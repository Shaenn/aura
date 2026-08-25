<template>
  <form class="sc" @submit.prevent="submit">
    <!--
      Les images collées, avant le champ : elles précèdent le texte dans le
      message envoyé, et les voir au-dessus de ce qu'on écrit dit dans quel ordre
      l'agent les lira.
    -->
    <ul v-if="shots.length" class="sc-shots" :aria-label="t('agent.composer.images.aria')">
      <li v-for="shot in shots" :key="shot.id" class="sc-shot">
        <img :src="shot.url" :alt="shot.alt" class="sc-shot-img" />
        <q-btn
          flat
          dense
          round
          size="sm"
          icon="close"
          class="sc-shot-drop"
          :aria-label="t('agent.composer.images.drop', { name: shot.alt })"
          @click="drop(shot.id)"
        />
        <span class="sc-shot-meta font-mono">{{ shot.caption }}</span>
      </li>
    </ul>
    <p v-if="pasteError" class="sc-paste-error">{{ pasteError }}</p>

    <!--
      Le champ et son menu partagent un conteneur positionné : la liste des
      commandes se pose au-dessus du champ, jamais sous la pliure, et suit sa
      largeur sans qu'on ait à la mesurer.
    -->
    <div class="sc-field-wrap">
      <ul
        v-if="menuOpen"
        :id="listId"
        ref="menuEl"
        class="surface-card sc-menu"
        role="listbox"
        :aria-label="t(`agent.composer.${menu?.kind === 'file' ? 'files' : 'commands'}.aria`)"
        @mousedown="holdMenu"
      >
        <li v-if="pending" class="sc-menu-note">
          {{ t(`agent.composer.${menu?.kind === 'file' ? 'files' : 'commands'}.loading`) }}
        </li>
        <!--
          Vide et échec disent la même chose ici : il n'y a rien à proposer. La
          saisie à la main reste possible, et distinguer les deux cas ferait
          parler AURA d'une panne qui n'empêche rien.
        -->
        <li v-else-if="!items.length" class="sc-menu-note">
          {{ t(`agent.composer.${menu?.kind === 'file' ? 'files' : 'commands'}.none`) }}
        </li>
        <template v-else>
          <!--
            Dossiers et fichiers se choisissent tous deux : mentionner un dossier
            désigne un périmètre de travail, ce qu'un fichier ne dit pas. Le
            rendu est emboîté, la navigation reste linéaire — chaque ligne porte
            son rang, et `aria-expanded` dit aux lecteurs d'écran ce que les
            flèches latérales ouvrent.
          -->
          <li
            v-for="row in rows"
            :id="`${listId}-${row.index}`"
            :key="row.key"
            role="option"
            :aria-selected="row.index === active"
            :aria-expanded="row.kind === 'dir' ? !row.shut : undefined"
            class="sc-menu-row sc-menu-item"
            :class="{ 'is-active': row.index === active, 'sc-menu-dir': row.kind === 'dir' }"
            :style="{ paddingLeft: `calc(var(--space-sm) + ${row.depth} * var(--space-md))` }"
            @mousedown.prevent="choose(row.index ?? 0)"
          >
            <span class="sc-menu-name font-mono">
              <!-- Le chevron plie et déplie sans rien insérer : c'est le seul
                   endroit de la ligne qui ne choisit pas ce qu'elle nomme. -->
              <q-icon
                v-if="row.kind === 'dir'"
                :name="row.shut ? 'chevron_right' : 'expand_more'"
                size="16px"
                class="sc-menu-chevron"
                :aria-label="t(`agent.composer.files.${row.shut ? 'expand' : 'collapse'}`)"
                @mousedown.stop.prevent="toggle(row.path)"
              />
              {{ row.label }}<span v-if="row.kind === 'dir'">/</span>
              <span v-if="row.hint" class="sc-menu-hint">{{ row.hint }}</span>
              <span v-if="row.count" class="sc-menu-hint">
                {{ t('agent.composer.files.hidden', row.count) }}
              </span>
            </span>
            <span v-if="row.description" class="sc-menu-desc">{{ row.description }}</span>
          </li>
          <!-- Une liste coupée doit le dire : sans cela, un fichier absent
               passerait pour un fichier inexistant. -->
          <li v-if="countNote" class="sc-menu-note">{{ countNote }}</li>
        </template>
      </ul>

      <!--
        Une session s'ouvre désormais vide : le curseur doit être là où l'on va
        écrire, sans un clic de plus.

        `spellcheck="false"` comme partout ailleurs dans AURA : un prompt mêle de
        la prose, des chemins `@src/…`, des commandes `/…` et des bouts de code,
        et le correcteur du navigateur souligne tout ce qui n'est pas dans son
        dictionnaire. Le rouge n'y signale plus une faute, il fait du bruit.
      -->
      <q-input
        ref="fieldEl"
        v-model="text"
        dense
        outlined
        autogrow
        autofocus
        type="textarea"
        role="combobox"
        aria-autocomplete="list"
        spellcheck="false"
        :aria-expanded="menuOpen"
        :aria-controls="menuOpen ? listId : undefined"
        :aria-activedescendant="activeId"
        :disable="disable"
        :placeholder="placeholder"
        :aria-label="t('agent.composer.aria')"
        class="sc-field"
        @keydown="onKey"
        @keyup="syncCaret"
        @click="syncCaret"
        @blur="closeMenu"
        @paste="onPaste"
      />
    </div>
    <div class="sc-actions">
      <!--
        Interrompre n'est proposé que pendant un tour. Un bouton grisé le reste du
        temps dirait la même chose en occupant la place d'une action possible.
      -->
      <q-btn v-if="working" flat no-caps icon="stop_circle" :label="t('agent.composer.interrupt')" :disable="busy" @click="emit('interrupt')" />
      <q-btn
        unelevated
        no-caps
        type="submit"
        color="primary"
        icon-right="send"
        :label="t('agent.composer.send')"
        :disable="disable || !text.trim()"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
  import type { PromptAttachment, SlashCommandInfo } from '@/services/agent'
  import { fmtBytes } from '@/utils/format'
  import { treeRows } from '@/utils/pathMatch'
  import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
  import { useI18n } from 'vue-i18n'

  const props = defineProps<{
    working?: boolean
    busy?: boolean
    ended?: boolean
    /** Les commandes `/` proposables. Vide tant que personne n'en a demandé. */
    commands?: SlashCommandInfo[]
    commandsLoading?: boolean
    /** Les chemins du dossier de travail, pour le `@`. Même chargement paresseux. */
    files?: string[]
    filesLoading?: boolean
    /** Le dépôt était trop grand : la liste est partielle, et le menu le dit. */
    filesTruncated?: boolean
  }>()
  const emit = defineEmits<{
    send: [string, PromptAttachment[]]
    interrupt: []
    /** Au premier `/` tapé : c'est l'écran qui va chercher la liste. */
    'commands-needed': []
    /** Au premier `@` tapé, de même — et c'est là que le dossier se parcourt. */
    'files-needed': []
  }>()

  const { t } = useI18n()

  const text = ref('')

  const disable = computed(() => props.ended === true)

  /**
   * Écrire pendant que l'agent travaille est permis, et c'est voulu : le CLI met
   * ces tours en file et les dépile au milieu du travail. C'est souvent là qu'on
   * corrige le tir.
   */
  const placeholder = computed(() =>
    props.ended ? t('agent.composer.ended') : props.working ? t('agent.composer.working') : t('agent.composer.idle'),
  )

  // ── Le menu : commandes `/` et chemins `@` ──────────────────────────────────
  //
  // Un seul menu pour deux sources, parce que c'est un seul geste : on tape un
  // caractère d'appel, on filtre, on choisit, ça s'insère. Ce qui les sépare tient
  // en deux lignes — où le motif a le droit de commencer, et ce qu'on insère.

  const listId = useId()
  const menuEl = useTemplateRef<HTMLElement>('menuEl')
  const fieldEl = useTemplateRef<{ nativeEl?: HTMLTextAreaElement }>('fieldEl')
  const active = ref(0)
  const dismissed = ref(false)
  /** Où est le curseur, seule chose qui dise à quel mot on est en train de toucher. */
  const caret = ref(0)

  function syncCaret(): void {
    caret.value = fieldEl.value?.nativeEl?.selectionStart ?? text.value.length
  }

  /** Ce qui s'écrit, et où : `start` est la position du caractère d'appel. */
  interface Menu {
    kind: 'command' | 'file'
    query: string
    start: number
  }

  /**
   * Ce qu'on est en train de nommer, ou `null` si l'on écrit du texte ordinaire.
   *
   * Les deux motifs ne se ressemblent qu'en apparence :
   *
   * - Une **commande** ouvre le message. Le CLI ne les reconnaît que là, et
   *   proposer la liste au milieu d'une phrase volerait la touche Entrée à
   *   quelqu'un qui écrit une adresse électronique.
   * - Un **chemin** se mentionne n'importe où, autant de fois qu'on veut. Il se
   *   lit donc autour du curseur — du dernier `@` précédé d'un espace jusqu'à la
   *   position courante.
   *
   * Dans les deux cas, un espace ferme : passé lui, on ne nomme plus, on écrit.
   */
  const menu = computed<Menu | null>(() => {
    const before = text.value.slice(0, caret.value)

    const command = /^\/(\S*)$/.exec(before)
    if (command && caret.value === text.value.trimEnd().length) {
      return { kind: 'command', query: command[1] ?? '', start: 0 }
    }

    const file = /(?:^|\s)@(\S*)$/.exec(before)
    if (file) {
      const query = file[1] ?? ''
      return { kind: 'file', query, start: caret.value - query.length - 1 }
    }
    return null
  })

  /** Ce qu'une ligne du menu affiche, quelle que soit sa source. */
  interface Item {
    /** Ce qui s'insère à la place du motif. */
    value: string
    label: string
    hint?: string
    description?: string
  }

  /**
   * Les commandes qui correspondent, celles dont le nom commence par ce qui est
   * tapé d'abord.
   *
   * Un alias vaut le nom pour trouver — `/cost` mène à `/usage` — mais c'est le
   * nom canonique qui s'affiche et qui s'insère : deux entrées pour une seule
   * commande diraient qu'elles font deux choses.
   */
  function commandItems(query: string): Item[] {
    const q = query.toLowerCase()
    const rank = (c: SlashCommandInfo): number => {
      const names = [c.name, ...(c.aliases ?? [])].map((n) => n.toLowerCase())
      if (names.some((n) => n.startsWith(q))) return 0
      return names.some((n) => n.includes(q)) ? 1 : 2
    }
    return (props.commands ?? [])
      .map((command) => ({ command, rank: rank(command) }))
      .filter((m) => m.rank < 2)
      .sort((a, b) => a.rank - b.rank || a.command.name.localeCompare(b.command.name))
      .map(({ command }) => ({
        value: `/${command.name}`,
        label: `/${command.name}`,
        ...(command.argumentHint ? { hint: command.argumentHint } : {}),
        ...(command.description ? { description: command.description } : {}),
      }))
  }

  /**
   * Ce que le menu affiche, groupe par groupe.
   *
   * Les commandes forment un seul groupe sans en-tête ; les fichiers viennent
   * rangés sous leur dossier. Chaque ligne porte son rang dans la liste plate —
   * c'est lui que la navigation au clavier déplace, et l'arbre n'est qu'une mise
   * en forme par-dessus.
   */
  /**
   * Les dossiers repliés, par chemin.
   *
   * Un dossier fermé le reste tant qu'on ne le rouvre pas, même si la saisie
   * change : c'est un choix de l'utilisateur sur sa vue, pas une conséquence de sa
   * recherche. Les chemins qui disparaissent des résultats n'ont simplement plus
   * d'effet.
   */
  const collapsed = ref(new Set<string>())

  function toggle(path: string): void {
    const next = new Set(collapsed.value)
    if (!next.delete(path)) next.add(path)
    collapsed.value = next
  }

  /** Les chemins retenus, calculés une seule fois par frappe. */
  const found = computed(() => (menu.value?.kind === 'file' ? treeRows(props.files ?? [], menu.value.query, collapsed.value) : null))

  /** Une ligne affichée. `index` n'existe que sur les lignes choisissables. */
  interface Row {
    key: string
    kind: 'dir' | 'file'
    label: string
    depth: number
    path: string
    hint?: string
    description?: string
    /** Dossier : fermé, et ce qu'il retient. */
    shut?: boolean
    count?: number
    index?: number
  }

  /**
   * Ce que le menu affiche, ligne à ligne.
   *
   * Les commandes forment une liste plate — leur nom se suffit. Les fichiers
   * viennent en arbre, un segment de dossier par ligne, décroché d'un cran à
   * chaque niveau. **Toutes** les lignes se choisissent, dossiers compris : un
   * dossier mentionné dans un prompt désigne un périmètre de travail, ce qu'un
   * fichier ne dit pas.
   */
  const rows = computed<Row[]>(() => {
    const open = menu.value
    if (!open) return []

    let index = 0
    if (open.kind === 'command') {
      return commandItems(open.query).map((item) => ({
        key: item.value,
        kind: 'file' as const,
        label: item.label,
        depth: 0,
        path: item.value,
        ...(item.hint ? { hint: item.hint } : {}),
        ...(item.description ? { description: item.description } : {}),
        index: index++,
      }))
    }

    return (found.value?.rows ?? []).map((row) => ({
      key: `${row.kind}:${row.path}`,
      kind: row.kind,
      label: row.label,
      depth: row.depth,
      path: row.path,
      ...(row.collapsed ? { shut: true } : {}),
      ...(row.count ? { count: row.count } : {}),
      index: index++,
    }))
  })

  /**
   * Ce qu'Entrée insère, dans l'ordre où les flèches parcourent les lignes.
   *
   * Un dossier s'insère avec sa barre finale : `@src/components/` se lit comme un
   * dossier, là où `@src/components` pourrait passer pour un fichier sans
   * extension.
   */
  const items = computed<Item[]>(() => {
    const open = menu.value
    if (!open) return []
    if (open.kind === 'command') return commandItems(open.query)
    return (found.value?.rows ?? []).map((row) => ({
      value: `@${row.path}${row.kind === 'dir' ? '/' : ''}`,
      label: row.label,
    }))
  })

  /**
   * Le seul cas où la liste n'est pas complète.
   *
   * L'affichage, lui, ne tronque plus rien : ce qui correspond est montré, et
   * c'est le repli qui règle la longueur. Reste la borne du serveur, qui ne se
   * déclenche que sur un dépôt démesuré — et qui doit se dire, sans quoi on
   * chercherait un fichier absent de l'écran en croyant qu'il n'existe pas.
   */
  const countNote = computed(() => (menu.value?.kind === 'file' && props.filesTruncated ? t('agent.composer.files.truncated') : ''))

  const pending = computed(() =>
    menu.value?.kind === 'file'
      ? props.filesLoading === true && !(props.files ?? []).length
      : props.commandsLoading === true && !(props.commands ?? []).length,
  )
  const menuOpen = computed(() => menu.value !== null && !dismissed.value && !disable.value)
  const activeId = computed(() => (menuOpen.value && items.value.length ? `${listId}-${active.value}` : undefined))

  watch(
    () => menu.value?.kind ?? null,
    (now, before) => {
      if (now === null) {
        dismissed.value = false
        return
      }
      // Chaque liste ne se demande qu'une fois par session, et seulement ici : ces
      // appels démarrent le processus du CLI, ou parcourent un dépôt entier.
      if (before === now) return
      if (now === 'file') emit('files-needed')
      else emit('commands-needed')
    },
  )

  // Une frappe qui reprend après un Échap rouvre le menu : on ne se tait que
  // jusqu'au prochain geste. La sélection se replace à chaque changement de
  // saisie, faute de quoi Entrée insérerait ce qui était surligné pour une autre.
  watch(
    () => menu.value?.query ?? null,
    (now, before) => {
      if (now === null || now === before) return
      dismissed.value = false
      // L'arbre s'affiche par ordre alphabétique, mais c'est la meilleure réponse
      // qu'on veut sous la touche Entrée : on va la chercher là où l'alphabet l'a
      // rangée. Un dossier n'est jamais « la meilleure réponse » — c'est un
      // fichier qu'on cherchait.
      const best = found.value?.best ?? ''
      const at = best ? rows.value.findIndex((row) => row.kind === 'file' && row.path === best) : -1
      active.value = at === -1 ? 0 : at
    },
  )

  // La sélection au clavier doit rester visible quand la liste dépasse sa hauteur.
  watch(active, async () => {
    await nextTick()
    menuEl.value?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' })
  })

  /**
   * Un geste dans le menu ne doit pas le refermer.
   *
   * Le menu se ferme quand le champ perd le focus — c'est ce qui le fait
   * disparaître dès qu'on va travailler ailleurs. Mais saisir la barre de
   * défilement retire elle aussi le focus au champ : l'arbre se refermait sous le
   * curseur au moment précis où l'on cherchait à descendre dedans.
   *
   * Les lignes, elles, se protègent par `mousedown.prevent`, qui empêche le
   * transfert de focus. On ne peut pas en faire autant ici : `preventDefault` sur
   * la barre de défilement supprimerait le glissement natif, donc le geste
   * lui-même. On note plutôt que le geste vient du menu, et on rend le focus au
   * champ quand il s'achève — où qu'il s'achève, la souris pouvant très bien être
   * relâchée en dehors.
   */
  let inMenu = false

  function holdMenu(): void {
    inMenu = true
    window.addEventListener(
      'mouseup',
      () => {
        inMenu = false
        fieldEl.value?.nativeEl?.focus()
      },
      { once: true },
    )
  }

  function closeMenu(): void {
    if (inMenu) return
    dismissed.value = true
  }

  /**
   * Complète la saisie sans envoyer : choisir un nom n'est pas décider du tour.
   *
   * On ne remplace que le motif — du caractère d'appel au curseur — et non tout le
   * champ : c'est ce qui permet plusieurs `@` dans un même message, et de compléter
   * l'un d'eux sans toucher au reste de la phrase.
   *
   * L'espace final ouvre la place de la suite et referme le menu de lui-même : le
   * motif ne reconnaît plus un nom en train de s'écrire.
   */
  function choose(i: number): void {
    const open = menu.value
    const item = items.value[i]
    if (!open || !item) return

    const inserted = `${item.value} `
    text.value = text.value.slice(0, open.start) + inserted + text.value.slice(caret.value)
    const at = open.start + inserted.length
    caret.value = at
    // Le champ garde le focus ; sans replacer le curseur, il repartirait à la fin
    // du texte et la mention suivante s'écrirait au mauvais endroit.
    void nextTick(() => {
      const field = fieldEl.value?.nativeEl
      field?.setSelectionRange(at, at)
    })
  }

  function onKey(e: KeyboardEvent): void {
    if (menuOpen.value && items.value.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        const count = items.value.length
        active.value = (active.value + step + count) % count
        return
      }
      // Droite ouvre, gauche ferme — la convention d'un arbre, et le seul geste
      // qui n'insère rien. Sur un fichier, les deux touches rendent la main au
      // curseur : c'est encore du texte qu'on est en train d'écrire.
      const row = rows.value[active.value]
      if (row?.kind === 'dir' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        const shut = collapsed.value.has(row.path)
        if (e.key === 'ArrowRight' ? shut : !shut) {
          e.preventDefault()
          toggle(row.path)
        }
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.isComposing)) {
        e.preventDefault()
        choose(active.value)
        return
      }
    }
    if (e.key === 'Escape' && menuOpen.value) {
      // Le menu se referme sans vider le champ : ce qui est tapé reste envoyable.
      e.preventDefault()
      closeMenu()
      return
    }
    // Entrée envoie, Maj+Entrée passe à la ligne — la convention des messageries,
    // et celle du CLI.
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  // ── Les images collées ──────────────────────────────────────────────────────

  /**
   * Ce que l'API accepte de lire. Un presse-papier peut porter autre chose — un
   * fichier `.psd`, un SVG — et le refuser ici évite un tour parti pour rien.
   */
  const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

  /** La limite de l'API, la même que celle du BFF. */
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024

  interface Shot {
    id: string
    mediaType: string
    /** Le base64 nu, tel qu'il partira. */
    data: string
    bytes: number
    /** L'aperçu, servi depuis le navigateur : l'image n'a pas encore d'adresse. */
    url: string
  }

  const shots = ref<(Shot & { alt: string; caption: string })[]>([])
  const pasteError = ref('')

  /**
   * Coller une image l'attache au tour au lieu de l'écrire.
   *
   * Le presse-papier ne donne pas de fichier sur le disque : ni chemin, ni nom,
   * seulement des octets. C'est la raison d'être de tout ce chemin — sans lui, une
   * capture d'écran n'a aucun moyen d'entrer dans une session.
   *
   * On ne coupe le collage que si l'on a bien pris quelque chose : un presse-papier
   * mixte doit continuer d'insérer son texte.
   */
  async function onPaste(e: ClipboardEvent): Promise<void> {
    const files = [...(e.clipboardData?.items ?? [])]
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
    if (!files.length) return

    e.preventDefault()
    pasteError.value = ''
    for (const file of files) await attach(file)
  }

  async function attach(file: File): Promise<void> {
    if (!IMAGE_TYPES.includes(file.type)) {
      pasteError.value = t('agent.composer.images.type', { type: file.type })
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      pasteError.value = t('agent.composer.images.tooBig')
      return
    }

    const data = await base64(file)
    const id = `${Date.now()}-${shots.value.length}`
    const alt = t('agent.composer.images.alt', { n: shots.value.length + 1 })
    shots.value = [
      ...shots.value,
      {
        id,
        mediaType: file.type,
        data,
        bytes: file.size,
        // `data:` plutôt qu'un `URL.createObjectURL` : rien à révoquer, et
        // l'aperçu survit au vidage de la liste sans laisser de poignée derrière.
        url: `data:${file.type};base64,${data}`,
        alt,
        caption: `${file.type.replace(/^image\//, '').toUpperCase()} · ${fmtBytes(file.size)}`,
      },
    ]
  }

  /** Le base64 nu, sans le préfixe `data:…;base64,` que le lecteur ajoute. */
  function base64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        // `readAsDataURL` rend toujours une chaîne ; le type, lui, couvre aussi
        // l'`ArrayBuffer` des autres lectures.
        const read = typeof reader.result === 'string' ? reader.result : ''
        resolve(read.split(',')[1] ?? '')
      }
      reader.onerror = () => reject(reader.error ?? new Error('read'))
      reader.readAsDataURL(file)
    })
  }

  function drop(id: string): void {
    shots.value = shots.value.filter((shot) => shot.id !== id)
    pasteError.value = ''
  }

  function submit(): void {
    const value = text.value.trim()
    if (!value || disable.value) return
    emit(
      'send',
      value,
      shots.value.map(({ mediaType, data }) => ({ mediaType, data })),
    )
    text.value = ''
    shots.value = []
    pasteError.value = ''
  }
