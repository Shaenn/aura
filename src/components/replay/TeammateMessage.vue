<template>
  <section class="tm" :style="accent ? { borderLeftColor: accent } : undefined">
    <header class="tm-head">
      <q-icon name="forum" size="15px" aria-hidden="true" />
      <span class="tm-from font-mono">{{ block.from || t('replay.teammate.unknown') }}</span>
      <span v-if="block.summary" class="tm-subject">{{ block.summary }}</span>
    </header>

    <!-- Un signal de service, pas de la parole : le harnais le fait passer par le
         même canal, en JSON. Seul son type apprend quelque chose au lecteur ; le
         reste — horodatage, identifiant de panneau tmux — est de la plomberie. -->
    <p v-if="block.notice" class="tm-notice">
      <q-icon :name="NOTICES[block.notice] ?? 'info'" size="14px" aria-hidden="true" />
      {{ said }}
    </p>

    <MarkdownView v-else-if="block.text" :source="block.text" />
    <p v-else class="tm-empty">{{ t('replay.teammate.empty') }}</p>
  </section>
</template>

<script setup lang="ts">
  import type { Block } from '@/services/projects'
  import { agentColor } from '@/utils/agentColors'
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import MarkdownView from './MarkdownView.vue'

  const { t } = useI18n()

  const props = defineProps<{ block: Block }>()

  /** Les quatre signaux du parc — 21 · 6 · 6 · 6 sur 39 corps de service. */
  const NOTICES: Record<string, string> = {
    idle_notification: 'hourglass_empty',
    shutdown_request: 'logout',
    shutdown_approved: 'check_circle',
    teammate_terminated: 'power_settings_new',
  }

  /**
   * Ce que le signal dit. Un type hors des quatre connus se rend tel quel : c'est
   * un identifiant du harnais, pas une phrase à traduire.
   */
  const said = computed((): string => {
    const notice = props.block.notice ?? ''
    return notice in NOTICES ? t(`replay.teammate.notice.${notice}`) : notice
  })

  /**
   * La teinte de l'expéditeur. Le CLI la donne dans l'attribut `color` — 66 blocs
   * du parc sur 97 — et elle vaut mieux que le hachage du nom, qui est un repli :
   * elle est celle que l'équipier porte partout ailleurs dans sa propre session.
   *
   * Un filet, jamais la couleur du texte : voir la note des jetons `--agent-*`.
   */
  const HUES = new Set(['blue', 'green', 'yellow', 'purple', 'pink', 'orange', 'cyan', 'red'])

  const accent = computed((): string | undefined => {
    const given = props.block.color
    if (given && HUES.has(given)) return `var(--agent-${given})`
    return props.block.from ? agentColor(props.block.from) : undefined
  })
</script>

<style scoped lang="scss">
  .tm {
    border: 1px solid var(--line);
    border-left: 2px solid var(--brand-muted);
    border-radius: var(--radius-sm);
    background: var(--surface);
    padding: var(--space-sm) var(--space-md) var(--space-md);
  }
  .tm-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-sm);
    color: var(--brand-muted);
    font-size: var(--fs-sm);
    font-weight: 600;
  }
  .tm-from {
    color: var(--text);
  }
  // L'objet, à côté de l'expéditeur — en retrait, pour que le nom reste le titre.
  .tm-subject {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: var(--fs-xs);
    font-weight: 400;
  }
  .tm-notice {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-sm);
  }
  .tm-empty {
    margin: 0;
    color: var(--dim);
    font-size: var(--fs-sm);
    font-style: italic;
  }
</style>
