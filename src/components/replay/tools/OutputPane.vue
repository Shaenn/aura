<template>
  <!-- Un résultat sans texte n'a pas de pavé : soit l'outil n'a rien écrit — et
       l'en-tête de l'appel le dit déjà —, soit tout son résultat est une image,
       rendue au-dessus. Un cadre « Résultat · vide » ne ferait que répéter. -->
  <section v-if="text || isError" class="op" :class="{ 'op--error': isError }">
    <button
      type="button"
      class="op-head"
      :aria-expanded="open"
      :aria-controls="bodyId"
      @click="open = !open"
    >
      <q-icon :name="open ? 'expand_more' : 'chevron_right'" size="16px" aria-hidden="true" />
      <span class="section-label">{{
        isError ? t('replay.tools.output.error') : t('replay.tools.output.result')
      }}</span>
      <span class="op-dot" :class="`op-dot--${status}`" aria-hidden="true" />
      <span class="op-status">{{ t(`replay.tools.output.status.${status}`) }}</span>
      <q-space />
      <span v-if="persisted" class="op-size font-mono">{{ persisted.size }}</span>
      <span v-else class="op-size font-mono">{{ t('replay.tools.output.lines', lineCount) }}</span>
    </button>

    <div v-if="open" :id="bodyId" class="op-body">
      <div v-if="persisted" class="op-persisted">
        <p class="op-note">
          Sortie trop volumineuse pour le transcript ({{ persisted.size }}). Claude Code n'en a
          gardé qu'un aperçu et a écrit le reste sur le disque.
        </p>
        <q-btn
          v-if="canLoad && !full"
          unelevated
          no-caps
          size="sm"
          color="primary"
          :loading="loading"
          :label="t('replay.tools.output.loadFull')"
          @click="loadFull"
        />
        <p v-else-if="!canLoad" class="op-note op-note--dim">
          {{ t('replay.tools.output.noReload') }}
        </p>
        <p v-if="error" class="op-error" role="alert">{{ error }}</p>
      </div>

      <!-- `v-html` is safe: `ansiToHtml` escapes the source before adding its
           own `<span>` markup (see `utils/ansi.ts`). -->
      <pre class="op-pre"><code v-html="shownHtml" /></pre>

      <div class="op-actions">
        <q-btn
          v-if="truncatable"
          flat
          dense
          no-caps
          size="sm"
          class="op-more"
          :label="
            clamped
              ? t('replay.tools.output.seeAll', { n: lineCount })
              : t('replay.tools.output.reduce')
          "
          @click="clamped = !clamped"
        />
        <q-space />
        <CopyButton :text="plain" :label="t('replay.tools.output.copy')" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, inject, useId } from 'vue';
import { useExpandable } from '@/composables/useExpandAll';
import { readToolResult } from '@/services/projects';
import { ansiToHtml, stripAnsi } from '@/utils/ansi';
import { TRANSCRIPT_SOURCE } from '../transcriptSource';
import CopyButton from '@/components/ui/CopyButton.vue';

import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    content: string;
    isError?: boolean;
    /** `tool_use` id — the persisted output is named after it. */
    toolUseId?: string;
    defaultOpen?: boolean;
  }>(),
  { isError: false, toolUseId: '', defaultOpen: false },
);

const CLAMP_LINES = 20;

const bodyId = `op-${useId()}`;
// `defaultOpen` was read once at setup and never again, so the page-wide
// expand/collapse could not reach a result pane. It can now.
//
// Mais pas le dépliage automatique du tour suivi en direct : il ouvrait aussi
// les résultats, qui se refermaient au tour suivant — le temps de les lire, ils
// avaient disparu. Le suivi montre donc ce que l'outil *fait* ; ce qu'il répond
// reste à un clic. Un échec, lui, arrive déjà ouvert par `defaultOpen`.
const open = useExpandable(props.defaultOpen, { followSticky: false });
const clamped = ref(true);
const full = ref('');
const loading = ref(false);
const error = ref('');

const source = inject(TRANSCRIPT_SOURCE, ref(null));

type Status = 'ok' | 'error' | 'empty';

const status = computed<Status>(() => {
  if (props.isError) return 'error';
  return props.content.trim() ? 'ok' : 'empty';
});

/**
 * Claude Code replaces an oversized tool result with a pointer to a file:
 *
 *   <persisted-output>
 *   Output too large (96.2KB). Full output saved to: …/tool-results/toolu_xxx.txt
 *
 *   Preview (first 2KB):
 *   …
 *   </persisted-output>
 *
 * We surface the size and offer to read the file back, rather than printing the
 * marker verbatim as the timeline does today.
 */
const PERSISTED =
  /^<persisted-output>\s*\nOutput too large \(([^)]+)\)\. Full output saved to: (.+?)\n/;

const persisted = computed(() => {
  const m = PERSISTED.exec(props.content);
  if (!m) return null;
  const preview = props.content
    .replace(PERSISTED, '')
    .replace(/^\s*Preview \(first [^)]*\):\s*\n/, '')
    .replace(/\n?\.\.\.\n?<\/persisted-output>\s*$/, '')
    .replace(/\n?<\/persisted-output>\s*$/, '');
  return { size: m[1] ?? '', path: m[2] ?? '', preview };
});

const canLoad = computed(() => Boolean(props.toolUseId && source.value));

/** What the pane shows: the loaded file, else the preview, else the raw content. */
const text = computed(() => full.value || persisted.value?.preview || props.content);
const lineCount = computed(() => text.value.split('\n').length);
const truncatable = computed(() => lineCount.value > CLAMP_LINES);
const shown = computed(() =>
  truncatable.value && clamped.value
    ? text.value.split('\n').slice(0, CLAMP_LINES).join('\n')
    : text.value,
);
/** Terminal output still carries its SGR codes — render them, don't print them. */
const shownHtml = computed(() => ansiToHtml(shown.value));
/** Copying should hand over the text, not the escape codes painting it. */
const plain = computed(() => stripAnsi(text.value));

async function loadFull(): Promise<void> {
  const src = source.value;
  if (!src || !props.toolUseId) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await readToolResult(src.slug, src.sessionId, props.toolUseId);
    full.value = res.content;
    if (res.truncated) error.value = t('replay.tools.output.tooBig');
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('replay.tools.output.unreadable');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped lang="scss">
.op {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
}
.op--error {
  border-color: color-mix(in srgb, var(--danger) 45%, var(--line-2));
}
.op-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-md);
  background: none;
  border: none;
  color: var(--dim);
  cursor: pointer;
  text-align: left;
}
.op-head:hover {
  background: var(--hover-overlay);
}
.op-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  flex-shrink: 0;
  background: var(--dim);
}
.op-dot--ok {
  background: var(--pulse);
}
.op-dot--error {
  background: var(--danger);
}
.op-status {
  font-size: var(--fs-2xs);
  color: var(--muted);
}
.op-size {
  font-size: var(--fs-2xs);
  color: var(--faint);
}
.op-body {
  padding: var(--space-md);
  border-top: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.op-persisted {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-sm);
}
.op-note {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--muted);
}
.op-note--dim {
  color: var(--faint);
  font-style: italic;
}
.op-error {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--danger);
}
.op-pre {
  margin: 0;
  padding: var(--space-md);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow-x: auto;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: var(--fs-sm);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 480px;
}
.op--error .op-pre {
  color: color-mix(in srgb, var(--danger) 85%, var(--text));
}
.op-actions {
  display: flex;
  align-items: center;
}
.op-more {
  color: var(--brand);
}
</style>
