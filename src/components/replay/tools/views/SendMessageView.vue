<template>
  <div class="tv">
    <!-- Qui parle à qui. L'expéditeur n'est pas dans l'entrée — un agent ne se
         nomme pas lui-même — mais le harness le renvoie dans le résultat, avec
         la couleur qu'il lui a attribuée. -->
    <p class="smv-route">
      <span v-if="verdict?.sender" class="smv-agent font-mono">
        <span v-if="hue(verdict.senderColor)" class="smv-dot" :class="hue(verdict.senderColor)" />
        {{ verdict.sender }}
      </span>
      <q-icon name="east" size="14px" aria-hidden="true" />
      <span class="smv-agent font-mono">
        <span v-if="hue(verdict?.targetColor)" class="smv-dot" :class="hue(verdict?.targetColor)" />
        {{ target }}
      </span>
      <span v-if="kind" class="smv-kind">{{ kind }}</span>
    </p>

    <ToolChips :items="params" />

    <!-- L'objet, que le CLI exige dès que le message est du texte : trois des
         cinq erreurs dures du parc sont un `summary` oublié. -->
    <h4 v-if="subject" class="smv-subject">{{ subject }}</h4>

    <!-- Un message peut être un ordre de service, et le corps est alors un objet
         — `{type, reason}` pour demander l'arrêt d'un agent,
         `{type, request_id, approve}` pour y répondre. `str()` n'en tirait rien :
         ces 12 appels du parc n'affichaient aucun corps du tout, et la raison de
         l'arrêt se perdait. Il passe avant le corps de texte, sans quoi le
         `content` de repli présenterait cette raison — « fin de la
         discussion » — comme si c'était un message adressé à quelqu'un. -->
    <p v-if="order" class="smv-order">
      <q-icon :name="order.icon" size="15px" aria-hidden="true" />
      <span>{{ order.said }}</span>
    </p>

    <!-- Le corps. `content` ne sert que de repli : il redit `message` mot pour
         mot 41 fois sur 48, et les 7 fois où il en diffère c'est pour en dire
         moins — « [idem] », « synthèse », ou la même phrase coupée à cinquante
         caractères. Jamais un mot de plus, sept fois sur sept. -->
    <section v-else-if="body" class="smv-body">
      <MarkdownView :source="body" />
    </section>

    <KeyValueList v-else-if="!params.length" :input="block.input" />

    <!-- Ce que le harness a fait du message. Il répond en JSON, et ce JSON est à
         73 % le message qu'on vient de lire : `routing.content` est l'entrée à
         l'octet près, 21 fois sur 21. Ne reste à dire que le sort de l'envoi. -->
    <p v-if="verdict" class="smv-verdict" :class="{ 'smv-verdict--no': !verdict.ok }" role="status">
      <q-icon :name="verdict.ok ? 'mark_email_read' : 'report'" size="15px" aria-hidden="true" />
      <span>{{ verdict.said }}</span>
    </p>
    <p v-if="verdict?.output" class="smv-path font-mono" :title="verdict.output">
      <q-icon name="description" size="13px" aria-hidden="true" />
      <span class="smv-dir">{{ dirname(verdict.output) }}</span>
      <span class="smv-base">{{ basename(verdict.output) }}</span>
    </p>

    <OutputPane
      v-if="!verdict"
      :content="raw"
      :is-error="block.result?.isError ?? false"
      :tool-use-id="block.id ?? ''"
      :default-open="block.result?.isError ?? false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Block } from 'src/services/projects';
import { asRecord, bool, chips, str } from '../values';
import { basename, dirname } from '../language';
import ToolChips from '../ToolChips.vue';
import KeyValueList from '../KeyValueList.vue';
import OutputPane from '../OutputPane.vue';
import MarkdownView from 'components/replay/MarkdownView.vue';

import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{ block: Block }>();

const input = computed(() => asRecord(props.block.input));
const raw = computed(() => props.block.result?.content ?? '');

/**
 * Le destinataire. Le schéma en accepte deux noms et le modèle écrit les deux :
 * `to` et `recipient` portent la même valeur 92 fois sur 92 dans le parc — jamais
 * une seule divergence. Un seul est donc montré.
 *
 * 27 appels sur 62 s'adressent non pas à un nom d'équipier (`rf`, `archi`,
 * `team-lead`) mais à un identifiant d'agent de dix-sept caractères. Il n'est pas
 * abrégé : c'est la seule chose qui désigne cet agent.
 */
const target = computed(
  () => str(input.value.to) || str(input.value.recipient) || str(input.value.agentId),
);

const subject = computed(() => str(input.value.summary));

