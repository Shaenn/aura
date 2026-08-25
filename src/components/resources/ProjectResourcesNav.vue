<template>
  <p v-if="!hasClaudeDir && !outsideCount" class="pd-empty">
    <i18n-t keypath="resources.noClaudeDir" scope="global">
      <template #dir><span class="font-mono">.claude</span></template>
    </i18n-t>
  </p>
  <p v-else-if="hasClaudeDir && !resources.length && !outsideCount" class="pd-empty">
    <i18n-t keypath="resources.emptyClaudeDir" scope="global">
      <template #dir><span class="font-mono">.claude</span></template>
    </i18n-t>
  </p>

  <div v-if="resources.length || outsideCount || plans.length" class="pd-nav-groups">
    <!-- Mémoire : les CLAUDE.md et leurs équivalents d'autres outils vivent dans
         l'arborescence des sources, pas dans .claude. D'où le groupe distinct, la
         mention de provenance et leur exclusion du poids .claude. -->
    <div v-if="memories.length" class="pd-group">
      <button
        type="button"
        class="pd-group-head section-label"
        :aria-expanded="isCatOpen('project-memory')"
        :aria-label="
          isCatOpen('project-memory')
            ? t('common.collapse', { label: t('resources.projectMemory') })
            : t('common.expand', { label: t('resources.projectMemory') })
        "
        @click="toggleCat('project-memory')"
      >
        <q-icon :name="isCatOpen('project-memory') ? 'expand_more' : 'chevron_right'" size="14px" aria-hidden="true" />
        <q-icon name="psychology" size="14px" aria-hidden="true" />
        {{ t('resources.projectMemory') }}
        <span class="pd-group-src font-mono">{{ t('resources.outsideClaude') }}</span>
        <span class="pd-group-count">{{ memories.length }}</span>
      </button>
      <RuleTree
        v-if="isCatOpen('project-memory')"
        :nodes="memoryTree"
        :active-rel="activeMemoryRel"
        file-icon="psychology"
        @open="(r) => emit('open-memory', r)"
      />
    </div>

    <!-- Documents du dépôt : README, CONTRIBUTING, LICENSE… Même provenance que
         la mémoire, même route de lecture, mais un groupe à part — Claude Code ne
         les charge pas de lui-même, les ranger sous « Mémoire » mentirait. -->
    <div v-if="repoDocs.length" class="pd-group">
      <button
        type="button"
        class="pd-group-head section-label"
        :aria-expanded="isCatOpen('repo-docs')"
        :aria-label="
          isCatOpen('repo-docs') ? t('common.collapse', { label: t('resources.repoDocs') }) : t('common.expand', { label: t('resources.repoDocs') })
        "
        @click="toggleCat('repo-docs')"
      >
        <q-icon :name="isCatOpen('repo-docs') ? 'expand_more' : 'chevron_right'" size="14px" aria-hidden="true" />
        <q-icon name="article" size="14px" aria-hidden="true" />
        {{ t('resources.repoDocs') }}
        <span class="pd-group-src font-mono">{{ t('resources.outsideClaude') }}</span>
        <span class="pd-group-count">{{ repoDocs.length }}</span>
      </button>
      <!-- Liste plate, dans l'ordre que le serveur a donné : le README d'abord.
           L'arbre trierait par ordre alphabétique et le mettrait derrière un
           ARCHITECTURE.md, alors que c'est la porte d'entrée du dépôt. -->
      <ul v-if="isCatOpen('repo-docs')" class="pd-res-list">
        <li v-for="r in repoDocs" :key="r.rel">
          <button
            type="button"
            class="pd-res-row"
            :class="{ 'pd-res-row--active': activeMemoryRel === r.rel }"
            :aria-current="activeMemoryRel === r.rel ? 'true' : undefined"
            @click="emit('open-memory', r)"
          >
            <span class="pd-res-name font-mono">{{ r.rel }}</span>
            <span class="pd-res-size font-mono">{{ fmtBytes(r.size) }}</span>
          </button>
        </li>
      </ul>
    </div>

    <div v-for="group in resourceGroups" :key="group.key" class="pd-group">
      <button
        type="button"
        class="pd-group-head section-label"
        :aria-expanded="isCatOpen(group.key)"
        :aria-label="isCatOpen(group.key) ? t('common.collapse', { label: group.label }) : t('common.expand', { label: group.label })"
        @click="toggleCat(group.key)"
      >
        <q-icon :name="isCatOpen(group.key) ? 'expand_more' : 'chevron_right'" size="14px" aria-hidden="true" />
        <q-icon :name="group.icon" size="14px" aria-hidden="true" />
        {{ group.label }}
        <span class="pd-group-count">
          {{ group.key === 'skills' ? skillGroups.length : group.items.length }}
        </span>
      </button>

      <template v-if="isCatOpen(group.key)">
        <!-- Skills : chaque skill est un dossier (SKILL.md + ses références) -->
        <div v-if="group.key === 'skills'" class="pd-skills">
          <div v-for="s in skillGroups" :key="s.key" class="pd-skill">
            <div class="pd-skill-head">
              <button
                v-if="s.refCount"
                type="button"
                class="pd-skill-toggle"
                :aria-expanded="isSkillExpanded(s.key)"
                :aria-label="isSkillExpanded(s.key) ? t('common.collapse', { label: s.title }) : t('common.expand', { label: s.title })"
                @click="toggleSkill(s.key)"
              >
                <q-icon :name="isSkillExpanded(s.key) ? 'expand_more' : 'chevron_right'" size="16px" aria-hidden="true" />
              </button>
              <span v-else class="pd-skill-toggle-spacer" aria-hidden="true" />
              <button
                type="button"
                class="pd-skill-open"
                :class="{ 'pd-res-row--active': s.main && activeResourceRel === s.main.rel }"
                :disabled="!s.main"
                :aria-current="s.main && activeResourceRel === s.main.rel ? 'true' : undefined"
                @click="s.main && emit('open-resource', s.main)"
              >
                <q-icon name="folder" size="14px" aria-hidden="true" />
                <span class="pd-skill-name">{{ s.title }}</span>
                <span v-if="s.refCount" class="pd-skill-badge font-mono"> {{ s.refCount }} réf. </span>
              </button>
            </div>

            <div v-if="isSkillExpanded(s.key)" class="pd-skill-body">
              <div v-if="s.refCount" class="pd-skill-refs">
                <!-- Fichiers de référence à la racine du skill -->
                <ul class="pd-res-list">
                  <li v-for="r in s.directRefs" :key="r.rel">
                    <button
                      type="button"
                      class="pd-res-row pd-res-row--ref"
                      :class="{ 'pd-res-row--active': activeResourceRel === r.rel }"
                      :aria-current="activeResourceRel === r.rel ? 'true' : undefined"
                      @click="emit('open-resource', r)"
                    >
                      <span class="pd-res-name font-mono">{{ r.name }}</span>
                      <span class="pd-res-size font-mono">{{ fmtBytes(r.size) }}</span>
                    </button>
                  </li>
                </ul>

                <!-- Sous-dossiers (ex. references/) comme nœuds repliables -->
                <div v-for="f in s.refFolders" :key="f.name" class="pd-ref-folder">
                  <button
                    type="button"
                    class="pd-ref-folder-head"
                    :aria-expanded="isRefFolderExpanded(s.key, f.name)"
                    @click="toggleRefFolder(s.key, f.name)"
                  >
                    <q-icon :name="isRefFolderExpanded(s.key, f.name) ? 'expand_more' : 'chevron_right'" size="14px" aria-hidden="true" />
                    <q-icon name="folder_open" size="13px" aria-hidden="true" />
                    <span class="font-mono">{{ f.name }}</span>
                    <span class="pd-ref-folder-count font-mono">{{ f.items.length }}</span>
                  </button>
                  <ul v-if="isRefFolderExpanded(s.key, f.name)" class="pd-res-list pd-ref-folder-items">
                    <li v-for="r in f.items" :key="r.rel">
                      <button
                        type="button"
                        class="pd-res-row pd-res-row--ref"
                        :class="{ 'pd-res-row--active': activeResourceRel === r.rel }"
                        :aria-current="activeResourceRel === r.rel ? 'true' : undefined"
                        @click="emit('open-resource', r)"
                      >
                        <span class="pd-res-name font-mono">{{ refLeaf(r) }}</span>
                        <span class="pd-res-size font-mono">{{ fmtBytes(r.size) }}</span>
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Règles : arbre repliable de dossiers (même principe que les skills) -->
        <RuleTree v-else-if="group.key === 'rules'" :nodes="ruleTree" :active-rel="activeResourceRel" @open="(r) => emit('open-resource', r)" />

        <!-- Docs : arbre repliable de dossiers (ex. docs/diagrammes/) -->
        <RuleTree
          v-else-if="group.key === 'docs'"
          :nodes="docTree"
          :active-rel="activeResourceRel"
          file-icon="description"
          @open="(r) => emit('open-resource', r)"
        />

        <!-- Outils : arbre repliable de dossiers (ex. tools/vue-lsp-wrapper/) -->
        <RuleTree
          v-else-if="group.key === 'tools'"
          :nodes="toolTree"
          :active-rel="activeResourceRel"
          file-icon="build"
          @open="(r) => emit('open-resource', r)"
        />

        <!-- Autres catégories : liste plate -->
        <ul v-else class="pd-res-list">
          <li v-for="r in group.items" :key="r.rel">
            <button
              type="button"
              class="pd-res-row"
              :class="{ 'pd-res-row--active': activeResourceRel === r.rel }"
              :aria-current="activeResourceRel === r.rel ? 'true' : undefined"
              @click="emit('open-resource', r)"
            >
              <span class="pd-res-name font-mono">{{ group.key === 'agents' ? r.name : r.rel }}</span>
              <span v-if="group.key !== 'agents' && r.description" class="pd-res-desc">{{ r.description }}</span>
              <span class="pd-res-size font-mono">{{ fmtBytes(r.size) }}</span>
            </button>
          </li>
        </ul>
      </template>
    </div>

    <!-- Dossiers inclus : un groupe par dossier que vous avez demandé à voir.
         Ils vivent dans les sources, hors de .claude, et n'y sont montrés que
         parce que vous l'avez dit — d'où le bouton de retrait sur chacun. -->
    <div v-for="f in folders" :key="f.rel" class="pd-group">
      <div class="pd-group-line">
        <button
          type="button"
          class="pd-group-head section-label"
          :aria-expanded="isCatOpen(`folder:${f.rel}`)"
          :aria-label="isCatOpen(`folder:${f.rel}`) ? t('common.collapse', { label: f.rel }) : t('common.expand', { label: f.rel })"
          @click="toggleCat(`folder:${f.rel}`)"
        >
          <q-icon :name="isCatOpen(`folder:${f.rel}`) ? 'expand_more' : 'chevron_right'" size="14px" aria-hidden="true" />
          <q-icon name="folder_special" size="14px" aria-hidden="true" />
          <span class="pd-group-name font-mono">{{ f.rel }}</span>
          <span class="pd-group-count">{{ f.files.length }}</span>
        </button>
        <q-btn
          v-if="canInclude"
          flat
          dense
          round
          size="xs"
          icon="close"
          :aria-label="t('resources.include.removeAria', { folder: f.rel })"
          @click="emit('exclude-folder', f.rel)"
        />
      </div>
      <RuleTree
        v-if="isCatOpen(`folder:${f.rel}`)"
        :nodes="folderTrees[f.rel] ?? []"
        :active-rel="activeIncludedRel"
        file-icon="description"
        @open="(r) => emit('open-included', r)"
      />
    </div>

    <!-- Plans : produits par ce projet mais stockés hors de lui, dans
         ~/.claude/plans. D'où la mention de provenance et l'exclusion
         des compteurs .claude ci-dessus. Le flux de session n'en passe
         aucun : le groupe disparaît alors de lui-même. -->
    <div v-if="plans.length" class="pd-group">
      <button
        type="button"
        class="pd-group-head section-label"
        :aria-expanded="isCatOpen('plans')"
        :aria-label="isCatOpen('plans') ? t('common.collapse', { label: t('resources.plans') }) : t('common.expand', { label: t('resources.plans') })"
        @click="toggleCat('plans')"
      >
        <q-icon :name="isCatOpen('plans') ? 'expand_more' : 'chevron_right'" size="14px" aria-hidden="true" />
        <q-icon name="assignment" size="14px" aria-hidden="true" />
        {{ t('resources.plans') }}
        <span class="pd-group-src font-mono">~/.claude/plans</span>
        <span class="pd-group-count">{{ plans.length }}</span>
      </button>
      <!-- Un projet ancien en accumule des dizaines : on les range par année/mois. -->
      <PlanTree v-if="isCatOpen('plans')" :plans="plans" :active-name="activePlanName" @open="(p) => emit('open-plan', p)" />
    </div>
  </div>

  <!-- Hors des groupes : l'inclusion n'est pas une ressource, c'est un geste sur
       l'arbre. Elle n'existe que sur la page Projet — le volet du flux de
       session montre, il ne configure pas. -->
  <q-btn
    v-if="canInclude"
    flat
    dense
    no-caps
    size="sm"
    icon="create_new_folder"
    class="pd-include"
    :label="t('resources.include.action')"
    @click="emit('include-folder')"
  />
