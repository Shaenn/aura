<template>
  <!-- Sans session courante, rien ne peut aller chercher les octets : on le dit,
       plutôt que d'afficher un cadre cassé. -->
  <p v-if="!urls.length" class="is-none font-mono">🖼 {{ t('replay.images.unloadable', images.length) }}</p>

  <ul v-else class="is-list">
    <li v-for="shot in urls" :key="shot.url" class="is-item">
      <button type="button" class="is-thumb" @click="opened = shot.url">
        <!-- `loading="lazy"` : une session de pilotage navigateur en compte des
             dizaines, et une timeline dépliée ne doit pas toutes les tirer. -->
        <img :src="shot.url" :alt="shot.alt" loading="lazy" decoding="async" class="is-img" />
      </button>
      <div class="is-meta">
        <span class="font-mono">{{ shot.caption }}</span>
        <q-space />
        <q-btn
          flat
          dense
          no-caps
          size="sm"
          class="is-open"
          icon="open_in_new"
          :label="t('replay.images.open')"
          type="a"
          :href="shot.url"
          target="_blank"
          rel="noopener"
        />
      </div>
    </li>
  </ul>

  <q-dialog :model-value="opened !== null" @update:model-value="(v) => !v && (opened = null)">
    <q-card class="is-card surface-card">
      <img v-if="opened" :src="opened" :alt="t('replay.images.full')" class="is-full" />
      <div class="is-actions">
        <q-space />
        <q-btn flat no-caps dense :label="t('common.close')" @click="opened = null" />
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
  // Les images d'un transcript : capture Playwright, `Read` d'un PNG, pièce jointe.
  //
  // Le transcript n'en porte que l'adresse (voir `TranscriptImage`) ; chaque
  // vignette est un `<img>` vers le BFF, servi en `immutable`. Le cache HTTP fait
  // donc le dédoublonnage tout seul, et rien de tout cela ne passe par le JSON de
  // la timeline — c'est ce qui permet d'afficher les 23 captures d'une session
  // sans en alourdir le chargement de 2,6 Mo.
  import type { TranscriptImage } from '@/services/projects'
  import { transcriptImageUrl } from '@/services/projects'
  import { fmtBytes, fmtNum } from '@/utils/format'
  import { computed, inject, ref } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { TRANSCRIPT_SOURCE } from './transcriptSource'

  const { t } = useI18n()

  const props = defineProps<{ images: TranscriptImage[]; label?: string }>()

  const source = inject(TRANSCRIPT_SOURCE, ref(null))
  const opened = ref<string | null>(null)

  const urls = computed(() => {
    const src = source.value
    // Une image collée dans l'Atelier porte son adresse : elle n'est pas encore
    // dans un transcript, et il n'y a donc pas de session d'où la tirer. Les
    // autres continuent de passer par le couple slug / session.
    if (!src && !props.images.some((img) => img.url)) return []
    return props.images
      .map((img, i) => {
        const kind = img.mediaType.replace(/^image\//, '').toUpperCase()
        const what = props.label ?? t('replay.images.alt')
        // Les dimensions valent plus que le poids : c'est d'elles que vient le coût
        // en tokens, et c'est en les réduisant qu'on le fait baisser.
        const size = img.width && img.height ? `${img.width}×${img.height}` : ''
        const cost = img.tokens ? `~${fmtNum(img.tokens)} tokens` : ''
        return {
          url: img.url ?? (src ? transcriptImageUrl(src.slug, src.sessionId, img) : ''),
          alt: props.images.length > 1 ? `${what} (${i + 1}/${props.images.length})` : what,
          caption: [kind, size, fmtBytes(img.bytes), cost].filter(Boolean).join(' · '),
        }
        // Une image sans adresse ne se rend pas : mieux vaut l'omettre qu'un cadre cassé.
      })
      .filter((shot) => shot.url)
  })
</script>

<style scoped lang="scss">
  .is-none {
    margin: 0;
    color: var(--dim);
    font-size: var(--fs-sm);
  }
  .is-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
  }
  .is-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    max-width: 100%;
  }
  .is-thumb {
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--bg);
    cursor: zoom-in;
    overflow: hidden;
    line-height: 0;
  }
  .is-thumb:hover {
    border-color: var(--brand);
  }
  .is-img {
    display: block;
    max-width: min(420px, 100%);
    max-height: 260px;
    object-fit: contain;
  }
  .is-meta {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--fs-2xs);
    color: var(--faint);
  }
  .is-open {
    color: var(--brand);
  }
  .is-card {
    padding: var(--space-md);
    max-width: 94vw;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .is-full {
    display: block;
    max-width: 100%;
    max-height: 80vh;
    object-fit: contain;
  }
  .is-actions {
    display: flex;
    align-items: center;
  }
</style>
