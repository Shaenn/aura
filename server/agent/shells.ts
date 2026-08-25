// Ce que la session a lancé en arrière-plan, et qui lui survit.
//
// `ActivityTracker` tient un présent qu'il remplace ; celui-ci tient une liste
// qu'il accumule. La différence vient de ce qu'ils suivent : un outil en vol
// disparaît quand il rend la main, alors qu'un `pnpm dev:all` *commence* à
// exister à ce moment-là. L'appel rend la main en deux secondes, le serveur tient
// le port une heure — et rien, jusqu'ici, ne le disait.
//
// Sur les 216 shells lancés dans le parc, 177 ont vu leur fin notifiée. Les 39
// autres tournaient encore quand leur session s'est arrêtée : c'est cette
// population-là que l'écran cherche. Aucun `KillShell` dans le parc, pas un
// seul — personne ne coupe, faute de savoir qu'il y a quelque chose à couper.
//
// Rien ici ne parle au système : la liste se construit sur les seuls messages du
// SDK. C'est ce qui la rend exacte — le harnais nomme le shell du même jeton
// quand il le lance et quand il le termine, là où un rapprochement par processus
// devrait deviner.

import { open } from 'node:fs/promises'
import type { BackgroundShell, ShellOutput } from '../../shared/agent.ts'
import { str } from '../json.ts'
import { parseTaskNotification } from '../transcript.ts'
import { resultText } from './translate.ts'

type Rec = Record<string, unknown>

