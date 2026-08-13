<template>
  <q-page class="mc">
    <h1 class="sr-only">{{ t('nav.mcp') }}</h1>

    <div class="backdrop-grid backdrop-grid--fixed" aria-hidden="true"></div>

    <header class="mc-header">
      <q-icon name="dns" size="15px" class="mc-head-icon" aria-hidden="true" />
      <p class="mc-sub font-mono">mcp-needs-auth-cache · ~/.claude.json · settings.json</p>
      <div class="mc-tools">
        <span v-if="dirty" class="dirty-pill font-mono">
          <span class="status-dot status-dot--brand" aria-hidden="true" /> {{ t('common.unsaved') }}
        </span>
        <q-btn flat dense no-caps :label="t('common.refresh')" :disable="loading" @click="reload" />
        <q-btn
          unelevated
          no-caps
          dense
          color="primary"
          text-color="dark"
          :label="t('common.propose')"
          :disable="!dirty || !valid || proposing"
          :loading="proposing"
          @click="propose"
        />
      </div>
    </header>

    <!-- Connected (claude.ai) -->
    <section class="surface-card mc-section" aria-labelledby="mc-conn-title">
      <header class="mc-section-head">
        <q-icon name="cloud" size="20px" aria-hidden="true" />
        <h2 id="mc-conn-title">{{ t('pages.mcp.connected') }}</h2>
        <span class="mc-count font-mono">{{ inv.connected.length }}</span>
      </header>
      <p class="mc-note">{{ t('pages.mcp.connectedNote') }}</p>
      <ul v-if="inv.connected.length" class="mc-list">
        <li v-for="s in inv.connected" :key="s.id" class="mc-row">
          <div class="mc-row-main">
            <span class="status-dot status-dot--pulse" aria-hidden="true" />
            <span class="mc-name">{{ s.name }}</span>
          </div>
          <span class="mc-meta font-mono">{{ s.id }}</span>
        </li>
      </ul>
      <p v-else class="mc-empty">{{ t('pages.mcp.noConnected') }}</p>
    </section>

    <!-- File-configured -->
    <section class="surface-card mc-section" aria-labelledby="mc-file-title">
      <header class="mc-section-head">
        <q-icon name="dns" size="20px" aria-hidden="true" />
        <h2 id="mc-file-title">{{ t('pages.mcp.fileTitle') }}</h2>
        <span class="mc-count font-mono">{{ inv.fileServers.length }}</span>
        <q-space />
        <q-btn
          unelevated
          no-caps
          dense
          color="primary"
          text-color="dark"
          icon="add"
          :label="t('pages.mcp.addServer')"
          :disable="loading"
          @click="openAdd"
        />
      </header>
      <p class="mc-note">
        <i18n-t keypath="pages.mcp.fileNote" scope="global">
          <template #path>
            <span class="font-mono">~/.claude.json</span>
          </template>
          <template #global>
            <strong>{{ t('pages.mcp.fileNoteGlobal') }}</strong>
          </template>
        </i18n-t>
      </p>
      <ul v-if="inv.fileServers.length" class="mc-list">
        <li v-for="(s, i) in inv.fileServers" :key="i" class="mc-row">
          <div class="mc-row-main">
            <span class="mc-name">{{ s.name }}</span>
            <span class="badge badge--scope">{{ s.scope }}</span>
            <span class="badge badge--transport font-mono">{{ s.transport }}</span>
          </div>
          <div class="mc-row-end">
            <span class="mc-meta font-mono">{{ s.detail }}</span>
            <div v-if="s.scope === 'global'" class="mc-row-actions">
              <q-btn
                flat
                dense
                round
                size="sm"
                icon="edit"
                :aria-label="t('pages.mcp.editAria', { name: s.name })"
                :disable="busy"
                @click="openEdit(s.name)"
              />
              <q-btn
                flat
                dense
                round
                size="sm"
                icon="delete"
                color="negative"
                :aria-label="t('pages.mcp.deleteAria', { name: s.name })"
                :disable="busy"
                @click="removeServer(s.name)"
              />
            </div>
          </div>
        </li>
      </ul>
      <p v-else class="mc-empty">{{ t('pages.mcp.noFileServer') }}</p>
    </section>

    <!-- Editable settings-level controls -->
    <section class="surface-card mc-section" aria-labelledby="mc-set-title">
      <header class="mc-section-head">
        <q-icon name="tune" size="20px" aria-hidden="true" />
        <h2 id="mc-set-title">{{ t('pages.mcp.settingsTitle') }}</h2>
      </header>
      <p class="mc-note">
        <i18n-t keypath="pages.mcp.settingsNote" scope="global">
          <template #path>
            <span class="font-mono">settings.json</span>
          </template>
        </i18n-t>
      </p>

      <div class="mc-field">
        <div>
          <div class="mc-field-name">{{ t('pages.mcp.projectServers') }}</div>
          <div class="mc-field-hint font-mono">enableAllProjectMcpServers</div>
        </div>
        <SegmentedControl
          v-model="enableAll"
          :options="autoApproveOptions"
          :aria-label="t('pages.mcp.projectServers')"
        />
      </div>

      <RuleList
        :label="t('pages.mcp.approvedList')"
        :rules="stringArray(['enabledMcpjsonServers'])"
        :placeholder="t('pages.mcp.serverNamePlaceholder')"
        @add="(v) => pushTo(['enabledMcpjsonServers'], v)"
        @remove="(i) => removeFrom(['enabledMcpjsonServers'], i)"
      />
      <RuleList
        :label="t('pages.mcp.disabledList')"
        tone="negative"
        :rules="stringArray(['disabledMcpjsonServers'])"
        :placeholder="t('pages.mcp.serverNamePlaceholder')"
        @add="(v) => pushTo(['disabledMcpjsonServers'], v)"
        @remove="(i) => removeFrom(['disabledMcpjsonServers'], i)"
      />
    </section>

    <!-- settings.json write -->
    <ConfirmDiffDialog :proposal="proposal" @applied="onApplied" @close="proposal = null" />

    <!-- ~/.claude.json global-server write -->
    <ConfirmDiffDialog
      :proposal="srvProposal"
      :apply-fn="applyServer"
      @applied="onServerApplied"
      @close="srvProposal = null"
    />

    <!-- Add / edit form -->
    <q-dialog v-model="formOpen">
      <q-card class="srv-card surface-card">
        <q-form class="srv-form" @submit.prevent="submitForm">
          <div class="section-label">
            {{ editingName ? t('pages.mcp.editServer') : t('pages.mcp.addServer') }}
          </div>

          <label class="srv-field">
            <span class="srv-label">{{ t('pages.mcp.name') }}</span>
            <!-- Ces quatre champs ne portent que du technique — nom de serveur,
                 commande, arguments, URL. Le correcteur du navigateur les
                 soulignerait entièrement, comme partout ailleurs dans AURA. -->
            <q-input
              v-model="fName"
              dense
              outlined
              spellcheck="false"
              :readonly="!!editingName"
              :placeholder="t('pages.mcp.namePlaceholder')"
              :rules="[(v) => !!v?.trim() || t('pages.mcp.nameRequired')]"
              hide-bottom-space
            />
          </label>

          <div class="srv-field">
            <span class="srv-label">{{ t('pages.mcp.transport') }}</span>
            <SegmentedControl
              v-model="fTransport"
              :options="transportOptions"
              :aria-label="t('pages.mcp.transport')"
            />
          </div>

          <template v-if="fTransport === 'stdio'">
            <label class="srv-field">
              <span class="srv-label">{{ t('pages.mcp.command') }}</span>
              <q-input
                v-model="fCommand"
                dense
                outlined
                spellcheck="false"
                :placeholder="t('pages.mcp.commandPlaceholder')"
                class="font-mono"
                :rules="[(v) => !!v?.trim() || t('pages.mcp.commandRequired')]"
                hide-bottom-space
              />
            </label>
            <label class="srv-field">
              <span class="srv-label">{{ t('pages.mcp.args') }}</span>
              <q-input
                v-model="fArgs"
                type="textarea"
                autogrow
                dense
                outlined
                spellcheck="false"
                placeholder="-y&#10;@scope/paquet"
                class="font-mono"
                hide-bottom-space
              />
            </label>
          </template>

          <template v-else>
            <label class="srv-field">
              <span class="srv-label">URL</span>
              <q-input
                v-model="fUrl"
                dense
                outlined
                spellcheck="false"
                :placeholder="t('pages.mcp.urlPlaceholder')"
                class="font-mono"
                :rules="[(v) => !!v?.trim() || t('pages.mcp.urlRequired')]"
                hide-bottom-space
              />
            </label>
          </template>

          <div class="srv-actions">
            <q-space />
            <q-btn flat no-caps dense :label="t('common.cancel')" @click="formOpen = false" />
            <q-btn
              unelevated
              no-caps
              dense
              type="submit"
              color="primary"
              text-color="dark"
              :loading="proposingSrv"
              :label="t('pages.mcp.preview')"
            />
          </div>
        </q-form>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useNotify } from '@/composables/useNotify';
