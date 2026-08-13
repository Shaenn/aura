<template>
  <div class="tv">
    <p v-if="url" class="wv-url">
      <q-icon name="link" size="14px" aria-hidden="true" />
      <a :href="url" target="_blank" rel="noopener noreferrer" class="wv-link font-mono">
        {{ url }}
      </a>
      <!-- Un 200 ne se signale pas : c'est le cas de 139 appels sur 167, et le
           dire à chaque fois noie les 28 qui ont répondu autre chose. -->
      <span v-if="http" class="wv-code" :class="`wv-code--${http.tone}`">{{ http.label }}</span>
    </p>

    <p v-if="ask" class="wv-ask">{{ ask }}</p>

    <!-- Le harness dit l'échec et la redirection en anglais, dans un texte
         adressé au modèle : « use an authenticated tool (e.g. `gh` …) ». Le
         lecteur du rejeu, lui, veut savoir si la page a répondu. -->
    <p v-if="failed" class="wv-note wv-note--fail" role="status">
      <q-icon name="error_outline" size="15px" aria-hidden="true" />
      <span>{{ t('replay.tools.views.web.failed') }}</span>
    </p>

    <p v-else-if="redirect" class="wv-note wv-note--redirect" role="status">
      <q-icon name="alt_route" size="15px" aria-hidden="true" />
      <span>
        {{ t('replay.tools.views.web.redirected') }}
        <a
          v-if="redirect.href"
          :href="redirect.href"
          target="_blank"
          rel="noopener noreferrer"
          class="wv-link font-mono"
          >{{ redirect.href }}</a
        >
      </span>
    </p>

    <p v-if="weight" class="wv-weight">
      {{ t('replay.tools.views.web.weight', { size: weight }) }}
    </p>

    <OutputPane
      v-if="showOutput"
      :content="block.result?.content ?? ''"
      :is-error="block.result?.isError ?? false"
      :tool-use-id="block.id ?? ''"
      :default-open="block.result?.isError ?? false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Block } from '@/services/projects';
import { asRecord, str } from '../values';
import { fmtBytes } from '@/utils/format';
import OutputPane from '../OutputPane.vue';

import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{ block: Block }>();

const input = computed(() => asRecord(props.block.input));

/** Only `http(s)` reaches the DOM: an `href` is a live link, not a display string. */
const url = computed(() => {
  const raw = str(input.value.url);
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
});

const ask = computed(() => str(input.value.prompt));

/** Le texte du résultat — le sidecar ne porte que le statut HTTP et le poids. */
const text = computed(() => props.block.result?.content ?? '');
const code = computed(() => {
  const c = props.block.result?.meta?.code;
  return typeof c === 'number' ? c : 0;
});

/**
 * Le statut HTTP, montré seulement quand il apporte quelque chose.
 *
 * Le harness ne marque `is_error` sur aucun d'eux : sur les 218 appels du parc,
 * 16 échecs et 12 redirections arrivaient dans le rejeu avec la même pastille
 * verte qu'une page lue.
 */
const http = computed(() => {
  const c = code.value;
  if (!c || c === 200) return null;
  const label = `${c} ${str(props.block.result?.meta?.codeText)}`.trim();
  return { label, tone: c >= 400 ? 'fail' : 'redirect' };
});

const failed = computed(() => code.value >= 400);

/**
 * L'hôte de destination n'est nulle part ailleurs : le `url` du sidecar reste
 * celui qu'on a demandé, y compris sur une redirection. Seul ce texte le porte.
 */
const REDIRECT = /^REDIRECT DETECTED:/;
const redirect = computed(() => {
  if (!REDIRECT.test(text.value)) return null;
  const m = /Redirect URL:\s*(\S+)/.exec(text.value);
  const raw = m?.[1] ?? '';
  try {
    const u = new URL(raw);
    return { href: u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '' };
  } catch {
    return { href: '' };
  }
});

/**
 * Le poids de la page avant extraction.
 *
 * Le rapport à ce qui en est retenu s'étale sur trois ordres de grandeur.
 * Une page d'un mégaoctet dont il reste deux kilo-octets, le rejeu n'en disait
 * rien : on lisait un extrait sans savoir de quelle masse il venait.
 */
const human = fmtBytes;
const weight = computed(() => {
  // Une redirection pèse quelques centaines d'octets — sa propre réponse, pas la
  // page. Annoncer « 443 o parcouru » sous un bandeau qui dit que le contenu n'a
  // pas été lu ferait passer l'un pour l'autre.
  if (failed.value || redirect.value) return '';
  const b = props.block.result?.meta?.bytes;
  return typeof b === 'number' && b > 0 ? human(b) : '';
});

/** Le texte n'apporte rien quand il n'est que le marqueur déjà traduit au-dessus. */
const showOutput = computed(() => {
  if (props.block.result?.isError) return true;
  if (failed.value || redirect.value) return false;
  return Boolean(text.value.trim());
});
</script>

<style scoped lang="scss">
.tv {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.wv-url {
  display: flex;
  align-items: flex-start;
  gap: var(--space-xs);
  margin: 0;
  min-width: 0;
  font-size: var(--fs-xs);
  line-height: 1.5;
}
// Une `q-icon` est une boîte inline-flex qui centre son glyphe, et sa hauteur
// suit sa propre taille — 14 px ici, pas celle du texte à côté. En `baseline`
// elle se calait donc sur son bord inférieur, un peu trop haut. Lui donner la
// hauteur d'une ligne du texte la centre dessus, et `flex-start` la garde en
// tête quand une URL longue passe à la ligne.
.wv-url > .q-icon {
  flex-shrink: 0;
  height: calc(var(--fs-xs) * 1.5);
}
.wv-note > .q-icon {
  flex-shrink: 0;
  height: calc(var(--fs-sm) * 1.5);
}
.wv-link {
  font-size: var(--fs-xs);
  color: var(--brand);
  word-break: break-all;
}
.wv-link:hover {
  color: var(--brand-hover);
}
.wv-ask {
  margin: 0;
  font-size: var(--fs-sm);
  font-style: italic;
  color: var(--muted);
}
.wv-code {
  flex-shrink: 0;
  font-size: var(--fs-2xs);
  border-radius: 999px;
  padding: 1px 8px;
  border: 1px solid currentcolor;
}
.wv-code--fail {
  color: var(--danger);
}
.wv-code--redirect {
  color: var(--warn);
}
.wv-note {
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  font-size: var(--fs-sm);
  line-height: 1.5;
}
.wv-note--fail {
  color: var(--danger);
}
.wv-note--redirect {
  color: var(--muted);
}
.wv-weight {
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--faint);
}
</style>
