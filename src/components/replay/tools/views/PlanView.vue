<template>
  <div class="tv">
    <!-- Le plan ne vit pas que dans la session : le CLI l'écrit sur le disque, et
         c'est ce fichier que la fiche du projet liste. Sans son nom, rien ne
         relie le plan qu'on lit ici à celui qui reste. Présent sur les 196
         appels du parc, tous dans `~/.claude/plans`. -->
    <p v-if="planFile" class="pv-file">
      <q-icon name="assignment" size="14px" aria-hidden="true" />
      <span class="font-mono">{{ planFile.name }}</span>
      <span class="pv-file-dir font-mono">{{ planFile.dir }}</span>
    </p>

    <!-- 186 real calls carry a full markdown plan here. Rendering it as escaped
         JSON, as the timeline did, threw away the single most readable artefact
         a session produces. -->
    <article v-if="plan" class="pv-plan">
      <MarkdownView :source="plan" />
    </article>

    <section v-if="allowed.length" class="pv-allowed">
      <h4 class="section-label">{{ t('replay.tools.views.plan.allowed') }}</h4>
      <ul class="pv-list">
        <li v-for="(p, i) in allowed" :key="i">
          <span class="pv-tool font-mono">{{ p.tool }}</span>
          <span class="pv-prompt">{{ p.prompt }}</span>
        </li>
      </ul>
    </section>

    <KeyValueList v-if="!plan && !allowed.length" :input="block.input" />

    <!-- The verdict, without echoing the plan back at the reader. -->
    <template v-if="approval">
      <p class="pv-verdict pv-verdict--ok">
        <q-icon name="check_circle" size="15px" aria-hidden="true" />
        {{ approval.text }}
      </p>

      <section v-if="edited" class="pv-edited">
        <h4 class="section-label">{{ t('replay.tools.views.plan.edited') }}</h4>
        <DiffView :before="plan" :after="approval.approvedPlan" filename="plan.md" />
      </section>
    </template>

    <!-- Un plan sur quatre est refusé, et le CLI le dit en 405 caractères
         d'anglais adressés au modèle. Ce qui compte tient au milieu : la phrase
         de l'utilisateur — « attends je réfléchis », « on abandonne l'idée », ou
         la contre-proposition qui décide de la suite. -->
    <template v-else-if="refusal">
      <p class="pv-verdict pv-verdict--no" role="status">
        <q-icon name="cancel" size="15px" aria-hidden="true" />
        Plan refusé — le travail n'a pas commencé.
      </p>
      <blockquote v-if="refusal.said" class="pv-said">{{ refusal.said }}</blockquote>
    </template>

    <OutputPane
      v-else
      :content="block.result?.content ?? ''"
      :is-error="block.result?.isError ?? false"
      :tool-use-id="block.id ?? ''"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Block } from 'src/services/projects';
import { arr, asRecord, str } from '../values';
import { stripResultIds, userRefusal } from '../serviceLines';
import KeyValueList from '../KeyValueList.vue';
import OutputPane from '../OutputPane.vue';
import DiffView from '../DiffView.vue';
import MarkdownView from 'components/replay/MarkdownView.vue';

import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{ block: Block }>();

const input = computed(() => asRecord(props.block.input));
const plan = computed(() => str(input.value.plan));

/** Le fichier où le CLI a écrit le plan — nom d'abord, dossier en second plan. */
const planFile = computed(() => {
  const p = str(input.value.planFilePath).replace(/\\/g, '/');
  const cut = p.lastIndexOf('/');
  if (cut < 0) return null;
  const dir = p.slice(0, cut);
  return {
    name: p.slice(cut + 1),
    dir: /\/\.claude\/plans$/.test(dir) ? '~/.claude/plans' : dir,
  };
});

const allowed = computed(() =>
  arr(input.value.allowedPrompts)
    .map((raw) => asRecord(raw))
    .map((p) => ({ tool: str(p.tool, 'Bash'), prompt: str(p.prompt) }))
    .filter((p) => p.prompt),
);

const text = computed(() => props.block.result?.content ?? '');

