<template>
  <div class="auq">
    <div v-for="(q, qi) in questions" :key="qi" class="auq-q">
      <div class="auq-q-head">
        <span v-if="q.header" class="auq-chip font-mono">{{ q.header }}</span>
        <span v-if="q.multiSelect" class="auq-multi font-mono">{{
          t('agent.ask.multiSelect')
        }}</span>
      </div>
      <p class="auq-question">{{ q.question }}</p>

      <ul class="auq-options">
        <li
          v-for="(o, oi) in q.options"
          :key="oi"
          class="auq-option"
          :class="{ 'auq-option--picked': isPicked(qi, o.label) }"
        >
          <q-icon
            :name="isPicked(qi, o.label) ? 'radio_button_checked' : 'radio_button_unchecked'"
            size="16px"
            class="auq-option-mark"
            aria-hidden="true"
          />
          <div class="auq-option-body">
            <div class="auq-option-label">{{ o.label }}</div>
            <div v-if="o.description" class="auq-option-desc">{{ o.description }}</div>
            <pre v-if="o.preview" class="auq-option-preview font-mono">{{ o.preview }}</pre>
          </div>
        </li>
      </ul>

      <!-- Free-text answer ("Other") that matches no option -->
      <div v-if="answerOf(qi) && !matchesOption(qi)" class="auq-free">
        <q-icon name="reply" size="14px" aria-hidden="true" />
        <span class="auq-free-label font-mono">{{ t('replay.ask.free') }}</span>
        <span class="auq-free-text">{{ answerOf(qi) }}</span>
      </div>
      <div v-else-if="rejected" class="auq-pending font-mono">{{ t('replay.ask.rejected') }}</div>
      <!--
        Le harness a repris la main tout seul. « En attente » serait un
        contresens : personne n'attend plus, la suite s'est écrite sans réponse.
      -->
      <div v-else-if="!answerOf(qi) && afk" class="auq-afk">
        <q-icon name="timer_off" size="14px" aria-hidden="true" />
        {{ t('replay.ask.afk', { n: Math.round(afk / 1000) }) }}
      </div>
      <div v-else-if="!answerOf(qi) && !noteOf(qi)" class="auq-pending font-mono">
        {{ t('replay.ask.pending') }}
      </div>

      <!-- Ce que l'utilisateur a ajouté de sa main, en plus ou à la place. -->
      <div v-if="noteOf(qi)" class="auq-free">
        <q-icon name="edit_note" size="14px" aria-hidden="true" />
        <span class="auq-free-label font-mono">{{ t('replay.ask.note') }}</span>
        <span class="auq-free-text">{{ noteOf(qi) }}</span>
      </div>
    </div>

    <!--
      Un appel dont l'entrée n'a pas passé la validation : rien à montrer, mais
      une carte vide laisserait croire à un défaut d'affichage.
    -->
    <p v-if="!questions.length" class="auq-pending font-mono">{{ t('replay.ask.none') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

interface Option {
  label: string;
  description?: string;
  preview?: string;
}
interface Question {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: Option[];
}

const props = withDefaults(
  defineProps<{
    input: unknown;
    result?: string | null;
    /**
     * Les réponses telles que le harness les a écrites — carte question → réponse.
     *
     * À préférer toujours au texte : voir `answers` plus bas.
     */
    answers?: Record<string, unknown> | null;
    /** Les notes libres, par question — ce que l'utilisateur a écrit en plus. */
    notes?: Record<string, unknown> | null;
    /** Le délai, en ms, au bout duquel le harness a renoncé à attendre. */
    afk?: number;
    rejected?: boolean;
  }>(),
  { result: null, answers: null, notes: null, afk: 0, rejected: false },
);

const { t } = useI18n();

const questions = computed<Question[]>(() => {
  const i = props.input as { questions?: Question[] } | null;
  return Array.isArray(i?.questions) ? i.questions : [];
});

/**
 * Les réponses, par question.
 *
 * Le harness en écrit une carte structurée à côté du texte (`answers`) : c'est
 * elle qui fait foi. Le texte, lui, énumère les couples entre guillemets —
 * `"Question"="Réponse"` — et devient ambigu dès qu'une question en contient
 * elle-même un, ce qui arrive dès qu'on cite un champ ou un format. Mesuré sur
 * le corpus : 17 questions perdaient ainsi leur réponse et s'affichaient « en
 * attente » alors qu'elles avaient été répondues.
 *
 * Le repli sur le texte reste néanmoins nécessaire : 18 appels sur 360 n'ont
 * pas de carte structurée, et un rejeu approximatif y vaut mieux que rien.
 */
const answers = computed<Map<string, string>>(() => {
  const map = new Map<string, string>();
  if (props.rejected) return map;

  if (props.answers) {
    for (const [q, a] of Object.entries(props.answers)) {
      if (typeof a === 'string') map.set(q, a);
    }
    if (map.size) return map;
  }

  const r = props.result ?? '';
  for (const m of r.matchAll(/"([^"]*)"\s*=\s*"([^"]*)"/g)) {
    if (m[1] !== undefined) map.set(m[1], m[2] ?? '');
  }
  return map;
});

/**
 * Ce que l'utilisateur a écrit à côté de son choix, quand ça n'est pas sa
 * réponse redite.
 *
 * Le harness recopie le plus souvent la note dans la réponse — 16 notes au parc,
 * la plupart mot pour mot identiques. L'afficher deux fois n'apprendrait rien.
 */
function noteOf(qi: number): string {
  const q = questions.value[qi];
  if (!q || props.rejected) return '';
  const n = props.notes?.[q.question];
  if (typeof n !== 'string' || !n) return '';
  return n === answerOf(qi) ? '' : n;
}

/**
 * Le marqueur que le harness met dans `answers` quand l'utilisateur n'a coché
 * aucune option et s'est contenté d'écrire. Ce n'est pas une réponse : c'est
 * l'aveu qu'il n'y en a pas, et la note dit tout.
 */
const NO_ANSWER = '(notes only)';

function answerOf(qi: number): string {
  const q = questions.value[qi];
  const a = q ? (answers.value.get(q.question) ?? '') : '';
  return a === NO_ANSWER ? '' : a;
}
function isPicked(qi: number, label: string): boolean {
  const a = answerOf(qi);
  if (!a) return false;
  if (a === label) return true;
  // Only multiSelect answers are comma-joined; splitting a single answer would
  // break any label that contains a comma of its own.
  if (!questions.value[qi]?.multiSelect) return false;
  return a
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .includes(label);
}
function matchesOption(qi: number): boolean {
  const q = questions.value[qi];
  if (!q) return false;
  return q.options.some((o) => isPicked(qi, o.label));
}
</script>

<style scoped lang="scss">
.auq {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}
.auq-q {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.auq-q-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.auq-chip {
  font-size: var(--fs-2xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--brand);
  background: var(--brand-soft);
  border: 1px solid var(--brand-line);
  border-radius: 999px;
  padding: 2px 9px;
}
.auq-multi {
  font-size: var(--fs-2xs);
  color: var(--dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.auq-question {
  margin: 0;
  font-size: var(--fs-md);
  font-weight: 600;
  line-height: 1.4;
}
.auq-options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.auq-option {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
}
.auq-option--picked {
  border-color: var(--brand-line);
  background: var(--brand-soft);
}
.auq-option-mark {
  color: var(--faint);
  margin-top: 1px;
  flex-shrink: 0;
}
.auq-option--picked .auq-option-mark {
  color: var(--brand);
}
.auq-option-body {
  min-width: 0;
}
.auq-option-label {
  font-size: var(--fs-sm);
  font-weight: 600;
}
.auq-option-desc {
  font-size: var(--fs-xs);
  color: var(--muted);
  line-height: 1.5;
  margin-top: 2px;
}
.auq-option-preview {
  margin: var(--space-sm) 0 0;
  padding: var(--space-sm) var(--space-md);
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  font-size: var(--fs-2xs);
  line-height: 1.5;
  color: var(--dim);
  overflow-x: auto;
}
.auq-option--picked .auq-option-preview {
  color: var(--text);
}
.auq-free {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border-left: 2px solid var(--brand-line);
  background: var(--surface);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
.auq-free-label {
  font-size: var(--fs-2xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--dim);
}
.auq-free-text {
  font-size: var(--fs-sm);
  color: var(--text);
}
.auq-pending {
  font-size: var(--fs-xs);
  color: var(--faint);
}
.auq-afk {
  display: flex;
  align-items: baseline;
  gap: var(--space-xs);
  font-size: var(--fs-xs);
  color: var(--muted);
}
</style>