/** Le corps, quand c'en est un — voir `order` pour les ordres de service. */
const body = computed(() => str(input.value.message) || str(input.value.content));

/**
 * `message` · `shutdown_request` · `shutdown_response` — 80 / 6 / 6 dans le parc.
 *
 * `message` ne se nomme pas : c'est le cas ordinaire, et l'annoncer n'apprend
 * rien. Un type inconnu se rend tel quel — c'est un identifiant du harnais.
 */
const NAMED = new Set(['shutdown_request', 'shutdown_response']);

const kind = computed(() => {
  const type = str(input.value.type);
  if (type === 'message') return '';
  return NAMED.has(type) ? t(`replay.tools.views.sendMessage.kind.${type}`) : type;
});

const params = computed(() =>
  chips([
    [t('replay.tools.chips.team'), str(input.value.team_name)],
    // Ce qui rattache une réponse d'arrêt à la demande qui l'a provoquée.
    [
      t('replay.tools.chips.request'),
      str(input.value.request_id) || str(asRecord(input.value.message).request_id),
    ],
  ]),
);

/**
 * Un ordre de service, dit en français. La forme est fixée par le harness — deux
 * types, trois champs — et l'entrée reste lisible au brut si elle en sort.
 */
const order = computed(() => {
  const m = input.value.message;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const o = asRecord(m);
  const type = str(o.type) || str(input.value.type);
  if (type === 'shutdown_request') {
    const reason = str(o.reason) || str(input.value.reason);
    return {
      icon: 'logout',
      said: reason
        ? t('replay.tools.views.sendMessage.askStopWhy', { reason })
        : t('replay.tools.views.sendMessage.askStop'),
    };
  }
  if (type === 'shutdown_response') {
    const yes = bool(o.approve) || bool(input.value.approve);
    return {
      icon: yes ? 'check_circle' : 'block',
      said: t(
        yes ? 'replay.tools.views.sendMessage.approved' : 'replay.tools.views.sendMessage.refused',
      ),
    };
  }
  return null;
});

// ── Le sort de l'envoi ───────────────────────────────────────────────────────
//
// Sept formes, toutes en JSON, mesurées sur les 62 appels du parc : remis en
// boîte 21, agent relancé 22, arrêt approuvé 6, demande d'arrêt transmise 6,
// erreur dure 5, destinataire injoignable 1, mis en file 1. Une forme qu'on ne
// sait pas lire retombe entière sur le pavé brut.

/** « Agent "a37…" had no active task; resumed … Output: C:\… » */
const RESUMED = /^Agent "([^"]+)" (had no active task|was stopped \(([^)]*)\)); resumed/;
const OUTPUT = /Output: (.+)$/;
const SENT = /^Message sent to (.+)'s inbox$/;
const QUEUED = /^Message queued for delivery to (\S+) at its next tool round\.$/;
const SHUTDOWN_SENT = /^Shutdown request sent to ([^.]+)\./;
const SHUTDOWN_OK =
  /^Shutdown approved\. Sent confirmation to ([^.]+)\. Agent (\S+) is now exiting\.$/;
// La phrase a bougé entre la version du parc — « is currently addressable.
// Spawn a new one or use the agent ID. » — et celle d'aujourd'hui, qui dit
// « is reachable » et conseille de vérifier l'orthographe. Seul le début est
// donc reconnu : c'est lui qui porte le nom, et le conseil qui suit ne
// s'adresse pas au lecteur du rejeu mais au modèle qui vient d'échouer.
const NO_AGENT = /^No agent named '([^']+)'/;

/**
 * « la boîte de archi » se lit mal, et l'équipe se nomme elle-même : `archi`,
 * `rf`, `team-lead` dans le parc, plus des identifiants qui commencent tous par
 * un `a`. L'élision n'est donc pas un cas rare ici, c'est la moitié des envois.
 */
const de = (name: string): string => (/^[aeiouâàéèêîôûy]/i.test(name) ? `d'${name}` : `de ${name}`);

interface Verdict {
  ok: boolean;
  said: string;
  sender?: string;
  senderColor?: string;
  targetColor?: string;
  output?: string;
}