/**
 * An approved `ExitPlanMode` answers with the whole plan appended to its
 * acknowledgement — a second copy of what we just rendered. Split it off: keep
 * the acknowledgement, and use the copy only to reveal what the user changed
 * before approving (the harness labels it "edited by user" either way).
 */
const APPROVED = /^([\s\S]*?)\n#{1,3} Approved Plan[^\n]*\n([\s\S]*)$/;

const approval = computed(() => {
  const result = props.block.result;
  if (!result || result.isError || !plan.value) return null;

  const m = APPROVED.exec(text.value);
  if (!m) return null;
  return {
    text: (m[1] ?? '').split('\n')[0]?.trim() || t('replay.tools.views.plan.approved'),
    // La poignée du CLI est agrafée après la copie du plan, donc *dans* elle.
    // Elle suffisait à faire diverger la copie de l'original : sur 9 plans
    // annoncés « modifiés par l'utilisateur », 6 ne l'étaient pas — c'est le
    // numéro de sortie que le diff montrait comme une modification.
    approvedPlan: stripResultIds(m[2] ?? '').trim(),
  };
});

const refusal = computed(() => userRefusal(text.value));

/**
 * Le plan a-t-il été retouché avant d'être approuvé ? Deux signaux, faux chacun
 * de son côté, justes ensemble.
 *
 * Le drapeau du harness vaut `true` pour des plans rigoureusement identiques —
 * il marque l'enregistrement, pas la retouche. Et la comparaison des textes
 * trouve des divergences, toutes fausses : le fichier de
 * plan est partagé par toute la session, et la copie que le résultat renvoie
 * porte alors un autre plan que celui de l'appel — un titre différent, neuf
 * mille caractères d'écart, que le rejeu présentait comme une édition.
 *
 * Exiger les deux ne perd rien : sur 142 plans approuvés, aucune retouche réelle
 * n'est attestée.
 */
const edited = computed(() => {
  if (props.block.result?.meta?.planWasEdited !== true) return false;
  const a = approval.value;
  return Boolean(a?.approvedPlan && a.approvedPlan !== plan.value.trim());
});
</script>

<style scoped lang="scss">
.tv {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.pv-file {
  display: flex;
  // Le chemin tient sur une ligne : `center` aligne le glyphe dessus sans avoir
  // à lui calculer une hauteur. Voir la même correction dans `GrepView`.
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: var(--fs-xs);
  color: var(--muted);
}
.pv-file > .q-icon {
  flex-shrink: 0;
}
.pv-file-dir {
  color: var(--faint);
  font-size: var(--fs-2xs);
  overflow: hidden;
  text-overflow: ellipsis;
}
.pv-plan {
  padding: var(--space-md) var(--space-lg);
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 2px solid var(--brand-line);
  border-radius: var(--radius-sm);
  max-height: 560px;
  overflow: auto;
}
.pv-allowed {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
// `.section-label` ne porte que la typographie ; sur un `h4`, la marge du
// navigateur reste. Dans une colonne flex elle s'ajoute au `gap`, ce qui
// décollait le titre de sa liste deux fois plus que prévu. Même correction que
// dans `SearchView` et `SkillView`.
.pv-allowed > h4,
.pv-edited > h4 {
  margin: 0;
}
.pv-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.pv-list > li {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  font-size: var(--fs-xs);
}
.pv-tool {
  flex-shrink: 0;
  color: var(--brand);
  font-size: var(--fs-2xs);
  border: 1px solid var(--brand-line);
  border-radius: 999px;
  padding: 1px 6px;
}
.pv-prompt {
  color: var(--muted);
}
.pv-verdict {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--fs-sm);
  color: var(--muted);
}
.pv-verdict--ok {
  color: var(--pulse);
}
.pv-verdict--no {
  color: var(--warn);
}
.pv-said {
  margin: 0;
  padding-left: var(--space-md);
  border-left: 2px solid var(--line-2);
  font-size: var(--fs-sm);
  color: var(--muted);
  white-space: pre-wrap;
}
.pv-edited {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
</style>