function rec(v: unknown): Rec {
  return v && typeof v === 'object' ? (v as Rec) : {}
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

/**
 * La promesse que rend `run_in_background` : un identifiant, pas une sortie.
 *
 * Jumelle de la constante `BACKGROUND` de `ShellView.vue`, qui reconnaît la même
 * phrase pour l'afficher. Elles ne se partagent pas — le serveur ne lit pas les
 * composants — mais elles se corrigent ensemble le jour où le CLI change sa
 * formule.
 */
const LAUNCHED = /^Command running in background with ID: (\S+?)\./

/** Le fichier où le CLI déverse la sortie, annoncé dans la même phrase. */
const OUTPUT_FILE = /Output is being written to: (.+?\.output)\b/

/** Ce que le `<summary>` d'une notification dit de la fin. */
const EXIT_CODE = /exit code (-?\d+)/

/**
 * Les `<status>` qui disent une coupure plutôt qu'un terme.
 *
 * Le parc n'en a mesuré qu'un — `completed`. Les autres sont ceux que le harnais
 * emploie ailleurs pour la même idée ; les reconnaître ne coûte rien et évite de
 * relire le flux le jour où l'un d'eux arrive. On nomme les formes de coupure
 * plutôt que de prendre tout ce qui n'est pas `completed` : un `failed` est une
 * fin, pas un arrêt, et son code de sortie le dit déjà.
 */
const KILLED_STATUS = /^(killed|stopped|aborted|cancell?ed|terminated|interrupted)$/i

/** La forme d'un identifiant de shell — `btt4xdjh2`, `bq55159a`. */
export const SHELL_ID = /^[a-z0-9]{4,24}$/

/**
 * Ce chemin est-il bien celui du fichier de sortie de ce shell ?
 *
 * `server/CLAUDE.md` pose la règle : aucun `node:fs` sur un chemin brut venu du
 * client. Ici le client n'en fournit aucun — il donne un `runId` et un `shellId`,
 * et le chemin sort du suiveur. Mais ce chemin-là vient d'un message du CLI, pas
 * de nous, et c'est assez pour le vérifier avant de le suivre.
 *
 * On compare les segments plutôt que les préfixes : le CLI écrit la forme courte
 * de Windows — `C:\Users\JEANDU~1.DUP\AppData\Local\Temp\claude\…` — là où
 * `os.tmpdir()` rend la forme longue, et un `startsWith` échouerait sur le poste
 * même où tout fonctionne.
 */
export function isOutputPath(path: string, shellId: string): boolean {
  if (!SHELL_ID.test(shellId)) return false
  const parts = path.toLowerCase().split(/[\\/]/)
  const last = parts[parts.length - 1]
  return last === `${shellId.toLowerCase()}.output` && parts.includes('claude') && parts[parts.length - 2] === 'tasks'
}

/** Ce qu'on retient d'un appel entre son départ et la réponse qui le nomme. */
interface Pending {
  command: string
  description: string
  startedAt: number
}

/**
 * Combien d'octets une réponse rend au plus.
 *
 * Un `pnpm dev:all` d'une heure écrit des mégaoctets ; personne n'en relira le
 * début, et les charger figerait l'onglet pour rien. Le panneau redemande la
 * suite à partir de son curseur, donc cette borne ne se paie qu'à la première
 * ouverture — ou après une longue absence.
 */
const TAIL_MAX = 64 * 1024

/**
 * Ce qu'une passe de lecture du transcript avale au plus.
 *
 * Plus large que la queue d'une sortie : il ne s'agit pas d'alimenter un écran
 * mais de rattraper un fichier, et une passe qui n'a pas fini reprend au tour
 * suivant, deux secondes plus tard.
 */
const PAGE_MAX = 512 * 1024

/**
 * La suite d'un fichier de sortie, à partir d'un curseur.
 *
 * La seule I/O de ce module, et elle est délibérément ici plutôt que dans la
 * route : c'est ce module qui sait ce qu'est un fichier de sortie, et c'est lui
 * qui porte la garde qui le vérifie.
 *
 * Un `from` au-delà de la taille veut dire que le fichier a rétréci — le CLI l'a
 * recréé pour un nouveau shell portant le même nom. On repart du début plutôt
 * que de rendre du vide indéfiniment.
 */
/**
 * La suite d'un fichier à partir d'un curseur, sans rien sauter.
 *
 * Jumelle de `readTail`, et son contraire sur le seul point qui compte : là où
 * la queue jette le milieu pour ne pas charger une heure de journal, celle-ci
 * rend tout, page par page. C'est ce qu'il faut pour le transcript, où une
 * ligne manquée est une fin de shell manquée — le harnais ne la réécrit pas.
 *
 * `next` dit où reprendre : tant qu'il diffère de `size`, il reste à lire.
 */
export async function readSince(path: string, from: number): Promise<{ text: string; next: number; size: number }> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const at = from > size || from < 0 ? 0 : from
    const length = Math.min(size - at, PAGE_MAX)
    if (length <= 0) return { text: '', next: size, size }

    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, at)

    // Une page qui s'arrête au milieu d'une ligne la perdrait des deux côtés :
    // tronquée ici, et déjà dépassée par le curseur à la passe suivante. On
    // rend donc les lignes entières, et le reste au tour d'après. Le cas ne se
    // pose qu'avant la fin du fichier — la dernière page se rend telle quelle,
    // sa ligne finale fût-elle encore en cours d'écriture.
    const end = at + length < size ? buffer.lastIndexOf(0x0a) + 1 : length
    if (end <= 0) return { text: '', next: at + length, size }

    return { text: buffer.subarray(0, end).toString('utf8'), next: at + end, size }
  } finally {
    await handle.close()
  }
}

export async function readTail(path: string, from: number): Promise<ShellOutput> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const start = from > size || from < 0 ? 0 : from
    const skipped = Math.max(0, size - start - TAIL_MAX)
    const at = start + skipped
    const length = size - at
    if (length <= 0) return { text: '', from: at, size, ...(skipped ? { skipped } : {}) }

    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, at)
    return { text: buffer.toString('utf8'), from: at, size, ...(skipped ? { skipped } : {}) }
  } finally {
    await handle.close()
  }
}