import RuleList from '@/components/settings/RuleList.vue';
import SegmentedControl from '@/components/ui/SegmentedControl.vue';
import ConfirmDiffDialog from '@/components/ConfirmDiffDialog.vue';
import { useJsonForm } from '@/composables/useJsonForm';
import {
  getMcp,
  proposeMcp,
  applyMcp,
  type McpInventory,
  type McpServerConfig,
} from '@/services/mcp';
import {
  readFile,
  propose as proposeWrite,
  ClaudeApiError,
  type Proposal,
} from '@/services/claude';

const { t } = useI18n();
const { notifyError } = useNotify();
const PATH = 'settings.json';

const inv = ref<McpInventory>({ connected: [], fileServers: [], globalServers: {} });
const content = ref('');
const original = ref('');
const loading = ref(true);
const proposing = ref(false);
const proposal = ref<Proposal | null>(null);

// ── Global-server CRUD (~/.claude.json) ──────────────────────────────────────
const SRV_REL = '~/.claude.json › mcpServers';
const formOpen = ref(false);
const editingName = ref<string | null>(null); // null = add
const editingBase = ref<McpServerConfig>({}); // original config (edit) to preserve unknown keys
const fName = ref('');
const fTransport = ref<'stdio' | 'http'>('stdio');
const fCommand = ref('');
const fArgs = ref('');
const fUrl = ref('');
const transportOptions = [
  { label: 'stdio', value: 'stdio' },
  { label: 'http', value: 'http' },
];

