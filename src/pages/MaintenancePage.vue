<template>
  <q-page class="mt">
    <h1 class="sr-only">{{ t('pages.maintenance.title') }}</h1>

    <div class="backdrop-grid backdrop-grid--fixed" aria-hidden="true"></div>

    <header class="mt-header">
      <q-icon name="build" size="15px" class="mt-head-icon" aria-hidden="true" />
      <p class="mt-sub font-mono">{{ t('pages.maintenance.subtitle') }}</p>
      <q-btn flat dense no-caps :label="t('pages.maintenance.reload')" class="mt-refresh" :disable="loading" @click="reloadAll" />
    </header>

    <!-- Storage -->
    <section class="surface-card mt-section" aria-labelledby="mt-storage-title">
      <header class="mt-section-head">
        <q-icon name="storage" size="20px" aria-hidden="true" />
        <h2 id="mt-storage-title">{{ t('pages.maintenance.storage') }}</h2>
        <span class="mt-count font-mono">{{ storage ? fmtBytes(storage.total) : '—' }}</span>
      </header>
      <ul class="mt-bars">
        <li v-for="a in allAreas" :key="a.key" class="mt-bar">
          <div class="mt-bar-info">
            <span class="mt-bar-label">{{ a.label }}</span>
            <span class="mt-bar-size font-mono">{{ fmtBytes(a.size) }}</span>
          </div>
          <div class="mt-bar-track">
            <div class="mt-bar-fill" :style="{ width: pct(a.size) }" />
          </div>
          <q-btn
            v-if="a.purgeable && a.size > 0"
            flat
            dense
            no-caps
            size="sm"
            color="negative"
            icon="delete_sweep"
            :label="t('pages.maintenance.purge')"
            @click="purge(a.key, a.label)"
          />
          <span v-else class="mt-bar-protected font-mono">{{ a.purgeable ? '' : t('pages.maintenance.protected') }}</span>
        </li>
      </ul>
    </section>

    <!-- Chaque projet montre ses propres plans sur sa page. Ne restent ici que ceux
         qu'aucun projet ne réclame : sans cette section, ils seraient inatteignables. -->
    <section class="surface-card mt-section" aria-labelledby="mt-plans-title">
      <header class="mt-section-head">
        <q-icon name="assignment" size="20px" aria-hidden="true" />
        <h2 id="mt-plans-title">{{ t('pages.maintenance.orphanPlans') }}</h2>
        <span class="mt-count font-mono">{{ orphanCount }}</span>
      </header>
      <OrphanPlans ref="orphanPlans" @count="orphanCount = $event" />
    </section>

    <!--
      Ce que le système exécute, et que le disque ne dit pas.

      Un daemon, un hôte de pseudo-terminal et le pont de l'extension n'écrivent
      aucun fichier de session : sur neuf processus mesurés un soir, quatre
      n'apparaissaient nulle part. Ce sont ceux qui survivent à ce qui les a
      lancés, donc exactement ceux qu'on cherche quand on cherche.
    -->
    <section class="surface-card mt-section" aria-labelledby="mt-proc-title">
      <header class="mt-section-head">
        <q-icon name="account_tree" size="20px" aria-hidden="true" />
        <h2 id="mt-proc-title">{{ t('pages.maintenance.processes.head') }}</h2>
        <!-- Sans AURA : la section s'appelle « Processus Claude », et le BFF est un
             `node`. Il figure dans la liste parce qu'il ancre les sessions de
             l'Atelier, qui sont ses enfants — mais le compter mentirait. -->
        <span class="mt-count font-mono">{{ claudeCount || '—' }}</span>
      </header>

      <p class="mt-proc-intro">{{ t('pages.maintenance.processes.intro') }}</p>

      <p v-if="unsupported" class="mt-proc-none">
        {{ t('pages.maintenance.processes.unsupported') }}
      </p>
      <p v-else-if="!loadingProcs && !processes.length" class="mt-proc-none">
        {{ t('pages.maintenance.processes.empty') }}
      </p>
      <q-skeleton v-else-if="loadingProcs" type="rect" height="96px" />

      <ul v-else class="mt-procs">
        <li v-for="row in processRows" :key="row.p.pid" class="mt-proc" :style="{ paddingLeft: `calc(${row.depth} * var(--space-lg))` }">
          <span class="status-dot" :class="dotClass(row.p)" aria-hidden="true" />
          <span class="mt-proc-kind">{{ t(`pages.maintenance.processes.kind.${row.p.kind}`) }}</span>
          <span class="mt-proc-pid font-mono">{{ row.p.pid }}</span>
          <span class="mt-proc-what" :title="row.p.command">{{ label(row.p) }}</span>

          <span v-if="row.p.orphan" class="mt-proc-tag mt-proc-tag--warn">
            {{ t('pages.maintenance.processes.orphan') }}
          </span>
          <span v-if="row.p.self" class="mt-proc-tag">
            {{ t('pages.maintenance.processes.self') }}
          </span>

          <span class="mt-proc-age font-mono">{{ row.p.startedAt ? relTime(row.p.startedAt) : '' }}</span>

          <!-- AURA ne se termine pas d'ici : elle s'éteint, ce qui coupe d'abord
               les sessions de l'Atelier. -->
          <q-btn
            v-if="!row.p.self"
            flat
            dense
            size="sm"
            color="negative"
            icon="close"
            :aria-label="t('pages.maintenance.processes.stop', { pid: row.p.pid })"
            @click="confirmKill(row.p)"
          />
        </li>
      </ul>
    </section>
  </q-page>