</template>

<script setup lang="ts">
  /**
   * Le navigateur des ressources d'un projet — l'arbre, et rien d'autre.
   *
   * Il vit à deux endroits : la page Projet, où il occupe la colonne de gauche du
   * master-detail, et l'onglet « Ressources » du flux de session, dans la colonne
   * de droite. Les deux font la même largeur (360 px contre 376 px), d'où un seul
   * composant plutôt qu'une variante compacte : ce qui doit se ressembler est
   * identique par construction, et non par discipline.
   *
   * Il ne lit aucun fichier et n'appelle aucun service : il reçoit l'inventaire et
   * signale ce qu'on lui demande d'ouvrir. Ce que l'hôte en fait — une visionneuse
   * inline sur la page Projet, un dialogue dans le flux — ne le regarde pas.
   */
  import PlanTree from '@/components/PlanTree.vue'
  import RuleTree from '@/components/RuleTree.vue'
  import type { IncludedFolder, ResourceCategory, ResourceNode } from '@/services/projects'
  import type { PlanInfo } from '@/services/system'
  import { fmtBytes } from '@/utils/format'
  import { computed, reactive } from 'vue'
  import { useI18n } from 'vue-i18n'
  import { buildTree, CATEGORY_META, groupSkills, refLeaf, type RuleNode } from './projectResources'

  const props = withDefaults(
    defineProps<{
      resources: ResourceNode[]
      /** Les instructions d'agents de l'arborescence des sources, hors `.claude`. */
      memories: ResourceNode[]
      /** Les documents du dépôt (README, CONTRIBUTING…), même provenance. */
      repoDocs: ResourceNode[]
      /** Les dossiers du projet que l'utilisateur a demandé à voir. */
      folders?: IncludedFolder[]
      /**
       * Montrer les gestes d'inclusion — ajouter un dossier, en retirer un.
       *
       * Réservé à la page Projet. Le volet de l'Atelier affiche le même arbre mais
       * ne configure rien : on y regarde une session, on n'y range pas un projet.
       */
      canInclude?: boolean
      hasClaudeDir: boolean
      /** Ressource ouverte, pour le surlignage — vide si la sélection vient d'ailleurs. */
      activeResourceRel?: string
      activeMemoryRel?: string
      activeIncludedRel?: string
      /** Les plans du projet. Absents : le groupe ne s'affiche pas. */
      plans?: PlanInfo[]
      activePlanName?: string
    }>(),
    {
      activeResourceRel: '',
      activeMemoryRel: '',
      activeIncludedRel: '',
      folders: () => [],
      canInclude: false,
      plans: () => [],
      activePlanName: '',
    },
  )

  const emit = defineEmits<{
    'open-resource': [r: ResourceNode]
    'open-memory': [r: ResourceNode]
    'open-included': [r: ResourceNode]
    'open-plan': [p: PlanInfo]
    'include-folder': []
    'exclude-folder': [rel: string]
  }>()

  const { t } = useI18n()

  const resourceGroups = computed(() =>
    CATEGORY_META.map((m) => ({
      ...m,
      label: t(`resources.categories.${m.key}`),
      items: props.resources.filter((r) => r.category === m.key),
    })).filter((g) => g.items.length),
  )

  const skillGroups = computed(() => groupSkills(props.resources))

  function resourcesIn(category: ResourceCategory): ResourceNode[] {
    return props.resources.filter((r) => r.category === category)
  }

  const ruleTree = computed<RuleNode[]>(() => buildTree(resourcesIn('rules'), { stripPrefix: true }))
  const docTree = computed<RuleNode[]>(() => buildTree(resourcesIn('docs'), { stripPrefix: true }))
  const toolTree = computed<RuleNode[]>(() => buildTree(resourcesIn('tools'), { stripPrefix: true }))
  const memoryTree = computed<RuleNode[]>(() => buildTree(props.memories, { stripPrefix: false, filesFirst: true }))

  /**
   * L'arbre d'un dossier inclus, préfixe retiré.
   *
   * Le `rel` des documents part de la racine du projet — c'est ce que la route de
   * lecture attend —, mais l'en-tête du groupe porte déjà le nom du dossier :
   * l'afficher à nouveau sur chaque ligne décalerait l'arbre pour rien.
   */
  const folderTrees = computed<Record<string, RuleNode[]>>(() => {
    const out: Record<string, RuleNode[]> = {}
    for (const f of props.folders) {
      out[f.rel] = buildTree(f.files, {
        stripPrefix: false,
        stripSegments: f.rel.split('/').length,
      })
    }
    return out
  })

  /** Ce que le projet porte hors de `.claude` — mémoire et documents du dépôt. */
  const outsideCount = computed(() => props.memories.length + props.repoDocs.length)

  // Les groupes de tête (Mémoire, Documents du dépôt, Agents, Skills, …, Plans)
  // arrivent repliés. Déployés, un projet installé en aligne assez pour que le bas
  // de l'arbre demande de faire défiler ; repliés, ils tiennent tous à l'écran et
  // l'on voit d'un coup ce que le projet porte.
  const expandedCats = reactive<Record<string, boolean>>({})
  function isCatOpen(key: string): boolean {
    return Boolean(expandedCats[key])
  }
  function toggleCat(key: string): void {
    expandedCats[key] = !expandedCats[key]
  }

  // Expand/collapse state. Skills start collapsed (keeps the tree compact); their
  // sub-folders default to expanded once the skill itself is opened.
  const expandedSkills = reactive<Record<string, boolean>>({})
  const collapsedRefFolders = reactive<Record<string, boolean>>({})

  function isSkillExpanded(key: string): boolean {
    return Boolean(expandedSkills[key])
  }
  function toggleSkill(key: string): void {
    expandedSkills[key] = !expandedSkills[key]
  }
  function refFolderKey(skill: string, folder: string): string {
    return `${skill}/${folder}`
  }
  function isRefFolderExpanded(skill: string, folder: string): boolean {
    return !collapsedRefFolders[refFolderKey(skill, folder)]
  }
  function toggleRefFolder(skill: string, folder: string): void {
    const k = refFolderKey(skill, folder)
    collapsedRefFolders[k] = !collapsedRefFolders[k]
  }
