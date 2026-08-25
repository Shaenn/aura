// Poser une question à l'humain — sans terminal.
//
// `AskUserQuestion` est exécuté par le CLI, qui le rend dans sa TUI. Sans TUI il
// répond « the user did not answer », et rien dans le SDK ne permet de *fournir*
// le résultat d'un outil : ni `canUseTool`, qui n'autorise ou ne refuse, ni les
// hooks `PreToolUse`.
//
// On ne se met donc pas devant l'outil, on prend sa place : `toolAliases`
// redirige l'`AskUserQuestion` émis par le modèle vers l'outil MCP in-process
// ci-dessous, qu'AURA exécute elle-même. Vérifié en Phase 0 — et le transcript
// persisté garde le nom `AskUserQuestion`, si bien que `AskView` s'applique sans
// modification.

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type { AskQuestion } from '../../shared/agent.ts'

/** Le nom vers lequel `toolAliases` redirige. */
export const ASK_TOOL = 'mcp__atelier__ask_user'

/**
 * La phrase du harness, relevée sur des appels réels.
 *
 * Il ne s'agit pas de cosmétique : notre résultat MCP ne porte que du texte, là
 * où le harness écrit en plus une carte structurée (`toolUseResult.answers`) que
 * nous ne pouvons pas produire. Au rejeu, `AskUserQuestionView` retombe alors sur
 * son analyse du texte — laquelle cherche exactement ces couples `"Q"="R"`.
 */
export function harnessSentence(answers: Record<string, string>, notes?: string): string {
  const pairs = Object.entries(answers)
    .map(([question, answer]) => `"${question}"="${answer}"`)
    .join(', ')
  const trailer = notes?.trim() ? ` user notes: ${notes.trim()}` : ''
  return `User has answered your questions: ${pairs}${trailer}. You can now continue with the user's answers in mind.`
}

/** Ce que le CLI répond quand personne n'a répondu. On reprend ses mots. */
export const NO_ANSWER = 'The user did not answer the questions.'

/**
 * L'entrée d'une question, décrite pour ce qu'on sait en rendre — jamais pour ce
 * qu'on accepte.
 *
 * Ce schéma est la copie d'un schéma qu'on ne possède pas : celui de
 * `AskUserQuestion`, que le SDK déclare en TypeScript (`sdk-tools.d.ts`,
 * `AskUserQuestionInput`). Or zod **retire ce qu'il ne déclare pas**. `preview` —
 * les maquettes ASCII qu'une question fait justement comparer — manquait ici, et
 * disparaissait donc en silence avant d'atteindre le formulaire : on choisissait
 * entre des libellés sans voir ce qu'ils désignaient.
 *
 * D'où le `passthrough` : un champ que le SDK ajoutera demain traversera au lieu
 * d'être coupé. L'interface n'en montrera que ce qu'elle sait montrer, ce qui est
 * un défaut visible et réparable — contrairement à une amputation muette.
 */
export const QUESTION_SHAPE = {
  questions: z.array(
    z
      .object({
        question: z.string(),
        header: z.string(),
        multiSelect: z.boolean().optional(),
        options: z.array(
          z
            .object({
              label: z.string(),
              description: z.string(),
              /** Maquette, extrait de code, comparaison — souvent multi-lignes. */
              preview: z.string().optional(),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
  ),
}

/**
 * Le serveur MCP d'une session. `ask` suspend jusqu'à ce qu'un humain réponde et
 * rend la phrase à remettre au modèle.
 */
export function createAskServer(ask: (questions: AskQuestion[]) => Promise<string>) {
  return createSdkMcpServer({
    name: 'atelier',
    version: '1.0.0',
    tools: [
      tool('ask_user', "Pose une ou plusieurs questions à choix à l'utilisateur et retourne ses réponses.", QUESTION_SHAPE, async (args) => ({
        content: [{ type: 'text' as const, text: await ask(args.questions) }],
      })),
    ],
  })
}
