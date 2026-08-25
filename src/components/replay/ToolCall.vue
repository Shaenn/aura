<template>
  <div class="tc" :class="{ 'tc--error': isError }">
    <button type="button" class="tc-head" :aria-expanded="open" :aria-controls="bodyId" @click="open = !open">
      <q-icon :name="descriptor.icon" size="16px" class="tc-icon" aria-hidden="true" />
      <span class="tc-name font-mono">{{ block.name }}</span>
      <span v-if="summary" class="tc-summary font-mono">{{ summary }}</span>
      <q-space />

      <span v-if="tokens" class="tc-tokens font-mono">
        ~{{ fmtNum(tokens) }}
        <q-tooltip anchor="top middle" self="bottom middle" class="rp-tt">
          {{
            images.length
              ? t('replay.tools.call.tokensTipImages', { n: fmtInt(tokens) }, images.length)
              : t('replay.tools.call.tokensTip', { n: fmtInt(tokens) })
          }}
        </q-tooltip>
      </span>

      <!-- Colour never carries the meaning on its own: the dot is doubled by a word. -->
      <span class="tc-status">
        <span class="tc-dot" :class="`tc-dot--${status}`" aria-hidden="true" />
        <span class="tc-status-label">{{ t(`replay.tools.call.status.${status}`) }}</span>
      </span>

      <q-icon :name="open ? 'expand_less' : 'expand_more'" size="18px" aria-hidden="true" />
    </button>

    <!-- Hooks that fired around this call. Shown even when the card is folded:
         a hook that injected context or blocked the turn explains what follows. -->
    <div v-if="block.hooks?.length" class="tc-hooks">
      <HookRunView v-for="(hook, i) in block.hooks" :key="i" :run="hook" />
    </div>

    <!-- `v-if`, not `v-show`: a folded body must not mount. Highlighting and
         markdown rendering are the timeline's whole cost, and a long session has
         hundreds of tool calls the reader will never open. -->
    <div v-if="open" :id="bodyId" class="tc-body">
      <!-- Ce que l'outil a *montré* passe avant ce qu'il a dit : une capture
           d'écran est le résultat, le texte à côté n'en est que le résidu. -->
      <ImageStrip v-if="images.length" :images="images" :label="t('replay.images.byTool', { tool: block.name })" class="tc-images" />
      <component :is="view" :block="block" />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useExpandable } from '@/composables/useExpandAll'
  import type { Block } from '@/services/projects'
  import { fmtInt, fmtNum } from '@/utils/format'
  import { estimateTokens } from 'shared/context'
  import { computed, inject, ref, useId } from 'vue'
  import { useI18n } from 'vue-i18n'
  import HookRunView from './HookRunView.vue'
  import ImageStrip from './ImageStrip.vue'
  import { RUNNING_TOOLS } from './runningTools'
  import { descriptorFor, summarise, type ToolView } from './tools/registry'
  import AgentView from './tools/views/AgentView.vue'
  import AskView from './tools/views/AskView.vue'
  import EditView from './tools/views/EditView.vue'
  import EnterPlanView from './tools/views/EnterPlanView.vue'
  import GenericView from './tools/views/GenericView.vue'
  import GlobView from './tools/views/GlobView.vue'
  import GrepView from './tools/views/GrepView.vue'
  import LspView from './tools/views/LspView.vue'
  import MessageView from './tools/views/MessageView.vue'
  import PlanView from './tools/views/PlanView.vue'
  import ReadView from './tools/views/ReadView.vue'
  import SearchView from './tools/views/SearchView.vue'
  import SendMessageView from './tools/views/SendMessageView.vue'
  import ShellView from './tools/views/ShellView.vue'
  import SkillView from './tools/views/SkillView.vue'
  import TaskView from './tools/views/TaskView.vue'
  import WebSearchView from './tools/views/WebSearchView.vue'
  import WebView from './tools/views/WebView.vue'
  import WriteView from './tools/views/WriteView.vue'

  const props = withDefaults(defineProps<{ block: Block; defaultOpen?: boolean }>(), {
    defaultOpen: false,
  })

  const VIEWS: Record<ToolView, unknown> = {
    read: ReadView,
    edit: EditView,
    write: WriteView,
    shell: ShellView,
    grep: GrepView,
    glob: GlobView,
    lsp: LspView,
    plan: PlanView,
    enterPlan: EnterPlanView,
    agent: AgentView,
    web: WebView,
    webSearch: WebSearchView,
    task: TaskView,
    message: MessageView,
    sendMessage: SendMessageView,
    ask: AskView,
    search: SearchView,
    skill: SkillView,
    generic: GenericView,
  }

  type Status = 'ok' | 'error' | 'running' | 'none'

  const { t } = useI18n()

  const bodyId = `tc-${useId()}`

  /**
   * Le lancement d'un agent s'ouvre d'emblée, et le « tout replier » ne le referme
   * pas.
   *
   * Les autres cartes cachent un résultat qu'on va chercher quand on le veut ;
   * celle-ci porte l'état d'un travail — le nom de l'agent, où il en est, l'outil
   * qu'il vient d'appeler. Repliée, elle se réduit à une ligne `Agent` parmi trente
   * autres appels, et rien ne dit plus qu'une conversation entière est partie
   * ailleurs. C'est justement ce que la piste a sorti du fil : le seul endroit qui
   * en garde la trace ne peut pas être replié par défaut.
   *
   * Un `ref` local plutôt qu'`useExpandable` : aucune commande globale ne doit la
   * refermer. Elle reste à un clic — le bouton d'en-tête la plie comme les autres.
   * La consigne, elle, garde son propre repli dans `AgentView` : cinquante lignes
   * de prompt repousseraient hors de l'écran l'état qu'on vient d'ouvrir.
   */
  const pinned = props.block.name === 'Agent'
  // Folded by default: a turn is read for its prose, and its tools on demand.
  const open = pinned ? ref(true) : useExpandable(props.defaultOpen)

  const name = computed(() => props.block.name ?? '')
  const descriptor = computed(() => descriptorFor(name.value))
  const view = computed(() => VIEWS[descriptor.value.view])
  const summary = computed(() => summarise(name.value, props.block.input))

  const images = computed(() => props.block.result?.images ?? [])
  const isError = computed(() => props.block.result?.isError === true)

  // Fourni par l'Atelier seul : en rejeu, rien ne tourne plus. Voir `runningTools`.
  const runningTools = inject(RUNNING_TOOLS, null)
  const status = computed<Status>(() => {
    if (isError.value) return 'error'
    if (props.block.result) return 'ok'
    const id = props.block.id
    return id && runningTools?.value.has(id) ? 'running' : 'none'
  })

  /**
   * What this call cost the context window, near enough to compare two rows.
   *
   * `chars / 4`, the same heuristic the context panel uses, over the input it sent
   * and the result it got back. Always rendered behind a `~` — no offline
   * tokenizer exists, and the real figure is only known per response, not per tool.
   *
   * Une image, elle, ne se compte pas au caractère : le modèle la lit en pavés de
   * 28 px, et le BFF a déjà fait ce calcul (voir `TranscriptImage.tokens`). Sans
   * lui, un `Read` de capture d'écran s'annonçait à ~30 tokens au lieu de ~1 500.
   */
  const tokens = computed(() => {
    const input = props.block.input ? JSON.stringify(props.block.input) : ''
    const result = props.block.result?.content ?? ''
    const visual = images.value.reduce((sum, img) => sum + (img.tokens ?? 0), 0)
    return estimateTokens(input) + estimateTokens(result) + visual
  })
