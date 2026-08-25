// Les processus Claude vivants : les énumérer, dire d'où ils viennent, les couper.
//
// C'est la seule partie du BFF qui regarde ailleurs que dans `~/.claude`. La
// raison est nette : un daemon, un hôte de pseudo-terminal, le pont de
// l'extension Chrome n'écrivent aucun fichier de session. Sur neuf processus
// Claude mesurés un soir, cinq seulement étaient déclarés sur le disque — et les
// quatre invisibles étaient précisément ceux qui posaient problème.
//
// Tout ce qui se calcule est séparé de tout ce qui appelle le système :
// `buildProcessList` et `killOrder` sont des fonctions pures, et c'est sur elles
// que portent les tests. Seul `enumerate` parle à la plateforme.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ClaudeProcess, ClaudeProcessKind, ProcessList } from '../shared/processes.ts'
import { alive, listSessions, type SessionInfo } from './maintenance.ts'

const run = promisify(execFile)

/** Ce que la plateforme sait dire d'un processus, avant toute interprétation. */
export interface RawProcess {
  pid: number
  ppid: number
  command: string
  startedAt?: number
}

/**
 * Ce qu'on garde d'une ligne de commande.
 *
 * Assez pour reconnaître un rôle et un dossier de travail ; pas de quoi
 * transporter un prompt entier — certaines lignes du SDK dépassent le millier de
 * caractères, et rien à l'écran n'en montrerait la fin.
 */
const COMMAND_MAX = 300

/**
 * Le délai au-delà duquel on renonce à énumérer.
 *
 * Le démarrage de PowerShell coûte quelques centaines de millisecondes, et une
 * requête WMI un peu plus. Cinq secondes laissent une marge confortable à une
 * machine chargée, tout en évitant qu'un écran de maintenance reste suspendu.
 */
const ENUMERATE_TIMEOUT_MS = 5_000

/**
 * L'énumération Windows.
 *
 * Les dates sont converties en millisecondes **dans PowerShell** : sérialiser un
 * `DateTime` en JSON donne selon les versions une chaîne ISO ou un `/Date(…)/`,
 * et parser les deux côté Node serait deux fois plus de code pour le même
 * nombre. L'encodage de sortie est forcé, sans quoi un chemin accentué revient
 * en mojibake.
 *
 * `node.exe` figure dans le filtre bien qu'il ne soit pas Claude : le BFF en est
 * un, et il doit être dans la table pour que les sessions de l'Atelier — ses
 * propres enfants — se rattachent à quelque chose.
 */
