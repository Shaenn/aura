<template>
  <!--
    La lecture d'une ressource, en grand.

    Le panneau qui l'ouvre fait 376 px : de quoi parcourir un arbre, pas de quoi
    lire un CLAUDE.md. Le dialogue est téléporté au `body`, donc affranchi de la
    colonne étroite d'où part le geste — et il rend l'écran au flux dès qu'on le
    referme, ce qu'une troisième colonne permanente ne ferait pas.
  -->
  <q-dialog :model-value="resource !== null" @update:model-value="(v) => !v && emit('close')">
    <q-card class="rd-card surface-card" :aria-labelledby="titleId">
      <header class="rd-head">
        <q-icon :name="icon" size="18px" class="rd-icon" aria-hidden="true" />
        <div class="rd-head-main">
          <h2 :id="titleId" class="rd-title">{{ resource?.name }}</h2>
          <span class="rd-path font-mono">{{ resource?.rel }}</span>
        </div>
        <span class="rd-ro font-mono"> <q-icon name="lock" size="12px" aria-hidden="true" /> {{ t('common.readOnly') }} </span>
        <!-- Pas de bouton tant qu'il n'y a rien à copier : un bouton grisé
             occuperait la place et n'apprendrait rien de plus. -->
        <CopyButton v-if="content" :text="content" :label="t('resources.copyContent')" />
        <q-btn v-close-popup flat dense round size="sm" icon="close" :aria-label="t('common.close')" />
      </header>

      <!-- Le corps défile chez lui : `min-height: 0` est ce qui autorise l'enfant
           d'un flex à rétrécir, sans quoi la carte ignorerait sa hauteur max. -->
      <div class="rd-body">
        <div v-if="loading" class="rd-state" role="status">
          <q-spinner size="24px" />
          <span>{{ t('common.loading') }}</span>
        </div>

        <div v-else-if="error" class="rd-state" role="alert">
          <q-icon name="error_outline" size="28px" color="negative" aria-hidden="true" />
          <p>{{ error }}</p>
        </div>

        <template v-else>
          <FrontmatterCard
            v-if="parsed.present"
            class="rd-fm"
            :entries="parsed.entries"
            :keys="fmKeys"
            :fallback-name="resource?.name ?? ''"
            :icon="icon"
            :no-description="t('resources.noDescription')"
          />
          <!-- Un fichier du disque : son balisage brut se rend, il ne s'affiche pas. -->
          <MarkdownView :source="body" allow-html />
        </template>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
  import MarkdownView from '@/components/replay/MarkdownView.vue'
  import CopyButton from '@/components/ui/CopyButton.vue'
  import { readIncludedFile, readMemory, readResource, type ResourceNode } from '@/services/projects'
  import { readPlan } from '@/services/system'
  import { parseDoc, type KeySpec } from '@/utils/resourceFrontmatter'
  import { computed, ref, useId, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import FrontmatterCard from './FrontmatterCard.vue'
  import { CATEGORY_META, FM_KEYS, renderBody, type ResourceSource } from './projectResources'

  const props = withDefaults(
    defineProps<{
      slug: string
      /** `null` ferme le dialogue. Ouvrir, c'est passer un nœud. */
      resource: ResourceNode | null
      /** Quatre provenances, quatre routes de lecture — voir `ResourceSource`. */
      source?: ResourceSource
    }>(),
    { source: 'resource' },
  )

  const emit = defineEmits<{ close: [] }>()

  const { t } = useI18n()

  // Un identifiant par instance : deux cartes ouvertes ne se disputent pas le même
  // `aria-labelledby`, quoi qu'il advienne des pages hôtes.
  const titleId = useId()

  const content = ref('')
  const ext = ref('')
  const loading = ref(false)
  const error = ref('')

  // Chaque provenance a sa route ; un plan n'est pas ici, il se lit par son nom de
  // fichier et n'a pas de slug à passer.
  const READERS: Record<Exclude<ResourceSource, 'plan'>, (slug: string, path: string) => Promise<{ rel: string; content: string }>> = {
    resource: readResource,
    memory: readMemory,
    included: readIncludedFile,
  }

  const icon = computed(() => {
    // Un document du dépôt se lit par la route de la mémoire, sans en être : la
    // catégorie tranche.
    if (props.resource?.category === 'repo') return 'article'
    if (props.source === 'memory') return 'psychology'
    // La même icône que le groupe « Plans » de l'arbre d'où part le clic.
    if (props.source === 'plan') return 'assignment'
    return CATEGORY_META.find((m) => m.key === props.resource?.category)?.icon ?? 'description'
  })

  async function load(node: ResourceNode): Promise<void> {
    content.value = ''
    error.value = ''
    loading.value = true
    try {
      // Un plan ne vit pas dans le projet mais dans `~/.claude/plans`, et se lit
      // par son nom de fichier — le slug n'entre pas dans l'adresse.
      const { content: c } = props.source === 'plan' ? await readPlan(node.rel) : await READERS[props.source](props.slug, node.rel)
      // Cliquer vite sur deux fichiers ne doit pas afficher le contenu du premier
      // sous le titre du second : une réponse qui n'est plus attendue est jetée.
      if (props.resource?.rel !== node.rel) return
      content.value = c
      // Le titre d'un plan est sa première ligne, pas un nom de fichier : c'est
      // `rel` qui porte l'extension, et un plan est du markdown de toute façon.
      ext.value = props.source === 'plan' ? 'md' : (node.name.split('.').pop()?.toLowerCase() ?? '')
    } catch (e) {
      if (props.resource?.rel !== node.rel) return
      error.value = e instanceof Error ? e.message : t('resources.errors.read')
    } finally {
      loading.value = false
    }
  }

  watch(
    () => props.resource,
    (node) => {
      if (node) void load(node)
    },
    { immediate: true },
  )

  // Même lecture et même carte que la page Projet : `parseDoc` extrait le bloc
  // `---…---`, `FrontmatterCard` l'explique, et le vocabulaire suit la catégorie.
  const parsed = computed(() => (ext.value === 'md' ? parseDoc(content.value) : { present: false, entries: [], body: content.value }))
  const fmKeys = computed<KeySpec[]>(() => (props.resource ? (FM_KEYS[props.resource.category] ?? []) : []))
  const body = computed(() => renderBody(ext.value, content.value, parsed.value.body))
</script>

<style scoped lang="scss">
  // Le rayon est répété (`.rd-card.rd-card`) pour l'emporter sur le 4 px que
  // Quasar pose sur `.q-dialog__inner > div` — une spécificité que `.surface-card`
  // seule ne peut pas atteindre. Sans quoi la carte reste à angles vifs quand les
  // blocs du flux, eux, sont arrondis. `overflow: hidden` va avec : c'est lui qui
  // oblige l'en-tête et le corps à suivre l'arrondi au lieu d'en dépasser.
  .rd-card.rd-card {
    width: 900px;
    max-width: 92vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  // L'en-tête est séparé par le filet lumineux du socle, pas par le gris neutre de
  // `q-separator` : c'est la même arête que porte le pourtour de la carte.
  .rd-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    border-bottom: 1px solid var(--glow-line);
    background: linear-gradient(180deg, var(--glow-soft), transparent);
  }
  .rd-icon {
    color: var(--brand);
    flex: 0 0 auto;
  }
  .rd-head-main {
    flex: 1 1 auto;
    min-width: 0;
  }
  .rd-title {
    margin: 0;
    font-size: var(--fs-md);
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rd-path {
    display: block;
    font-size: var(--fs-2xs);
    color: var(--dim);
    word-break: break-all;
  }
  .rd-ro {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--fs-2xs);
    color: var(--faint);
  }
  .rd-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-lg);
  }
  .rd-fm {
    margin-bottom: var(--space-lg);
  }
  .rd-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-xl);
    color: var(--muted);
    text-align: center;
  }
  .rd-state p {
    margin: 0;
  }
</style>