export class ShellTracker {
  /** Les shells connus, dans l'ordre où ils sont partis. */
  private readonly shells = new Map<string, BackgroundShell>()
  /** Où le CLI écrit chaque sortie. Gardé à part : ce n'est pas du protocole. */
  private readonly paths = new Map<string, string>()
  /**
   * Les appels partis dont la réponse n'est pas revenue.
   *
   * Un `Bash` en arrière-plan s'annonce en deux temps : l'appel porte la
   * commande, la réponse porte l'identifiant. Ni l'un ni l'autre ne suffit —
   * l'appel seul donnerait une ligne qu'on ne saurait pas relire, la réponse
   * seule une ligne qui ne dirait pas ce qui tourne.
   */
  private readonly pending = new Map<string, Pending>()

  snapshot(): BackgroundShell[] {
    return [...this.shells.values()]
  }

  /** Le fichier de sortie d'un shell — `undefined` s'il n'en a pas annoncé. */
  outputPath(id: string): string | undefined {
    return this.paths.get(id)
  }

  /** Les shells qu'on croit encore vivants, et dont le fichier vaut d'être relu. */
  running(): BackgroundShell[] {
    return this.snapshot().filter((s) => s.state === 'running')
  }

  /**
   * Ce qu'une relecture du disque a trouvé.
   *
   * Le suiveur ne lit aucun fichier lui-même : il ne connaît que des messages.
   * C'est le runner qui va voir, et qui repasse ici ce qu'il a mesuré.
   */
  observe(id: string, size: number, lastWriteAt: number): boolean {
    const shell = this.shells.get(id)
    if (!shell || (shell.size === size && shell.lastWriteAt === lastWriteAt)) return false
    shell.size = size
    shell.lastWriteAt = lastWriteAt
    return true
  }

  /**
   * La fin, lue dans le transcript plutôt que dans le flux.
   *
   * Mesuré sur une session de l'Atelier : le CLI reçoit bien la notification et
   * l'écrit dans son `.jsonl` — deux lignes, une mise en file et le message
   * injecté — mais **le SDK ne la relaie pas**. Sur les quatre messages `user`
   * d'une session de test, le flux n'en a transmis qu'un : le résultat d'outil.
   * Une session pilotée n'apprendrait donc jamais qu'un shell s'est terminé.
   *
   * D'où cette seconde source. Elle ne déduit rien : c'est la même phrase, avec
   * le même jeton, simplement lue là où elle se trouve.
   */
  fromTranscript(chunk: string): boolean {
    let changed = false
    for (const raw of chunk.split('\n')) {
      if (!raw.includes('<task-notification>')) continue
      // Une ligne de transcript est du JSON, et la notification y vit échappée.
      // On la déplie plutôt que de la lire à travers ses barres obliques.
      let text = raw
      try {
        const line: unknown = JSON.parse(raw)
        const content = (rec(line).message as Rec | undefined)?.content ?? rec(line).content
        if (typeof content === 'string') text = content
      } catch {
        // Ligne tronquée par une écriture en cours : la prochaine passe la
        // relira entière.
      }
      if (this.onNotification(text)) changed = true
    }
    return changed
  }

  /** Lit un message du SDK et dit si la liste a bougé. */
  consume(message: Rec): boolean {
    switch (str(message.type)) {
      case 'assistant':
        return this.onAssistant(rec(message.message))
      case 'user':
        return this.onUser(rec(message.message))
      default:
        return false
    }
  }

