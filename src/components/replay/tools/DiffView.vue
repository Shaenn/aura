<template>
  <figure class="dv">
    <figcaption class="dv-head">
      <q-icon name="edit" size="14px" aria-hidden="true" />
      <span v-if="filename" class="dv-name font-mono" :title="filename">{{ shortName }}</span>
      <span v-if="label" class="dv-lang font-mono">{{ label }}</span>
      <span class="dv-stat font-mono">
        <span v-if="stat.added" class="dv-stat-add">+{{ stat.added }}</span>
        <span v-if="stat.removed" class="dv-stat-del">−{{ stat.removed }}</span>
        <span v-if="!stat.added && !stat.removed" class="dv-stat-none">{{ t('replay.tools.diff.identical') }}</span>
        <span v-if="replaceAll" class="dv-stat-scope">{{ t('replay.tools.diff.perOccurrence') }}</span>
      </span>
      <q-space />
      <span v-if="replaceAll" class="dv-flag font-mono">{{ t('replay.tools.diff.replaceAll') }}</span>
      <CopyButton :text="after" :label="t('replay.tools.diff.copyNew')" />
    </figcaption>

    <div class="dv-body" :style="{ maxHeight }">
      <table class="dv-table">
        <caption class="sr-only">
          {{
            t('replay.tools.diff.caption', { file: shortName || t('replay.tools.diff.editedFile') })
          }}
          {{
            stat.added
          }}
          ligne(s) ajoutée(s),
          {{
            stat.removed
          }}
          supprimée(s)<template v-if="replaceAll">, à chaque occurrence du motif dans le fichier — le nombre d'occurrences n'est pas connu</template
          >.
        </caption>
        <tbody>
          <tr v-for="(row, i) in rows" :key="i" :class="`dv-row dv-row--${row.op}`">
            <td class="dv-ln" aria-hidden="true">{{ row.oldNo || '' }}</td>
            <td class="dv-ln" aria-hidden="true">{{ row.newNo || '' }}</td>
            <td class="dv-sign">{{ SIGN[row.op] }}</td>
            <td class="dv-code"><span v-html="row.html || ' '" /></td>
          </tr>
        </tbody>
      </table>
    </div>
  </figure>
</template>

<script setup lang="ts">
  import CopyButton from '@/components/ui/CopyButton.vue'
  import { diffLines, diffStat, type DiffOp } from '@/utils/diff'
  import { highlightCode } from '@/utils/markdown'
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { basename, langOf, langLabel } from './language'

  const { t } = useI18n()

  const props = withDefaults(
    defineProps<{
      before: string
      after: string
      filename?: string
      replaceAll?: boolean
      maxHeight?: string
    }>(),
    { filename: '', replaceAll: false, maxHeight: '420px' },
  )

  /** Screen-reader-visible sign; the colour alone must never carry the meaning. */
  const SIGN: Record<DiffOp, string> = { add: '+', del: '−', same: ' ' }

  const shortName = computed(() => basename(props.filename))
  const lang = computed(() => langOf(props.filename))
  const label = computed(() => langLabel(props.filename))

  const lines = computed(() => diffLines(props.before, props.after))
  /**
   * En `replace_all`, ce diff n'est pas un changement mais une règle : il montre ce
   * qui arrive à *chaque* occurrence du motif, pas le total appliqué au fichier.
   * D'où « par occurrence » accolé au compte — sans chiffrer les sites, que ni
   * l'entrée de l'outil ni son résultat ne donnent.
   */
  const stat = computed(() => diffStat(lines.value))

  /**
   * Two gutters, as a unified diff shows them: the line's number before the edit
   * and after it. `Edit` carries fragments, not whole files, so both count from 1
   * — an absolute line number would be a number we do not have.
   *
   * Each line is highlighted on its own. A diff row is a fragment of a fragment;
   * a block comment opened above it is already out of reach.
   */
  const rows = computed(() => {
    let oldNo = 0
    let newNo = 0
    return lines.value.map((l) => ({
      op: l.op,
      oldNo: l.op === 'add' ? 0 : ++oldNo,
      newNo: l.op === 'del' ? 0 : ++newNo,
      html: highlightCode(l.text, lang.value),
    }))
  })
</script>

<style scoped lang="scss">
  .dv {
    margin: 0;
    border: 1px solid var(--line-2);
    border-radius: var(--radius-sm);
    background: var(--bg);
    overflow: hidden;
  }
  .dv-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-xs) var(--space-xs) var(--space-md);
    background: var(--code-header-bg);
    border-bottom: 1px solid var(--line);
    color: var(--dim);
    min-height: 34px;
  }
  .dv-name {
    color: var(--text);
    font-size: var(--fs-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dv-lang {
    flex-shrink: 0;
    font-size: var(--fs-2xs);
    color: var(--muted);
    padding: 1px 6px;
    border: 1px solid var(--line-2);
    border-radius: 999px;
  }
  .dv-stat {
    flex-shrink: 0;
    display: flex;
    gap: var(--space-xs);
    font-size: var(--fs-xs);
  }
  .dv-stat-add {
    color: var(--diff-add-text);
  }
  .dv-stat-del {
    color: var(--diff-del-text);
  }
  .dv-stat-none {
    color: var(--faint);
  }
  .dv-stat-scope {
    color: var(--muted);
    font-size: var(--fs-2xs);
  }
  .dv-flag {
    flex-shrink: 0;
    font-size: var(--fs-2xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--warn);
    border: 1px solid var(--line-2);
    border-radius: 999px;
    padding: 1px 6px;
  }
  .dv-body {
    overflow: auto;
  }
  .dv-table {
    border-collapse: collapse;
    width: 100%;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: var(--fs-sm);
    line-height: 1.55;
  }
  .dv-row--add {
    background: var(--diff-add-bg);
    box-shadow: inset 3px 0 0 var(--diff-add-line);
  }
  .dv-row--del {
    background: var(--diff-del-bg);
    box-shadow: inset 3px 0 0 var(--diff-del-line);
  }
  .dv-ln {
    width: 1%;
    min-width: 2.6em;
    padding: 0 var(--space-xs);
    text-align: right;
    color: var(--faint);
    user-select: none;
    white-space: nowrap;
  }
  .dv-sign {
    width: 1%;
    padding: 0 var(--space-sm) 0 var(--space-xs);
    user-select: none;
    color: var(--dim);
  }
  .dv-row--add .dv-sign {
    color: var(--diff-add-text);
  }
  .dv-row--del .dv-sign {
    color: var(--diff-del-text);
  }
  .dv-code {
    padding-right: var(--space-md);
    white-space: pre;
    width: 100%;
  }
</style>
