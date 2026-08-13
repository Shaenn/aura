<template>
  <q-btn
    flat
    dense
    round
    no-caps
    size="sm"
    :icon="copied ? 'check' : 'content_copy'"
    :aria-label="copied ? t('common.copied') : buttonLabel"
    :class="['cb', { 'cb--done': copied }]"
    @click.stop="copy"
  >
    <q-tooltip anchor="top middle" self="bottom middle">
      {{ copied ? t('common.copied') : buttonLabel }}
    </q-tooltip>
  </q-btn>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ text: string; label?: string }>();

const { t } = useI18n();

// Le libellé par défaut se calcule, il ne se déclare pas : une valeur passée à
// `withDefaults` est figée à l'import du module, donc jamais retraduite quand la
// langue change.
const buttonLabel = computed(() => props.label ?? t('common.copy'));

const DONE_MS = 2000;
const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.text);
  } catch {
    // Clipboard is unavailable (insecure origin, denied permission). Say nothing
    // rather than claim a copy that did not happen.
    return;
  }
  copied.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => (copied.value = false), DONE_MS);
}

onUnmounted(() => clearTimeout(timer));
</script>

<style scoped lang="scss">
.cb {
  color: var(--dim);
}
.cb:hover {
  color: var(--text);
}
.cb--done {
  color: var(--pulse);
}
</style>
