<template>
  <div class="tv">
    <!-- A failed Read has no file to show: only the reason. -->
    <OutputPane v-if="failed" :content="result?.content ?? ''" is-error :tool-use-id="block.id ?? ''" default-open />

    <p v-else-if="identical" class="tv-identical">
      <q-icon name="content_copy" size="14px" aria-hidden="true" />
      {{ identical }}
    </p>

    <template v-else-if="file">
      <div v-if="markdown" class="tv-toggle">
        <SegmentedControl v-model="mode" :options="MODES" :aria-label="t('replay.tools.views.read.display')" />
      </div>

      <MarkdownView v-if="markdown && mode === 'preview'" :source="file.code" />
      <CodeBlock
        v-else
        :code="file.code"
        :lang="lang"
        :label="label"
        :filename="filePath"
        :start-line="file.startLine"
        :stat="range"
        icon="description"
      />

      <!-- Claude Code appends reminders after the file body; they are not the file. -->
      <details v-if="file.trailer" class="tv-trailer" :open="trailerOpen" @toggle="onTrailerToggle">
        <summary>
          <q-icon name="info" size="13px" aria-hidden="true" />
          {{ t('replay.tools.views.read.trailer') }}
        </summary>
        <pre class="tv-pre"><code>{{ file.trailer }}</code></pre>
      </details>
    </template>

    <OutputPane v-else :content="result?.content ?? ''" :is-error="result?.isError ?? false" :tool-use-id="block.id ?? ''" />
  </div>
</template>

<script setup lang="ts">
  import MarkdownView from '@/components/replay/MarkdownView.vue'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import { useExpandable, syncDetails } from '@/composables/useExpandAll'
  import type { Block } from '@/services/projects'
  import { computed, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import CodeBlock from '../CodeBlock.vue'
  import { langOf, langLabel, isMarkdown } from '../language'
  import OutputPane from '../OutputPane.vue'
  import { identicalTo, stripResultIds } from '../serviceLines'
  import { asRecord, num, str } from '../values'

  const { t } = useI18n()

  const props = defineProps<{ block: Block }>()

  const trailerOpen = useExpandable(false)
  const onTrailerToggle = syncDetails(trailerOpen)

  const MODES = [
    { label: 'Code', value: 'code' as const },
    { label: t('replay.tools.views.read.preview'), value: 'preview' as const },
  ]
  const mode = ref<'code' | 'preview'>('preview')

  const input = computed(() => asRecord(props.block.input))
  const filePath = computed(() => str(input.value.file_path))
  const lang = computed(() => langOf(filePath.value))
  const label = computed(() => langLabel(filePath.value))
  const markdown = computed(() => isMarkdown(filePath.value))
  const result = computed(() => props.block.result)
  const failed = computed(() => props.block.result?.isError === true)

  /**
   * Le CLI ne renvoie pas deux fois la même sortie : il remplace la seconde par un
   * renvoi vers la première. 7 lectures du parc sont dans ce cas, et la phrase
   * anglaise s'affichait à la place du fichier, comme si elle en était le contenu.
   */
  const identical = computed(() => (failed.value ? '' : identicalTo(result.value?.content ?? '')))

  /**
   * A `Read` result is the file body with each line prefixed by its real number
   * and a tab: `  2138\t  "semi-fini": …`. We recover both, so the gutter shows the
   * file's own numbering rather than counting from 1.
   *
   * Two shapes measured across 13 410 real results forbid a naive parse:
   *  - the harness may prepend a `<system-reminder>` before the body (80 cases) and
   *    append more after it (437), so the numbered run is not always at the top;
   *  - a file read from `offset: 0` starts at line **0** (8 cases), so "no start
   *    line yet" cannot be encoded as a falsy `0`.
   *
   * When there is no numbered run at all — `Wasted call — file unchanged`, an
   * image, an empty file — we return `null` and the caller shows the raw result.
   */
  const NUMBERED = /^\s*(\d+)\t([\s\S]*)$/

  const file = computed(() => {
    if (failed.value) return null
    const content = result.value?.content ?? ''
    if (!content) return null

    const lines = content.split('\n')
    const body: string[] = []
    let startLine: number | null = null
    let i = 0

    // Skip whatever the harness slipped in front of the file body.
    while (i < lines.length && !NUMBERED.test(lines[i] ?? '')) i++
    const preface = lines.slice(0, i)

    for (; i < lines.length; i++) {
      const m = NUMBERED.exec(lines[i] ?? '')
      if (!m) break
      if (startLine === null) startLine = Number(m[1])
      body.push(m[2] ?? '')
    }
    if (startLine === null) return null

    // Sans la poignée, 356 des 357 replis « Notes ajoutées au résultat » n'ont
    // plus rien à dire — ils promettaient une note et ne livraient qu'un numéro
    // de sortie. Un seul en portait autre chose.
    const notes = stripResultIds([...preface, ...lines.slice(i)].join('\n')).trim()
    return { code: body.join('\n'), startLine, trailer: notes }
  })

  const range = computed(() => {
    const f = file.value
    if (!f) return ''
    const lineCount = f.code.split('\n').length
    const end = f.startLine + lineCount - 1
    // A partial read states where it starts; a whole-file read just states its size.
    const partial = num(input.value.limit) > 0 || num(input.value.offset) > 0
    return partial ? `l. ${f.startLine}-${end}` : `${lineCount} lignes`
  })
</script>

<style scoped lang="scss">
  .tv {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .tv-toggle {
    display: flex;
  }
  .tv-identical {
    display: flex;
    align-items: baseline;
    gap: var(--space-xs);
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--muted);
  }
  .tv-trailer > summary {
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    color: var(--dim);
    font-size: var(--fs-xs);
  }
  .tv-trailer > summary::-webkit-details-marker {
    display: none;
  }
  .tv-pre {
    margin: var(--space-sm) 0 0;
    padding: var(--space-md);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: var(--fs-xs);
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--muted);
    max-height: 240px;
    overflow: auto;
  }
</style>
