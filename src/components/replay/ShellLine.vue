<template>
  <li class="sl" :class="`sl--${shell.state}`">
    <!--
      Le bouton déplie la sortie ; il ne navigue pas.

      C'est l'inverse d'une ligne de plan, où le clic renvoie au tour. Ici le
      tour n'apprend rien — l'appel qui a lancé un serveur dit « lancé », et
      c'est tout ce qu'il dira jamais. Ce qu'on vient chercher est ce que le
      serveur écrit depuis, et il l'écrit ailleurs que dans le fil.
    -->
    <div class="sl-row">
      <q-btn flat dense no-caps size="sm" align="left" class="sl-btn" :aria-expanded="open" :aria-controls="bodyId" @click="emit('toggle')">
        <q-icon :name="icon" size="14px" class="sl-icon" aria-hidden="true" />
        <span class="sl-name">{{ shell.description || shell.command }}</span>
      </q-btn>
      <q-btn
        flat
        dense
        size="sm"
        icon="north_east"
        class="sl-goto"
        :title="t('replay.shells.goto')"
        :aria-label="t('replay.shells.goto')"
        @click="emit('navigate')"
      />
    </div>

    <p class="sl-meta">{{ meta }}</p>

    <div v-if="open" :id="bodyId" class="sl-body">
      <!-- La commande entière, que la ligne du haut a pu rogner. -->
      <p class="sl-cmd font-mono">{{ shell.command }}</p>
      <slot />
    </div>
  </li>
</template>

<script setup lang="ts">
  import type { BackgroundShell } from '@/services/agent'
  import { fmtBytes, fmtDuration, fmtTime } from '@/utils/format'
  import { computed, useId } from 'vue'
  import { useI18n } from 'vue-i18n'

  const { t } = useI18n()

  const props = defineProps<{ shell: BackgroundShell; now: number; open: boolean }>()
  const emit = defineEmits<{ toggle: []; navigate: [] }>()

  const bodyId = useId()

  /**
   * À partir de quand un silence se dit.
   *
   * Le serveur relit les tailles toutes les deux secondes ; un shell bavard est
   * donc toujours « silencieux » depuis une ou deux secondes, ce qui ne veut rien
   * dire. Quinze secondes : au-delà, une boucle qui écrivait a cessé d'écrire, et
   * c'est ce qu'on cherchait à voir.
   */
  const QUIET_MS = 15_000

  const icon = computed(() => {
    if (props.shell.state === 'running') return 'play_circle'
    if (props.shell.state === 'killed') return 'stop_circle'
    return props.shell.exitCode ? 'error' : 'check_circle'
  })

  /**
   * La ligne d'état, qui dit deux choses selon le camp où le shell se trouve.
   *
   * Vivant, ce qui compte est le silence : `until netstat … :5001` boucle sans
   * écrire un octet, et c'est le seul signe qu'il ne finira jamais. Terminé, ce
   * qui compte est le code de sortie — le silence n'a plus rien à annoncer.
   */
  const meta = computed(() => {
    const shell = props.shell
    const at = fmtTime(shell.startedAt)

    if (shell.state !== 'running') {
      const how =
        shell.state === 'killed'
          ? t('replay.shells.stopped')
          : t(shell.exitCode ? 'replay.shells.failed' : 'replay.shells.done', {
              code: shell.exitCode ?? 0,
            })
      return `${at} · ${how}`
    }

    const size = shell.size ? fmtBytes(shell.size) : ''
    if (!shell.lastWriteAt) return [at, t('replay.shells.noOutput')].join(' · ')

    // L'écart se mesure sur le `now` du panneau, jamais sur `Date.now()` : une
    // horloge par ligne ferait battre dix minuteurs pour une seule question, et
    // un `Date.now()` lu ici ne redéclencherait aucun calcul — la ligne
    // afficherait « il y a une minute » pendant une heure.
    const idle = props.now - shell.lastWriteAt
    // En deçà du seuil, on ne dit que la taille : annoncer « rien écrit depuis
    // 1 s » d'un serveur qui écrit toutes les deux secondes donne l'alerte à
    // l'envers. Le silence n'est une nouvelle que lorsqu'il dure.
    const silence = idle >= QUIET_MS ? t('replay.shells.lastWrite', { ago: fmtDuration(idle) }) : ''
    return [at, size, silence].filter(Boolean).join(' · ')
  })
</script>

<style scoped lang="scss">
  .sl {
    min-width: 0;
    padding: var(--space-xs) 0;
  }
  .sl + .sl {
    border-top: 1px solid var(--line);
  }

  .sl-row {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  /*
  Le bouton porte une ligne, pas une étiquette.

  `q-btn` centre son contenu et le met en majuscules du thème Material : `align`
  et `no-caps` défont l'un et l'autre. Le `:deep` atteint le conteneur interne
  que Quasar pose autour du slot — sans lui, le texte long ne se tronque pas, il
  élargit la colonne.
*/
  .sl-btn {
    flex: 1;
    min-width: 0;
    color: var(--muted);
    font-size: var(--fs-sm);
  }
  .sl-btn :deep(.q-btn__content) {
    flex-wrap: nowrap;
    gap: var(--space-sm);
    min-width: 0;
  }

  .sl-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /*
  L'icône porte l'état, la couleur la nuance.

  Un shell qui tourne est la seule chose de cette colonne qui demande quelque
  chose au lecteur : il prend la couleur de marque, les autres restent gris.
*/
  .sl-icon {
    flex: none;
    color: var(--faint);
  }
  .sl--running .sl-icon {
    color: var(--brand);
  }
  .sl--running .sl-name {
    color: var(--text);
  }

  /*
  Le renvoi vers le fil ne se montre qu'au survol.

  Il ne se cache pas au clavier pour autant : `:focus-within` le fait
  réapparaître dès que la tabulation l'atteint. Une cible invisible qu'on peut
  atteindre mais pas voir serait pire que pas de cible du tout.
*/
  .sl-goto {
    flex: none;
    color: var(--faint);
    opacity: 0;
    transition: opacity var(--motion-fast);
  }
  .sl:hover .sl-goto,
  .sl:focus-within .sl-goto {
    opacity: 1;
  }

  .sl-meta {
    margin: 0 0 0 calc(14px + var(--space-sm) + var(--space-xs));
    font-size: var(--fs-2xs);
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }

  .sl-body {
    margin-top: var(--space-xs);
    padding-left: var(--space-xs);
  }
  .sl-cmd {
    margin: 0 0 var(--space-xs);
    font-size: var(--fs-2xs);
    color: var(--faint);
    overflow-wrap: anywhere;
  }
</style>