const WINDOWS_SCRIPT = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Get-CimInstance Win32_Process -Filter "Name='claude.exe' OR Name='node.exe'" |
  ForEach-Object {
    [pscustomobject]@{
      pid     = $_.ProcessId
      ppid    = $_.ParentProcessId
      started = if ($_.CreationDate) { [long]([datetimeoffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { 0 }
      cmd     = $_.CommandLine
    }
  } | ConvertTo-Json -Compress
`

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
function text(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Énumère les processus, ou rend `null` si la plateforme ne s'y prête pas.
 *
 * `null` et non un tableau vide : les deux se lisent autrement à l'écran, et
 * confondre « je ne sais pas regarder » avec « rien ne tourne » serait le
 * mensonge le plus coûteux de cette surface.
 */
export async function enumerate(): Promise<RawProcess[] | null> {
  try {
    return process.platform === 'win32' ? await enumerateWindows() : await enumeratePosix()
  } catch {
    return null
  }
}

async function enumerateWindows(): Promise<RawProcess[]> {
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SCRIPT], {
    timeout: ENUMERATE_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  })

  const trimmed = stdout.trim()
  if (!trimmed) return []
  const parsed: unknown = JSON.parse(trimmed)
  // `ConvertTo-Json` rend un objet nu quand il n'y a qu'un résultat, un tableau
  // au-delà. Les deux arrivent en pratique — un poste où seul AURA tourne.
  const rows: unknown[] = Array.isArray(parsed) ? parsed : [parsed]

  return rows.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>
    const started = num(r.started)
    return {
      pid: num(r.pid),
      ppid: num(r.ppid),
      command: text(r.cmd),
      ...(started ? { startedAt: started } : {}),
    }
  })
}

/**
 * L'énumération POSIX.
 *
 * Sans date de démarrage, délibérément : `lstart` demande de parser une date
 * localisée, et `etimes` n'existe pas sur macOS. `startedAt` est facultatif dans
 * le protocole pour cette raison — l'écran montre l'âge là où il le connaît, et
 * se tait ailleurs plutôt que d'afficher une valeur inventée.
 */
async function enumeratePosix(): Promise<RawProcess[]> {
  const { stdout } = await run('ps', ['-Ao', 'pid=,ppid=,args='], {
    timeout: ENUMERATE_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  })

  const out: RawProcess[] = []
  for (const line of stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    if (!m) continue
    out.push({ pid: Number(m[1]), ppid: Number(m[2]), command: (m[3] ?? '').trim() })
  }
  return out
}

/** Ce qui trahit un rôle dans une ligne de commande. */
const MARKERS: { needle: string; kind: ClaudeProcessKind }[] = [
  { needle: '--chrome-native-host', kind: 'native-host' },
  { needle: '--bg-pty-host', kind: 'pty-host' },
  { needle: 'daemon run', kind: 'daemon' },
]

/** Le binaire que le SDK embarque, et qu'il lance pour une session d'Atelier. */
const SDK_BINARY = /node_modules[\\/]@anthropic-ai[\\/]claude-agent-sdk/i

function mentionsClaude(command: string): boolean {
  return /claude/i.test(command)
}

/**
 * Le PID que le daemon dit avoir eu pour lanceur.
 *
 * Il l'écrit dans sa propre ligne de commande — `--spawned-by {"…","pid":24680}`
 * — et c'est la seule trace de son origine, puisqu'un daemon est réparenté dès
 * que la session qui l'a lancé disparaît. Sans cela, un daemon abandonné depuis
 * des heures est indiscernable d'un daemon tout neuf.
 *
 * `0` quand la ligne ne dit rien, ce qui est le cas de tout le reste.
 */
export function spawnedByPid(command: string): number {
  const m = /--spawned-by[\s\S]*?pid\\?"\s*:\s*(\d+)/.exec(command)
  return m ? Number(m[1]) : 0
}

/**
 * D'où vient ce processus ?
 *
 * La parenté passe avant la ligne de commande partout où elle tranche : un
 * enfant direct du BFF est une session de l'Atelier, quoi qu'en dise sa ligne, et
 * l'enfant d'un hôte de pseudo-terminal est un job. Les marqueurs textuels ne
 * servent qu'à ce que la parenté ne dit pas.
 */
function classify(p: RawProcess, selfPid: number, byPid: Map<number, RawProcess>): ClaudeProcessKind {
  if (p.pid === selfPid) return 'aura'

  for (const { needle, kind } of MARKERS) {
    if (p.command.includes(needle)) return kind
  }

  if (p.ppid === selfPid || SDK_BINARY.test(p.command)) return 'atelier'

  const parent = byPid.get(p.ppid)
  if (parent?.command.includes('--bg-pty-host')) return 'bg-job'
  // Un job dont l'hôte est déjà tombé : la ligne le dit encore. Une session
  // ouverte à la main n'a jamais d'identifiant imposé.
  if (p.command.includes('--session-id')) return 'bg-job'

  return mentionsClaude(p.command) ? 'interactive' : 'other'
}

/**
 * Ce processus a-t-il perdu ce qui l'a lancé ?
 *
 * Pour un daemon, on interroge le lanceur qu'il nomme dans sa ligne : il est
 * réparenté dès la mort de sa session, donc son `ppid` ne dit plus rien. Pour
 * tout le reste, le parent réel fait foi.
 */
function isOrphan(p: RawProcess, isAlive: (pid: number) => boolean): boolean {
  const origin = spawnedByPid(p.command)
  if (origin) return !isAlive(origin)
  return p.ppid > 0 && !isAlive(p.ppid)
}

/**
 * Assemble la liste montrable à partir du brut.
 *
 * L'orphelinat se juge en interrogeant le système, **jamais** la table : celle-ci
 * ne contient que des processus Claude, si bien qu'une session lancée depuis un
 * terminal y paraîtrait toujours abandonnée — son parent est un shell, qui n'y
 * figure pas. On demande donc au système si le parent vit encore, et pour un
 * daemon on interroge le lanceur qu'il nomme lui-même plutôt que son parent, dont
 * il a été détaché.
 *
 * `isAlive` est injectable pour que le calcul reste pur sous test.
 */
export function buildProcessList(
  raw: RawProcess[],
  selfPid: number,
  sessions: SessionInfo[] = [],
  isAlive: (pid: number) => boolean = alive,
): ClaudeProcess[] {
  const all = new Map(raw.map((p) => [p.pid, p]))
  const byPid = new Map(sessions.filter((s) => s.pid).map((s) => [s.pid as number, s]))

  return raw
    .filter((p) => p.pid === selfPid || mentionsClaude(p.command))
    .map((p) => {
      const session = byPid.get(p.pid)
      return {
        pid: p.pid,
        ppid: p.ppid,
        kind: classify(p, selfPid, all),
        command: p.command.slice(0, COMMAND_MAX),
        ...(p.startedAt ? { startedAt: p.startedAt } : {}),
        orphan: isOrphan(p, isAlive),
        self: p.pid === selfPid,
        ...(session
          ? {
              sessionId: session.sessionId,
              ...(session.name ? { name: session.name } : {}),
              ...(session.cwd ? { cwd: session.cwd } : {}),
              ...(session.status ? { status: session.status } : {}),
            }
          : {}),
      }
    })
    .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0) || a.pid - b.pid)
}

/**
 * Dans quel ordre couper.
 *
 * Parent d'abord, descendance ensuite. L'ordre n'est pas une élégance : un job
 * coupé avant son hôte de pseudo-terminal est relancé par celui-ci dans la
 * seconde, avec le même identifiant de session sous un nouveau PID. C'est
 * exactement ce qui s'est produit le soir où cette surface a été décidée.
 *
 * Un parcours en largeur suffit à garantir cet ordre, et la table des visités
 * protège du cycle qu'un PID recyclé pourrait former.
 */
export function killOrder(pid: number, descendants: boolean, procs: ClaudeProcess[]): number[] {
  if (!descendants) return [pid]

  const children = new Map<number, number[]>()
  for (const p of procs) {
    if (p.ppid === p.pid) continue
    children.set(p.ppid, [...(children.get(p.ppid) ?? []), p.pid])
  }

  const order: number[] = []
  const seen = new Set<number>()
  const queue = [pid]
  while (queue.length) {
    const current = queue.shift() as number
    if (seen.has(current)) continue
    seen.add(current)
    order.push(current)
    queue.push(...(children.get(current) ?? []))
  }
  return order
}

/** La liste complète, enrichie de ce que les fichiers de session savent. */
export async function listClaudeProcesses(): Promise<ProcessList> {
  const raw = await enumerate()
  if (!raw) return { processes: [], unsupported: true }

  // Les fichiers de session ne sont pas indispensables : sans eux la liste perd
  // les noms, pas les processus.
  let sessions: SessionInfo[] = []
  try {
    sessions = await listSessions()
  } catch {
    /* la liste vaut sans les noms */
  }
  return { processes: buildProcessList(raw, process.pid, sessions) }
}

/**
 * Termine un processus, et sa descendance si on le demande.
 *
 * Rend les PID effectivement tombés. Un `kill` qui échoue n'interrompt pas les
 * suivants : le processus a pu sortir de lui-même entre l'énumération et le
 * geste, et abandonner à ce moment-là laisserait la moitié d'un arbre debout —
 * soit précisément l'état qu'on venait défaire.
 */
export function killTree(pid: number, descendants: boolean, procs: ClaudeProcess[]): number[] {
  const killed: number[] = []
  for (const target of killOrder(pid, descendants, procs)) {
    try {
      process.kill(target, 'SIGKILL')
      killed.push(target)
    } catch {
      /* déjà parti, ou hors de portée */
    }
  }
  return killed
}
