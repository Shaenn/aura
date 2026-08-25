<template>
  <q-page class="bk">
    <h1 class="sr-only">{{ t('pages.backups.title') }}</h1>

    <div class="backdrop-grid backdrop-grid--fixed" aria-hidden="true"></div>

    <header class="bk-header">
      <q-icon name="history" size="15px" class="bk-head-icon" aria-hidden="true" />
      <p class="bk-sub font-mono">
        {{ t('pages.backups.sub', { n: entries.length, size: totalSize }, entries.length) }}
      </p>
      <div class="bk-tools">
        <q-btn flat dense no-caps :label="t('common.refresh')" :disable="loading" @click="refresh" />
        <q-btn
          flat
          dense
          no-caps
          color="negative"
          icon="delete_sweep"
          :label="t('pages.backups.purgeAll')"
          :disable="!entries.length"
          @click="purgeAll"
        />
      </div>
    </header>

    <EmptyState v-if="!loading && !entries.length" pad="lg" :message="t('pages.backups.empty')" />

    <div v-else class="bk-body">
      <!-- Files, as the tree they form on disk -->
      <aside class="bk-list surface-card">
        <RuleTree :nodes="tree" :active-rel="selected ?? ''" file-icon="history" :file-meta="versionCount" @open="selected = $event.rel" />
      </aside>

      <!-- Versions of the selected file -->
      <section class="bk-versions surface-card">
        <EmptyState v-if="!current" center pad="lg" class="bk-empty--big" :message="t('pages.backups.pickFile')" />
        <template v-else>
          <div class="bk-versions-head">
            <span class="bk-versions-scope font-mono">{{ current.scope }}</span>
            <span class="font-mono">{{ current.label }}</span>
          </div>
          <ul class="bk-vlist">
            <li v-for="v in current.versions" :key="v.stamp" class="bk-ver">
              <div class="bk-ver-info">
                <span class="bk-ver-date">{{ fmtDate(v.mtime) }}</span>
                <span class="bk-ver-size font-mono">{{ fmtBytes(v.size) }}</span>
              </div>
              <div class="bk-ver-actions">
                <q-btn
                  unelevated
                  no-caps
                  dense
                  size="sm"
                  color="primary"
                  text-color="dark"
                  icon="restore"
                  :label="t('pages.backups.restore')"
                  :loading="busy === v.stamp"
                  @click="restore(v)"
                />
                <q-btn
                  flat
                  dense
                  round
                  size="sm"
                  icon="delete"
                  color="negative"
                  :aria-label="t('pages.backups.purgeOneAria', { date: fmtDate(v.mtime) })"
                  @click="purgeOne(v)"
                />
              </div>
            </li>
          </ul>
        </template>
      </section>
    </div>

    <ConfirmDiffDialog :proposal="proposal" @applied="onRestored" @close="proposal = null" />
  </q-page>
</template>

