// Ce que la carte d'un appel `Agent` sait du run qu'elle a lancé.
//
// L'appel et son run vivent dans deux pistes différentes : l'appel sur le fil
// principal, les tours dans la piste de l'agent. La carte de l'appel est donc le
// seul endroit du fil principal qui puisse dire où en est le travail — et c'est
// exactement là qu'on le cherche, puisque c'est là que les tours étaient avant.
//
// Elle est loin de la page qui tient les données (`ToolCall` la monte au fond de
// la timeline), d'où l'injection plutôt qu'une prop traversant quatre étages.
// Injecter `null` reste valide : la carte retombe alors sur ce que l'appel dit
// de lui-même, ce qu'elle a toujours fait.

import type { SubagentRunSummary, TranscriptEvent } from '@/services/projects'
import type { InjectionKey, Ref } from 'vue'
import { summarise } from './tools/registry'

/** Un run, augmenté de ce que la carte montre en direct. */
export interface RunView {
  run: SubagentRunSummary
  /** Le dernier outil que l'agent a appelé — vide s'il n'en a appelé aucun. */
  lastTool: string
  /** Ce que cet appel visait, résumé comme le ferait sa propre carte. */
  lastToolSummary: string
  /**
   * Combien de fichiers distincts le run a écrits, `0` s'il n'a fait que lire.
   *
   * C'est la seule chose qu'un lecteur ne peut pas déduire du nombre de tours :
   * 264 des 598 runs du parc écrivent — 3 fichiers en médiane, jusqu'à 53 — et
   * les 334 autres n'ont fait que chercher. Deux cents lignes de piste séparent
   * ces deux cas, alors qu'ils n'engagent pas du tout la même relecture.
   */
  filesWritten: number
}

/** Par `toolUseId` de l'appel `Agent` : le run qui lui répond. */
export const AGENT_RUNS: InjectionKey<Ref<Map<string, RunView>>> = Symbol('agent-runs')

/** Ouvrir la piste d'un run. Absent quand la page n'a pas de pistes. */
export const OPEN_TRACK: InjectionKey<((agentId: string) => void) | null> = Symbol('open-track')

/**
 * Indexer les runs par l'appel qui les a lancés, dernier outil compris.
 *
 * Une seule passe sur le flux pour tous les runs : un balayage par run coûterait
 * autant de parcours que d'agents, et ce calcul se refait à chaque ligne ajoutée
 * pendant qu'une session travaille.
 *
 * Un run sans `toolUseId` n'entre pas dans la carte : rien ne le rattache à un
 * appel, donc aucune carte ne peut le montrer. Sa piste, elle, existe toujours.
 */
export function indexRuns(events: readonly TranscriptEvent[], runs: readonly SubagentRunSummary[]): Map<string, RunView> {
  if (!runs.length) return new Map()

  /** Par `agentId`, le dernier `tool_use` vu — le flux étant dans l'ordre. */
  const lastByAgent = new Map<string, { name: string; input: unknown }>()
  /** Par `agentId`, les chemins écrits — un `Set`, un même fichier se réédite. */
  const writtenByAgent = new Map<string, Set<string>>()
  for (const ev of events) {
    if (!ev.agentId) continue
    for (const b of ev.blocks) {
      if (b.kind !== 'tool_use' || !b.name) continue
      lastByAgent.set(ev.agentId, { name: b.name, input: b.input })
      if (b.name !== 'Edit' && b.name !== 'Write') continue
      const p = (b.input as Record<string, unknown> | null)?.file_path
      if (typeof p !== 'string' || !p) continue
      let set = writtenByAgent.get(ev.agentId)
      if (!set) writtenByAgent.set(ev.agentId, (set = new Set()))
      set.add(p)
    }
  }

  const out = new Map<string, RunView>()
  for (const run of runs) {
    if (!run.toolUseId) continue
    const last = lastByAgent.get(run.agentId)
    out.set(run.toolUseId, {
      run,
      lastTool: last?.name ?? '',
      lastToolSummary: last ? summarise(last.name, last.input) : '',
      filesWritten: writtenByAgent.get(run.agentId)?.size ?? 0,
    })
  }
  return out
}