const proposingSrv = ref(false);
const srvProposal = ref<Proposal | null>(null);
const pendingSrv = ref<{
  name: string;
  server: McpServerConfig | null;
  expectedHash: string | null;
} | null>(null);
const busy = computed(() => proposingSrv.value || srvProposal.value !== null);

function openAdd(): void {
  editingName.value = null;
  editingBase.value = {};
  fName.value = '';
  fTransport.value = 'stdio';
  fCommand.value = '';
  fArgs.value = '';
  fUrl.value = '';
  formOpen.value = true;
}

function openEdit(name: string): void {
  const cfg = inv.value.globalServers[name] ?? {};
  editingName.value = name;
  editingBase.value = { ...cfg };
  fName.value = name;
  const isHttp = cfg.type === 'http' || cfg.type === 'sse' || (!cfg.command && !!cfg.url);
  fTransport.value = isHttp ? 'http' : 'stdio';
  fCommand.value = cfg.command ?? '';
  fArgs.value = (cfg.args ?? []).join('\n');
  fUrl.value = cfg.url ?? '';
  formOpen.value = true;
}

/** Build the server config from the form, preserving unknown keys on edit. */
function buildServer(): McpServerConfig {
  const base: McpServerConfig = { ...editingBase.value };
  if (fTransport.value === 'stdio') {
    base.command = fCommand.value.trim();
    const args = fArgs.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (args.length) base.args = args;
    else delete base.args;
    delete base.url;
    if (base.type && base.type !== 'stdio') delete base.type;
  } else {
    base.type = 'http';
    base.url = fUrl.value.trim();
    delete base.command;
    delete base.args;
  }
  return base;
}

async function submitForm(): Promise<void> {
  const name = fName.value.trim();
  if (!name) return;
  await startProposal(name, buildServer());
}

async function removeServer(name: string): Promise<void> {
  await startProposal(name, null);
}

async function startProposal(name: string, server: McpServerConfig | null): Promise<void> {
  proposingSrv.value = true;
  try {
    const p = await proposeMcp(name, server);
    pendingSrv.value = { name, server, expectedHash: p.expectedHash };
    srvProposal.value = { rel: SRV_REL, exists: true, before: p.before, after: p.after };
    formOpen.value = false;
  } catch (e) {
    notifyError(e, t('pages.mcp.prepareError'));
  } finally {
    proposingSrv.value = false;
  }
}

async function applyServer(): Promise<{ rel: string; backupPath: string | null }> {
  const p = pendingSrv.value;
  if (!p) throw new Error(t('pages.mcp.noPending'));
  const res = await applyMcp(p.name, p.server, p.expectedHash);
  return { rel: SRV_REL, backupPath: res.backupPath };
}