<script setup lang="ts">
  import ConfirmDiffDialog from '@/components/ConfirmDiffDialog.vue'
  import RuleTree, { type RuleNode, type RuleDirNode, type RuleFileNode } from '@/components/RuleTree.vue'
  import EmptyState from '@/components/ui/EmptyState.vue'
  import { useNotify } from '@/composables/useNotify'
  import { listBackups, readBackup, purgeBackups, type BackupEntry } from '@/services/backups'
  import { propose as proposeWrite, type Proposal } from '@/services/claude'
  import { fmtBytes, fmtDate } from '@/utils/format'
  import { prettyProjectSlug } from '@/utils/slug'
  import { useQuasar } from 'quasar'
  import { onMounted, ref, computed, watch } from 'vue'
  import { useI18n } from 'vue-i18n'

  const { t } = useI18n()
  const $q = useQuasar()
  const { notifyError, notifyDone } = useNotify()

  const entries = ref<BackupEntry[]>([])
  const loading = ref(true)
  const selected = ref<string | null>(null)
  const busy = ref<string | null>(null)
  const proposal = ref<Proposal | null>(null)

  interface FileGroup {
    rel: string
    /** Project the file belongs to, or the managed dir itself. */
    scope: string
    /** Path shown to the user: within its project, the slug is redundant. */
    label: string
    versions: BackupEntry[]
  }

  // `projects/<slug>/memory/MEMORY.md` ne dit rien à qui lit : le slug est un
  // chemin encodé, et il écrase le nom du fichier. On sépare les deux — le projet
  // d'un côté, ce qui a été sauvegardé de l'autre.
  const CLAUDE_DIR = '~/.claude'
  // `~/.claude.json` est l'état du CLI, et il vit à côté du dossier géré, pas
  // dedans : c'est la seule sauvegarde qui sorte de la racine (server/mcp.ts).
  const HOME_JSON = '.claude.json'
  function scopeOf(rel: string): { scope: string; label: string } {
    if (rel === HOME_JSON) return { scope: '~', label: HOME_JSON }
    const m = /^projects\/([^/]+)\/(.+)$/.exec(rel)
    if (!m?.[1] || !m[2]) return { scope: CLAUDE_DIR, label: rel }
    return { scope: prettyProjectSlug(m[1]), label: m[2] }
  }

  const files = computed<FileGroup[]>(() => {
    const map = new Map<string, BackupEntry[]>()
    for (const e of entries.value) {
      const arr = map.get(e.rel) ?? []
      arr.push(e)
      map.set(e.rel, arr)
    }
    return [...map.entries()]
      .map(([rel, versions]) => ({
        rel,
        ...scopeOf(rel),
        versions: versions.sort((a, b) => b.mtime - a.mtime),
      }))
      .sort(
        (a, b) =>
          // Le dossier géré d'abord, les projets ensuite, chacun groupé.
          Number(a.scope !== CLAUDE_DIR) - Number(b.scope !== CLAUDE_DIR) || a.scope.localeCompare(b.scope) || a.label.localeCompare(b.label),
      )
  })
  const current = computed(() => files.value.find((f) => f.rel === selected.value) ?? null)

  // ── L'arbre ──────────────────────────────────────────────────────────────────

  // L'arbre est celui de la page Projet — même composant, donc même façon de
  // plier, de mettre en avant la sélection et de compter. `buildTree` ne convient
  // pas ici : il nomme ses dossiers d'après le disque, or c'est précisément le
  // slug de projet qu'on veut traduire.
  function leaf(f: FileGroup, label: string): RuleFileNode {
    const last = f.versions[0]
    return {
      type: 'file',
      key: f.rel,
      label,
      node: {
        category: 'other',
        rel: f.rel,
        name: label,
        title: '',
        description: '',
        size: last?.size ?? 0,
        mtime: last?.mtime ?? 0,
      },
    }
  }

  function insert(root: RuleDirNode, f: FileGroup): void {
    const segs = f.rel.split('/')
    let cur = root
    segs.forEach((seg, i) => {
      if (i === segs.length - 1) {
        cur.children.push(leaf(f, seg))
        return
      }
      const path = segs.slice(0, i + 1).join('/')
      let dir = cur.children.find((c): c is RuleDirNode => c.type === 'dir' && c.path === path)
      if (!dir) {
        // Un niveau sous `projects/`, le segment est un slug encodé : c'est le
        // seul endroit de l'arbre où le nom affiché n'est pas le nom sur disque.
        const name = /^projects\/[^/]+$/.test(path) ? prettyProjectSlug(seg) : seg
        dir = { type: 'dir', key: path, name, path, fileCount: 0, children: [] }
        cur.children.push(dir)
      }
      cur = dir
    })
  }

  // Fichiers avant dossiers : `settings.json` et `CLAUDE.md` sont ce qu'on vient
  // chercher, ils passeraient sous trois dossiers avec la convention inverse.
  function finish(d: RuleDirNode): number {
    let n = 0
    for (const c of d.children) n += c.type === 'dir' ? finish(c) : 1
    d.fileCount = n
    d.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? 1 : -1
      return (a.type === 'dir' ? a.name : a.label).localeCompare(b.type === 'dir' ? b.name : b.label)
    })
    return n
  }

  const tree = computed<RuleNode[]>(() => {
    const managed: RuleDirNode = {
      type: 'dir',
      key: CLAUDE_DIR,
      name: CLAUDE_DIR,
      path: CLAUDE_DIR,
      fileCount: 0,
      children: [],
    }
    const out: RuleNode[] = []
    for (const f of files.value) {
      if (f.rel === HOME_JSON) out.push(leaf(f, `~/${HOME_JSON}`))
      else insert(managed, f)
    }
    finish(managed)
    if (managed.children.length) out.unshift(managed)
    return out
  })

  /** En bout de ligne, un fichier vaut par son nombre de versions, pas sa taille. */
  function versionCount(node: { rel: string }): string {
    return String(files.value.find((f) => f.rel === node.rel)?.versions.length ?? '')
  }

  const totalSize = computed(() => fmtBytes(entries.value.reduce((s, e) => s + e.size, 0)))

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      entries.value = (await listBackups()).entries
    } catch (e) {
      notifyError(e, t('pages.backups.readError'))
    } finally {
      loading.value = false
    }
  }

  // Keep a valid selection as the list changes.
  watch(files, (fs) => {
    if (!fs.some((f) => f.rel === selected.value)) selected.value = fs[0]?.rel ?? null
  })

  async function restore(v: BackupEntry): Promise<void> {
    busy.value = v.stamp
    try {
      const { content } = await readBackup(v.stamp, v.rel)
      // Preview current-vs-backup, then the normal apply writes it back (and
      // snapshots the pre-restore state).
      proposal.value = await proposeWrite(v.rel, content)
    } catch (e) {
      notifyError(e, t('pages.backups.prepareError'))
    } finally {
      busy.value = null
    }
  }

  async function onRestored(): Promise<void> {
    proposal.value = null
    notifyDone(t('pages.backups.restored'))
    await refresh()
  }

  // Confirmée, comme la purge globale : une sauvegarde est le seul exemplaire de
  // ce qu'un fichier contenait avant une écriture. Supprimer au clic, sans filet,
  // c'était retirer le filet lui-même.
  function purgeOne(v: BackupEntry): void {
    $q.dialog({
      title: t('pages.backups.purgeOneTitle'),
      message: t('pages.backups.purgeOneMessage', {
        date: fmtDate(v.mtime),
        file: current.value?.rel ?? '',
      }),
      cancel: { flat: true, noCaps: true, label: t('common.cancel') },
      ok: { color: 'negative', noCaps: true, label: t('pages.backups.purgeOneOk') },
    }).onOk(() => {
      void (async () => {
        try {
          await purgeBackups(v.stamp)
          notifyDone(t('pages.backups.purgedOne'))
          await refresh()
        } catch (e) {
          notifyError(e, t('pages.backups.deleteError'))
        }
      })()
    })
  }

  function purgeAll(): void {
    const n = entries.value.length
    $q.dialog({
      title: t('pages.backups.purgeAll'),
      message: t('pages.backups.purgeMessage', { n }),
      cancel: { flat: true, noCaps: true, label: t('common.cancel') },
      ok: { color: 'negative', noCaps: true, label: t('pages.backups.purgeOk') },
    }).onOk(() => {
      void (async () => {
        try {
          await purgeBackups()
          await refresh()
        } catch (e) {
          notifyError(e, t('pages.backups.purgeError'))
        }
      })()
    })
  }

  onMounted(refresh)
