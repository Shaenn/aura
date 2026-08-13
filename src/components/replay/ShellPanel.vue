<template>
  <div class="sh">
    <!--
      Ce qui est fini derrière un repli, comme les plans clos de `TaskPanel`.

      Une session de travail lance des attentes en série — `until netstat …`,
      `until curl …` — qui meurent en quelques secondes chacune. Les laisser
      s'empiler pousserait sous la ligne de flottaison le seul shell qui compte :
      celui qui tient encore un port.
    -->
    <q-btn
      v-if="past.length"
      flat
      dense
      no-caps
      size="sm"
      align="left"
      class="sh-past"
      :icon="pastOpen ? 'expand_less' : 'expand_more'"
      :label="t('replay.shells.past', past.length)"
      :aria-expanded="pastOpen"
      :aria-controls="pastId"
      @click="pastOpen = !pastOpen"
    />

    <ul v-if="pastOpen && past.length" :id="pastId" class="sh-list sh-list--past">
      <ShellLine
        v-for="shell in past"
        :key="shell.id"
        :shell="shell"
        :now="now"
        :open="opened === shell.id"
        @toggle="toggle(shell.id)"
        @navigate="emit('navigate', shell.toolUseId)"
      >
        <ShellOutputView v-if="opened === shell.id" :state="output" />
      </ShellLine>
    </ul>

    <ul class="sh-list">
      <ShellLine
        v-for="shell in live"
        :key="shell.id"
        :shell="shell"
        :now="now"
        :open="opened === shell.id"
        @toggle="toggle(shell.id)"
        @navigate="emit('navigate', shell.toolUseId)"
      >
        <ShellOutputView v-if="opened === shell.id" :state="output" />
      </ShellLine>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ShellLine from './ShellLine.vue';
import ShellOutputView, { type OutputState } from './ShellOutputView.vue';
import { getShellOutput, type BackgroundShell } from '@/services/agent';

const { t } = useI18n();

const props = defineProps<{ runId: string; shells: BackgroundShell[] }>();
const emit = defineEmits<{ navigate: [uuid: string] }>();

const pastId = useId();
const pastOpen = ref(false);

/** Ce qui tourne encore, et ce qui est retombé. */
const live = computed(() => props.shells.filter((s) => s.state === 'running'));
const past = computed(() => props.shells.filter((s) => s.state !== 'running'));

/**
 * L'horloge du panneau, qui n'avance que tant qu'un shell est vivant.
 *
 * Le serveur ne pousse la liste que lorsqu'elle change. Or ce qu'on cherche à
 * lire ici est précisément l'inverse d'un changement : une sentinelle coincée
 * n'écrit rien, donc rien ne part, donc l'écart afficherait « il y a une
 * minute » pendant une heure. Le chrono court côté client, comme celui de
 * `ActivityLine`.
 */
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;

watch(
  () => live.value.length > 0,
  (running) => {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
    if (!running) return;
    now.value = Date.now();
    ticker = setInterval(() => {
      now.value = Date.now();
    }, 5_000);
  },
  { immediate: true },
);

// ── La sortie dépliée ───────────────────────────────────────────────────────
//
// Une seule à la fois : deux pavés de terminal ouverts côte à côte dans une
// colonne de 320 px ne se lisent ni l'un ni l'autre, et chacun demande son
// propre rafraîchissement.

const opened = ref('');
const output = ref<OutputState>({ text: '', loading: false, error: '' });
let poller: ReturnType<typeof setInterval> | null = null;
/** Le curseur rendu par le serveur : on ne redemande que la suite. */
let cursor = 0;

function toggle(id: string): void {
  if (opened.value === id) {
    opened.value = '';
    stopPolling();
    return;
  }
  opened.value = id;
  output.value = { text: '', loading: true, error: '' };
  cursor = 0;
  void pull();
  startPolling();
}

async function pull(): Promise<void> {
  const id = opened.value;
  if (!id) return;
  try {
    const chunk = await getShellOutput(props.runId, id, cursor);
    // La réponse a pu croiser un repli, ou l'ouverture d'un autre shell.
    if (opened.value !== id) return;
    cursor = chunk.size;
    const before = chunk.skipped ? `${t('replay.shells.skipped', { n: chunk.skipped })}\n` : '';
    output.value = {
      text: output.value.text + before + chunk.text,
      loading: false,
      error: '',
    };
  } catch (e) {
    if (opened.value !== id) return;
    output.value = {
      text: output.value.text,
      loading: false,
      error: e instanceof Error ? e.message : String(e),
    };
    stopPolling();
  }
}

/**
 * Le rafraîchissement ne suit que ce qui vit.
 *
 * Un shell terminé a rendu tout ce qu'il rendra : redemander sa sortie toutes
 * les deux secondes ne changerait qu'un compteur de requêtes.
 */
function startPolling(): void {
  stopPolling();
  const shell = props.shells.find((s) => s.id === opened.value);
  if (shell?.state !== 'running') return;
  poller = setInterval(() => void pull(), 2_000);
}

function stopPolling(): void {
  if (!poller) return;
  clearInterval(poller);
  poller = null;
}

// Un shell qui se termine pendant qu'on le regarde : on prend sa dernière
// sortie, puis on cesse de demander.
watch(
  () => props.shells.find((s) => s.id === opened.value)?.state,
  (state) => {
    if (state && state !== 'running') {
      void pull();
      stopPolling();
    }
  },
);

onUnmounted(() => {
  if (ticker) clearInterval(ticker);
  stopPolling();
});
</script>

<style scoped lang="scss">
.sh {
  padding: var(--space-sm) var(--space-md) var(--space-md);
}

.sh-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Ce qui est retombé s'enfonce d'un cran et se sépare de ce qui tourne. */
.sh-list--past {
  padding-left: var(--space-sm);
  padding-bottom: var(--space-xs);
  margin-bottom: var(--space-xs);
  border-bottom: 1px solid var(--line);
}

/* Même couture que `TaskPanel` : une ligne, quel que soit le nombre. */
.sh-past {
  width: 100%;
  color: var(--faint);
  font-size: var(--fs-xs);
}
</style>
