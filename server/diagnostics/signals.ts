// Un relevé par session : ce qu'elle a coûté, et où c'est parti.
//
// Il manquait un échelon. `usage.ts` agrège en cellules (jour × modèle × projet),
// trop grossier pour désigner une session ; `parseTranscript` reconstruit tout
// l'événementiel d'une session, trop lourd pour les centaines de fichiers d'un
// dossier actif. Les règles de diagnostic ont besoin de l'entre-deux : un objet
// par session, assez riche pour juger, assez maigre pour tenir tout le parc en
// mémoire.
//
// Trois partis pris qui décident du reste :
//
//  1. **Le même pliage que la page Usage.** Une réponse API s'étale sur plusieurs
//     lignes JSONL ; on la replie par `message.id` (voir `tokens.ts`). Les deux
//     agrégateurs partagent ce code, donc leurs totaux se réconcilient au token
//     près — c'est un test, pas un espoir (`test/signals.test.ts`).
//  2. **Le coût en dollars, jamais en tokens cumulés.** `input + output +
//     cacheRead + cacheCreate` additionne des grandeurs dont les prix vont de 1
//     à 50 : un tel total classe en tête les sessions à gros cache, qui sont les
//     moins chères. Chaque cellule (jour × modèle) est chiffrée à son propre
//     tarif, comme dans `usage.ts`.
//  3. **L'exact et l'estimé ne se mélangent pas.** `tokens`, `cost`,
//     `peakContext` et les compactions sont lus tels quels dans le transcript.
//     `tools`, `byCategory` et `imageTokens` sont des estimations (chars/4 pour
//     le texte, pavés de 28 px pour les images) : tout ce qui les affiche doit
//     porter un `~`. Voir `shared/context.ts`, qui tient la même ligne.
//
// Ce module ne juge rien. Il mesure. Les seuils sont à l'étape suivante.

import { createReadStream } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { CONTEXT_CATEGORIES, estimateTokens, type Compaction, type ContextCategory } from '../../shared/context.ts'
import { CLAUDE_DIR } from '../claude/paths.ts'
import { classifyAttachment, contextLimitFor, readCompaction } from '../context.ts'
import { str, num } from '../json.ts'
import { costOf, isPriced, type TokenCounts } from '../pricing.ts'
import { ZERO, addTokens, growth, localDay, zeroTokens } from '../tokens.ts'
import { eachImage, imageSize, isHiResVisionModel, resultToText, visualTokens } from '../transcript.ts'

// ── Ce qu'on publie ──────────────────────────────────────────────────────────

/** Ce qu'un outil a pesé sur une session. Estimation — voir l'en-tête. */
export interface ToolCost {
  name: string
  /** `inputTokens + outputTokens`, le poids total de l'outil sur la fenêtre. */
  tokens: number
  /** Ce qui est parti vers l'outil : le corps d'un `Write`, le patch d'un `Edit`. */
  inputTokens: number
  /** Ce qu'il a rendu, images comprises. */
  outputTokens: number
  /** Part de `outputTokens` due aux images rendues. */
  imageTokens: number
  calls: number
  /** Appels revenus en erreur — des tokens dépensés sans résultat. */
  errors: number
}

/**
 * Une injection nommée du harness — une mémoire, un catalogue, un hook.
 *
 * Seules les catégories `memory`, `skills` et `harness` sont retenues : ce sont
 * celles qu'on peut *décider* d'alléger, et leurs libellés sont en petit nombre.
 * Les fichiers lus, eux, portent un libellé par chemin — des milliers par parc,
 * et rien à décider : c'est le travail de la session.
 */
export interface InjectionCost {
  category: ContextCategory
  /** Le libellé produit par `classifyAttachment` : `rules/foo.md`, `Hook lint`… */
  label: string
  tokens: number
  /** Combien de fois cette injection est entrée dans la fenêtre. */
  count: number
}

/**
 * Ce qu'une session a fait de ses appels d'outil, par famille.
 *
 * La coupure est volontairement grossière — chercher d'un côté, construire de
 * l'autre — parce que c'est elle qui discrimine : les sessions qui produisent le
 * plus font 0,6 exploration par édition, les moins productives 1,5. Aucune
 * famille n'est « bonne » ; c'est leur *rapport* qui décrit une manière de
 * travailler.
 */
export interface ToolFamilies {
  explorationCalls: number
  explorationErrors: number
  /** Poids de ces appels dans la fenêtre, entrée et sortie. Estimation. */
  explorationTokens: number
  productionCalls: number
  productionErrors: number
  productionTokens: number
}

/** Un point de dépense : une réponse API, à sa date et à son prix. */
export interface CostPoint {
  /** Millisecondes epoch — l'horodatage de la réponse. */
  t: number
  cost: number
  sessionId: string
}

/** Un sous-agent, chiffré depuis son propre fichier. */
export interface SubagentCost {
  agentId: string
  /** Le type d'agent, quand le `.meta.json` le nomme. */
  agentType: string | null
  turns: number
  tokens: TokenCounts
  cost: number
}

/** Un modèle, tel qu'il a servi dans cette session. */
export interface ModelCost {
  model: string
  turns: number
  tokens: TokenCounts
  cost: number
  /** Faux quand aucun tarif n'est connu : ses tokens comptent, pas son coût. */
  priced: boolean
}