</script>

<style scoped lang="scss">
  .bk {
    padding: var(--space-md) var(--space-xl) var(--space-xl);
    width: 100%;
    max-width: var(--page-max);
    margin: 0 auto;
  }
  .bk-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-md);
    margin-bottom: var(--space-lg);
  }
  .bk-head-icon {
    color: var(--faint);
    flex: 0 0 auto;
  }
  .bk-sub {
    flex: 1 1 auto;
    min-width: 0;
    color: var(--dim);
    font-size: var(--fs-sm);
    margin: 0;
  }
  .bk-tools {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex: 0 0 auto;
    margin-left: auto;
  }
  .bk-empty--big {
    margin: auto;
  }

  .bk-body {
    display: grid;
    grid-template-columns: 420px 1fr;
    gap: var(--space-lg);
    align-items: start;
  }
  @media (max-width: 860px) {
    .bk-body {
      grid-template-columns: 1fr;
    }
  }
  .bk-list {
    padding: var(--space-xs);
    max-height: calc(100vh - 180px);
    overflow: auto;
  }
  .bk-list {
    padding: var(--space-sm);
  }
  .bk-versions {
    min-height: 200px;
    display: flex;
    flex-direction: column;
  }
  .bk-versions-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-md);
    border-bottom: 1px solid var(--line);
    color: var(--muted);
    font-size: var(--fs-sm);
    word-break: break-all;
  }
  .bk-versions-scope {
    font-size: var(--fs-2xs);
    color: var(--dim);
  }
  .bk-vlist {
    list-style: none;
    margin: 0;
    padding: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .bk-ver {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-sm) var(--space-md);
    background: var(--surface-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
  }
  .bk-ver-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .bk-ver-date {
    font-size: var(--fs-sm);
  }
  .bk-ver-size {
    font-size: var(--fs-2xs);
    color: var(--dim);
  }
  .bk-ver-actions {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }
</style>
