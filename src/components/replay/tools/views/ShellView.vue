<template>
  <div class="tv">
    <p v-if="description" class="tv-desc">{{ description }}</p>

    <p v-if="unsandboxed" class="tv-flag font-mono">
      <q-icon name="lock_open" size="13px" aria-hidden="true" />
      {{ t('replay.tools.views.shell.unsandboxed') }}
    </p>

    <CodeBlock
      v-if="command"
      :code="command"
      :lang="lang"
      :line-numbers="false"
      icon="terminal"
      :stat="background ? t('replay.tools.chips.background') : ''"
      max-height="260px"
    />
    <KeyValueList v-else :input="block.input" />

    <p v-if="notRun" class="tv-state">
      <q-icon name="block" size="14px" aria-hidden="true" />
      {{ notRun }}
    </p>

    <p v-else-if="exit" class="tv-flag tv-flag--danger font-mono">
      <q-icon name="report" size="13px" aria-hidden="true" />
      {{ exit }}
    </p>

    <p v-if="launched" class="tv-state">
      <q-icon name="schedule" size="14px" aria-hidden="true" />
      {{ t('replay.tools.views.shell.launched', { id: launched }) }}
    </p>

    <p v-if="touched.length" class="tv-note">
      {{ t('replay.tools.views.shell.touched', touched.length) }}
      <span v-for="(f, n) in touched" :key="f" class="font-mono">{{ n ? `, ${base(f)}` : base(f) }}</span>
    </p>

    <p v-if="cwd" class="tv-note">
      Le dossier de travail n'a pas été conservé : il est revenu à
      <span class="font-mono">{{ cwd }}</span>
    </p>

    <OutputPane
      :content="body"
      :is-error="block.result?.isError ?? false"
      :tool-use-id="block.id ?? ''"
      :default-open="(block.result?.isError ?? false) && !notRun"
    />

    <p v-if="silent" class="tv-empty">{{ t('replay.tools.views.shell.silent') }}</p>
  </div>
</template>

