<template>
  <q-dialog :model-value="modelValue" @update:model-value="(v) => emit('update:modelValue', v)">
    <q-card class="ifd surface-card">
      <header class="ifd-head">
        <q-icon name="create_new_folder" size="18px" aria-hidden="true" />
        <h2 class="ifd-title">{{ t('resources.include.title') }}</h2>
      </header>

      <p class="ifd-intro">{{ t('resources.include.intro') }}</p>

      <div v-if="loading" class="ifd-state"><q-spinner size="22px" /> {{ t('common.loading') }}</div>
      <div v-else-if="error" class="ifd-state" role="alert">
        <q-icon name="error_outline" size="22px" color="negative" aria-hidden="true" />
        <p>{{ error }}</p>
      </div>
      <p v-else-if="!candidates.length" class="ifd-state">{{ t('resources.include.empty') }}</p>

      <div v-else class="ifd-tree">
        <FolderCandidateTree :nodes="tree" :selected="selection" @toggle="toggle" />
      </div>

      <footer class="ifd-actions">
        <span class="ifd-tally font-mono">{{ t('resources.include.selected', selection.length) }}</span>
        <q-btn flat no-caps dense :label="t('common.cancel')" @click="close" />
        <q-btn unelevated no-caps dense color="primary" :label="t('resources.include.apply')" :disable="!changed" @click="apply" />
      </footer>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
  /**
   * Le sélecteur de dossiers à inclure dans l'arbre d'un projet.
   *
   * AURA mesure — combien de documents porte chaque sous-dossier — et propose ;
   * elle ne décide pas. Aucun signe sur le disque ne distingue un `docs/` qu'on lit
   * d'un dossier de gabarits que le programme consomme : c'est la seule chose que
   * la machine ne peut pas trancher à votre place.
   *
   * On y compose une sélection entière, et on l'applique d'un coup. Appliquer à
   * chaque case cochée aurait paru plus direct, mais chaque inclusion relit
   * l'inventaire du projet : on rangeait ses dossiers un par un, en attendant le
   * rechargement entre deux. Une liste se choisit, elle ne se bascule pas.
   */
  import { getFolderCandidates, type FolderCandidate } from '@/services/projects'
  import { computed, ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import FolderCandidateTree from './FolderCandidateTree.vue'
  import { buildCandidateTree } from './projectResources'

  const props = defineProps<{
    modelValue: boolean
    slug: string
    /** Les dossiers déjà inclus — le point de départ de la sélection. */
    included: string[]
  }>()

  const emit = defineEmits<{
    'update:modelValue': [v: boolean]
    apply: [folders: string[]]
  }>()

  const { t } = useI18n()

  const candidates = ref<FolderCandidate[]>([])
  const loading = ref(false)
  const error = ref('')

  const tree = computed(() => buildCandidateTree(candidates.value))

  /** Ce qu'on est en train de choisir. Rien n'est écrit tant qu'on n'applique pas. */
  const selection = ref<string[]>([])

  const key = (l: string[]): string => [...l].sort((a, b) => a.localeCompare(b)).join('\n')
  const changed = computed(() => key(selection.value) !== key(props.included))

  /**
   * Cocher un dossier retire ceux qu'il emporte.
   *
   * L'inclusion est récursive : garder `docs/api` à côté de `docs` ferait deux
   * groupes pour les mêmes fichiers. Le sous-dossier reste coché à l'écran — son
   * ancêtre le couvre — mais il sort de la liste.
   */
  function toggle(rel: string, on: boolean): void {
    selection.value = on ? [...selection.value.filter((f) => !f.startsWith(`${rel}/`)), rel] : selection.value.filter((f) => f !== rel)
  }

  function close(): void {
    emit('update:modelValue', false)
  }

  function apply(): void {
    emit('apply', [...selection.value])
    close()
  }

  // Le parcours coûte un balayage de l'arborescence : on ne le paie qu'à
  // l'ouverture, et une seule fois par ouverture. La sélection repart de ce qui est
  // inclus — rouvrir après avoir annulé ne doit pas garder les cases d'avant.
  watch(
    () => props.modelValue,
    async (open) => {
      if (!open || !props.slug) return
      selection.value = [...props.included]
      loading.value = true
      error.value = ''
      try {
        candidates.value = (await getFolderCandidates(props.slug)).candidates
      } catch (e) {
        error.value = e instanceof Error ? e.message : t('resources.errors.list')
      } finally {
        loading.value = false
      }
    },
  )
</script>

<style scoped lang="scss">
  .ifd {
    width: 520px;
    max-width: 90vw;
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  .ifd-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--muted);
  }
  .ifd-title {
    margin: 0;
    font-size: var(--fs-md);
    font-weight: 600;
    color: var(--text);
  }
  .ifd-intro {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--dim);
  }
  .ifd-state {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--muted);
    font-size: var(--fs-sm);
    padding: var(--space-md) 0;

    p {
      margin: 0;
    }
  }
  .ifd-tree {
    max-height: 46vh;
    overflow-y: auto;
  }
  .ifd-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-sm);
  }
  .ifd-tally {
    margin-right: auto;
    font-size: var(--fs-2xs);
    color: var(--faint);
  }
</style>