/**
 * Le relevé d'une session — fil principal et sous-agents réunis.
 *
 * `tokens` et `cost` couvrent les deux ; `turns` ne compte que le fil principal,
 * et `subagentTurns` les réponses des sidecars, parce qu'une règle qui parle de
 * « la longueur d'une session » parle de la conversation, pas de ses délégations.
 */
export interface SessionSignal {
  sessionId: string
  /** Le slug du répertoire sous `~/.claude/projects`. */
  project: string
  branch: string
  /** Bornes ISO observées, tous fichiers de la session confondus. */
  firstTs: string
  lastTs: string
  /** Jour local du premier événement — la clé de tout regroupement temporel. */
  firstDay: string

  /** Réponses API du fil principal, dédupées. Jamais un nombre de lignes. */
  turns: number
  /** Réponses API produites dans les sidecars de sous-agents. */
  subagentTurns: number
  /**
   * Réponses portant `isSidechain` **dans le fichier principal**.
   *
   * L'ancien format y écrivait les tours de sous-agents, avant que les sidecars
   * existent. Elles sont comptées dans `turns` et dans `tokens` — les en retirer
   * ferait diverger le total de celui de la page Usage, qui les compte aussi.
   * Le champ existe pour qu'une règle sache qu'une session mélange les deux.
   */
  sidechainTurns: number

  tokens: TokenCounts
  /** Dollars aux tarifs API. Somme des cellules (jour × modèle) de la session. */
  cost: number
  /** `cacheRead / (input + cacheRead + cacheCreate)`. 0 si rien n'est entré. */
  cacheHitRatio: number
  /** Ce que coûte la seule relecture de l'historique, en dollars. */
  cacheReadCost: number
  /**
   * Ce qu'a coûté la *construction* du cache, en dollars.
   *
   * Le pendant du précédent : ce qu'on paie une fois pour n'avoir à relire qu'au
   * dixième du prix ensuite. Une session dont ce poste domine n'amortit pas.
   */
  cacheCreateCost: number
  /**
   * Ce qu'a coûté l'entrée jamais mise en cache, en dollars.
   *
   * `inputCost + cacheCreateCost` est le prix de *construction* de la fenêtre, et
   * `cacheReadCost` celui de sa relecture. Les trois se somment au coût d'entrée
   * total ; leur rapport dit si une session amortit ou recommence.
   */
  inputCost: number

  models: ModelCost[]
  /** Modèles de la session dont on ignore le tarif — leur coût manque au total. */
  unpricedModels: string[]

  /**
   * La plus grande fenêtre observée : `max(input + cacheRead + cacheCreate)`.
   * Exact. Une compaction prouve aussi une fenêtre — voir `compactions`.
   */
  peakContext: number
  /**
   * La fenêtre de la toute première réponse. Exact.
   *
   * Elle porte le socle (prompt système, schémas d'outils, mémoires) avant que la
   * conversation n'ait rien ajouté. Ce n'est pas le `baseline` de
   * `shared/context.ts`, qui en soustrait les injections mesurées : c'est la
   * borne haute, celle qu'on peut lire sans rien estimer. 0 si la première
   * réponse ne porte pas d'`usage`.
   */
  firstTurnContext: number
  /** Chaque compaction, avec ses champs tels que le harness les a écrits. */
  compactions: Compaction[]

  subagents: SubagentCost[]
  /** Les outils de la session, les plus lourds d'abord. Estimation. */
  tools: ToolCost[]
  /** Total des appels d'outil revenus en erreur. */
  toolErrors: number
  /** Tokens visuels de toutes les images entrées dans la fenêtre. Estimation. */
  imageTokens: number
  /**
   * Ce qui est entré dans la fenêtre, par catégorie, cumulé sur la session.
   * Estimation, et **cumul, non instantané** : ce qu'une compaction a vidé puis
   * réinjecté compte deux fois, parce qu'il a été payé deux fois.
   */
  byCategory: Record<ContextCategory, number>
  /**
   * Les injections nommées les plus lourdes (mémoires, catalogues, hooks), les
   * plus grosses d'abord. Estimation — c'est ce qui permet à un diagnostic de
   * désigner un fichier plutôt qu'une catégorie.
   */
  topInjections: InjectionCost[]

  // ── Ce que la session a *fait* ─────────────────────────────────────────────
  //
  // Les champs ci-dessus disent où l'argent est parti ; ceux-ci disent quels
  // gestes y mènent. Ils ne portent aucun jugement : « beaucoup exploré pour peu
  // de modifications » se vérifie, « improductive » ne se déduit pas — une
  // session qui traque deux heures un bug subtil et le corrige en une ligne
  // serait la moins productive de toutes selon un décompte d'éditions.

