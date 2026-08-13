<template>
  <div class="tv">
    <ToolChips :items="params" />
    <p v-if="description" class="tv-desc">{{ description }}</p>

    <p v-if="stopped" class="tv-state">
      <q-icon name="stop_circle" size="14px" aria-hidden="true" />
      {{ stopped.what }}
    </p>

    <!-- Sans grammaire : le harnais ne dit pas dans quel interpréteur la commande
         avait été lancée — `local_bash` couvre aussi bien `Bash` que `PowerShell`
         — et colorer du pwsh comme du sh est un mensonge de plus, pas un de
         moins. 3 des 55 commandes tiennent sur plusieurs lignes. -->
    <CodeBlock
      v-if="stopped?.command"
      :code="stopped.command"
      :line-numbers="false"
      icon="terminal"
      max-height="200px"
    />

    <KeyValueList v-if="!params.length && !description && !stopped" :input="block.input" />

    <OutputPane
      :content="body"
      :is-error="block.result?.isError ?? false"
      :tool-use-id="block.id ?? ''"
      :default-open="block.result?.isError ?? false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Block } from '@/services/projects';
import { asRecord, chips, num, str } from '../values';
import ToolChips from '../ToolChips.vue';
import CodeBlock from '../CodeBlock.vue';
import KeyValueList from '../KeyValueList.vue';
import OutputPane from '../OutputPane.vue';

import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{ block: Block }>();

const input = computed(() => asRecord(props.block.input));
const description = computed(() => str(input.value.description, str(input.value.reason)));

/**
 * Deux outils de nom voisin, deux mondes.
 *
 * `TaskCreate` et `TaskUpdate` numérotent le plan de travail — « #3 », un rang
 * dans la liste de droite — et ne passent pas par ici : le jalon les prend, et
 * les 1 031 appels du parc n'ont pas produit une seule erreur, donc l'échappée
 * `isError` de `isTaskMarker` n'a jamais servi. Ce que cette vue rend, ce sont
 * les 55 `TaskStop`.
 *
 * Or leur `task_id` n'est pas un rang mais une poignée d'arrière-plan —
 * `b6esw55k7`, le même jeton que `ShellView` annonce en lançant une commande
 * détachée. L'étiquette « tâche », posée à l'identique sur les deux, envoyait
 * chercher dans le plan un numéro qui n'y est pas.
 */
const stop = computed(() => props.block.name === 'TaskStop');

const params = computed(() =>
  chips([
    ['sujet', str(input.value.subject)],
    [
      t(stop.value ? 'replay.tools.chips.background' : 'replay.tools.chips.task'),
      str(input.value.taskId, str(input.value.task_id)),
    ],
    ['statut', str(input.value.status)],
    [
      t('replay.tools.chips.delay'),
      num(input.value.delaySeconds)
        ? t('replay.tools.chips.seconds', { n: num(input.value.delaySeconds) })
        : '',
    ],
    [t('replay.tools.chips.stop'), input.value.stop === true ? t('replay.tools.chips.yes') : ''],
  ]),
);

const raw = computed(() => props.block.result?.content ?? '');

/**
 * Ce que `TaskStop` répond : un objet JSON, jamais une phrase.
 *
 * 54 des 55 résultats du parc — le cinquante-cinquième est l'erreur « déjà
 * terminée » — portent `{message, task_id, task_type, command}`, 391 caractères
 * en médiane, jusqu'à 2 309. Il s'affichait tel quel, accolades comprises, alors
 * qu'il ne dit que deux choses : ce qui a été arrêté, et la commande que c'était.
 * `message` n'est que la concaténation anglaise des deux autres — vérifié sur
 * les 55.
 *
 * Lu ici plutôt qu'au serveur : la liste blanche de `structuredResult` existe
 * pour éviter de charger le cache du BFF d'un doublon du texte, et ici le texte
 * *est* l'objet. Rien à recopier.
 */
const stopped = computed(() => {
  if (!stop.value || props.block.result?.isError) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  if (!str(o.task_id)) return null;
  // 50 `local_bash`, 4 `local_agent` : arrêter un processus et arrêter un
  // sous-agent ne sont pas le même geste, et c'est le seul champ qui les sépare.
  // Sous ce même nom `command`, le premier range une ligne de commande — jusqu'à
  // 1 055 caractères, parfois sur plusieurs lignes — et le second le libellé du
  // sous-agent, « Rédaction SF ». L'un veut un pavé de code, l'autre une phrase.
  const agent = str(o.task_type) === 'local_agent';
  const command = str(o.command);
  if (agent) {
    return {
      what: command
        ? `Arrêt du sous-agent « ${command} », lancé en arrière-plan.`
        : t('replay.tools.views.task.stopAgent'),
      command: '',
    };
  }
  return { what: t('replay.tools.views.task.stopCommand'), command };
});

/** Une fois l'objet lu, il ne reste rien à déplier : le pavé se retire. */
const body = computed(() => (stopped.value ? '' : raw.value));
</script>

<style scoped lang="scss">
.tv {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.tv-desc {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--muted);
  white-space: pre-wrap;
}
// Même correction que dans `ShellView` : `align-items: baseline` posait l'icône
// trop haut, un `q-icon` n'ayant pas de ligne de base propre. En flux, le
// `vertical-align: middle` de Quasar s'aligne sur les métriques de la police.
.tv-state {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--muted);
}
.tv-state .q-icon {
  margin-right: var(--space-xs);
}
</style>
