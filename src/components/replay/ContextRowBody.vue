<template>
  <!--
    Le corps d'une ligne, partagé par les trois vues. Il vit tantôt dans un
    `<summary>`, tantôt dans un `<div>` — donc pas de `<li>` ni de `<button>`
    autour : un bouton dans un `<summary>` n'est pas atteignable au clavier.
  -->
  <span class="crb">
    <span v-if="pill" class="crb-pill" :style="{ color, borderColor: color }">{{ pill }}</span>

    <span class="crb-label" :title="row.path ?? row.label">{{ row.label }}</span>

    <!--
      Le chemin complet, tel qu'il était sur le disque de la session. `@click.stop`
      dans `CopyButton` empêche le pli de s'ouvrir sous le doigt.
    -->
    <CopyButton
      v-if="row.path"
      :text="row.path"
      :label="t('replay.context.copyPath', { path: row.path })"
      class="crb-copy"
    />

    <!--
      Le tour où cette injection est entrée dans la fenêtre. Cliquer y emmène :
      c'est ce qui fait la différence entre un tableau de bord et un outil.
    -->
    <a
      v-if="row.uuid"
      class="crb-turn font-mono"
      href="#"
      :aria-label="t('replay.context.goToTurn', { n: row.turnIndex + 1 })"
      @click.prevent.stop="emit('navigate', row.uuid)"
      >@{{ row.turnIndex + 1 }}</a
    >

    <span class="crb-tokens font-mono">~{{ fmtNum(row.tokens) }}</span>

    <!--
      Un Edit pèse à l'aller, un Read au retour : le total seul ne dit pas lequel
      des deux cette session paie. En colonne, il rognait le libellé.
    -->
    <span v-if="row.inputTokens !== undefined" class="crb-split font-mono">
      {{
        t('replay.context.split', {
          in: fmtNum(row.inputTokens),
          out: fmtNum(row.outputTokens ?? 0),
        })
      }}
    </span>
  </span>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { fmtNum } from 'src/utils/format';
import CopyButton from 'components/ui/CopyButton.vue';
import type { ContextRowModel } from './contextRows';

const { t } = useI18n();

defineProps<{
  row: ContextRowModel;
  pill?: string | undefined;
  color?: string | undefined;
}>();

const emit = defineEmits<{ navigate: [uuid: string] }>();
</script>

<style scoped lang="scss">
.crb {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.crb-pill {
  flex: none;
  font-size: var(--fs-2xs);
  line-height: 1.4;
  padding: 0 4px;
  border: 1px solid;
  border-radius: var(--radius-xs);
  background: transparent;
}

.crb-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
}

.crb-copy {
  flex: none;
  opacity: 0;
}
.crb:hover .crb-copy,
.crb-copy:focus-visible {
  opacity: 1;
}

.crb-turn {
  flex: none;
  color: var(--brand-muted);
  text-decoration: none;
  border-bottom: 1px dotted currentcolor;

  &:hover {
    color: var(--brand);
  }
  &:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
}

.crb-tokens {
  flex: none;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

/* Sur sa propre ligne : en colonne, il réduisait le libellé à « 1 appel d'ou… ». */
.crb-split {
  flex: 1 0 100%;
  font-size: var(--fs-2xs);
  color: var(--faint);
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}
</style>
