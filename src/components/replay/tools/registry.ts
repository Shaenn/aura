// What each tool looks like in the timeline: an icon, a one-line summary, and
// which body renders its input.
//
// A table, not a chain of `if`s. Adding a tool means adding a row; a tool we have
// never seen falls back to `GENERIC`, which is honest rather than empty. The
// summary is the only thing most readers ever see — a collapsed `Edit` row must
// say *which file* and *how much*, or the timeline is a wall of tool names.
//
// The views and their frequency, measured over 44 585 real tool calls:
// Read 31.1% · Edit 23.3% · Bash 19.5% · Grep 8.6% · Glob 4.8% · Write 4.5%.

import { t } from '@/i18n'

export type ToolView =
  | 'read'
  | 'edit'
  | 'write'
  | 'shell'
  | 'grep'
  | 'glob'
  | 'lsp'
  | 'plan'
  | 'enterPlan'
  | 'agent'
  | 'web'
  | 'webSearch'
  | 'task'
  | 'message'
  | 'sendMessage'
  | 'ask'
  | 'search'
  | 'skill'
  | 'generic'

export interface ToolDescriptor {
  /** Material icon name (Quasar `@quasar/extras`). */
  icon: string
  view: ToolView
  summary: (input: Record<string, unknown>) => string
}

import { asRecord, arr, bool, num, str, type ToolInput as Input } from './values'
import { basename as short } from './language'

/** Collapse whitespace and cut, so a summary never wraps the header. */
function oneLine(s: string, max = 80): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function countLines(s: string): number {
  return s ? s.split('\n').length : 0
}

/** Un résumé mal accordé se remarque plus que le compte qu'il porte. */
function lineCount(n: number): string {
  return `${n} ligne${n > 1 ? 's' : ''}`
}

/** `https://code.claude.com/docs/en/hooks.md` → `code.claude.com/docs/…/hooks.md` */
function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    return url
  }
}

const GENERIC: ToolDescriptor = {
  icon: 'build',
  view: 'generic',
  // Nothing is known about this tool, so show the first thing that reads like a
  // subject rather than inventing a field order it never had.
  summary: (i) => oneLine(str(i.description) || str(i.query) || str(i.name) || str(i.path) || str(i.file_path) || str(i.prompt)),
}

function taskSummary(i: Input): string {
  const id = str(i.taskId) || str(i.task_id)
  const parts = [str(i.subject), id && `#${id}`, str(i.status)].filter(Boolean)
  return oneLine(parts.join(' · '))
}

/**
 * Une commande d'une ligne se résume par elle-même. Une commande multi-ligne,
 * aplatie puis coupée à 80 caractères, ne montre que sa plomberie —
 * `cat > fichier <<'EOF'` — et jamais son sujet ; sa description le dit mieux.
 *
 * Une minorité des commandes tiennent sur plusieurs lignes, et la quasi-totalité
 * de celles-là portent une description. Le repli sur la commande ne sert que les
 * appels qui n'en ont aucune.
 */
function shellSummary(i: Input): string {
  const command = str(i.command)
  const description = str(i.description)
  if (command.includes('\n') && description) return oneLine(description)
  return oneLine(command || description)
}