const verdict = computed<Verdict | null>(() => {
  if (props.block.result?.isError) return null;
  const text = raw.value.trim();
  if (!text.startsWith('{')) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const o = asRecord(json);
  if (typeof o.success !== 'boolean') return null;
  const said = str(o.message);
  const routing = asRecord(o.routing);
  const colors = {
    ...(str(routing.sender) && { sender: str(routing.sender) }),
    ...(str(routing.senderColor) && { senderColor: str(routing.senderColor) }),
    ...(str(routing.targetColor) && { targetColor: str(routing.targetColor) }),
  };

  // Un envoi refusé. Le seul cas du parc est un destinataire qui n'existe pas ;
  // les autres refus que le harness pourrait rendre gardent leur phrase telle
  // quelle, en anglais — une phrase se lit toujours mieux que le JSON qui la
  // porte, et le bandeau dit déjà que l'envoi a échoué.
  if (o.success === false) {
    const gone = NO_AGENT.exec(said);
    return {
      ok: false,
      said: gone ? t('replay.tools.views.sendMessage.unreachable', { name: gone[1] ?? '' }) : said,
      ...colors,
    };
  }

  const sent = SENT.exec(said);
  if (sent) {
    return {
      ok: true,
      said: t('replay.tools.views.sendMessage.delivered', { who: de(sent[1] ?? '') }),
      ...colors,
    };
  }

  const queued = QUEUED.exec(said);
  if (queued) {
    return {
      ok: true,
      said: t('replay.tools.views.sendMessage.queued', { who: queued[1] ?? '' }),
      ...colors,
    };
  }

  const resumed = RESUMED.exec(said);
  if (resumed) {
    // Le harness distingue l'agent qui n'avait rien en cours de celui qu'il a
    // fallu rouvrir — 15 et 7 fois. Dans les deux cas il repart en arrière-plan
    // depuis son transcript, et son résultat s'écrira dans le fichier annoncé.
    const state =
      resumed[2] === 'had no active task'
        ? t('replay.tools.views.sendMessage.noTask')
        : t('replay.tools.views.sendMessage.wasStopped', { why: resumed[3] ?? '' });
    const out = OUTPUT.exec(said);
    return {
      ok: true,
      said: t('replay.tools.views.sendMessage.resumed', { state }),
      ...colors,
      ...(out?.[1] && { output: out[1] }),
    };
  }

  const ask = SHUTDOWN_SENT.exec(said);
  if (ask) {
    return {
      ok: true,
      said: t('replay.tools.views.sendMessage.stopSent', { who: ask[1] ?? '' }),
      ...colors,
    };
  }

  const bye = SHUTDOWN_OK.exec(said);
  if (bye) {
    return {
      ok: true,
      said: t('replay.tools.views.sendMessage.stopDone', {
        who: bye[1] ?? '',
        agent: bye[2] ?? '',
      }),
      ...colors,
    };
  }
  return null;
});

/** La couleur que le harness donne à l'agent, ramenée à celles qu'on sait peindre. */
const HUES = new Set(['blue', 'green', 'red', 'yellow', 'purple', 'cyan', 'orange']);
const hue = (color?: string): string => (color && HUES.has(color) ? `smv-agent--${color}` : '');
</script>

<style scoped lang="scss">
.tv {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.smv-route {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin: 0;
  font-size: var(--fs-xs);
  color: var(--faint);
}
.smv-agent {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 0 var(--space-xs);
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  color: var(--text);
}
// Le harness peint chaque agent d'une couleur et la répète à chaque envoi : la
// reprendre ici, c'est reconnaître un interlocuteur d'un coup d'œil le long du
// fil. Le parc n'en a montré que trois — bleu, vert, rouge — mais les huit
// teintes du CLI ont déjà leur jeton dans ce dépôt, tenu à l'écart des couleurs
// d'état exprès : un agent n'est pas une erreur.
//
// Un point, jamais la couleur du texte : `pink` et `yellow` ne tiennent pas
// 4,5:1 sur une surface claire. C'est la règle que porte `app.scss` — le nom
// reste en `--text` sur `--surface-2`, la teinte va dans la pastille.
.smv-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
// Les teintes sont citées : sans guillemets, Sass lit `red`, `blue`, … comme des
// valeurs couleur et non comme les morceaux de nom de classe qu'elles sont ici.
@each $hue in ('blue', 'green', 'yellow', 'purple', 'pink', 'orange', 'cyan', 'red') {
  .smv-agent--#{$hue} {
    background: var(--agent-#{$hue});
  }
}
.smv-kind {
  font-style: italic;
}
.smv-subject {
  margin: 0;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text);
}
.smv-body {
  padding: var(--space-md);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  max-height: 420px;
  overflow: auto;
}
.smv-order,
.smv-verdict {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--muted);
}
.smv-verdict--no {
  color: var(--warn);
}
.smv-path {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: var(--fs-2xs);
}
.smv-dir {
  color: var(--faint);
  overflow: hidden;
  text-overflow: ellipsis;
}
.smv-base {
  color: var(--muted);
  flex-shrink: 0;
}
</style>