</template>

<script setup lang="ts">
  import OrphanPlans from '@/components/OrphanPlans.vue'
  import { useNotify } from '@/composables/useNotify'
  import { getProcesses, getStorage, killProcess, purgeArea, type ClaudeProcess, type Storage } from '@/services/system'
  import { fmtBytes, relTime } from '@/utils/format'
  import { useQuasar } from 'quasar'
  import { onMounted, ref, computed, useTemplateRef } from 'vue'
  import { useI18n } from 'vue-i18n'

  const { t } = useI18n()
  const $q = useQuasar()
  const { notifyError, notifyDone } = useNotify()
  const storage = ref<Storage | null>(null)
  const loading = ref(true)
  const orphanCount = ref(0)
  const orphanPlans = useTemplateRef<InstanceType<typeof OrphanPlans>>('orphanPlans')

  const allAreas = computed(() => {
    if (!storage.value) return []
    return [
      ...storage.value.areas,
      {
        key: 'backups',
        label: t('pages.maintenance.backupsArea'),
        size: storage.value.backups,
        purgeable: true,
      },
    ]
  })
  const maxSize = computed(() => Math.max(1, ...allAreas.value.map((a) => a.size)))
  function pct(n: number): string {
    return `${Math.round((n / maxSize.value) * 100)}%`
  }

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      storage.value = await getStorage()
    } catch (e) {
      notifyError(e, t('pages.maintenance.errors.storage'))
    } finally {
      loading.value = false
    }
  }

  // ── Processus ───────────────────────────────────────────────────────────────

  const processes = ref<ClaudeProcess[]>([])
  const unsupported = ref(false)
  const loadingProcs = ref(true)

  /** Le décompte annoncé : les processus Claude, donc tout sauf moi. */
  const claudeCount = computed(() => processes.value.filter((p) => !p.self).length)

  async function refreshProcesses(): Promise<void> {
    loadingProcs.value = true
    try {
      const list = await getProcesses()
      processes.value = list.processes
      unsupported.value = list.unsupported === true
    } catch (e) {
      notifyError(e, t('pages.maintenance.errors.processes'))
    } finally {
      loadingProcs.value = false
    }
  }

  /**
   * L'ordre des racines, du plus proche de nous au plus périphérique.
   *
   * Le rang ne s'applique **qu'aux racines** : trier toutes les lignes par rôle
   * casserait l'arbre, alors que la parenté est ce qui rend cette liste lisible —
   * un job doit rester sous l'hôte qui le relancerait.
   *
   * Les rôles absents d'ici n'y manquent pas : `atelier` descend d'AURA, `pty-host`
   * et `bg-job` de leur daemon. Ils ne remontent au rang de racine que détachés de
   * leur parent, et ce rang-là dit alors leur isolement.
   */
  const ROOT_ORDER: Record<string, number> = {
    aura: 0,
    interactive: 1,
    daemon: 2,
    'pty-host': 3,
    'bg-job': 4,
    atelier: 5,
    'native-host': 6,
    other: 7,
  }

  function rootRank(p: ClaudeProcess): number {
    return ROOT_ORDER[p.kind] ?? ROOT_ORDER.other ?? 7
  }

  /**
   * L'arbre à plat, chaque ligne sachant sa profondeur.
   *
   * Est racine ce dont le parent n'est pas dans la liste — un shell, le `node
   * --watch` du BFF. Le reste descend de sa racine, dans l'ordre où il a démarré.
   * Les non rattachés sont ajoutés en fin de parcours plutôt qu'oubliés : un cycle
   * de PID recyclés ne doit pas faire disparaître des lignes de l'écran.
   */
  const processRows = computed<{ p: ClaudeProcess; depth: number }[]>(() => {
    const byPid = new Map(processes.value.map((p) => [p.pid, p]))
    const children = new Map<number, ClaudeProcess[]>()
    for (const p of processes.value) {
      if (p.ppid !== p.pid && byPid.has(p.ppid)) {
        children.set(p.ppid, [...(children.get(p.ppid) ?? []), p])
      }
    }

    const rows: { p: ClaudeProcess; depth: number }[] = []
    const seen = new Set<number>()
    function walk(p: ClaudeProcess, depth: number): void {
      if (seen.has(p.pid)) return
      seen.add(p.pid)
      rows.push({ p, depth })
      for (const child of children.get(p.pid) ?? []) walk(child, depth + 1)
    }

    const racines = processes.value
      .filter((p) => p.ppid === p.pid || !byPid.has(p.ppid))
      .sort((a, b) => rootRank(a) - rootRank(b) || (a.startedAt ?? 0) - (b.startedAt ?? 0))

    for (const p of racines) walk(p, 0)
    // Le filet : ce qu'aucune racine n'a atteint, faute d'un cycle de parenté.
    for (const p of processes.value) walk(p, 0)
    return rows
  })

  /**
   * Ce qu'on lit d'un processus, en plus de son rôle.
   *
   * Rien, plutôt que sa ligne de commande, quand aucun fichier de session ne le
   * nomme : un daemon ou le pont de l'extension n'ont pas de nom à donner, et
   * déballer leur chemin absolu remplit la ligne d'un bruit que la colonne de rôle
   * a déjà résumé. La ligne complète reste au survol, pour qui la cherche.
   */
  function label(p: ClaudeProcess): string {
    return p.name || p.cwd || ''
  }

  function dotClass(p: ClaudeProcess): Record<string, boolean> {
    return {
      'status-dot--pulse': p.status === 'busy',
      'status-dot--live': p.status === 'busy',
      'status-dot--brand': p.status === 'waiting',
    }
  }

  /** Combien de processus tomberaient avec celui-ci. Pour l'annoncer, pas pour agir. */
  function descendantCount(pid: number): number {
    const children = new Map<number, number[]>()
    for (const p of processes.value) {
      if (p.ppid !== p.pid) children.set(p.ppid, [...(children.get(p.ppid) ?? []), p.pid])
    }
    let n = 0
    const queue = [...(children.get(pid) ?? [])]
    const seen = new Set<number>([pid])
    while (queue.length) {
      const current = queue.shift() as number
      if (seen.has(current)) continue
      seen.add(current)
      n += 1
      queue.push(...(children.get(current) ?? []))
    }
    return n
  }

  /**
   * Toujours avec la descendance.
   *
   * Ce n'est pas une option offerte à l'utilisateur : couper un job sans son hôte
   * de pseudo-terminal le voit renaître dans la seconde. Le dialogue annonce donc
   * ce que le geste emporte, plutôt que de demander de choisir entre un geste qui
   * marche et un qui ne marche pas.
   */
  function confirmKill(p: ClaudeProcess): void {
    const n = descendantCount(p.pid)
    $q.dialog({
      title: t('pages.maintenance.processes.confirm.title'),
      message: n ? t('pages.maintenance.processes.confirm.tree', { pid: p.pid, n }) : t('pages.maintenance.processes.confirm.single', { pid: p.pid }),
      cancel: { flat: true, noCaps: true, label: t('common.cancel') },
      ok: { color: 'negative', noCaps: true, label: t('pages.maintenance.processes.confirm.ok') },
    }).onOk(() => {
      void (async () => {
        try {
          const { killed } = await killProcess(p.pid, true)
          notifyDone(t('pages.maintenance.processes.killed', { n: killed.length }))
        } catch (e) {
          notifyError(e, t('pages.maintenance.errors.kill'))
        }
        await refreshProcesses()
      })()
    })
  }

  /** The plans list loads itself on mount, so only an explicit reload fans out to it. */
  async function reloadAll(): Promise<void> {
    await Promise.all([refresh(), refreshProcesses(), orphanPlans.value?.refresh()])
  }

  function purge(area: string, label: string): void {
    // Deleting all transcripts is the most destructive purge — warn harder.
    const all = area === 'projects'
    $q.dialog({
      title: all ? t('pages.maintenance.confirm.transcriptsTitle') : t('pages.maintenance.purge'),
      message: all ? t('pages.maintenance.confirm.transcriptsMessage') : t('pages.maintenance.confirm.areaMessage', { area: label }),
      cancel: { flat: true, noCaps: true, label: t('common.cancel') },
      ok: {
        color: 'negative',
        noCaps: true,
        label: all ? t('pages.maintenance.confirm.deleteAll') : t('pages.maintenance.purge'),
      },
    }).onOk(() => {
      void (async () => {
        try {
          await purgeArea(area)
          notifyDone(t('pages.maintenance.purged'))
          await refresh()
        } catch (e) {
          notifyError(e, t('pages.maintenance.errors.purge'))
        }
      })()
    })
  }

  onMounted(() => {
    void refresh()
    void refreshProcesses()
  })