  /** Les appels d'outil par famille, fil principal et sous-agents réunis. */
  families: ToolFamilies
  /**
   * Les tours réellement pris par l'humain — ni les échos de résultats d'outil,
   * ni les injections du harness, ni les lignes de commande locales.
   *
   * `turns / userTurns` dit combien de réponses un prompt a déclenchées. Le
   * signal est à lire **à l'envers** de l'intuition : les sessions qui produisent
   * le plus en font nettement plus. Un brief complet qu'on laisse courir bat dix
   * relances courtes.
   */
  userTurns: number
  /**
   * Les `[Request interrupted by user]` du transcript.
   *
   * Leur coût direct est négligeable ; ce qu'elles marquent ne l'est pas : le
   * travail partait ailleurs qu'attendu.
   */
  interruptions: number
  /** Appels de `Read` sur un chemin déjà lu dans la session. */
  rereadCalls: number
  /** Ce que ces relectures ont remis dans la fenêtre. Estimation. */
  rereadTokens: number
  /**
   * La taille de la fenêtre du modèle, déduite de ce que la session a fait.
   *
   * Voir `contextLimitFor` : ce n'est pas l'identifiant du modèle qui la donne —
   * une session sur fenêtre longue écrit `claude-opus-4-8` tout court. On la
   * déduit donc de la plus grande fenêtre observée.
   */
  contextLimit: number

  /** Fichiers lus pour bâtir ce relevé (principal + sidecars). */
  files: number
}

export interface SignalsReport {
  signals: SessionSignal[]
  /**
   * Chaque réponse API du parc, à sa date et à son prix, en ordre chronologique.
   *
   * C'est la même passe qui les produit — le pliage par `message.id` est déjà
   * fait, la cellule (jour × modèle) déjà chiffrée. Ce qu'ils ajoutent est un
   * axe : les relevés par session ne savent rien dire d'une fenêtre de 5 h, qui
   * traverse les sessions et les coupe. Voir `pace.ts`.
   */
  points: CostPoint[]
  /** Fichiers relus lors de cet appel — 0 quand tout venait du cache. */
  filesScanned: number
}

// ── Le relevé d'un fichier ───────────────────────────────────────────────────
//
// Le cache est par fichier, pas par session : un transcript est immuable une fois
// la session close, alors qu'une session gagne des sidecars en cours de route.
// On scanne donc des fichiers, on assemble des sessions.

/** Une cellule (jour × modèle) : l'unité de chiffrage, comme dans `usage.ts`. */
interface Cell extends TokenCounts {
  day: string
  model: string
  turns: number
}

interface ToolTally {
  inputTokens: number
  outputTokens: number
  imageTokens: number
  calls: number
  errors: number
}

/** Une image en attente de chiffrage : son palier dépend des modèles du fichier. */
interface PendingImage {
  toolUseId: string
  width: number
  height: number
}

export interface FileScan {
  sessionId: string
  project: string
  branch: string
  firstTs: string
  lastTs: string
  /** `null` pour le fil principal ; sinon le sidecar d'un sous-agent. */
  agentId: string | null
  agentType: string | null
  cells: Cell[]
  turns: number
  sidechainTurns: number
  peakContext: number
  firstTurnContext: number
  compactions: Compaction[]
  tools: Map<string, ToolTally>
  toolErrors: number
  imageTokens: number
  byCategory: Record<ContextCategory, number>
  /** Par `catégorie|libellé`, pour les seules catégories décidables. */
  injections: Map<string, InjectionCost>
  families: ToolFamilies
  userTurns: number
  interruptions: number
  rereadCalls: number
  rereadTokens: number
  models: Set<string>
  /** Les réponses de ce fichier, horodatées et chiffrées. Voir `CostPoint`. */
  points: { t: number; cost: number }[]
}

/** Les catégories dont on retient les libellés — voir `InjectionCost`. */
const NAMED_CATEGORIES = new Set<ContextCategory>(['memory', 'skills', 'harness'])

/**
 * Les deux familles d'outils qui décrivent une manière de travailler.
 *
 * Tout ce qui n'y figure pas — `Bash`, `Task`, un serveur MCP — n'est ni l'un ni
 * l'autre et n'entre dans aucun compte : un `Bash` peut lancer des tests comme
 * il peut lister un répertoire, et le ranger d'un côté fabriquerait un ratio que
 * rien ne soutient.
 */
const EXPLORATION_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'])
const PRODUCTION_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

/** Ce que le harness écrit quand l'utilisateur coupe la parole. */
const INTERRUPTED = '[Request interrupted by user'

function zeroFamilies(): ToolFamilies {
  return {
    explorationCalls: 0,
    explorationErrors: 0,
    explorationTokens: 0,
    productionCalls: 0,
    productionErrors: 0,
    productionTokens: 0,
  }
}

/** La famille d'un outil, ou `null` s'il n'en a pas. */
function familyOf(name: string): 'exploration' | 'production' | null {
  if (EXPLORATION_TOOLS.has(name)) return 'exploration'
  if (PRODUCTION_TOOLS.has(name)) return 'production'
  return null
}

/**
 * Combien d'injections nommées un fichier conserve.
 *
 * Le relevé de chaque fichier reste en cache pour toute la vie du serveur : sans
 * borne, un dossier bien fourni y garderait des dizaines de milliers de
 * libellés dont aucun diagnostic n'a l'usage. Vingt suffisent largement à trouver
 * les plus lourds d'une session.
 */
const MAX_NAMED_INJECTIONS = 20

function zeroCategories(): Record<ContextCategory, number> {
  const out = {} as Record<ContextCategory, number>
  for (const c of CONTEXT_CATEGORIES) out[c] = 0
  return out
}