function onServerApplied(): void {
  srvProposal.value = null;
  pendingSrv.value = null;
  void reload();
}

const { valid, field, remove, stringArray, pushTo, removeFrom } = useJsonForm(content);
const dirty = computed(() => content.value !== original.value);

// Segments name the two behaviours rather than answering an implied yes/no question,
// so the row reads as a statement of what happens to project servers.
const autoApproveOptions = computed(() => [
  { label: t('pages.mcp.autoApprove'), value: true },
  { label: t('pages.mcp.toConfirm'), value: false },
]);
// "À confirmer" is the default behaviour, so it is expressed by the key's absence
// rather than by an explicit `false` — the file only records deviations.
const enableAll = computed({
  get: (): boolean => field<boolean>(['enableAllProjectMcpServers'], false).value,
  set: (v: boolean): void => {
    if (v) field<boolean>(['enableAllProjectMcpServers'], true).value = true;
    else remove(['enableAllProjectMcpServers']);
  },
});

async function loadSettings(): Promise<void> {
  try {
    const { content: c } = await readFile(PATH);
    content.value = c;
    original.value = c;
  } catch (e) {
    if (e instanceof ClaudeApiError && e.status === 404) {
      content.value = '{}\n';
      original.value = '';
    } else {
      notifyError(e, t('pages.mcp.readError'));
    }
  }
}

async function reload(): Promise<void> {
  loading.value = true;
  try {
    await Promise.all([loadSettings(), getMcp().then((m) => (inv.value = m))]);
  } catch (e) {
    notifyError(e, t('pages.mcp.reloadError'));
  } finally {
    loading.value = false;
  }
}

async function propose(): Promise<void> {
  proposing.value = true;
  try {
    proposal.value = await proposeWrite(PATH, content.value);
  } catch (e) {
    notifyError(e, t('common.proposeError'));
  } finally {
    proposing.value = false;
  }
}

function onApplied(): void {
  original.value = content.value;
  proposal.value = null;
}

onMounted(reload);
</script>

<style scoped lang="scss">
.mc {
  padding: var(--space-md) var(--space-xl) var(--space-xl);
  width: 100%;
  max-width: var(--page-max);
  // Centré, comme toute page bornée de l'application : calé à gauche, le vide
  // s'accumulait d'un seul côté et se lisait comme une colonne manquante.
  margin: 0 auto;
}
.mc-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-xs) var(--space-md);
  margin-bottom: var(--space-lg);
}
.mc-head-icon {
  color: var(--faint);
  flex: 0 0 auto;
}
.mc-sub {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--dim);
  font-size: var(--fs-sm);
  margin: 0;
}
.mc-tools {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: 0 0 auto;
  margin-left: auto;
}
.dirty-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--fs-xs);
  color: var(--brand);
  background: var(--brand-soft);
  border: 1px solid var(--brand-line);
  border-radius: var(--radius-sm);
  padding: var(--space-xs) var(--space-sm);
}
.mc-section {
  padding: var(--space-lg);
  margin-bottom: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.mc-section-head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--muted);
}
.mc-section-head h2 {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
}
.mc-count {
  font-size: var(--fs-sm);
  color: var(--dim);
}
.mc-note {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--muted);
}
.mc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.mc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-sm) 0;
  border-top: 1px solid var(--line);
}
.mc-row:first-child {
  border-top: none;
}
.mc-row-main {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.mc-name {
  font-size: var(--fs-md);
}
.mc-meta {
  font-size: var(--fs-xs);
  color: var(--dim);
  word-break: break-all;
}
.badge {
  font-size: var(--fs-2xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  border: 1px solid transparent;
}
.badge--scope {
  color: var(--muted);
  background: var(--surface-2);
  border-color: var(--line);
}
.badge--transport {
  color: var(--brand);
  background: var(--brand-soft);
  border-color: var(--brand-line);
}
.mc-empty {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--dim);
}
.mc-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--line);
}
.mc-field-name {
  font-size: var(--fs-md);
}
.mc-field-hint {
  font-size: var(--fs-xs);
  color: var(--dim);
}
.mc-row-end {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-width: 0;
}
.mc-row-actions {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex: 0 0 auto;
}

/* ── Add / edit dialog ─────────────────────────────────────────────────────── */
.srv-card {
  width: 520px;
  max-width: 92vw;
  padding: var(--space-lg);
}
.srv-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.srv-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.srv-label {
  font-size: var(--fs-sm);
  color: var(--muted);
}
.srv-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
}
</style>
