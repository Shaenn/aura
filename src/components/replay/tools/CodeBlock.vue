<template>
  <figure class="cbk">
    <figcaption v-if="filename || badge || stat" class="cbk-head">
      <q-icon :name="icon" size="14px" aria-hidden="true" />
      <span v-if="filename" class="cbk-name font-mono" :title="filename">
        {{ shortName }}
      </span>
      <span v-if="badge" class="cbk-lang font-mono">{{ badge }}</span>
      <span v-if="stat" class="cbk-stat font-mono">{{ stat }}</span>
      <q-space />
      <CopyButton
        :text="code"
        :label="
          t('replay.tools.code.copy', {
            what: filename ? shortName : t('replay.tools.code.theCode'),
          })
        "
      />
    </figcaption>

    <div class="cbk-body" :style="{ maxHeight }">
      <pre class="cbk-pre" :class="{ 'cbk-pre--wrap': !lineNumbers }"><code
        v-for="(html, i) in lines"
        :key="i"
        class="cbk-line"
      ><span
          v-if="lineNumbers"
          class="cbk-ln"
          aria-hidden="true"
        >{{ startLine + i }}</span><span class="cbk-code" v-html="html || ' '" /></code></pre>
    </div>
  </figure>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { highlightLines } from '@/utils/markdown';
import { basename } from './language';
import CopyButton from '@/components/ui/CopyButton.vue';

import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    code: string;
    /** highlight.js grammar name; `''` renders as escaped plain text. */
    lang?: string;
    /** What the badge says. Defaults to `lang` — pass `langLabel(path)` for files. */
    label?: string;
    filename?: string;
    /** First line's number — `Read` results start wherever `offset` pointed. */
    startLine?: number;
    lineNumbers?: boolean;
    icon?: string;
    /** A short fact for the header: `+12 −3`, `l. 1-120`, … */
    stat?: string;
    maxHeight?: string;
  }>(),
  {
    lang: '',
    label: '',
    filename: '',
    startLine: 1,
    lineNumbers: true,
    icon: 'code',
    stat: '',
    maxHeight: '420px',
  },
);

const shortName = computed(() => basename(props.filename));
const badge = computed(() => props.label || props.lang);
// `v-html` is safe here: `highlightLines` escapes the source before adding its
// own `<span>` markup (see `utils/markdown.ts`, markdown-it runs with html:false).
const lines = computed(() => highlightLines(props.code, props.lang));
</script>

<style scoped lang="scss">
.cbk {
  margin: 0;
  border: 1px solid var(--line-2);
  border-radius: var(--radius-sm);
  background: var(--bg);
  overflow: hidden;
}
.cbk-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-xs) var(--space-xs) var(--space-md);
  background: var(--code-header-bg);
  border-bottom: 1px solid var(--line);
  color: var(--dim);
  min-height: 34px;
}
.cbk-name {
  color: var(--text);
  font-size: var(--fs-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cbk-lang,
.cbk-stat {
  flex-shrink: 0;
  font-size: var(--fs-2xs);
  color: var(--muted);
}
.cbk-lang {
  padding: 1px 6px;
  border: 1px solid var(--line-2);
  border-radius: 999px;
}
.cbk-body {
  overflow: auto;
}
.cbk-pre {
  margin: 0;
  padding: var(--space-sm) 0;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: var(--fs-sm);
  line-height: 1.55;
}
.cbk-line {
  display: flex;
  min-width: 100%;
  width: max-content;
}
.cbk-line:hover {
  background: var(--hover-overlay);
}
.cbk-ln {
  flex: 0 0 auto;
  min-width: 3.5em;
  padding: 0 var(--space-md) 0 var(--space-sm);
  text-align: right;
  color: var(--faint);
  user-select: none;
}
.cbk-code {
  flex: 1 1 auto;
  padding-right: var(--space-md);
  white-space: pre;
}
/* Sans gouttière de numéros, le code n'a plus de marge à gauche — et une commande
   shell se lit mieux repliée que défilée horizontalement. */
.cbk-pre--wrap .cbk-line {
  width: auto;
}
.cbk-pre--wrap .cbk-code {
  padding-left: var(--space-md);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
