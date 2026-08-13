<template>
  <!--
    Une question, pas une autorisation.

    L'agent ne demande pas la permission de faire quelque chose : il attend une
    réponse pour continuer. D'où un formulaire, et non le bandeau à deux boutons —
    les confondre demanderait deux gestes pour une seule décision.
  -->
  <form class="ap" :aria-labelledby="headId" @submit.prevent="submit">
    <header class="ap-head">
      <q-icon name="help" size="16px" aria-hidden="true" />
      <h3 :id="headId">{{ t('agent.ask.title') }}</h3>
      <!-- Où l'on en est, quand il y a plusieurs questions à répondre. -->
      <span v-if="multi" class="ap-count font-mono">{{ step + 1 }} / {{ questions.length }}</span>
      <q-space />
      <q-btn
        flat
        dense
        round
        size="sm"
        icon="close"
        :aria-label="t('agent.ask.close')"
        @click="emit('close')"
      >
        <q-tooltip>{{ t('agent.ask.closeHint') }}</q-tooltip>
      </q-btn>
    </header>

    <!--
      Une question à la fois.

      Le harness en autorise quatre par appel, et chacune peut porter des
      maquettes de dix lignes : les empiler donnait un formulaire de plusieurs
      écrans où l'on répondait à la première sans savoir que la troisième
      existait. L'en-tête de chaque question — douze caractères, c'est sa
      raison d'être — fait le titre de son étape.
    -->
    <q-stepper
      v-if="multi"
      v-model="step"
      flat
      animated
      header-nav
      class="ap-stepper"
      color="primary"
      active-color="primary"
      done-color="primary"
    >
      <q-step
        v-for="(q, qi) in questions"
        :key="qi"
        :name="qi"
        :title="q.header"
        :done="answered(qi)"
        :header-nav="true"
        icon="help_outline"
        done-icon="check"
      >
        <QuestionFields
          :question="q"
          :model-value="picks[qi]"
          @update:model-value="(v) => setPick(qi, v)"
        />
      </q-step>
    </q-stepper>

    <QuestionFields
      v-else-if="questions[0]"
      :question="questions[0]"
      :model-value="picks[0]"
      @update:model-value="(v) => setPick(0, v)"
    />

    <!-- La précision vaut pour la réponse entière, pas pour une étape : elle vit
         donc hors du stepper, avec le bouton qui l'envoie. -->
    <!-- `spellcheck="false"` comme partout ailleurs : une précision destinée à
         l'agent cite volontiers un chemin ou un identifiant, que le correcteur
         du navigateur souligne comme des fautes. -->
    <q-input
      v-model="notes"
      dense
      outlined
      autogrow
      type="textarea"
      spellcheck="false"
      :label="t('agent.ask.notes')"
      :aria-label="t('agent.ask.notesAria')"
    />

    <div class="ap-actions">
      <q-btn
        v-if="multi && step > 0"
        flat
        no-caps
        icon="chevron_left"
        :label="t('agent.ask.previous')"
        :disable="busy"
        @click="step -= 1"
      />
      <q-space />
      <!-- Tant qu'il reste une question sans réponse, avancer est le seul geste
           offert : c'est plus clair qu'un « Répondre » grisé sans dire pourquoi. -->
      <q-btn
        v-if="multi && step < questions.length - 1"
        unelevated
        no-caps
        color="primary"
        icon-right="chevron_right"
        :label="t('agent.ask.next')"
        :disable="busy || !answered(step)"
        @click="step += 1"
      />
      <q-btn
        v-else
        unelevated
        no-caps
        type="submit"
        color="primary"
        :label="t('agent.ask.submit')"
        :disable="busy || !complete"
      >
        <q-tooltip v-if="!complete && multi">
          {{ t('agent.ask.missing', missing.length) }}
        </q-tooltip>
      </q-btn>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AskRequest } from 'src/services/agent';
import QuestionFields from './QuestionFields.vue';

/**
 * Ce qu'une réponse en cours retient, entre deux ouvertures du dialogue.
 *
 * Le brouillon vit chez l'appelant et non ici : refermer le dialogue démonte ce
 * composant, et une réponse à demi choisie ne doit pas disparaître parce qu'on
 * est allé relire la conversation — c'est même la raison d'être du bouton.
 */
export interface AskDraft {
  /** Un choix par question : une chaîne, ou une liste quand le choix est multiple. */
  picks: (string | string[])[];
  notes: string;
  step: number;
}

const props = defineProps<{ request: AskRequest; busy?: boolean }>();
const draft = defineModel<AskDraft>('draft', { required: true });
const emit = defineEmits<{ answer: [Record<string, string>, string]; close: [] }>();

const { t } = useI18n();

const headId = useId();

const questions = computed(() => props.request.questions);
const multi = computed(() => questions.value.length > 1);

const picks = computed(() => draft.value.picks);
const step = computed({
  get: () => Math.min(draft.value.step, questions.value.length - 1),
  set: (v) => (draft.value = { ...draft.value, step: v }),
});
const notes = computed({
  get: () => draft.value.notes,
  set: (v) => (draft.value = { ...draft.value, notes: v }),
});

function setPick(index: number, value: string | string[]): void {
  const next = [...draft.value.picks];
  next[index] = value;
  draft.value = { ...draft.value, picks: next };
}

/** Une question a sa réponse : une chaîne non vide, ou au moins une case cochée. */
function answered(index: number): boolean {
  const pick = picks.value[index];
  return Array.isArray(pick) ? pick.length > 0 : Boolean(pick);
}

const missing = computed(() => questions.value.map((_, i) => i).filter((i) => !answered(i)));
const complete = computed(() => missing.value.length === 0);

function submit(): void {
  if (!complete.value) return;
  const answers: Record<string, string> = {};
  questions.value.forEach((q, i) => {
    const pick = picks.value[i];
    // Le harness joint les choix multiples par `, ` : on reprend sa forme, parce
    // que c'est elle que le visualiseur relit au rejeu.
    answers[q.question] = Array.isArray(pick) ? pick.join(', ') : (pick ?? '');
  });
  emit('answer', answers, notes.value);
}
</script>

<style scoped>
.ap {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  min-height: 0;
}

.ap-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--text);
}

.ap-head h3 {
  font-size: var(--fs-base);
  font-weight: 600;
  margin: 0;
}

.ap-count {
  font-size: var(--fs-xs);
  color: var(--muted);
}

/* Le stepper de Quasar porte son propre fond et son propre rembourrage : on lui
   retire les deux, la carte du dialogue les fournit déjà. */
.ap-stepper {
  background: transparent;
  min-height: 0;
}
.ap-stepper :deep(.q-stepper__step-inner) {
  padding: var(--space-md) 0 0;
}
.ap-stepper :deep(.q-stepper__header) {
  border-bottom: 1px solid var(--line);
}

.ap-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
</style>
