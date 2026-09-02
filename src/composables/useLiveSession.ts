// Une session de l'Atelier, vue du navigateur.
//
// Le composable ne fait qu'appliquer des upserts sur une liste d'événements. Il
// n'interprète rien : la forme des messages du SDK est traduite côté serveur, et
// ce qui arrive ici a déjà la forme que la timeline de rejeu sait rendre.
//
// Une seule `EventSource` par session, refermée à la sortie de l'écran. La
// session, elle, survit : c'est le registre du BFF qui la possède, pas l'onglet.

import type {
  AgentActivity,
  AgentSession,
  AgentStatus,
  AgentUpsert,
  AskRequest,
  BackgroundShell,
  PermissionRequest,
  SlashCommandInfo,
} from '@/services/agent'
import { getSessionCommands, getSessionFiles, IDLE_ACTIVITY, streamUrl } from '@/services/agent'
import type { TranscriptEvent } from '@/services/projects'
import { ref, shallowRef, triggerRef, onUnmounted } from 'vue'

export function useLiveSession() {
  /**
   * `shallowRef` : la timeline se redessine sur le remplacement d'un événement,
   * pas sur la mutation d'un champ enfoui. Rendre profondément réactif un flux
   * qui reçoit plusieurs deltas par seconde ferait payer un parcours complet de
   * l'arbre à chaque token.
   */
  const events = shallowRef<TranscriptEvent[]>([])
  const session = ref<AgentSession | null>(null)
  const status = ref<AgentStatus>('idle')
  const error = ref('')
  /** Les demandes en attente, dans l'ordre d'arrivée. */
  const permissions = ref<PermissionRequest[]>([])
  const asks = ref<AskRequest[]>([])
  const connected = ref(false)
  /**
   * Le lien a été établi, puis rompu — et pas encore rétabli.
   *
   * `connected` seul ne suffit pas à le dire : il est faux entre l'ouverture de
   * la page et la première trame, où il n'y a pourtant rien d'anormal à
   * signaler. Ce drapeau ne se lève qu'après un flux qui a vécu, et retombe dès
   * qu'il reprend.
   */
  const lost = ref(false)
  /**
   * Ce que l'agent fait à l'instant. Un état à part de la timeline : il ne
   * s'ajoute à rien, il se remplace — et il n'a pas de passé.
   */
  const activity = ref<AgentActivity>(IDLE_ACTIVITY)
  /**
   * Les commandes `/`, chargées à la demande puis rafraîchies par le flux.
   *
   * Elles ne font pas partie du `snapshot` : les demander démarre le processus
   * du CLI, et une session qu'on regarde sans lui parler ne doit rien coûter.
   */
  const commands = ref<SlashCommandInfo[]>([])
  const commandsLoading = ref(false)
  /**
   * Les fichiers du dossier de travail, pour le `@`.
   *
   * Chargés une fois, entiers, puis filtrés dans le navigateur : le serveur ne
   * revoit pas une requête par frappe. `filesTruncated` dit qu'un dépôt trop
   * grand a été coupé.
   */
  const files = ref<string[]>([])
  const filesTruncated = ref(false)
  const filesLoading = ref(false)
  /**
   * Ce que la session a lancé en arrière-plan.
   *
   * Une liste, là où `activity` est un présent : un `pnpm dev:all` quitte les
   * outils en vol au bout de deux secondes et tient son port une heure.
   */
  const shells = ref<BackgroundShell[]>([])

  let source: EventSource | null = null
  let attached = ''
  /** Le flux a-t-il déjà porté quelque chose ? Voir `lost`. */
  let opened = false
  let commandsAsked = false
  let filesAsked = false
  const index = new Map<string, number>()

  function reindex(): void {
    index.clear()
    events.value.forEach((e, i) => index.set(e.uuid, i))
  }

  function apply(upsert: AgentUpsert): void {
    switch (upsert.kind) {
      case 'snapshot':
        session.value = upsert.session
        status.value = upsert.session.status
        events.value = upsert.events
        activity.value = upsert.activity
        shells.value = upsert.shells
        reindex()
        return

      case 'session':
        session.value = upsert.session
        return

      case 'append-event':
        events.value = [...events.value, upsert.event]
        index.set(upsert.event.uuid, events.value.length - 1)
        return

      case 'replace-event': {
        const at = index.get(upsert.event.uuid)
        if (at === undefined) {
          events.value = [...events.value, upsert.event]
          index.set(upsert.event.uuid, events.value.length - 1)
          return
        }
        const next = events.value.slice()
        next[at] = upsert.event
        events.value = next
        return
      }

      case 'text-delta': {
        const at = index.get(upsert.uuid)
        const event = at === undefined ? undefined : events.value[at]
        const block = event?.blocks[upsert.blockIndex]
        if (!block) return
        // Le seul endroit où l'on mute au lieu de remplacer : un token par
        // frappe, et recopier l'événement à chacun ferait des milliers de
        // tableaux pour une réponse un peu longue. `triggerRef` prévient le
        // rendu sans changer l'identité de la liste.
        block.text = (block.text ?? '') + upsert.text
        triggerRef(events)
        return
      }

      case 'tool-input': {
        // Même raison que `text-delta` de muter plutôt que remplacer : l'entrée
        // se réécrit entière à chaque pas, et recopier la liste d'événements à
        // chaque fois ferait redessiner toute la timeline pour une ligne.
        const at = index.get(upsert.uuid)
        const event = at === undefined ? undefined : events.value[at]
        const block = event?.blocks[upsert.blockIndex]
        if (!block) return
        block.input = upsert.input
        triggerRef(events)
        return
      }

      case 'activity':
        activity.value = upsert.activity
        return

      case 'shells':
        // Le serveur pousse la liste entière : elle se remplace, comme celle des
        // commandes. Il n'y a pas de delta à appliquer sur quatre entrées.
        shells.value = upsert.shells
        return

      case 'status':
        status.value = upsert.status
        // Une erreur appartient au statut qui la porte : sans cette remise à
        // zéro, celle d'un tour ancien restait sous le composeur pour le reste
        // de la session, y compris après une reprise réussie.
        error.value = upsert.error ?? ''
        if (session.value) session.value.status = upsert.status
        return

      case 'permission-request':
        permissions.value = [...permissions.value, upsert.request]
        return

      case 'permission-settled':
        permissions.value = permissions.value.filter((p) => p.id !== upsert.id)
        return

      case 'ask-request':
        asks.value = [...asks.value, upsert.request]
        return

      case 'ask-settled':
        asks.value = asks.value.filter((a) => a.id !== upsert.id)
        return

      case 'commands':
        // Le serveur pousse la liste entière : elle se remplace, elle ne se
        // fusionne pas. Un Skill retiré doit disparaître du menu.
        commands.value = upsert.commands
        return
    }
  }

  /**
   * Charge les commandes une fois par session.
   *
   * Appelée au premier `/` tapé, jamais à l'ouverture : c'est cet appel qui
   * démarre le CLI. Ensuite, seul le flux les met à jour.
   *
   * Un échec laisse la liste vide plutôt qu'il ne signale une panne — la saisie
   * à la main reste possible, et rien n'est perdu.
   */
  async function loadCommands(): Promise<void> {
    if (commandsAsked || !attached) return
    commandsAsked = true
    commandsLoading.value = true
    try {
      commands.value = (await getSessionCommands(attached)).commands
    } catch {
      commands.value = []
    } finally {
      commandsLoading.value = false
    }
  }

  /**
   * Charge les fichiers du dossier une fois par session.
   *
   * Appelée au premier `@` tapé. Un échec laisse la liste vide : le chemin se
   * tape alors à la main, ce qui reste possible de toute façon.
   */
  async function loadFiles(): Promise<void> {
    if (filesAsked || !attached) return
    filesAsked = true
    filesLoading.value = true
    try {
      const read = await getSessionFiles(attached)
      files.value = read.files
      filesTruncated.value = read.truncated
    } catch {
      files.value = []
    } finally {
      filesLoading.value = false
    }
  }

  /** S'attacher à une session. Le premier message reçu est tout son état. */
  function attach(runId: string): void {
    detach()
    events.value = []
    permissions.value = []
    asks.value = []
    error.value = ''
    activity.value = IDLE_ACTIVITY
    commands.value = []
    commandsAsked = false
    files.value = []
    filesTruncated.value = false
    filesAsked = false
    attached = runId
    opened = false
    index.clear()

    source = new EventSource(streamUrl(runId))
    source.onopen = () => {
      connected.value = true
      lost.value = false
      opened = true
    }
    source.onerror = () => {
      // `EventSource` se reconnecte seul, et le `snapshot` qui suivra remettra
      // l'état d'aplomb : la coupure n'est donc pas une panne. Mais tant qu'elle
      // dure, on ne sait plus ce que fait l'agent — et la dernière phase reçue
      // resterait à l'écran, son chrono montant à vide, parce qu'il tourne ici.
      // Une session coupée pendant un compactage annonçait ainsi un compactage
      // qui n'avait plus lieu.
      connected.value = false
      lost.value = opened
      activity.value = IDLE_ACTIVITY
    }
    // Le serveur nomme chaque trame de son `kind` : on écoute par nom plutôt que
    // `onmessage`, qui ne reçoit que les trames sans nom.
    const kinds: AgentUpsert['kind'][] = [
      'snapshot',
      'session',
      'append-event',
      'replace-event',
      'text-delta',
      'tool-input',
      'activity',
      'shells',
      'status',
      'permission-request',
      'permission-settled',
      'ask-request',
      'ask-settled',
      'commands',
    ]
    for (const kind of kinds) {
      source.addEventListener(kind, (e) => {
        apply(JSON.parse((e as MessageEvent<string>).data) as AgentUpsert)
      })
    }
  }

  function detach(): void {
    source?.close()
    source = null
    attached = ''
    connected.value = false
    lost.value = false
    opened = false
    // Débranché, on ne sait plus ce qui se passe : laisser la dernière phase
    // affichée ferait croire à une session qu'on regarde encore.
    activity.value = IDLE_ACTIVITY
  }

  onUnmounted(detach)

  return {
    events,
    session,
    status,
    error,
    permissions,
    asks,
    connected,
    lost,
    activity,
    commands,
    commandsLoading,
    loadCommands,
    files,
    filesTruncated,
    filesLoading,
    loadFiles,
    shells,
    attach,
    detach,
  }
}