/** Le texte qu'un appel d'outil emporte, tel que la fenêtre l'a reçu. */
function toolInputText(input: unknown): string {
  if (input === undefined || input === null) return ''
  if (typeof input === 'string') return input
  try {
    return JSON.stringify(input)
  } catch {
    return ''
  }
}

function tally(tools: Map<string, ToolTally>, name: string): ToolTally {
  const key = name || 'Outil'
  const found = tools.get(key) ?? {
    inputTokens: 0,
    outputTokens: 0,
    imageTokens: 0,
    calls: 0,
    errors: 0,
  }
  tools.set(key, found)
  return found
}

// ── Le scan d'un fichier ─────────────────────────────────────────────────────

/**
 * Un fichier à plier, et ce qu'on sait de lui avant de l'ouvrir.
 *
 * Exporté avec `scanFile` pour que les mesures d'activité — familles d'outils,
 * relectures, interruptions — soient éprouvables sur une fixture écrite à la
 * main. Rien d'autre n'en dépend : `scanFile` ne connaît qu'un chemin absolu, et
 * pas `CLAUDE_DIR`.
 */
export interface FileRef {
  path: string
  sessionId: string
  project: string
  agentId: string | null
  agentType: string | null
}

/**
 * Plier un transcript en un `FileScan`.
 *
 * Le fichier est lu en flux : certains dépassent la dizaine de mégaoctets, et une
 * ligne peut porter des centaines de Ko de base64. Rien de ce qui est lu n'est conservé — on
 * n'accumule que des compteurs, si bien que la mémoire ne dépend pas de la taille
 * du corpus.
 *
 * Contrairement à `usage.ts`, on analyse ici *toutes* les lignes et non les seules
 * porteuses d'`usage` : le coût par outil, les images et les injections sont
 * précisément dans les autres. C'est le pass complet, et c'est pourquoi il vit
 * derrière un cache incrémental.
 */
