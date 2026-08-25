<template>
  <div class="prp">
    <header class="prp-head">
      <q-icon name="folder_open" size="16px" aria-hidden="true" />
      <span class="section-label">{{ t('resources.panelTitle') }}</span>
      <!-- Ce que l'arbre montre, le compteur l'annonce — les plans et les dossiers
           inclus compris, même si leurs fichiers vivent hors du `.claude` du
           projet. -->
      <span v-if="data" class="prp-count font-mono">
        {{
          treeCount({
            resources: data.resources,
            memories: data.memories,
            repoDocs: data.repoDocs,
            folders: data.folders,
            plans,
          })
        }}
      </span>
      <q-btn flat dense round size="sm" icon="refresh" :aria-label="t('resources.reloadAria')" :disable="loading" @click="reload" />
    </header>

    <div v-if="loading && !data" class="prp-skel">
      <q-skeleton type="rect" height="28px" class="q-mb-sm" />
      <q-skeleton type="rect" height="80px" class="q-mb-sm" />
      <q-skeleton type="rect" height="48px" />
    </div>

    <div v-else-if="error" class="prp-state" role="alert">
      <q-icon name="error_outline" size="24px" color="negative" aria-hidden="true" />
      <p>{{ error }}</p>
      <q-btn flat no-caps dense :label="t('common.retry')" @click="reload" />
    </div>

    <ProjectResourcesNav
      v-else-if="data"
      :resources="data.resources"
      :memories="data.memories"
      :repo-docs="data.repoDocs"
      :folders="data.folders"
      :has-claude-dir="data.hasClaudeDir"
      :active-resource-rel="activeSource === 'resource' ? activeRel : ''"
      :active-memory-rel="activeSource === 'memory' ? activeRel : ''"
      :active-included-rel="activeSource === 'included' ? activeRel : ''"
      :plans="plans"
      :active-plan-name="activeSource === 'plan' ? activeRel : ''"
      @open-resource="(r) => emit('open', r, 'resource')"
      @open-memory="(r) => emit('open', r, 'memory')"
      @open-included="(r) => emit('open', r, 'included')"
      @open-plan="openPlan"
    />
  </div>
</template>

<script setup lang="ts">
  /**
   * L'inventaire d'un projet, chargé quand on le regarde et pas avant.
   *
   * Il vit dans un écran de direct, où tout le reste se rafraîchit — le transcript
   * sur événement, le rythme toutes les trente secondes. Les ressources, non :
   * elles ne changent que si l'on édite un fichier, et relire l'arborescence au
   * rythme du flux serait du travail pur pour un résultat identique. Le
   * rechargement est donc un geste, pas une horloge.
   *
   * Les dossiers inclus s'y montrent comme dans la page Projet — c'est le même
   * inventaire — mais sans `can-include` : on les lit ici, on les choisit là-bas.
   * Un même réglage édité depuis deux écrans, c'est deux endroits où le corriger.
   */
  import { getProjectPlans, getProjectResources, type ProjectResources, type ResourceNode } from '@/services/projects'
  import type { PlanInfo } from '@/services/system'
  import { ref, watch } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { treeCount, type ResourceSource } from './projectResources'
  import ProjectResourcesNav from './ProjectResourcesNav.vue'

  const props = withDefaults(
    defineProps<{
      slug: string
      /** L'onglet est-il visible ? Rien n'est demandé au serveur tant qu'il ne l'est pas. */
      active?: boolean
      /** La ressource ouverte dans le dialogue, pour la surligner dans l'arbre. */
      activeRel?: string
      activeSource?: ResourceSource
    }>(),
    { active: false, activeRel: '', activeSource: 'resource' },
  )

  const emit = defineEmits<{ open: [r: ResourceNode, source: ResourceSource] }>()

  const { t } = useI18n()

  const data = ref<ProjectResources | null>(null)
  /**
   * Les plans du projet — le même groupe que dans la page Projet.
   *
   * Ils vivent dans `~/.claude/plans`, hors du projet, d'où une seconde requête :
   * l'inventaire du `.claude` ne les connaît pas. Un projet sans plan fait
   * disparaître le groupe de lui-même.
   */
  const plans = ref<PlanInfo[]>([])

  /**
   * Un plan n'est pas un `ResourceNode`, mais il se lit comme lui.
   *
   * Le dialogue attend un nœud ; on lui en donne un, avec le nom lisible en titre
   * et le fichier en chemin — et `source: 'plan'`, qui décide de la route de
   * lecture. La catégorie ne sert qu'au vocabulaire de frontmatter, qu'un plan
   * n'a pas.
   */
  function openPlan(p: PlanInfo): void {
    emit(
      'open',
      {
        category: 'docs',
        rel: p.name,
        name: p.title || p.name,
        title: p.title,
        description: '',
        size: p.size,
        mtime: p.mtime,
      },
      'plan',
    )
  }
  /** Le projet que `data` décrit — ce qui distingue « déjà chargé » de « à charger ». */
  const loadedSlug = ref('')
  const loading = ref(false)
  const error = ref('')

  async function load(slug: string, force = false): Promise<void> {
    if (!slug) return
    if (!force && loadedSlug.value === slug && data.value) return
    loading.value = true
    error.value = ''
    try {
      // Les plans sont une requête à part, et leur échec n'est pas celui de
      // l'inventaire : un `~/.claude/plans` vide ou illisible ne doit pas priver
      // l'écran des agents, des skills et des règles du projet.
      const [res, planList] = await Promise.all([getProjectResources(slug), getProjectPlans(slug).catch(() => ({ plans: [] as PlanInfo[] }))])
      // Le projet a pu changer pendant la requête : on jette la réponse tardive.
      if (props.slug !== slug) return
      data.value = res
      plans.value = planList.plans
      loadedSlug.value = slug
    } catch (e) {
      if (props.slug !== slug) return
      error.value = e instanceof Error ? e.message : t('resources.errors.unreadable')
    } finally {
      loading.value = false
    }
  }

  function reload(): void {
    void load(props.slug, true)
  }

  // Deux déclencheurs, une seule condition : l'onglet est ouvert et l'on sait de
  // quel projet il s'agit. Changer de session dans le même projet ne déclenche
  // rien — l'inventaire ne dépend pas de la session.
  watch(
    () => [props.active, props.slug] as const,
    ([active, slug]) => {
      if (!active || !slug) return
      if (loadedSlug.value && loadedSlug.value !== slug) {
        data.value = null
        plans.value = []
        loadedSlug.value = ''
      }
      void load(slug)
    },
    { immediate: true },
  )
</script>

<style scoped lang="scss">
  .prp {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-md);
  }
  .prp-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--muted);
  }
  .prp-count {
    font-size: var(--fs-xs);
    color: var(--dim);
    margin-left: auto;
  }
  .prp-skel {
    padding: 0 var(--space-xs);
  }
  .prp-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-lg) var(--space-md);
    color: var(--muted);
    text-align: center;
  }
  .prp-state p {
    margin: 0;
    font-size: var(--fs-sm);
  }
</style>