</script>

<style scoped>
  .sc {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .sc-field-wrap {
    position: relative;
  }

  /* Les vignettes : assez grandes pour reconnaître ce qu'on a collé, assez petites
   pour que trois d'entre elles ne poussent pas le champ hors de l'écran. */
  .sc-shots {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sc-shot {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sc-shot-img {
    display: block;
    max-width: 140px;
    max-height: 90px;
    object-fit: contain;
    border: 1px solid var(--line);
    border-radius: var(--radius-xs);
    background: var(--bg);
  }

  /* Sur l'image plutôt qu'à côté : la vignette est petite, et une rangée de
   boutons sous une rangée d'images se lit mal. */
  .sc-shot-drop {
    position: absolute;
    top: 2px;
    right: 2px;
    color: var(--text);
    background: var(--surface-2);
  }

  .sc-shot-meta {
    font-size: var(--fs-2xs);
    color: var(--faint);
  }

  .sc-paste-error {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--warn);
  }

  .sc-field {
    width: 100%;
  }

  .sc-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
  }

  /* Le menu se pose au-dessus du champ : sous lui, il sortirait de l'écran dès que
   le composeur est en bas de page — c'est-à-dire toujours. */
  .sc-menu {
    position: absolute;
    bottom: calc(100% + var(--space-xs));
    left: 0;
    right: 0;
    z-index: 1;
    max-height: 18rem;
    overflow-y: auto;
    margin: 0;
    padding: var(--space-xs);
    list-style: none;
  }

  .sc-menu-note {
    padding: var(--space-sm);
    color: var(--muted);
    font-size: var(--fs-sm);
  }

  /* Le décrochage vient de `depth`, posé en style en ligne : c'est la seule mesure
   qui dépend d'une donnée, et une classe par niveau ne dirait rien de plus. */
  .sc-menu-row {
    display: flex;
    flex-direction: column;
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-xs);
  }

  /* Un dossier se choisit comme un fichier, mais se lit en retrait : c'est la
   structure, pas la réponse. */
  .sc-menu-dir {
    color: var(--dim);
  }

  .sc-menu-chevron {
    margin-right: 2px;
    margin-left: calc(-1 * var(--space-xs));
    cursor: pointer;
  }

  .sc-menu-item {
    cursor: pointer;
    transition: background var(--motion-fast);
  }

  .sc-menu-item:hover,
  .sc-menu-item.is-active {
    background: var(--surface-3);
  }

  .sc-menu-name {
    color: var(--text);
    font-size: var(--fs-sm);
  }

  .sc-menu-hint {
    color: var(--dim);
  }

  .sc-menu-desc {
    color: var(--muted);
    font-size: var(--fs-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
