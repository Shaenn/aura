<template>
  <div class="tv">
    <!-- La cible de l'appel. La position n'est dite que si elle a été choisie :
         voir `trivialPosition` plus bas. -->
    <p class="lv-target font-mono" :title="filePath">
      <q-icon name="my_location" size="13px" aria-hidden="true" />
      <span class="lv-dir">{{ dir }}</span>
      <span class="lv-base">{{ base }}</span>
      <span v-if="position" class="lv-pos">{{ position }}</span>
    </p>

    <ToolChips :items="params" />

    <!-- Un serveur de langage qui n'a pas répondu. Le CLI ne marque pas ces
         résultats en erreur : l'appel s'affiche comme réussi, et son texte
         commence par « Error performing … ». 10 des 101 résultats du parc. -->
    <template v-if="parsed?.kind === 'echec'">
      <p class="lv-verdict lv-verdict--no" role="status">
        <q-icon name="error_outline" size="15px" aria-hidden="true" />
        {{ t('replay.tools.views.lsp.failed') }}
      </p>
      <p class="lv-cause font-mono">{{ parsed.cause }}</p>
    </template>

    <template v-else-if="parsed?.kind === 'refus'">
      <p class="lv-verdict lv-verdict--no" role="status">
        <q-icon name="cancel" size="15px" aria-hidden="true" />
        {{ t('replay.tools.views.lsp.refused') }}
      </p>
      <blockquote v-if="parsed.said" class="lv-said">{{ parsed.said }}</blockquote>
    </template>

    <!-- « Rien trouvé », que le CLI dit en 122 à 148 caractères d'anglais
         expliquant au modèle qu'un index incomplet répond pareil. La réserve
         vaut d'être gardée — un vide peut être un faux vide — mais elle tient
         en une ligne, sous la réponse. -->
    <template v-else-if="parsed?.kind === 'vide'">
      <p class="lv-empty">{{ emptyLabel }}</p>
      <p class="tv-note">
        {{ t('replay.tools.views.lsp.indexing') }}
      </p>
    </template>

    <!-- Le survol répond en markdown, bloc de code typé compris. Rendu en texte
         brut, une signature TypeScript de vingt lignes est illisible. -->
    <MarkdownView v-else-if="parsed?.kind === 'hover'" :source="parsed.markdown" />

    <!-- `documentSymbol` : un arbre, dont l'indentation porte l'imbrication.
         Jusqu'à 81 nœuds et 3 niveaux dans le parc. -->
    <ul v-else-if="parsed?.kind === 'arbre'" class="lv-tree">
      <li v-for="(node, i) in parsed.nodes" :key="i" class="lv-node">
        <span class="lv-gutter font-mono">
          <span aria-hidden="true">{{ t('replay.tools.views.lsp.line') }}</span>
          <span>{{ node.line }}</span>
        </span>
        <span class="lv-branch" :style="{ paddingLeft: `calc(${node.depth} * var(--space-md))` }">
          <span class="lv-name font-mono">{{ node.name }}</span>
          <span class="lv-kind">{{ kindOf(node.symKind) }}</span>
          <span v-if="added(node.detail, node.name)" class="lv-detail font-mono" :title="node.detail">
            {{ added(node.detail, node.name) }}
          </span>
        </span>
      </li>
    </ul>

    <template v-else-if="parsed?.kind === 'localisations'">
      <p class="lv-count">{{ countLabel }}</p>
      <ol class="lv-files">
        <li v-for="(group, gi) in parsed.groups" :key="gi" class="lv-file">
          <p class="lv-path font-mono" :title="group.file">
            <q-icon name="description" size="13px" aria-hidden="true" />
            <span class="lv-dir">{{ dirOf(group.file) }}</span>
            <span class="lv-base">{{ baseOf(group.file) }}</span>
          </p>
          <ul class="lv-hits">
            <li v-for="(item, ii) in group.items" :key="ii" class="lv-hit">
              <span class="lv-at font-mono">{{ at(item) }}</span>
              <template v-if="item.label">
                <span class="lv-name font-mono">{{ item.label }}</span>
                <span class="lv-kind">{{ kindOf(item.symKind ?? '') }}</span>
                <span v-if="added(item.detail ?? '', item.label)" class="lv-detail font-mono" :title="item.detail">
                  {{ added(item.detail ?? '', item.label) }}
                </span>
              </template>
              <span v-if="item.callsAt" class="lv-line">{{ t('replay.tools.views.lsp.callAt', { at: item.callsAt }) }}</span>
            </li>
          </ul>
        </li>
      </ol>
    </template>

    <OutputPane v-else :content="raw" :is-error="block.result?.isError ?? false" :tool-use-id="block.id ?? ''" />
  </div>
