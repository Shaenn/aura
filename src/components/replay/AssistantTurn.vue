<template>
  <article class="at">
    <button type="button" class="at-head" :aria-expanded="open" :aria-controls="bodyId" @click="open = !open">
      <q-icon name="smart_toy" size="16px" class="at-icon" aria-hidden="true" />
      <span class="at-who">Claude</span>
      <span v-if="model" class="at-model font-mono">{{ model }}</span>
      <span class="at-items">{{ itemsSummary }}</span>
      <q-space />

      <!-- Le contexte de la carte, en deux chiffres exacts : la taille de la
           fenêtre à la fin, et ce que la carte y a ajouté en tout. -->
      <span v-if="cardContext" class="at-ctx-sum font-mono">
        ⧉{{ fmtNum(cardContext.window) }}
        <span v-if="cardContext.delta > 0" class="at-ctx-sum-delta">+{{ fmtNum(cardContext.delta) }}</span>
        <q-tooltip anchor="top middle" self="bottom middle" class="rp-tt">
          <div>
            {{ t('replay.turn.windowTip', { n: fmtInt(cardContext.window) }) }}
          </div>
          <div v-if="cardContext.delta > 0">
            {{ t('replay.turn.deltaTip', { n: fmtInt(cardContext.delta) }) }}
          </div>
        </q-tooltip>
      </span>

      <span v-if="turn.outputTokens" class="at-tokens font-mono">
        ↑{{ fmtNum(turn.outputTokens) }}
        <q-tooltip anchor="top middle" self="bottom middle" class="rp-tt">
          {{ t('replay.turn.outputTip', { n: fmtInt(turn.outputTokens) }) }}
        </q-tooltip>
      </span>
      <span v-if="turn.durationMs" class="at-dur font-mono">{{ fmtDuration(turn.durationMs) }}</span>
      <span class="at-time font-mono">{{ time }}</span>

      <q-icon name="expand_more" size="18px" class="at-chev" :class="{ 'at-chev--open': open }" aria-hidden="true" />
    </button>

    <div v-if="open" :id="bodyId" class="at-body">
      <template v-for="(ev, ei) in turn.events" :key="ev.uuid">
        <!--
          Un jalon au début de chaque réponse. Dans une carte qui en compte des
          dizaines, c'est ce qui rend le tour 148 trouvable ; `id` sert d'ancre au
          lien `@148` du panneau. Le jalon porte la croissance exacte du tour, et
          se déplie sur ce qui y est entré *en silence* — un fichier réinjecté,
          une règle — quand il y en a. Le reste (outils, raisonnement) est déjà
          rendu dessous.
        -->
        <!-- `plans.marks` : les jalons qu'une liste de tâches enjambe. Le
             harness pose chaque tâche dans son propre tour, si bien qu'un plan
             de cinq lignes traînait cinq jalons derrière lui. L'ancre `@73`
             n'est pas perdue : elle passe sur la ligne de la tâche. -->
        <template v-if="turnAt(ev.uuid) && !plans.marks.has(ev.uuid)">
          <details v-if="turnAt(ev.uuid)!.rows.length" :id="`rp-turn-${ev.uuid}`" class="at-turn at-turn--fold">
            <summary class="at-turn-mark font-mono">
              <span class="at-turn-mark-line" aria-hidden="true" />
              <q-icon name="chevron_right" size="13px" class="at-turn-chev" aria-hidden="true" />
              {{ t('replay.turn.mark', { n: turnAt(ev.uuid)!.turnIndex + 1 }) }}
              <span v-if="turnAt(ev.uuid)!.delta > 0" class="at-turn-delta">+{{ fmtNum(turnAt(ev.uuid)!.delta) }}</span>
              <span class="at-turn-silent">{{ t('replay.turn.injected', turnAt(ev.uuid)!.rows.length) }}</span>
            </summary>
            <ul class="at-turn-list">
              <li v-for="(row, i) in turnAt(ev.uuid)!.rows" :key="i" class="at-turn-row">
                <span class="at-turn-pill" :style="{ color: pillColor(row), borderColor: pillColor(row) }">{{ pill(row) }}</span>
                <span class="at-turn-rowlabel" :title="row.path ?? row.label">{{ row.label }}</span>
                <span class="at-turn-tok font-mono">~{{ fmtNum(row.tokens) }}</span>
              </li>
            </ul>
          </details>

          <p v-else :id="`rp-turn-${ev.uuid}`" class="at-turn-mark font-mono">
            <span class="at-turn-mark-line" aria-hidden="true" />
            {{ t('replay.turn.mark', { n: turnAt(ev.uuid)!.turnIndex + 1 }) }}
            <span v-if="turnAt(ev.uuid)!.delta > 0" class="at-turn-delta">+{{ fmtNum(turnAt(ev.uuid)!.delta) }}</span>
          </p>
        </template>

        <p v-if="systemLabel(ev)" class="at-sys" :class="{ 'at-sys--error': ev.level === 'error' }">
          <q-icon :name="ev.level === 'error' ? 'error_outline' : 'info'" size="13px" aria-hidden="true" />
          {{ systemLabel(ev) }}
        </p>

        <template v-for="(b, bi) in ev.blocks" :key="`${ei}-${bi}`">
          <!-- Le manuel d'un skill, versé dans la fenêtre par un appel `Skill`.
               Ce n'est la parole de personne : il se replie. -->
          <SkillDocument v-if="skillDoc(ev, b)" :doc="skillDoc(ev, b)!" />

          <!-- Claude's own prose. -->
          <div v-else-if="b.kind === 'text'" class="at-text">
            <MarkdownView :source="b.text ?? ''" />
          </div>

          <!-- Thinking the harness kept only as a signature: nothing to unfold. -->
          <p v-else-if="b.kind === 'thinking' && b.redacted" class="at-think-redacted">
            <q-icon name="psychology" size="14px" aria-hidden="true" />
            {{ t('replay.turn.redacted') }}
          </p>

          <ThinkingBlock v-else-if="b.kind === 'thinking'" :text="b.text ?? ''" />

          <!-- Une série de créations d'affilée est un seul geste : elle se rend
               d'un bloc, sur son premier appel. Les suivants ne rendent rien —
               d'où la condition en queue de `ToolCall`. -->
          <TaskPlan v-else-if="planAt(ei, bi)" :items="planAt(ei, bi)!" />

          <!-- Une transition isolée reste un jalon : voir `TaskMarker`. La carte
               d'outil reste pour les appels en échec, qu'on veut pouvoir déplier. -->
          <TaskMarker v-else-if="isTaskMarker(b) && !plans.absorbed.has(blockKey(ei, bi))" :block="b" :uuid="ev.uuid" />

          <ToolCall v-else-if="b.kind === 'tool_use' && !plans.absorbed.has(blockKey(ei, bi))" :block="b" />

          <TaskReport v-else-if="b.kind === 'task_notification'" :block="b" />

          <template v-else-if="b.kind === 'tool_result'">
            <ImageStrip v-if="b.images?.length" :images="b.images" />
            <pre class="at-orphan"><code>{{ b.content }}</code></pre>
          </template>

          <ImageStrip v-else-if="b.kind === 'image' && b.images?.length" :images="b.images" />
          <p v-else-if="b.kind === 'image'" class="at-image font-mono">
            {{ t('replay.turn.image') }}
          </p>
        </template>
      </template>
    </div>

    <!-- Folded, the answer still shows. It is the point of the turn, not a detail. -->
    <div v-else-if="lastText" class="at-body at-body--peek">
      <div class="at-text">
        <MarkdownView :source="lastText" />
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
  import { useChartTokens, seriesColor } from '@/composables/useChartTokens'
  import { useExpandable, provideScopedExpandAll } from '@/composables/useExpandAll'
  import type { AssistantTurn } from '@/composables/useTranscriptTurns'
  import type { Block, ContextCategory, TranscriptEvent } from '@/services/projects'
  import { fmtDuration, fmtInt, fmtNum, fmtTime } from '@/utils/format'
  import { computed, useId, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import type { CardContext, CardTurn, ContextRowModel } from './contextRows'
  import ImageStrip from './ImageStrip.vue'
  import MarkdownView from './MarkdownView.vue'
  import { skillDocument, type SkillDoc } from './skillDocument'
  import SkillDocument from './SkillDocument.vue'
  import { blockKey, groupTaskPlans, isTaskMarker, type PlanItem } from './taskList'
  import TaskMarker from './TaskMarker.vue'
  import TaskPlan from './TaskPlan.vue'
  import TaskReport from './TaskReport.vue'
  import ThinkingBlock from './ThinkingBlock.vue'
  import ToolCall from './ToolCall.vue'

  const { t } = useI18n()

  const props = withDefaults(
    defineProps<{
      turn: AssistantTurn
      defaultOpen?: boolean
      /** Ce que la carte a ajouté au contexte, ou `null` hors reconstruction. */
      cardContext?: CardContext | null
      /** Le tour en cours d'un flux suivi en direct : il s'ouvre en profondeur. */
      live?: boolean
    }>(),
    { defaultOpen: true, cardContext: null, live: false },
  )

  const chart = useChartTokens()

  /**
   * L'ordre fixe des catégories : il attribue les teintes, comme dans le panneau —
   * la même position donne la même couleur des deux côtés. `harness` n'en a pas :
   * c'est de la machinerie, elle prend le gris.
   */
  const CAT_ORDER: ContextCategory[] = ['memory', 'skills', 'files', 'tools', 'thinking', 'userMessage']

  /** Une règle vit dans la catégorie mémoire mais n'est pas un CLAUDE.md. */
  function pill(row: ContextRowModel): string {
    if (row.category === 'memory' && row.label.startsWith('rules/')) {
      return t('replay.context.pills.rule')
    }
    // Le jeton est celui du panneau de contexte : une catégorie se nomme pareil
    // des deux côtés, sans quoi la même chose porterait deux noms dans un écran.
    return t(`replay.context.pills.${row.category}`)
  }
  /** La teinte de la catégorie, identique à celle du panneau de contexte. */
  function pillColor(row: ContextRowModel): string {
    const i = CAT_ORDER.indexOf(row.category)
    return i >= 0 ? seriesColor(chart.value, i) : chart.value.muted
  }

  /** Le détail du tour qui commence à cette ligne, s'il y en a un. */
  function turnAt(uuid: string): CardTurn | undefined {
    return props.cardContext?.byUuid[uuid]
  }

  /**
   * Les séries de créations de tâches, rendues d'un bloc.
   *
   * Une série ne peut enjamber ce qui se rend *avant* les blocs d'un événement —
   * un jalon qui se déplie sur une injection silencieuse, une ligne système : les
   * absorber les ferait disparaître. Ces événements coupent donc la série.
   */
  const plans = computed(() =>
    groupTaskPlans(
      props.turn.events,
      (ev) => Boolean(systemLabel(ev)) || ev.blocks.some((b) => skillDoc(ev, b)) || (turnAt(ev.uuid)?.rows.length ?? 0) > 0,
    ),
  )

  /** La série qui s'ouvre sur ce bloc, s'il en ouvre une. */
  function planAt(ei: number, bi: number): PlanItem[] | undefined {
    return plans.value.starts.get(blockKey(ei, bi))
  }

  const bodyId = `at-${useId()}`
  // A turn reads open: its prose is the point. Expand-all can still close it.
  const open = useExpandable(props.defaultOpen)

  // Le tour en direct déplie ses outils et son raisonnement — dans un flux suivi
  // en direct, ce qui se passe est justement dans ces replis, et les rouvrir à
  // chaque tour reviendrait à cliquer sans arrêt. Quand un tour plus récent prend
  // la main, celui-ci rend son contenu au repli : sa prose, elle, reste lisible.
  // La commande est bornée à ce tour, d'où `provideScopedExpandAll` — appelé après
  // le `useExpandable` ci-dessus, qui doit suivre la page et non ce tour.
  const { setAll } = provideScopedExpandAll()
  watch(
    () => props.live,
    (live) => {
      if (live) open.value = true
      // Adhésif tant que le tour est en direct : ses outils arrivent au fil de
      // l'eau, bien après que l'ordre a été donné.
      setAll(live, live)
    },
    { immediate: true },
  )

  /** `claude-opus-4-8` → `opus-4-8`: the vendor prefix is on every row. */
  const model = computed(() => props.turn.model.replace(/^claude-/, ''))

  const itemsSummary = computed(() => {
    const parts: string[] = []
    if (props.turn.toolCount) {
      parts.push(t('replay.turn.tools', props.turn.toolCount))
    }
    if (props.turn.thinkingCount) parts.push(t('replay.turn.thinking'))
    return parts.join(' · ')
  })

  const time = computed(() => fmtTime(props.turn.startedAt))

  /** The last thing Claude said in this turn — its conclusion. */
  const lastText = computed(() => {
    for (let i = props.turn.events.length - 1; i >= 0; i--) {
      const ev = props.turn.events[i]
      if (!ev || ev.kind !== 'assistant') continue
      for (let j = ev.blocks.length - 1; j >= 0; j--) {
        const b = ev.blocks[j]
        if (b?.kind === 'text' && b.text?.trim()) return b.text
      }
    }
    return ''
  })

  /**
   * Le manuel de skill que porte ce bloc, s'il en porte un.
   *
   * Le résultat est mémorisé par bloc : le plus gros document du parc fait 8 831
   * lignes, et le gabarit appelle cette fonction deux fois par bloc et par rendu.
   */
  const skillDocs = new WeakMap<object, SkillDoc | null>()
  function skillDoc(ev: TranscriptEvent, b: Block): SkillDoc | null {
    if (b.kind !== 'text' || !ev.isMeta) return null
    const known = skillDocs.get(b)
    if (known !== undefined) return known
    const doc = skillDocument(b.text ?? '', ev.skill)
    skillDocs.set(b, doc)
    return doc
  }

  /** Rows the harness slipped into the turn: reminders, injected context. */
  function systemLabel(ev: TranscriptEvent): string {
    if (ev.kind === 'assistant') return ''
    // Un manuel de skill se nomme lui-même dans son pli : « Système (contexte) »
    // juste au-dessus ne ferait que redire, en moins précis.
    if (ev.blocks.length > 0 && ev.blocks.every((b) => skillDoc(ev, b))) return ''
    if (ev.kind === 'system') {
      return ev.subtype ? t('replay.loose.systemSub', { sub: ev.subtype }) : t('replay.loose.system')
    }
    if (ev.isMeta) return t('replay.turn.sysMeta')
    if (ev.origin === 'task-notification') return t('replay.turn.sysReport')
    // Inside a run, a `user` row is what the orchestrator said to the agent —
    // a follow-up or an interruption. Never the human, so never "Vous".
    if (ev.isSidechain && ev.kind === 'user') return t('replay.turn.sysToAgent')
    return ev.origin ? t('replay.turn.sysOrigin', { origin: ev.origin }) : t('replay.loose.system')
  }
</script>

<style scoped lang="scss">
  .at {
    border-left: 2px solid var(--brand-line);
    padding-left: var(--space-md);
  }
  .at-head {
    /* Le fond du survol déborde à gauche pour que le texte reste sur la grille du
     tour ; à droite il s'arrête au bord. D'où une largeur qui compense le seul
     décalage gauche — et un `box-sizing` explicite, parce que `width: 100%` plus
     un padding déborderait en `content-box`. */
    box-sizing: border-box;
    width: calc(100% + var(--space-sm));
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    margin-left: calc(var(--space-sm) * -1);
    background: none;
    border: none;
    border-radius: var(--radius-xs);
    color: inherit;
    cursor: pointer;
    text-align: left;
  }
  .at-head:hover {
    background: var(--hover-overlay);
  }
  .at-icon {
    color: var(--brand);
    flex-shrink: 0;
  }
  .at-who {
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--muted);
    flex-shrink: 0;
  }
  .at-model {
    font-size: var(--fs-2xs);
    color: var(--brand-muted);
    flex-shrink: 0;
  }
  .at-items {
    font-size: var(--fs-2xs);
    color: var(--faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .at-tokens,
  .at-dur,
  .at-time {
    flex-shrink: 0;
    font-size: var(--fs-2xs);
    color: var(--faint);
  }
  .at-ctx-sum {
    flex-shrink: 0;
    font-size: var(--fs-2xs);
    color: var(--brand-muted);
    cursor: help;
  }
  .at-ctx-sum-delta {
    color: var(--muted);
  }
  .at-chev {
    flex-shrink: 0;
    color: var(--dim);
    transition: transform var(--motion-fast);
    transform: rotate(-90deg);
  }
  .at-chev--open {
    transform: rotate(0deg);
  }
  .at-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding-top: var(--space-sm);
  }

  /* Jalon de tour : discret, mais assez pour segmenter une longue carte. */
  .at-turn-mark {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin: 0;
    font-size: var(--fs-2xs);
    color: var(--faint);
    scroll-margin-block: var(--space-xl);
  }
  .at-turn-mark-line {
    height: 1px;
    width: var(--space-lg);
    background: var(--line-2);
    flex: none;
  }
  .at-turn-delta {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .at-turn-silent {
    color: var(--brand-muted);
  }

  /* Un jalon qui se déplie : il a fait entrer quelque chose d'invisible. */
  .at-turn--fold > summary {
    list-style: none;
    cursor: pointer;
    padding: 1px 0;
    border-radius: var(--radius-xs);

    &:hover {
      color: var(--muted);
    }
    &:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: -2px;
    }
  }
  .at-turn--fold > summary::-webkit-details-marker {
    display: none;
  }
  .at-turn-chev {
    color: var(--dim);
    transition: transform var(--motion-fast);
    transform: rotate(0deg);
    flex: none;
  }
  .at-turn--fold[open] .at-turn-chev {
    transform: rotate(90deg);
  }
  .at-turn-list {
    list-style: none;
    margin: 2px 0 var(--space-xs);
    padding: 0 0 0 calc(var(--space-lg) + var(--space-sm));
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .at-turn-row {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--fs-2xs);
  }
  .at-turn-pill {
    flex: none;
    // Teinte posée en ligne, par catégorie ; le texte porte le sens, la couleur
    // ne fait que le redoubler.
    border: 1px solid;
    border-radius: var(--radius-xs);
    padding: 0 4px;
    line-height: 1.4;
    background: transparent;
  }
  .at-turn-rowlabel {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
  }
  .at-turn-tok {
    flex: none;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }
  .at-body--peek {
    opacity: 0.85;
  }
  .at-sys {
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--fs-2xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--faint);
  }
  /* An API error is why the turn stopped — it must not read like a debug label. */
  .at-sys--error {
    color: var(--danger);
  }
  .at-think-redacted {
    border: 1px dashed var(--line-3);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--surface);
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    color: var(--dim);
    font-size: var(--fs-xs);
    font-style: italic;
  }
  .at-orphan {
    margin: 0;
    padding: var(--space-md);
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: var(--fs-sm);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .at-image {
    color: var(--dim);
    font-size: var(--fs-sm);
  }
</style>