</script>

<style scoped lang="scss">
  .mt {
    padding: var(--space-md) var(--space-xl) var(--space-xl);
    width: 100%;
    max-width: var(--page-max);
    // Centré, comme toute page bornée de l'application : calé à gauche, le vide
    // s'accumulait d'un seul côté et se lisait comme une colonne manquante.
    margin: 0 auto;
  }
  .mt-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-md);
    margin-bottom: var(--space-lg);
  }
  .mt-head-icon {
    color: var(--faint);
    flex: 0 0 auto;
  }
  .mt-sub {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--dim);
    font-size: var(--fs-sm);
    margin: 0;
  }
  .mt-refresh {
    flex: 0 0 auto;
    margin-left: auto;
  }
  .mt-section {
    padding: var(--space-lg);
    margin-bottom: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  .mt-section-head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--muted);
  }
  .mt-section-head h2 {
    margin: 0;
    font-size: var(--fs-lg);
    font-weight: 600;
    color: var(--text);
  }
  .mt-count {
    font-size: var(--fs-sm);
    color: var(--dim);
  }
  .mt-bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .mt-bar {
    display: grid;
    grid-template-columns: 1fr 120px auto;
    align-items: center;
    gap: var(--space-md);
  }
  .mt-bar-info {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-sm);
    min-width: 0;
  }
  .mt-bar-label {
    font-size: var(--fs-sm);
  }
  .mt-bar-size {
    font-size: var(--fs-xs);
    color: var(--dim);
  }
  .mt-bar-track {
    height: 6px;
    background: var(--surface-2);
    border-radius: 999px;
    overflow: hidden;
  }
  .mt-bar-fill {
    height: 100%;
    background: var(--brand);
    border-radius: 999px;
  }
  .mt-bar-protected {
    font-size: var(--fs-2xs);
    color: var(--faint);
    text-transform: uppercase;
  }

  .mt-proc-intro {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--muted);
    max-width: 78ch;
  }
  .mt-proc-none {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--dim);
  }
  .mt-procs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  /* Le rembourrage à gauche porte la profondeur : il est posé en ligne, seul
   endroit où une valeur calculée a sa place. */
  .mt-proc {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    min-width: 0;
  }
  .mt-proc-kind {
    font-size: var(--fs-xs);
    color: var(--muted);
    flex: 0 0 auto;
  }
  .mt-proc-pid {
    font-size: var(--fs-xs);
    color: var(--dim);
    flex: 0 0 auto;
  }
  .mt-proc-what {
    font-size: var(--fs-sm);
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mt-proc-tag {
    font-size: var(--fs-2xs);
    color: var(--faint);
    text-transform: uppercase;
    flex: 0 0 auto;
  }
  .mt-proc-tag--warn {
    color: var(--warn);
  }
  .mt-proc-age {
    font-size: var(--fs-2xs);
    color: var(--faint);
    flex: 0 0 auto;
  }
</style>
