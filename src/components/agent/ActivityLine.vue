<template>
  <!--
    La ligne ne se réserve pas de place : absente, elle ne laisse pas de trou
    sous le fil. Elle n'apparaît que pendant qu'il se passe quelque chose, et
    c'est cette apparition même qui porte le signal.
  -->
  <div v-if="activity.phase" class="al" role="status">
    <PulseDots />

    <span class="al-label">{{ label }}</span>
    <!-- Les chiffres sont retirés de la lecture d'écran : une seconde de plus
         n'est pas une information à annoncer, et l'annoncer couvrirait le reste. -->
    <span v-if="detail" class="al-detail font-mono" aria-hidden="true">{{ detail }}</span>

    <q-space />

    <!-- À droite, ce que le CLI met entre parenthèses : la durée du tour et ce
         qu'il a fait écrire. Deux chiffres qui ne bougent pas au même rythme et
         ne répondent pas à la même question que ceux de gauche. -->
    <span v-if="turn" class="al-turn font-mono" aria-hidden="true">{{ turn }}</span>
    <span v-if="activity.outputTokens" class="al-turn font-mono" aria-hidden="true">
      ↓ {{ fmtNum(activity.outputTokens) }}
      <q-tooltip anchor="top middle" self="bottom middle" class="rp-tt">
        {{ t('agent.activity.outputTooltip') }}
      </q-tooltip>
    </span>
  </div>
</template>

<script setup lang="ts">
  import PulseDots from '@/components/ui/PulseDots.vue'
  import type { AgentActivity, AgentPhase } from '@/services/agent'
  import { fmtNum } from '@/utils/format'
  import { computed, onUnmounted, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'

  const props = defineProps<{ activity: AgentActivity }>()

  const { t } = useI18n()

  /**
   * Ce que chaque phase dit, quand elle n'a rien de plus précis à dire.
   *
   * `tool` n'y figure pas : elle se nomme de ses outils, et « Outil en cours »
   * apprendrait moins que « Bash ». La clé est calculée à l'appel : un libellé
   * posé ici resterait figé dans la langue du démarrage.
   */
  const phaseLabel = (phase: Exclude<AgentPhase, 'tool'>): string => t(`agent.activity.${phase}`)

  /**
   * L'horloge du composant, qui n'avance que pendant qu'on regarde.
   *
   * Le serveur envoie un instant de départ, pas une durée : un chrono qui court
   * côté client tient la seconde sans coûter une trame réseau par seconde. Le
   * `tool_progress` du SDK, lui, corrige quand il passe.
   */
  const now = ref(Date.now())
  let ticker: ReturnType<typeof setInterval> | null = null

  watch(
    () => props.activity.phase !== null,
    (running) => {
      if (ticker) {
        clearInterval(ticker)
        ticker = null
      }
      if (!running) return
      now.value = Date.now()
      ticker = setInterval(() => {
        now.value = Date.now()
      }, 1000)
    },
    { immediate: true },
  )

  onUnmounted(() => {
    if (ticker) clearInterval(ticker)
  })

  const label = computed(() => {
    const { phase, tools, retry } = props.activity
    if (!phase) return ''
    if (phase === 'retrying' && retry) {
      return t('agent.activity.retryAttempt', { attempt: retry.attempt, max: retry.maxRetries })
    }
    if (phase !== 'tool') return phaseLabel(phase)
    if (!tools.length) return t('agent.activity.toolUnnamed')
    // Trois noms tiennent sur une ligne ; au-delà on compte, parce qu'une liste
    // qui déborde ne se lit plus et pousse le chrono hors de l'écran.
    const shown = tools.slice(0, 3).map((t) => t.name)
    const rest = tools.length - shown.length
    return rest > 0 ? `${shown.join(', ')} +${rest}` : shown.join(', ')
  })

  /** Une durée telle qu'on la lit d'un coup d'œil, jamais au dixième. */
  function fmtDuration(seconds: number): string {
    const s = t('formats.duration.s')
    if (seconds < 60) return `${Math.floor(seconds)} ${s}`
    const minutes = Math.floor(seconds / 60)
    return `${minutes} ${t('formats.duration.min')} ${String(Math.floor(seconds % 60)).padStart(2, '0')} ${s}`
  }

  /**
   * Le compteur de la phase — ce qui bouge *à l'intérieur* de ce qui est annoncé.
   *
   * Distinct du chrono du tour : celui-ci répond à « où en est cet outil-là »,
   * l'autre à « depuis combien de temps ça mouline ».
   */
  const detail = computed(() => {
    const { phase, thinkingTokens, tools, since, retry } = props.activity
    if (!phase) return ''
    if (phase === 'retrying') {
      if (!retry) return ''
      // Le SDK annonce un délai, pas une échéance : l'afficher tel quel laisserait
      // « dans 48 s » immobile pendant quarante-huit secondes, ce qui se lit comme
      // un écran gelé — exactement ce qu'on essaie de faire disparaître.
      const left = Math.max(0, retry.delayMs / 1000 - (now.value - since) / 1000)
      return left < 1 ? t('agent.activity.retryNow') : t('agent.activity.retryIn', { n: Math.ceil(left) })
    }
    if (phase === 'thinking' && thinkingTokens) {
      return t('agent.activity.thinkingTokens', { n: fmtNum(thinkingTokens) })
    }
    if (phase !== 'tool') return ''

    // Pour un outil c'est *sa* durée qui compte, pas celle de la phase : deux
    // outils lancés ensemble n'ont pas commencé au même instant. Et le chrono que
    // le SDK mesure lui-même fait foi sur celui qu'on calcule.
    const first = tools[0]
    const seconds = first?.elapsedSeconds ?? Math.max(0, (now.value - (first?.startedAt ?? since)) / 1000)
    // Sous deux secondes, un chrono clignote plus qu'il n'informe.
    return seconds < 2 ? '' : fmtDuration(seconds)
  })

  /**
   * Depuis combien de temps le tour dure — le `10m 8s` du CLI.
   *
   * Cinq secondes avant de l'afficher : en dessous, il n'y a rien à s'expliquer,
   * et un chiffre qui apparaît pour disparaître aussitôt fait plus de bruit que de
   * signal.
   */
  const turn = computed(() => {
    const { turnStartedAt } = props.activity
    if (!turnStartedAt) return ''
    const seconds = Math.max(0, (now.value - turnStartedAt) / 1000)
    return seconds < 5 ? '' : fmtDuration(seconds)
  })
</script>

<style scoped lang="scss">
  .al {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-xs) var(--space-md);
    font-size: var(--fs-xs);
    color: var(--muted);
  }

  .al-label {
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .al-detail,
  .al-turn {
    font-size: var(--fs-2xs);
    color: var(--faint);
    flex: none;
  }
</style>