</template>

<script setup lang="ts">
  import MarkdownView from '@/components/replay/MarkdownView.vue'
  import type { Block } from '@/services/projects'
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { basename, dirname } from '../language'
  import OutputPane from '../OutputPane.vue'
  import { userRefusal } from '../serviceLines'
  import ToolChips from '../ToolChips.vue'
  import { asRecord, chips, num, str } from '../values'

  const { t } = useI18n()

  const props = defineProps<{ block: Block }>()

  const input = computed(() => asRecord(props.block.input))
  const raw = computed(() => props.block.result?.content ?? '')
  const operation = computed(() => str(input.value.operation))
  const filePath = computed(() => str(input.value.filePath))

  const baseOf = (p: string): string => basename(p)
  const dirOf = (p: string): string => {
    const d = dirname(p)
    return d ? `${d}/` : ''
  }
  const base = computed(() => baseOf(filePath.value))
  const dir = computed(() => dirOf(filePath.value))

  /**
   * Le schéma exige `line` et `character` sur les neuf opérations, y compris les
   * deux qui ne travaillent pas sur une position : `documentSymbol` prend le
   * fichier entier, `workspaceSymbol` le projet entier. Le modèle y écrit donc
   * `1:1` faute de mieux — 55 appels sur 118, soit 38 des 39 `documentSymbol` et
   * 17 des 22 `workspaceSymbol`. Afficher ce couple, c'est afficher un chiffre que
   * personne n'a choisi.
   */
  const trivialPosition = computed(() => num(input.value.line) === 1 && num(input.value.character) === 1)

  const position = computed(() => (trivialPosition.value ? '' : `:${num(input.value.line)}:${num(input.value.character)}`))

  /**
   * `query` ne concerne que `workspaceSymbol`, mais elle y est le sujet de l'appel
   * — présente sur les 22 — et elle n'apparaissait nulle part : ni dans le résumé
   * de l'en-tête, ni dans le corps.
   */
  const params = computed(() => chips([[t('replay.tools.chips.symbol'), str(input.value.query)]]))

  /**
   * Les `SymbolKind` du protocole, dans la langue du reste de l'interface.
   *
   * Le nom du protocole reste la clé : c'est lui que le serveur envoie. Un genre
   * qu'on ne connaît pas se rend tel quel — mieux vaut le mot anglais du protocole
   * qu'un blanc.
   */
  const KINDS = new Set([
    'Property',
    'Method',
    'Constant',
    'Variable',
    'Class',
    'Function',
    'File',
    'Namespace',
    'Module',
    'Field',
    'Interface',
    'Enum',
    'Struct',
    'Constructor',
  ])

  const kindOf = (kind: string): string => (KINDS.has(kind) ? t(`replay.tools.views.lsp.kinds.${kind}`) : kind)

  /** Ce qui manque, dit par l'opération plutôt que par le texte anglais du CLI. */
  const EMPTY = new Set([
    'findReferences',
    'hover',
    'documentSymbol',
    'workspaceSymbol',
    'goToDefinition',
    'goToImplementation',
    'prepareCallHierarchy',
    'incomingCalls',
    'outgoingCalls',
  ])

  /**
   * Le mot que le CLI emploie dans son en-tête, et le nôtre. La clé du catalogue
   * n'a pas d'espace, là où le CLI en met une.
   */
  const WHAT: Record<string, string> = {
    reference: 'reference',
    symbol: 'symbol',
    definition: 'definition',
    implementation: 'implementation',
    'incoming call': 'incomingCall',
    'outgoing call': 'outgoingCall',
  }

  // ── Lecture du résultat ──────────────────────────────────────────────────────
  //
  // Six formes, toutes textuelles, toutes fixes. Le résultat structuré n'aide pas :
  // son champ `result` est le texte à l'octet près, 97 fois sur 97, et ses
  // `resultCount` / `fileCount` sont déjà dans la première ligne. Rien à faire
  // traverser la liste blanche du serveur.

  const FOUND = /^Found (\d+) (reference|symbol|definition|implementation|incoming call|outgoing call)s?(?: in workspace)?(?: across (\d+) files?)?:$/
  const DEFINED = /^Defined in (.+?):(\d+):(\d+)$/
  const HOVER = /^Hover info at \d+:\d+:\n?([\s\S]*)$/
  const SOFT_ERROR = /^Error performing \w+: ([\s\S]+)$/
  const NO_SERVER = /^No LSP server available for file type: (.+)$/
  const HARD_ERROR = /^<tool_use_error>([\s\S]*?)<\/tool_use_error>$/
  const NOTHING = /^No (?:references|hover information|symbols|definition|implementations|incoming calls|outgoing calls)\b/

  const GROUP = /^(\S.*):$/
  /** Une occurrence nue : `findReferences` ne nomme pas ce qu'il a trouvé. */
  const HIT = /^Line (\d+):(\d+)$/
  /** Un symbole : nom, genre, éventuellement sa signature, sa ligne. */
  const SYMBOL = /^(.+?) \((\w+)\)(?: (.+?))? - Line (\d+)(?: \[calls at: (\d+:\d+)\])?$/
  /** Une définition, que `goToDefinition` liste à plat sous son en-tête. */
  const LOCATION = /^(.+?):(\d+):(\d+)$/

  interface Hit {
    line: number
    character: number
    label?: string
    symKind?: string
    detail?: string
    callsAt?: string
  }
  interface Group {
    file: string
    items: Hit[]
  }
  type Parsed =
    | { kind: 'echec'; cause: string }
    | { kind: 'refus'; said: string }
    | { kind: 'vide' }
    | { kind: 'hover'; markdown: string }
    | {
        kind: 'arbre'
        nodes: { depth: number; name: string; symKind: string; detail: string; line: number }[]
      }
    | { kind: 'localisations'; total: number; what: string; fileCount: number; groups: Group[] }
    | null

  const parsed = computed<Parsed>(() => {
    const text = raw.value.trim()
    if (!text) return null

    const refusal = userRefusal(text)
    if (refusal) return { kind: 'refus', said: refusal.said }

    const hard = HARD_ERROR.exec(text)
    if (hard) return { kind: 'echec', cause: hard[1] ?? '' }
    const soft = SOFT_ERROR.exec(text)
    if (soft) return { kind: 'echec', cause: soft[1] ?? '' }
    const noServer = NO_SERVER.exec(text)
    if (noServer) return { kind: 'echec', cause: `Aucun serveur de langage pour les fichiers ${noServer[1]}` }

    if (NOTHING.test(text)) return { kind: 'vide' }

    const hover = HOVER.exec(text)
    if (hover) return { kind: 'hover', markdown: (hover[1] ?? '').trim() }

    // La forme courte de `goToDefinition` quand il n'y en a qu'une, sans en-tête.
    const defined = DEFINED.exec(text)
    if (defined) {
      return {
        kind: 'localisations',
        total: 1,
        what: 'definition',
        fileCount: 1,
        groups: [
          {
            file: defined[1] ?? '',
            items: [{ line: Number(defined[2]), character: Number(defined[3]) }],
          },
        ],
      }
    }

    const lines = text.split('\n')
    if (lines[0] === 'Document symbols:') return tree(lines.slice(1))
    const head = FOUND.exec(lines[0] ?? '')
    if (head) return list(head, lines.slice(1))
    return null
  })

  function tree(lines: string[]): Parsed {
    const nodes = []
    for (const raw of lines) {
      if (!raw.trim()) continue
      const m = SYMBOL.exec(raw.trim())
      // Une ligne qu'on ne sait pas lire rend tout le pavé au brut : mieux vaut le
      // texte du CLI qu'un arbre auquel il manque une branche.
      if (!m) return null
      nodes.push({
        depth: (raw.length - raw.replace(/^ +/, '').length) / 2,
        name: m[1] ?? '',
        symKind: m[2] ?? '',
        detail: m[3] ?? '',
        line: Number(m[4]),
      })
    }
    return { kind: 'arbre', nodes }
  }

  function list(head: RegExpExecArray, lines: string[]): Parsed {
    const groups: Group[] = []
    let current: Group | null = null
    for (const raw of lines) {
      if (!raw.trim()) continue
      const line = raw.trim()
      if (!/^\s/.test(raw)) {
        const g = GROUP.exec(line)
        if (!g) return null
        current = { file: g[1] ?? '', items: [] }
        groups.push(current)
        continue
      }
      const hit = HIT.exec(line)
      if (hit) {
        if (!current) return null
        current.items.push({ line: Number(hit[1]), character: Number(hit[2]) })
        continue
      }
      const symbol = SYMBOL.exec(line)
      if (symbol) {
        if (!current) return null
        current.items.push({
          line: Number(symbol[4]),
          character: 0,
          label: symbol[1] ?? '',
          symKind: symbol[2] ?? '',
          detail: symbol[3] ?? '',
          callsAt: symbol[5] ?? '',
        })
        continue
      }
      // `goToDefinition` liste ses résultats à plat, un chemin complet par ligne.
      const location = LOCATION.exec(line)
      if (location) {
        groups.push({
          file: location[1] ?? '',
          items: [{ line: Number(location[2]), character: Number(location[3]) }],
        })
        current = null
        continue
      }
      return null
    }
    return {
      kind: 'localisations',
      total: Number(head[1]),
      what: head[2] ?? '',
      fileCount: head[3] ? Number(head[3]) : groups.length,
      groups,
    }
  }

  /**
   * Ce que le détail d'un symbole ajoute à son nom — c'est-à-dire, presque
   * toujours, son type seul.
   *
   * Les serveurs C# renvoient le symbole une seconde fois, qualifié :
   * `AddRoutes(IEndpointRouteBuilder app)` a pour détail
   * `void CommentaireEndpoints.AddRoutes(IEndpointRouteBuilder app)`. La ligne
   * portait donc deux fois la même signature, et le conteneur qu'elle répète —
   * `CommentaireEndpoints` — est déjà le nœud parent, une ligne au-dessus.
   *
   * Les symboles porteurs d'un détail viennent tous d'un arbre `documentSymbol`, et
   * la quasi-totalité **se terminent exactement par `[Conteneur.]Nom`**. Une fois
   * ce suffixe retiré il ne reste que le type : `Task<IResult>`, `int?`, `void`.
   * Font exception les `Namespace`, dont le détail *est* le nom qualifié : rien ne
   * reste devant, et le détail entier est alors gardé, parce qu'il dit quelque
   * chose que le nom seul ne dit pas.
   *
   * Les serveurs TypeScript et Vue, eux, ne donnent aucun détail — d'où une gêne
   * qui ne se voyait que sur du C#.
   */
  const QUALIFIER = /[\w.<>,[\]?]+\.$/

  function added(detail: string, name = ''): string {
    if (!detail || !name) return detail
    // Une méthode d'extension C# se déclare avec `this` sur son premier
    // paramètre, et le serveur ne le remet pas dans la signature qualifiée :
    // `Register(this WebApplicationBuilder b)` a pour détail
    // `WebApplicationBuilder WebApplicationExtensions.Register(WebApplicationBuilder b)`.
    // Sans cette variante, les 6 méthodes d'extension du parc — toutes dans un
    // `Program.cs` — gardaient leur doublon entier.
    for (const form of [name, name.replace('(this ', '(')]) {
      if (!detail.endsWith(form)) continue
      const head = detail
        .slice(0, detail.length - form.length)
        .replace(QUALIFIER, '')
        .trim()
      return head || detail
    }
    return detail
  }

  /**
   * Une occurrence a sa colonne, un symbole n'en a pas : le serveur ne donne que
   * sa ligne de déclaration. Écrire `6:1` dans ce cas serait inventer une colonne.
   */
  const at = (hit: Hit): string => (hit.character ? `${hit.line}:${hit.character}` : `${t('replay.tools.views.lsp.line')} ${hit.line}`)

  const emptyLabel = computed(() =>
    EMPTY.has(operation.value) ? t(`replay.tools.views.lsp.empty.${operation.value}`) : t('replay.tools.views.lsp.noResult'),
  )

  const countLabel = computed(() => {
    const p = parsed.value
    if (p?.kind !== 'localisations') return ''
    const key = WHAT[p.what]
    const what = key ? t(`replay.tools.views.lsp.what.${key}`, p.total) : p.what
    return p.fileCount > 1
      ? t('replay.tools.views.lsp.countIn', { n: p.total, what, files: p.fileCount })
      : t('replay.tools.views.lsp.count', { n: p.total, what })
  })