</script>

<style scoped lang="scss">
  .tc {
    border: 1px solid var(--line-2);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    overflow: hidden;
  }
  .tc--error {
    border-color: color-mix(in srgb, var(--danger) 45%, var(--line-2));
  }
  .tc-head {
    /* `width: 100%` plus un padding déborde de la carte en `content-box` — le
     débordement est masqué par l'`overflow: hidden` de `.tc`, mais il rogne
     l'état affiché à droite. */
    box-sizing: border-box;
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    text-align: left;
  }
  .tc-head:hover {
    background: var(--hover-overlay);
  }
  .tc-icon {
    color: var(--brand);
    flex-shrink: 0;
  }
  .tc-name {
    font-size: var(--fs-sm);
    font-weight: 600;
    flex-shrink: 0;
  }
  .tc-summary {
    font-size: var(--fs-xs);
    color: var(--dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .tc-tokens {
    flex-shrink: 0;
    font-size: var(--fs-2xs);
    color: var(--faint);
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--surface-3);
  }
  .tc-status {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
  }
  .tc-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--dim);
  }
  .tc-dot--ok {
    background: var(--pulse);
  }
  .tc-dot--error {
    background: var(--danger);
  }
  /*
  Un outil qui tourne : la pastille respire au lieu de rester éteinte.

  Elle bat plus lentement que les points de la ligne d'activité — celle-ci dit
  « ça avance », celle-là dit « c'est ici que ça se passe ». Deux rythmes
  identiques dans le même écran se liraient comme un seul clignotement.
*/
  .tc-dot--running {
    background: var(--brand);
    animation: tc-breathe 1.8s ease-in-out infinite;
  }

  @keyframes tc-breathe {
    0%,
    100% {
      opacity: 0.35;
      transform: scale(0.8);
    }
    50% {
      opacity: 1;
      transform: scale(1.15);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tc-dot--running {
      animation: none;
    }
  }
  .tc-status-label {
    font-size: var(--fs-2xs);
    color: var(--faint);
  }
  .tc-hooks {
    padding: 0 var(--space-sm) var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .tc-body {
    padding: var(--space-md);
    border-top: 1px solid var(--line);
  }
  .tc-images {
    margin-bottom: var(--space-md);
  }
</style>
