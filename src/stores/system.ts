import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getSystem, getOverview, type Overview } from '@/services/claude';
import { getSessions, type SessionInfo } from '@/services/system';

/**
 * Live "system" state for the OS-like status bar and the launchpad: whether the
 * BFF is reachable (connected dot), the Claude Code version, the managed dir,
 * the resource counts, and the Claude Code sessions currently running.
 *
 * The sessions live here rather than in a page because two surfaces need them
 * at once — the status bar, present on every screen, and the launchpad's hero.
 * Kept per-page, each would poll the BFF on its own timer for the same answer.
 * The store holds the data; whoever is mounted long enough owns the interval
 * (see MainLayout), which keeps the polling lifecycle out of Pinia.
 */
export const useSystemStore = defineStore('system', () => {
  const connected = ref(false);
  const version = ref('');
  const claudeDir = ref('~/.claude');
  const overview = ref<Overview | null>(null);
  const loaded = ref(false);
  const sessions = ref<SessionInfo[]>([]);

  /** Active = en train de tourner (busy) ou en attente d'une action (waiting). */
  const isActive = (s: SessionInfo): boolean => !!s.status && s.status !== 'idle';
  const activeSessions = computed(() => sessions.value.filter(isActive));

  async function refresh(): Promise<void> {
    try {
      const [sys, ov] = await Promise.all([getSystem(), getOverview()]);
      version.value = sys.version;
      claudeDir.value = sys.claudeDir;
      overview.value = ov;
      connected.value = true;
    } catch {
      connected.value = false;
    } finally {
      loaded.value = true;
    }
  }

  async function refreshSessions(): Promise<void> {
    try {
      sessions.value = (await getSessions()).sessions;
    } catch {
      // BFF injoignable : on vide plutôt que de laisser une liste périmée
      // s'afficher comme vivante. La pastille de connexion signale la coupure.
      sessions.value = [];
    }
  }

  return {
    connected,
    version,
    claudeDir,
    overview,
    loaded,
    sessions,
    activeSessions,
    isActive,
    refresh,
    refreshSessions,
  };
});