</script>

<style scoped lang="scss">
  .tv {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .tv-note {
    margin: 0;
    font-size: var(--fs-2xs);
    color: var(--faint);
    font-style: italic;
  }
  .lv-target,
  .lv-path {
    display: flex;
    // Le chemin tient sur une ligne : `center` cale le glyphe dessus sans avoir à
    // lui calculer une hauteur. Voir la même correction dans `GrepView`.
    align-items: center;
    gap: var(--space-xs);
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
    font-size: var(--fs-xs);
  }
  .lv-path {
    margin-bottom: var(--space-xs);
  }
  .lv-dir {
    color: var(--faint);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lv-base {
    color: var(--text);
    flex-shrink: 0;
  }
  .lv-pos {
    color: var(--muted);
    flex-shrink: 0;
  }
  .lv-verdict {
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--fs-sm);
    color: var(--warn);
  }
  .lv-cause {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--muted);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .lv-said {
    margin: 0;
    padding-left: var(--space-md);
    border-left: 2px solid var(--line-2);
    font-size: var(--fs-sm);
    color: var(--muted);
    white-space: pre-wrap;
  }
  .lv-empty {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--muted);
  }
  .lv-count {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--muted);
  }
  .lv-tree,
  .lv-files,
  .lv-hits {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .lv-tree,
  .lv-files {
    max-height: 420px;
    overflow: auto;
  }
  .lv-files {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .lv-hits {
    border-left: 2px solid var(--line-2);
  }
  .lv-node,
  .lv-hit {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    padding: 1px var(--space-sm);
    font-size: var(--fs-xs);
    min-width: 0;
  }
  .lv-node:hover,
  .lv-hit:hover {
    background: var(--hover-overlay);
  }
  // Le numéro de ligne en gouttière, comme dans un éditeur — et comme partout
  // ailleurs dans l'Atelier. L'arbre le poussait à droite par `margin-left: auto`,
  // ce qui écrasait le type entre lui et le nom ; en colonne, les numéros
  // s'alignent et plus rien ne dispute la place.
  .lv-at {
    flex: 0 0 4.5em;
    text-align: right;
    color: var(--faint);
    user-select: none;
  }
  // La gouttière de l'arbre. Aligner à droite la chaîne entière — « l. 1 »,
  // « l. 121 » — alignait les chiffres mais promenait le « l. » d'une ligne à
  // l'autre, et c'est lui que l'œil suit. Le préfixe est donc calé à gauche du
  // champ et le nombre à droite, chacun sur sa colonne.
  .lv-gutter {
    flex: 0 0 4em;
    display: flex;
    justify-content: space-between;
    color: var(--faint);
    user-select: none;
  }
  // L'indentation porte l'imbrication : elle commence après la gouttière, sinon
  // les numéros se décaleraient avec la profondeur.
  .lv-branch {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    min-width: 0;
  }
  .lv-name {
    color: var(--text);
    flex-shrink: 0;
  }
  .lv-kind {
    flex-shrink: 0;
    color: var(--brand);
    font-size: var(--fs-2xs);
    border: 1px solid var(--brand-line);
    border-radius: 999px;
    padding: 0 6px;
  }
  // La signature complète, que le serveur répète après le nom : présente pour
  // lever une ambiguïté, pas pour être lue. Elle passe à la ligne suivante plutôt
  // que de pousser la ligne au-delà du cadre.
  .lv-detail {
    color: var(--faint);
    font-size: var(--fs-2xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .lv-line {
    margin-left: auto;
    flex-shrink: 0;
    color: var(--faint);
    font-size: var(--fs-2xs);
  }
</style>