  private onAssistant(payload: Rec): boolean {
    let changed = false
    for (const raw of arr(payload.content)) {
      const block = rec(raw)
      if (str(block.type) !== 'tool_use') continue
      const input = rec(block.input)

      if (str(block.name) === 'Bash' && input.run_in_background === true) {
        this.pending.set(str(block.id), {
          command: str(input.command),
          description: str(input.description),
          startedAt: Date.now(),
        })
        continue
      }

      // La seule trace d'une coupure. Le harnais n'écrit pas de
      // `<task-notification>` pour un shell qu'on arrête — mesuré sur deux
      // arrêts de cette session : zéro `<task-id>` dans le transcript, contre
      // deux par shell arrivé à son terme. L'appel d'outil, lui, passe dans le
      // flux ; c'est donc ici et nulle part ailleurs qu'un arrêt se voit.
      //
      // L'outil s'appelle `TaskStop` et nomme sa cible `task_id` ; `KillShell`
      // et `shell_id` sont l'ancienne forme, gardée en repli — le schéma de
      // l'outil documente encore `shell_id` comme déprécié.
      if (str(block.name) === 'TaskStop' || str(block.name) === 'KillShell') {
        const shell = this.shells.get(str(input.task_id) || str(input.shell_id))
        if (shell && shell.state === 'running') {
          shell.state = 'killed'
          shell.endedAt = Date.now()
          changed = true
        }
      }
    }
    return changed
  }

  /**
   * Un message côté « user » : un résultat d'outil, ou une nouvelle du harnais.
   *
   * `content` arrive sous deux formes, et il faut les deux. Une liste de blocs
   * porte les résultats d'outils ; une **chaîne nue** porte les messages que le
   * harnais injecte — et c'est précisément ainsi qu'arrive la fin d'un shell.
   * Mesuré sur une session de l'Atelier : la notification était bien dans le
   * flux, et ne lire que la liste la faisait manquer entièrement.
   */
  private onUser(payload: Rec): boolean {
    if (typeof payload.content === 'string') return this.onNotification(payload.content)

    let changed = false
    for (const raw of arr(payload.content)) {
      const block = rec(raw)
      const type = str(block.type)
      if (type === 'tool_result' && this.onResult(block)) changed = true
      if (type === 'text' && this.onNotification(str(block.text))) changed = true
    }
    return changed
  }

  /**
   * La réponse qui nomme le shell.
   *
   * Un appel dont la réponse ne porte pas la phrase attendue n'entre pas dans la
   * liste : sans identifiant, il n'y a ni ligne à montrer ni fichier à relire.
   * C'est le cas d'un `Bash` refusé, qui est parti sans jamais tourner.
   */
  private onResult(block: Rec): boolean {
    const toolUseId = str(block.tool_use_id)
    const start = this.pending.get(toolUseId)
    if (!start) return false
    this.pending.delete(toolUseId)

    const text = resultText(block.content)
    const id = LAUNCHED.exec(text.trim())?.[1]
    if (!id) return false

    const path = OUTPUT_FILE.exec(text)?.[1]
    if (path) this.paths.set(id, path)

    this.shells.set(id, {
      id,
      toolUseId,
      command: start.command,
      ...(start.description ? { description: start.description } : {}),
      startedAt: start.startedAt,
      state: 'running',
    })
    return true
  }

  /**
   * La fin, dite par le harnais.
   *
   * Le `<task-id>` d'une notification est l'identifiant du shell — le même jeton
   * qu'à son lancement. C'est ce qui permet de dire « terminé, code 0 » sans rien
   * déduire ; le détour par les processus, lui, devrait rapprocher deux
   * commandes et deux horaires sans jeton commun.
   *
   * La même enveloppe sert aux sous-agents : une notification dont le `task-id`
   * n'est pas un shell connu ne nous regarde pas.
   *
   * Le `<status>` sépare la fin de la coupure — voir `KILLED_STATUS`. Sans lui,
   * un shell arrêté s'afficherait « terminé, code 0 », ce qui est exactement
   * l'inverse de ce qui vient de se passer.
   */
  private onNotification(text: string): boolean {
    if (!text.includes('<task-notification>')) return false
    const parsed = parseTaskNotification(text)
    const shell = this.shells.get(parsed.taskId ?? '')
    if (!shell || shell.state !== 'running') return false

    shell.state = KILLED_STATUS.test(parsed.status ?? '') ? 'killed' : 'done'
    shell.endedAt = Date.now()
    const code = EXIT_CODE.exec(parsed.summary ?? '')?.[1]
    if (code !== undefined) shell.exitCode = Number(code)
    return true
  }
}
