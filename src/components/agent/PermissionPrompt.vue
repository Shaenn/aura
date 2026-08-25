<template>
  <section class="pp" :aria-labelledby="headId">
    <header class="pp-head">
      <q-icon name="lock" size="16px" aria-hidden="true" />
      <h3 :id="headId">{{ label }}</h3>
      <span class="pp-since font-mono">{{ since }}</span>
    </header>

    <!--
      Le chemin d'abord, et en entier.

      Mesuré à la Phase 2 : le modèle vise parfois un dossier qu'il a deviné —
      `C:\Users\Utilisateur\…` là où il fallait le dossier de travail — avant de
      se corriger au tour suivant. Autoriser sans voir où l'on écrit est le seul
      vrai danger de cet écran ; le chemin passe donc avant le reste, en mono, et
      sur autant de lignes qu'il en faut.
    -->
    <p v-if="target" class="pp-target font-mono">{{ target }}</p>
    <p v-if="request.description" class="pp-desc">{{ request.description }}</p>
    <p v-if="request.decisionReason" class="pp-reason">{{ request.decisionReason }}</p>

    <details v-if="detail" class="pp-detail">
      <summary>{{ t('agent.permission.detail') }}</summary>
      <pre class="font-mono">{{ detail }}</pre>
    </details>

    <div class="pp-actions">
      <q-btn unelevated no-caps color="primary" :label="t('agent.permission.allow')" :disable="busy" @click="answer('allow')" />
      <q-btn flat no-caps :label="t('agent.permission.always')" :disable="busy" @click="answer('allow-always')" />
      <q-btn flat no-caps :label="t('agent.permission.deny')" :disable="busy" @click="answer('deny')" />
    </div>
  </section>
</template>

<script setup lang="ts">
  import type { PermissionAnswer, PermissionRequest } from '@/services/agent'
  import { computed, ref, onMounted, onUnmounted } from 'vue'
  import { useI18n } from 'vue-i18n'

  const { t } = useI18n()

  const props = defineProps<{ request: PermissionRequest; busy?: boolean }>()
  const emit = defineEmits<{ answer: [PermissionAnswer] }>()

  const headId = computed(() => `perm-${props.request.id}`)

  /**
   * Le libellé de l'action. `title` est ce que le SDK dit de privilégier, mais il
   * arrive vide plus souvent qu'à son tour — les trois niveaux de repli sont donc
   * tous nécessaires, pas décoratifs.
   */
  const label = computed(() => props.request.title || props.request.displayName || props.request.toolName)

  /** Ce sur quoi l'outil va agir : un chemin, une commande, sinon rien. */
  const target = computed(() => {
    const input = props.request.input
    const path = input.file_path ?? input.path ?? input.notebook_path
    if (typeof path === 'string') return path
    if (typeof input.command === 'string') return input.command
    return props.request.blockedPath ?? ''
  })

  /** L'appel entier, pour qui veut vérifier ce que le résumé ne montre pas. */
  const detail = computed(() => {
    try {
      return JSON.stringify(props.request.input, null, 2)
    } catch {
      return ''
    }
  })

  // Une demande qui attend depuis longtemps ne se distingue pas d'une demande
  // fraîche, alors qu'elle expirera. Le compteur le dit sans rien réclamer.
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | null = null
  onMounted(() => {
    timer = setInterval(() => (now.value = Date.now()), 1000)
  })
  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })

  const since = computed(() => {
    const s = Math.max(0, Math.round((now.value - props.request.askedAt) / 1000))
    const unit = t('formats.duration.s')
    return s < 60 ? `${s} ${unit}` : `${Math.floor(s / 60)} ${t('formats.duration.min')} ${String(s % 60).padStart(2, '0')}`
  })

  function answer(value: PermissionAnswer): void {
    emit('answer', value)
  }
</script>

<style scoped>
  .pp {
    border: 1px solid var(--brand-line);
    border-radius: var(--radius-md);
    background: var(--brand-soft);
    padding: var(--space-lg) var(--space-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .pp-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--brand);
  }

  .pp-head h3 {
    font-size: var(--fs-base);
    font-weight: 600;
    margin: 0;
    flex: 1;
    min-width: 0;
  }

  .pp-since {
    font-size: var(--fs-2xs);
    color: var(--dim);
  }

  .pp-target {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--text);
    background: var(--surface-2);
    border-radius: var(--radius-xs);
    padding: var(--space-sm) var(--space-md);
    overflow-wrap: anywhere;
  }

  .pp-desc,
  .pp-reason {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--muted);
  }

  .pp-detail summary {
    font-size: var(--fs-xs);
    color: var(--dim);
    cursor: pointer;
  }

  .pp-detail pre {
    margin: var(--space-sm) 0 0;
    font-size: var(--fs-xs);
    color: var(--muted);
    max-height: 220px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .pp-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    margin-top: var(--space-xs);
  }
</style>