export async function scanFile(ref: FileRef): Promise<FileScan> {
  const scan: FileScan = {
    sessionId: ref.sessionId,
    project: ref.project,
    branch: '',
    firstTs: '',
    lastTs: '',
    agentId: ref.agentId,
    agentType: ref.agentType,
    cells: [],
    turns: 0,
    sidechainTurns: 0,
    peakContext: 0,
    firstTurnContext: 0,
    compactions: [],
    tools: new Map(),
    toolErrors: 0,
    imageTokens: 0,
    byCategory: zeroCategories(),
    injections: new Map(),
    families: zeroFamilies(),
    userTurns: 0,
    interruptions: 0,
    rereadCalls: 0,
    rereadTokens: 0,
    models: new Set(),
    points: [],
  }

  const cells = new Map<string, Cell>()
  /** Par `message.id` : la cellule où la réponse a atterri, et son compte courant. */
  const seen = new Map<string, { cell: Cell; counted: TokenCounts }>()
  /** Par `tool_use_id` : le nom de l'outil, pour recoller l'appel à son résultat. */
  const toolNames = new Map<string, string>()
  /** Par `message.id` : l'index du point de dépense, pour le compléter. */
  const pointOf = new Map<string, number>()
  /** Les chemins déjà lus : un `Read` qui y revient est une relecture. */
  const readPaths = new Set<string>()
  /** Les `tool_use_id` des relectures, pour peser leur résultat quand il arrive. */
  const rereadIds = new Set<string>()
  /** Les images, chiffrées à la fin : leur palier dépend des modèles du fichier. */
  const pendingImages: PendingImage[] = []
  /**
   * Les clés déjà admises dans la fenêtre courante. Une compaction la vide, donc
   * le jeu se vide avec elle : une mémoire réinjectée après coup est repayée.
   */
  let seenKeys = new Set<string>()
  let hiRes = false
  let firstTurnSeen = false

  const rl = createInterface({
    input: createReadStream(ref.path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  try {
    for await (const line of rl) {
      if (!line.trim()) continue
      let row: Record<string, unknown>
      try {
        row = JSON.parse(line) as Record<string, unknown>
      } catch {
        continue // une ligne illisible est une ligne de moins, pas un scan perdu
      }

      const ts = str(row.timestamp)
      if (ts) {
        if (!scan.firstTs || ts < scan.firstTs) scan.firstTs = ts
        if (ts > scan.lastTs) scan.lastTs = ts
      }
      if (!scan.branch) scan.branch = str(row.gitBranch)

      const type = str(row.type)
      const msg = row.message as Record<string, unknown> | undefined

      // ── Les images de la ligne, mises de côté ────────────────────────────
      eachImage(msg?.content, (source, toolUseId) => {
        const data = str(source.data)
        if (!data) return
        const size = imageSize(data, str(source.media_type, 'image/png'))
        if (size) pendingImages.push({ toolUseId, ...size })
      })

      // ── Une compaction : la fenêtre est vidée ────────────────────────────
      if (type === 'system' && str(row.subtype) === 'compact_boundary') {
        const compaction = readCompaction(row, ts ? Date.parse(ts) : 0)
        if (compaction) {
          scan.compactions.push(compaction)
          seenKeys = new Set()
        }
        continue
      }

      // ── Ce que le harness a poussé dans la fenêtre ───────────────────────
      if (type === 'attachment') {
        const injection = classifyAttachment(row.attachment)
        if (!injection) continue
        if (injection.dedupeKey) {
          if (seenKeys.has(injection.dedupeKey)) continue
          seenKeys.add(injection.dedupeKey)
        }
        scan.byCategory[injection.category] += injection.tokens
        if (NAMED_CATEGORIES.has(injection.category)) {
          const key = `${injection.category}|${injection.label}`
          const named = scan.injections.get(key)
          if (named) {
            named.tokens += injection.tokens
            named.count++
          } else {
            scan.injections.set(key, {
              category: injection.category,
              label: injection.label,
              tokens: injection.tokens,
              count: 1,
            })
          }
        }
        continue
      }

      if (!msg) continue

      // ── Le tour de l'utilisateur, et les résultats d'outils ──────────────
      if (type === 'user') {
        const content = msg.content
        /** Du texte que quelqu'un a tapé — ni balise du harness, ni écho d'outil. */
        let typed = ''
        let interrupted = false

        if (typeof content === 'string') {
          scan.byCategory.userMessage += estimateTokens(content)
          typed = content
        } else if (Array.isArray(content)) {
          for (const b of content as Record<string, unknown>[]) {
            if (b.type === 'text') {
              const text = str(b.text)
              scan.byCategory.userMessage += estimateTokens(text)
              if (!typed) typed = text
              if (text.includes(INTERRUPTED)) interrupted = true
            } else if (b.type === 'tool_result') {
              const id = str(b.tool_use_id)
              const name = toolNames.get(id) ?? 'Outil'
              const t = tally(scan.tools, name)
              const text = resultToText(b.content)
              const tokens = estimateTokens(text)
              t.outputTokens += tokens
              if (text.includes(INTERRUPTED)) interrupted = true
              // Une relecture pèse ce que son résultat a remis dans la fenêtre :
              // le fichier était déjà là, on le repaie en entier.
              if (rereadIds.has(id)) scan.rereadTokens += tokens
              const family = familyOf(name)
              if (family === 'exploration') scan.families.explorationTokens += tokens
              else if (family === 'production') scan.families.productionTokens += tokens
              if (b.is_error) {
                t.errors++
                scan.toolErrors++
                if (family === 'exploration') scan.families.explorationErrors++
                else if (family === 'production') scan.families.productionErrors++
              }
            }
          }
        }

        if (interrupted) scan.interruptions++

        // Un tour de l'humain, et non l'un des trois autres genres de lignes qui
        // portent `type: 'user'` : l'écho d'un résultat d'outil, une injection du
        // harness (résumé de compaction, notification d'agent, sortie de hook), ou
        // la trace d'une commande locale. Même filtre que `summariseTranscript`,
        // qui décide de la même chose pour le titre d'une session.
        const origin = row.origin as Record<string, unknown> | undefined
        const originKind = str(origin?.kind)
        const injectedUser = row.isCompactSummary === true || row.promptSource === 'system' || (originKind !== '' && originKind !== 'human')
        const trimmed = typed.trimStart()
        if (
          !row.isMeta &&
          !row.isSidechain &&
          !injectedUser &&
          // Couper la parole n'est pas donner une consigne : la ligne est écrite
          // par le harness, et la compter en prompt gonflerait le nombre de
          // briefs d'une session justement mal briefée.
          !interrupted &&
          trimmed &&
          // Les lignes de commande locales (`<command-name>`, `<bash-input>`,
          // `<local-command-stdout>`, `<system-reminder>`) commencent toutes par
          // une balise, qu'aucun prompt tapé ne porte en tête.
          !trimmed.startsWith('<')
        ) {
          scan.userTurns++
        }
        continue
      }

      if (type !== 'assistant') continue

      // ── La réponse : ses blocs, puis son usage ───────────────────────────
      const model = str(msg.model, 'unknown')
      scan.models.add(model)
      if (!hiRes && isHiResVisionModel(model)) hiRes = true

      if (Array.isArray(msg.content)) {
        for (const b of msg.content as Record<string, unknown>[]) {
          if (b.type === 'text') {
            scan.byCategory.thinking += estimateTokens(str(b.text))
          } else if (b.type === 'thinking') {
            // Claude Code n'écrit que la `signature` du raisonnement, jamais son
            // texte : ce qui est compté ici est ce qui reste sur le disque, pas
            // ce que le modèle a produit. Le manque tombe dans `unattributed`.
            scan.byCategory.thinking += estimateTokens(str(b.thinking))
          } else if (b.type === 'tool_use') {
            const name = str(b.name)
            const id = str(b.id)
            if (id) toolNames.set(id, name)
            const t = tally(scan.tools, name)
            t.calls++
            const inputTokens = estimateTokens(toolInputText(b.input))
            t.inputTokens += inputTokens

            const family = familyOf(name)
            if (family === 'exploration') {
              scan.families.explorationCalls++
              scan.families.explorationTokens += inputTokens
            } else if (family === 'production') {
              scan.families.productionCalls++
              scan.families.productionTokens += inputTokens
            }

            // Un `Read` sur un chemin déjà lu : le fichier n'a pas changé de
            // camp, il rentre une seconde fois dans la fenêtre. Le premier
            // passage, lui, est le travail de la session — il ne compte pas.
            if (name === 'Read') {
              const path = str((b.input as Record<string, unknown> | undefined)?.file_path)
              if (path) {
                if (readPaths.has(path)) {
                  scan.rereadCalls++
                  if (id) rereadIds.add(id)
                } else {
                  readPaths.add(path)
                }
              }
            }
          }
        }
      }

      const usage = msg.usage as Record<string, unknown> | undefined
      if (!usage) continue

      const tokens: TokenCounts = {
        input: num(usage.input_tokens),
        output: num(usage.output_tokens),
        cacheRead: num(usage.cache_read_input_tokens),
        cacheCreate: num(usage.cache_creation_input_tokens),
      }

      // La fenêtre que cette réponse a reçue. Les instantanés ne font que
      // croître, donc le maximum ligne à ligne est bien celui de la réponse.
      const context = tokens.input + tokens.cacheRead + tokens.cacheCreate
      if (context > scan.peakContext) scan.peakContext = context
      if (!firstTurnSeen && context > 0) {
        scan.firstTurnContext = context
        firstTurnSeen = true
      }

      // Une répétition d'une réponse déjà comptée : son `usage` en est un
      // instantané plus tardif, on complète de la différence.
      const id = str(msg.id)
      const prior = id ? seen.get(id) : undefined
      if (prior) {
        const delta = growth(prior.counted, tokens)
        addTokens(prior.cell, delta)
        // Le point de cette réponse existe déjà : il grandit du même delta, au
        // même tarif. `costOf` est linéaire en tokens, donc la somme des points
        // et celle des cellules ne peuvent pas diverger.
        const at = pointOf.get(id)
        const point = at !== undefined ? scan.points[at] : undefined
        if (point) point.cost += costOf(prior.cell.model, delta, prior.cell.day) ?? 0
        continue
      }

      const day = localDay(ts)
      if (!day) continue

      const key = `${day}\0${model}`
      let cell = cells.get(key)
      if (!cell) {
        cell = { ...ZERO, day, model, turns: 0 }
        cells.set(key, cell)
      }
      cell.turns++
      addTokens(cell, tokens)
      scan.turns++
      if (row.isSidechain) scan.sidechainTurns++
      if (id) seen.set(id, { cell, counted: { ...tokens } })

      // Le point de dépense de cette réponse. Une ligne sans horodatage lisible
      // n'en produit pas : un point sans date ne peut entrer dans aucune fenêtre,
      // et lui en inventer une le rangerait dans la mauvaise.
      const at = ts ? Date.parse(ts) : NaN
      if (Number.isFinite(at)) {
        if (id) pointOf.set(id, scan.points.length)
        scan.points.push({ t: at, cost: costOf(model, tokens, day) ?? 0 })
      }
    }
  } finally {
    rl.close()
  }

  // ── Les images, une fois le palier du fichier connu ───────────────────────
  for (const img of pendingImages) {
    const tokens = visualTokens(img.width, img.height, hiRes)
    scan.imageTokens += tokens
    if (img.toolUseId) {
      const t = tally(scan.tools, toolNames.get(img.toolUseId) ?? 'Outil')
      t.outputTokens += tokens
      t.imageTokens += tokens
    } else {
      // Une image collée par l'utilisateur : elle pèse sur son message.
      scan.byCategory.userMessage += tokens
    }
  }
  scan.byCategory.tools = [...scan.tools.values()].reduce((sum, t) => sum + t.inputTokens + t.outputTokens, 0)

  // Le relevé reste en cache : on n'y garde que les injections qui pèsent.
  if (scan.injections.size > MAX_NAMED_INJECTIONS) {
    scan.injections = new Map([...scan.injections].sort((a, b) => b[1].tokens - a[1].tokens).slice(0, MAX_NAMED_INJECTIONS))
  }

  scan.cells = [...cells.values()]
  return scan
}

// ── Le recensement des fichiers ──────────────────────────────────────────────

async function readAgentMeta(dir: string, agentId: string): Promise<string | null> {
  try {
    const raw = JSON.parse(await readFile(join(dir, `agent-${agentId}.meta.json`), 'utf8')) as Record<string, unknown>
    return str(raw.agentType) || null
  } catch {
    // Les anciens sidecars n'en écrivaient pas : l'agent reste anonyme, son
    // coût est compté quand même.
    return null
  }
}

/**
 * Tous les transcripts sous `projects/`, chacun rattaché à sa session.
 *
 * Un sidecar vit dans `<slug>/<sessionId>/subagents/agent-<id>.jsonl` : le nom du
 * répertoire *est* la session mère, et c'est la seule chose qui les relie de
 * façon sûre. C'est aussi ce que le CLI d'origine ne lisait pas — d'où des
 * sous-agents comptés en nombre d'appels et jamais en dollars.
 */
async function listFiles(): Promise<FileRef[]> {
  const root = join(CLAUDE_DIR, 'projects')
  const out: FileRef[] = []
  let slugs: string[]
  try {
    slugs = await readdir(root)
  } catch {
    return out
  }

  for (const project of slugs) {
    const dir = join(root, project)
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (entry.endsWith('.jsonl')) {
        out.push({
          path: join(dir, entry),
          sessionId: entry.slice(0, -6),
          project,
          agentId: null,
          agentType: null,
        })
        continue
      }

      const subDir = join(dir, entry, 'subagents')
      let agents: string[]
      try {
        agents = await readdir(subDir)
      } catch {
        continue // ce n'est pas un répertoire de session
      }
      for (const f of agents) {
        if (!f.endsWith('.jsonl')) continue
        const agentId = f.replace(/^agent-/, '').replace(/\.jsonl$/, '')
        out.push({
          path: join(subDir, f),
          sessionId: entry,
          project,
          agentId,
          agentType: await readAgentMeta(subDir, agentId),
        })
      }
    }
  }
  return out
}

// ── Cache incrémental ────────────────────────────────────────────────────────

interface CacheEntry {
  mtimeMs: number
  size: number
  scan: FileScan
}

/**
 * Un transcript est écrit en ajout et ne change plus une fois la session close :
 * un fichier dont (mtime, taille) n'a pas bougé ne peut pas porter de tokens
 * neufs. Seuls les quelques fichiers touchés depuis le dernier appel sont relus —
 * ce qui rend supportable le fait de tout analyser, ligne à ligne.
 */
const cache = new Map<string, CacheEntry>()

/** Vide le cache. Réservé aux tests et à un rechargement explicite. */
export function resetSignalsCache(): void {
  cache.clear()
}

async function collect(): Promise<{ scans: FileScan[]; scanned: number }> {
  const files = await listFiles()
  const live = new Set<string>()
  const scans: FileScan[] = []
  let scanned = 0

  for (const ref of files) {
    live.add(ref.path)
    let mtimeMs: number, size: number
    try {
      const s = await stat(ref.path)
      mtimeMs = s.mtimeMs
      size = s.size
    } catch {
      continue
    }

    const hit = cache.get(ref.path)
    if (hit && hit.mtimeMs === mtimeMs && hit.size === size) {
      scans.push(hit.scan)
      continue
    }
    const fresh = await scanFile(ref)
    scanned++
    cache.set(ref.path, { mtimeMs, size, scan: fresh })
    scans.push(fresh)
  }

  for (const path of cache.keys()) if (!live.has(path)) cache.delete(path)
  return { scans, scanned }
}

// ── L'assemblage en sessions ─────────────────────────────────────────────────

/** Le coût d'une liste de cellules, chacune à son propre tarif. */
function costOfCells(cells: Cell[]): number {
  let total = 0
  for (const c of cells) total += costOf(c.model, c, c.day) ?? 0
  return total
}

function foldModels(cells: Cell[]): ModelCost[] {
  const byModel = new Map<string, ModelCost>()
  for (const c of cells) {
    let m = byModel.get(c.model)
    if (!m) {
      m = {
        model: c.model,
        turns: 0,
        tokens: zeroTokens(),
        cost: 0,
        priced: isPriced(c.model),
      }
      byModel.set(c.model, m)
    }
    m.turns += c.turns
    addTokens(m.tokens, c)
    m.cost += costOf(c.model, c, c.day) ?? 0
  }
  return [...byModel.values()].sort((a, b) => b.cost - a.cost || b.tokens.output - a.tokens.output)
}

function mergeTools(scans: FileScan[]): { tools: ToolCost[]; errors: number } {
  const merged = new Map<string, ToolTally>()
  let errors = 0
  for (const s of scans) {
    errors += s.toolErrors
    for (const [name, t] of s.tools) {
      const found = tally(merged, name)
      found.inputTokens += t.inputTokens
      found.outputTokens += t.outputTokens
      found.imageTokens += t.imageTokens
      found.calls += t.calls
      found.errors += t.errors
    }
  }
  const tools = [...merged.entries()].map(([name, t]) => ({ name, tokens: t.inputTokens + t.outputTokens, ...t })).sort((a, b) => b.tokens - a.tokens)
  return { tools, errors }
}

/** Les injections nommées d'une session, tous ses fichiers réunis. */
function mergeInjections(scans: FileScan[]): InjectionCost[] {
  const merged = new Map<string, InjectionCost>()
  for (const s of scans) {
    for (const [key, i] of s.injections) {
      const found = merged.get(key)
      if (found) {
        found.tokens += i.tokens
        found.count += i.count
      } else {
        merged.set(key, { ...i })
      }
    }
  }
  return [...merged.values()].sort((a, b) => b.tokens - a.tokens)
}

/** Assemble les fichiers d'une même session en un relevé. */
function foldSession(sessionId: string, scans: FileScan[]): SessionSignal {
  const main = scans.filter((s) => !s.agentId)
  const sidecars = scans.filter((s) => s.agentId)
  const allCells = scans.flatMap((s) => s.cells)

  const tokens = zeroTokens()
  for (const c of allCells) addTokens(tokens, c)

  const denominator = tokens.input + tokens.cacheRead + tokens.cacheCreate
  const byCategory = zeroCategories()
  for (const s of scans) for (const c of CONTEXT_CATEGORIES) byCategory[c] += s.byCategory[c]

  const { tools, errors } = mergeTools(scans)
  const models = foldModels(allCells)

  // Les deux faces du cache, au tarif de chaque modèle et de chaque jour.
  const cacheReadCost = allCells.reduce((sum, c) => sum + (costOf(c.model, { ...ZERO, cacheRead: c.cacheRead }, c.day) ?? 0), 0)
  const cacheCreateCost = allCells.reduce((sum, c) => sum + (costOf(c.model, { ...ZERO, cacheCreate: c.cacheCreate }, c.day) ?? 0), 0)
  const inputCost = allCells.reduce((sum, c) => sum + (costOf(c.model, { ...ZERO, input: c.input }, c.day) ?? 0), 0)

  const timestamps = scans.map((s) => s.firstTs).filter(Boolean)
  const firstTs = timestamps.length ? timestamps.reduce((a, b) => (a < b ? a : b)) : ''
  const lastTs = scans.map((s) => s.lastTs).reduce((a, b) => (a > b ? a : b), '')

  // Le fil principal fait foi pour l'identité : un sidecar n'a ni la branche de
  // la session ni sa première fenêtre.
  const head = main[0] ?? scans[0]

  const peakContext = Math.max(
    0,
    ...main.map((s) => s.peakContext),
    // Une compaction prouve que la fenêtre a atteint `preTokens`, même si aucune
    // réponse relevée ne l'a montré.
    ...main.flatMap((s) => s.compactions.map((c) => c.preTokens)),
  )

  return {
    sessionId,
    project: head?.project ?? '',
    branch: head?.branch || '(none)',
    firstTs,
    lastTs,
    firstDay: firstTs ? localDay(firstTs) : '',

    turns: main.reduce((n, s) => n + s.turns, 0),
    subagentTurns: sidecars.reduce((n, s) => n + s.turns, 0),
    sidechainTurns: main.reduce((n, s) => n + s.sidechainTurns, 0),

    tokens,
    cost: costOfCells(allCells),
    cacheHitRatio: denominator ? tokens.cacheRead / denominator : 0,
    cacheReadCost,
    cacheCreateCost,
    inputCost,

    models,
    unpricedModels: models.filter((m) => !m.priced).map((m) => m.model),

    peakContext,
    // Du fil principal seulement, comme `peakContext` : une session réduite à ses
    // sidecars (le transcript mère supprimé, l'agent conservé) n'a pas de fenêtre
    // à elle, et celle de l'agent n'en est pas une mesure. 0 se lit « inconnu ».
    firstTurnContext: main[0]?.firstTurnContext ?? 0,
    compactions: main.flatMap((s) => s.compactions).sort((a, b) => a.timestamp - b.timestamp),

    subagents: sidecars
      .map((s) => {
        const agentTokens = zeroTokens()
        for (const c of s.cells) addTokens(agentTokens, c)
        return {
          agentId: s.agentId ?? '',
          agentType: s.agentType,
          turns: s.turns,
          tokens: agentTokens,
          cost: costOfCells(s.cells),
        }
      })
      .sort((a, b) => b.cost - a.cost),

    families: scans.reduce((acc, s) => {
      for (const k of Object.keys(acc) as (keyof ToolFamilies)[]) acc[k] += s.families[k]
      return acc
    }, zeroFamilies()),
    // Du fil principal seulement : dans un sidecar, une ligne `user` est
    // l'orchestrateur qui brieffe son agent, pas l'humain qui prend un tour.
    userTurns: main.reduce((n, s) => n + s.userTurns, 0),
    interruptions: main.reduce((n, s) => n + s.interruptions, 0),
    rereadCalls: scans.reduce((n, s) => n + s.rereadCalls, 0),
    rereadTokens: scans.reduce((n, s) => n + s.rereadTokens, 0),
    contextLimit: contextLimitFor(
      main.flatMap((s) => [...s.models]),
      peakContext,
    ),

    tools,
    toolErrors: errors,
    imageTokens: scans.reduce((n, s) => n + s.imageTokens, 0),
    byCategory,
    topInjections: mergeInjections(scans),
    files: scans.length,
  }
}

// ── API publique ─────────────────────────────────────────────────────────────

/**
 * Un relevé par session, sur tout le corpus, les plus coûteuses d'abord.
 *
 * Les sessions sans le moindre token (un fichier ouvert puis abandonné) sont
 * écartées : elles ne portent aucun signal et diluent tous les percentiles que
 * l'étape suivante calculera.
 */
export async function getSignals(): Promise<SignalsReport> {
  const { scans, scanned } = await collect()

  const bySession = new Map<string, FileScan[]>()
  for (const s of scans) {
    const list = bySession.get(s.sessionId)
    if (list) list.push(s)
    else bySession.set(s.sessionId, [s])
  }

  const signals = [...bySession.entries()]
    .map(([id, list]) => foldSession(id, list))
    .filter((s) => s.turns + s.subagentTurns > 0)
    .sort((a, b) => b.cost - a.cost)

  // Les points de tout le parc, en ordre chronologique : c'est ce que suppose
  // toute somme mobile, et le tri se fait une fois ici plutôt qu'à chaque appel.
  const points: CostPoint[] = []
  for (const s of scans) {
    for (const p of s.points) points.push({ ...p, sessionId: s.sessionId })
  }
  points.sort((a, b) => a.t - b.t)

  return { signals, points, filesScanned: scanned }
}