export const TOOLS: Record<string, ToolDescriptor> = {
  Read: {
    icon: 'description',
    view: 'read',
    summary: (i) => {
      const name = short(str(i.file_path))
      const offset = num(i.offset)
      const limit = num(i.limit)
      if (!offset && !limit) return name
      const from = offset || 1
      const range = limit ? t('replay.tools.summary.lineRange', { from, to: from + limit - 1 }) : t('replay.tools.summary.lineFrom', { from })
      return `${name} (${range})`
    },
  },
  Edit: {
    icon: 'edit',
    view: 'edit',
    // `replace_all` change la nature de l'appel : le fragment n'est plus une
    // modification mais un motif appliqué partout. Sans cette mention, une
    // édition d'un seul mot répétée trente fois se lit « 1 ligne ». Le nombre de
    // sites n'est ni dans l'entrée ni dans le résultat — on dit la portée, pas
    // un compte qu'on n'a pas.
    summary: (i) => {
      const name = short(str(i.file_path))
      const scope = bool(i.replace_all) ? ` · ${t('replay.tools.summary.everywhere')}` : ''
      const before = countLines(str(i.old_string))
      const after = countLines(str(i.new_string))
      if (!before && !after) return `${name}${scope}`
      const size = before === after ? lineCount(after) : `${before} → ${lineCount(after)}`
      return `${name} · ${size}${scope}`
    },
  },
  Write: {
    icon: 'note_add',
    view: 'write',
    summary: (i) => {
      const n = countLines(str(i.content))
      return `${short(str(i.file_path))}${n ? ` · ${lineCount(n)}` : ''}`
    },
  },
  Bash: {
    icon: 'terminal',
    view: 'shell',
    summary: shellSummary,
  },
  PowerShell: {
    icon: 'terminal',
    view: 'shell',
    summary: shellSummary,
  },
  Grep: {
    icon: 'search',
    view: 'grep',
    summary: (i) => {
      const where = str(i.glob) || (str(i.path) ? short(str(i.path)) : '')
      return oneLine(`"${str(i.pattern)}"${where ? ` dans ${where}` : ''}`)
    },
  },
  Glob: {
    icon: 'folder_open',
    view: 'glob',
    summary: (i) => {
      const where = str(i.path) ? ` dans ${short(str(i.path))}` : ''
      return oneLine(`${str(i.pattern)}${where}`)
    },
  },
  ExitPlanMode: {
    icon: 'checklist',
    view: 'plan',
    summary: (i) => {
      const plan = str(i.plan)
      if (!plan) return t('replay.tools.summary.planSubmitted')
      // The plan's own H1 is its title; fall back to its first non-empty line.
      const title =
        plan
          .split('\n')
          .find((l) => l.trim())
          ?.replace(/^#+\s*/, '') ?? ''
      return oneLine(title || t('replay.tools.summary.planSubmitted'))
    },
  },
  // Il partageait la vue `plan` avec `ExitPlanMode`, dont il n'a rien : pas de
  // plan, pas de fichier, pas de verdict. Son entrée est vide sur les 15 appels
  // du parc — le schéma n'a aucune propriété — et la vue y répondait par un
  // `KeyValueList` sur un objet vide, puis par les 581 caractères de consigne au
  // modèle dans le pavé brut.
  EnterPlanMode: {
    icon: 'edit_document',
    view: 'enterPlan',
    summary: () => t('replay.tools.summary.planMode'),
  },
  Agent: {
    icon: 'smart_toy',
    view: 'agent',
    summary: (i) => oneLine(str(i.description) || str(i.subagent_type) || str(i.prompt)),
  },
  WebFetch: {
    icon: 'language',
    view: 'web',
    summary: (i) => oneLine(shortUrl(str(i.url))),
  },
  // Elle partageait la vue `web` avec `WebFetch`, dont elle n'a rien : pas
  // d'URL, pas de statut HTTP, pas de poids de page. Ce qu'un résultat de
  // recherche porte — une liste de sources et une synthèse en markdown — cette
  // vue-là n'avait aucun moyen de le montrer, et le laissait au pavé brut.
  WebSearch: {
    icon: 'travel_explore',
    view: 'webSearch',
    summary: (i) => oneLine(str(i.query)),
  },
  TaskCreate: { icon: 'add_task', view: 'task', summary: taskSummary },
  TaskUpdate: { icon: 'update', view: 'task', summary: taskSummary },
  TaskStop: { icon: 'stop_circle', view: 'task', summary: taskSummary },
  SendMessage: {
    icon: 'send',
    view: 'sendMessage',
    // Un message porte son objet, un ordre de service n'en a pas : les 12
    // `shutdown_*` du parc n'ont pas de `summary`, et le résumé se réduisait au
    // nom du destinataire. Ce qu'ils demandent tient pourtant en trois mots, et
    // il est dans le corps — que le harness écrit là en objet, pas en texte.
    summary: (i) => {
      const to = str(i.to) || str(i.recipient) || str(i.agentId)
      const body = asRecord(i.message)
      const type = str(body.type) || str(i.type)
      const what =
        type === 'shutdown_request'
          ? t('replay.tools.summary.shutdownAsk')
          : type === 'shutdown_response'
            ? bool(body.approve) || bool(i.approve)
              ? t('replay.tools.summary.shutdownYes')
              : t('replay.tools.summary.shutdownNo')
            : str(i.summary)
      return oneLine([to && `→ ${to}`, what].filter(Boolean).join(' · '))
    },
  },
  TeamCreate: {
    icon: 'group_add',
    view: 'message',
    summary: (i) => oneLine(str(i.team_name) || str(i.description)),
  },
  TeamDelete: {
    icon: 'group_remove',
    view: 'message',
    summary: (i) => oneLine(str(i.team_name)),
  },
  AskUserQuestion: {
    icon: 'help',
    view: 'ask',
    summary: (i) => {
      const qs = arr(i.questions)
      const head = oneLine(str(asRecord(qs[0]).question))
      return qs.length > 1 ? `${head} (+${qs.length - 1})` : head
    },
  },
  // La vue générique listait `skill` et `args` en clé-valeur, puis rendait le
  // pavé de sortie — lequel ne contient jamais que `Launching skill: <nom>`,
  // c'est-à-dire l'en-tête de la carte, une troisième fois. Ce que l'appel fait
  // vraiment n'était nulle part : la restriction d'outils qu'il impose, et le
  // manuel entier qu'il verse dans la fenêtre juste après.
  Skill: {
    icon: 'extension',
    view: 'skill',
    summary: (i) => oneLine([str(i.skill), str(i.args)].filter(Boolean).join(' ')),
  },
  ToolSearch: {
    icon: 'manage_search',
    view: 'search',
    // 353 des 365 requêtes du parc nomment leurs outils sous la forme
    // `select:A,B`. Le préfixe est de la syntaxe, pas du sujet : le montrer
    // 353 fois de suite pousse hors du résumé ce qui s'y lit vraiment.
    summary: (i) => {
      const q = str(i.query)
      return oneLine(q.startsWith('select:') ? q.slice(7).split(',').join(' · ') : q)
    },
  },
  LSP: {
    icon: 'data_object',
    view: 'lsp',
    // Le schéma exige `line` et `character` sur les neuf opérations, y compris
    // les deux qui ne travaillent pas sur une position : `documentSymbol` prend
    // le fichier entier, `workspaceSymbol` le projet entier. Le modèle y écrit
    // `1:1` faute de mieux — 55 appels sur 118. Le résumé affichait donc un
    // numéro de ligne que personne n'avait choisi, et pour `workspaceSymbol` il
    // le faisait à la place de `query`, le seul mot qui décrive l'appel.
    summary: (i) => {
      const operation = str(i.operation)
      const query = str(i.query)
      if (query) return oneLine(`${operation} · ${query}`)
      const file = short(str(i.filePath))
      const chosen = num(i.line) !== 1 || num(i.character) !== 1
      const at = file && chosen ? `${file}:${num(i.line)}` : file
      return oneLine([operation, at].filter(Boolean).join(' · '))
    },
  },
}

/** The descriptor for a tool name, or a generic one for a tool we do not know. */
export function descriptorFor(name: string): ToolDescriptor {
  return TOOLS[name] ?? GENERIC
}

/** Guarded summary: a malformed input must never take the timeline down. */
export function summarise(name: string, input: unknown): string {
  try {
    return descriptorFor(name).summary(asRecord(input))
  } catch {
    return ''
  }
}