<script setup lang="ts">
  import type { Block } from '@/services/projects'
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import CodeBlock from '../CodeBlock.vue'
  import KeyValueList from '../KeyValueList.vue'
  import { basename } from '../language'
  import OutputPane from '../OutputPane.vue'
  import { asRecord, bool, str } from '../values'

  const { t } = useI18n()

  const props = defineProps<{ block: Block }>()

  const input = computed(() => asRecord(props.block.input))
  const command = computed(() => str(input.value.command))
  const description = computed(() => str(input.value.description))
  const background = computed(() => bool(input.value.run_in_background))
  /**
   * Le seul champ de l'entrée qui change la nature de ce qui a été exécuté : la
   * commande n'a pas été confinée. 92 appels dans le parc, 0,8 % — assez rare
   * pour qu'on ne le cherche pas, donc assez rare pour qu'il faille le montrer.
   *
   * `timeout` est écarté malgré ses 2 911 appels (24,2 %) : aucune commande du
   * parc ne l'a jamais dépassé, et ce que le délai laissait deviner — « ceci va
   * être long » — la description le dit déjà dans 96 % des appels `PowerShell`.
   */
  const unsandboxed = computed(() => bool(input.value.dangerouslyDisableSandbox))
  /** The `PowerShell` tool speaks pwsh; `Bash` speaks sh even on Windows. */
  const lang = computed(() => (props.block.name === 'PowerShell' ? 'powershell' : 'bash'))

  const raw = computed(() => props.block.result?.content ?? '')
  const isError = computed(() => props.block.result?.isError === true)

  /**
   * Le CLI agrafe à la sortie d'une commande des lignes qui ne viennent pas
   * d'elle, toujours en bloc à la toute fin — vérifié sur 820 résultats du parc,
   * sans une exception :
   *
   *   `[rerun: b5]`             la poignée qui permet de relancer l'appel — 739
   *   `Shell cwd was reset to …` le `cd` de la commande n'a pas survécu — 271
   *   `[result-id: r2]`         celle qui permet d'y renvoyer, jamais seule :
   *                             elle précède toujours `[rerun:]` — 117
   *   `[This command modified…]` l'avertissement « relis avant d'éditer » — 82
   *
   * 1 260 lignes en tout, affichées jusqu'ici comme la sortie de la commande. Les
   * poignées sont de la plomberie et disparaissent ; les deux autres disent
   * quelque chose, et le disent désormais en français.
   */
  const RERUN = /^\[rerun: [^\]]+\]$/
  const RESULT_ID = /^\[result-id: [^\]]+\]$/
  const MODIFIED = /^\[This command modified \d+ files? you've previously read: (.+?)\.? Call Read/
  const CWD_RESET = /^Shell cwd was reset to (.+?)\.?$/

  /**
   * `is_error` recouvre deux choses très différentes : la commande a échoué, ou
   * la commande n'a jamais tourné. Le second cas pèse 447 des 1 123 échecs du
   * parc — un refus de permission, un appel annulé, une interruption — et
   * s'affichait comme les autres : cadre rouge ouvert d'office sur une phrase
   * anglaise du CLI, alors qu'il n'y a rien à lire d'une commande non exécutée.
   */
  const REFUSED = /^Permission /
  const DECLINED = /^The user doesn't want to proceed/
  const CANCELLED = /^<tool_use_error>(Cancelled|Sibling tool call)/
  const INTERRUPTED = /^\[Request interrupted|interrupted by user/

  /** Toujours la première ligne, et toujours avec `is_error` : 661 résultats. */
  const EXIT = /^Exit code (\d+)/

  /** Ce qu'un code veut dire quand il le veut sans ambiguïté ; sinon, rien. */
  const MEANINGS = new Set(['1', '2', '126', '127', '130'])

  /** `run_in_background` ne rend pas une sortie mais une promesse : 140 résultats. */
  const BACKGROUND = /^Command running in background with ID: (\S+?)\./

  /** La sortie sans le bloc de service final, et ce que ce bloc disait. */
  const parsed = computed(() => {
    const lines = raw.value.split('\n')
    const touched: string[] = []
    let cwd = ''
    let end = lines.length - 1
    while (end >= 0) {
      const line = (lines[end] ?? '').trim()
      if (!line) {
        end--
        continue
      }
      const mod = MODIFIED.exec(line)
      const reset = CWD_RESET.exec(line)
      if (mod) {
        touched.unshift(...(mod[1] ?? '').split(', ').filter(Boolean))
      } else if (reset) {
        cwd = reset[1] ?? ''
      } else if (!RERUN.test(line) && !RESULT_ID.test(line)) {
        break
      }
      end--
    }
    return { body: lines.slice(0, end + 1).join('\n'), touched, cwd }
  })

  const touched = computed(() => parsed.value.touched)

  /**
   * Un `cd` posé dans la commande ne survit pas à l'appel : le CLI le dit en fin
   * de sortie, 271 résultats, toujours en dernière ligne. C'est la ligne qui
   * explique pourquoi la commande suivante ne trouve pas ses fichiers — elle vaut
   * mieux qu'un rang de plus dans le pavé.
   */
  const cwd = computed(() => parsed.value.cwd)

  const launched = computed(() => BACKGROUND.exec(parsed.value.body.trim())?.[1] ?? '')

  const notRun = computed(() => {
    if (!isError.value) return ''
    const text = parsed.value.body.trim()
    if (REFUSED.test(text)) return t('replay.tools.views.shell.refused')
    if (DECLINED.test(text)) return t('replay.tools.views.shell.declined')
    if (CANCELLED.test(text)) return t('replay.tools.views.shell.cancelled')
    if (INTERRUPTED.test(text)) return 'Commande interrompue.'
    return ''
  })

  const exit = computed(() => {
    const code = EXIT.exec(parsed.value.body)?.[1]
    if (!code) return ''
    return MEANINGS.has(code)
      ? t('replay.tools.views.shell.exitMeaning', {
          code,
          meaning: t(`replay.tools.views.shell.meaning.${code}`),
        })
      : t('replay.tools.views.shell.exit', { code })
  })

  /**
   * Ce qui reste à montrer. La phrase d'arrière-plan est rendue au-dessus, en
   * français et sans son chemin temporaire : le fichier qu'elle désigne n'existe
   * plus au moment où on relit la session.
   */
  const body = computed(() => (launched.value ? parsed.value.body.split('\n').slice(1).join('\n') : parsed.value.body))

  /**
   * Une commande qui réussit sans rien écrire ne laissait aucune trace : le pavé
   * de résultat se retire de lui-même quand il est vide. 138 résultats du parc,
   * qui ne contenaient que le bloc de service, s'affichaient donc comme un appel
   * sans réponse — ce qui se lit comme un affichage cassé.
   */
  const silent = computed(() => !body.value.trim() && !isError.value && !launched.value)

  function base(p: string): string {
    return basename(p)
  }
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
    font-style: italic;
    color: var(--muted);
  }
  /*
  Flux en ligne, et non flex.

  La phrase peut se replier sur deux lignes et l'icône doit rester sur la
  première : `align-items: baseline` la posait 3 px trop haut, mesuré à l'écran.
  Un `q-icon` n'a pas de ligne de base propre — c'est une boîte flex sans texte
  — alors le navigateur la synthétise sur le bord de sa boîte, ce qui n'a aucun
  rapport avec celle du texte d'à côté. Le `vertical-align: middle` que Quasar
  pose déjà sur l'icône s'appuie, lui, sur les métriques de la police.
*/
  .tv-state {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--muted);
  }
  .tv-state .q-icon {
    margin-right: var(--space-xs);
  }
  .tv-note {
    margin: 0;
    font-size: var(--fs-2xs);
    color: var(--faint);
  }
  .tv-empty {
    margin: 0;
    font-size: var(--fs-xs);
    color: var(--faint);
  }

  // Même badge que « tout remplacer » sur un diff : un fait de portée, pas un état.
  .tv-flag {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    align-self: flex-start;
    margin: 0;
    font-size: var(--fs-2xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--warn);
    border: 1px solid var(--line-2);
    border-radius: 999px;
    padding: 1px 6px;
  }
  .tv-flag--danger {
    color: var(--danger);
  }
</style>