</script>

<style scoped lang="scss">
  .pd-empty {
    margin: 0;
    color: var(--dim);
    font-size: var(--fs-sm);
    padding: var(--space-md);
  }
  .pd-nav-groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  .pd-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .pd-group-head {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    width: 100%;
    // Le style typographique reste celui de .section-label : ne rien redéclarer ici.
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    padding: var(--space-xs) var(--space-sm);
    text-align: left;
    cursor: pointer;
    transition: background var(--motion-fast);
  }
  .pd-group-head:hover {
    background: var(--hover-overlay);
  }
  .pd-group-head:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }
  .pd-group-count {
    color: var(--faint);
  }
  // Provenance des plans : ils ne viennent pas du .claude du projet.
  .pd-group-src {
    margin-left: auto;
    color: var(--faint);
    font-size: var(--fs-2xs);
    text-transform: none;
    letter-spacing: 0;
  }
  // Un dossier inclus porte une action de retrait : l'en-tête devient une ligne,
  // le bouton de repli en prend toute la place et le retrait ferme la marche.
  .pd-group-line {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }
  .pd-group-line .pd-group-head {
    flex: 1;
    min-width: 0;
  }
  .pd-group-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pd-include {
    align-self: flex-start;
    margin-top: var(--space-md);
    color: var(--muted);
  }
  .pd-res-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .pd-res-row {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: baseline;
    gap: 2px var(--space-sm);
    padding: var(--space-sm);
    background: none;
    border: none;
    border-left: 2px solid transparent;
    border-radius: var(--radius-sm);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background var(--motion-fast),
      border-color var(--motion-fast);
  }
  .pd-res-row:hover {
    background: var(--hover-overlay);
  }
  .pd-res-row:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }
  .pd-res-row--active {
    background: var(--brand-soft);
    border-left-color: var(--brand);
  }
  .pd-res-name {
    font-size: var(--fs-sm);
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pd-res-desc {
    grid-column: 1 / -1;
    font-size: var(--fs-xs);
    color: var(--dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pd-res-size {
    font-size: var(--fs-2xs);
    color: var(--faint);
    white-space: nowrap;
  }

  // ── Skills : dossier (SKILL.md) + références imbriquées ────────────────────────
  .pd-skills {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .pd-skill {
    display: flex;
    flex-direction: column;
  }
  .pd-skill-head {
    display: flex;
    align-items: center;
  }
  // Chevron de disclosure : replie/déplie le skill sans ouvrir le SKILL.md.
  .pd-skill-toggle,
  .pd-skill-toggle-spacer {
    flex: 0 0 auto;
    width: 20px;
    height: 24px;
  }
  .pd-skill-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    padding: 0;
    color: var(--dim);
    cursor: pointer;
    border-radius: var(--radius-xs);
    transition:
      background var(--motion-fast),
      color var(--motion-fast);
  }
  .pd-skill-toggle:hover {
    background: var(--hover-overlay);
    color: var(--text);
  }
  .pd-skill-toggle:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }
  .pd-skill-open {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-sm);
    background: none;
    border: none;
    border-left: 2px solid transparent;
    border-radius: var(--radius-sm);
    color: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background var(--motion-fast),
      border-color var(--motion-fast);
  }
  .pd-skill-open:hover:not(:disabled) {
    background: var(--hover-overlay);
  }
  .pd-skill-open:disabled {
    cursor: default;
  }
  .pd-skill-open:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }
  .pd-skill-open .q-icon {
    color: var(--brand);
    flex: 0 0 auto;
  }
  // Le corps (description + arbre) s'aligne sous le nom, pas sous le chevron.
  .pd-skill-body {
    padding-left: 20px;
  }
  .pd-skill-name {
    flex: 1 1 auto;
    min-width: 0;
    font-size: var(--fs-sm);
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pd-skill-badge {
    flex: 0 0 auto;
    font-size: var(--fs-2xs);
    color: var(--faint);
    padding: 1px 6px;
    border: 1px solid var(--line-2);
    border-radius: 999px;
  }
  // Trait vertical qui matérialise l'appartenance des références au skill.
  .pd-skill-refs {
    margin-left: calc(var(--space-sm) + 7px);
    padding-left: var(--space-sm);
    border-left: 1px solid var(--line-2);
  }
  .pd-res-row--ref .pd-res-name {
    font-size: var(--fs-xs);
    color: var(--text);
  }
  // Nœud de sous-dossier (ex. `references/`) : repliable dans l'arbre du skill.
  .pd-ref-folder-head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-sm);
    font-size: var(--fs-xs);
    color: var(--muted);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    transition: background var(--motion-fast);
  }
  .pd-ref-folder-head:hover {
    background: var(--hover-overlay);
  }
  .pd-ref-folder-head:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: -2px;
  }
  .pd-ref-folder-head .q-icon {
    color: var(--faint);
    flex: 0 0 auto;
  }
  .pd-ref-folder-count {
    font-size: var(--fs-2xs);
    color: var(--faint);
  }
  // Les fichiers du sous-dossier sont décalés sous son nœud.
  .pd-ref-folder-items {
    margin-left: calc(var(--space-sm) + 7px);
    padding-left: var(--space-sm);
    border-left: 1px solid var(--line-2);
  }
</style>
