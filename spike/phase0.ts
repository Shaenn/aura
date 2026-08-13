/**
 * Spike Phase 0 — ce qu'on doit prouver avant d'écrire une ligne de l'Atelier.
 *
 * Trois questions, trois modes. Aucune ne se répond par la lecture des typings :
 *   auth   — la souscription Claude Code locale passe-t-elle en headless sous
 *            Windows, sans ANTHROPIC_API_KEY, et voit-on des deltas de tokens ?
 *   permis — un Write non pré-autorisé passe-t-il par `canUseTool`, et un
 *            « allow » sans `updatedInput` casse-t-il vraiment l'outil ?
 *   ask    — que devient AskUserQuestion hors TUI ? Arrive-t-il jusqu'à nous ?
 *
 * Usage : tsx spike/phase0.ts <auth|permis|ask>
 * Le mode `permis` écrit dans un dossier jetable, jamais dans le dépôt.
 */

import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mode = process.argv[2] ?? 'auth';

/** Un journal plat : ce spike est lu dans un terminal, pas dans un debugger. */
const log = (tag: string, detail?: unknown): void => {
  const suffix =
    detail === undefined ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  console.log(`[${tag}]${suffix}`);
};

/**
 * En streaming input, `system/init` n'est émis qu'après lecture du premier
 * message : on pousse donc le prompt sans rien attendre, sinon interblocage.
 * L'itérable reste ouvert le temps du tour, puis se ferme — un seul tour suffit
 * à répondre aux trois questions.
 */
async function* singleTurn(text: string): AsyncGenerator<SDKUserMessage> {
  yield {
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] },
    parent_tool_use_id: null,
    session_id: '',
  } as SDKUserMessage;
}

const PROMPTS: Record<string, string> = {
  auth: "Réponds exactement : bonjour. Rien d'autre.",
  permis: 'Crée un fichier nommé preuve.txt contenant le mot OK. Puis arrête-toi.',
  ask: "Utilise l'outil AskUserQuestion pour me demander si je préfère le bleu ou le rouge. N'utilise aucun autre outil.",
  'ask-deny':
    "Utilise l'outil AskUserQuestion pour me demander si je préfère le bleu ou le rouge. Puis dis-moi ce que j'ai répondu.",
  'ask-mcp':
    "Utilise l'outil AskUserQuestion pour me demander si je préfère le bleu ou le rouge. Puis dis-moi ce que j'ai répondu.",
};

/**
 * La voie propre : on n'intercepte plus la permission, on prend la place de
 * l'outil. `toolAliases` redirige le `AskUserQuestion` émis par le modèle vers
 * un outil MCP in-process, que *nous* exécutons — donc dont nous écrivons le
 * résultat. Plus de refus, plus de `is_error`.
 *
 * Le texte renvoyé reprend mot pour mot la phrase du harness, relevée sur 376
 * appels réels : c'est elle que le repli textuel du visualiseur sait lire.
 */
const atelier = createSdkMcpServer({
  name: 'atelier',
  version: '0.0.1',
  tools: [
    tool(
      'ask_user',
      "Pose une ou plusieurs questions à choix à l'utilisateur et retourne ses réponses.",
      {
        questions: z.array(
          z.object({
            question: z.string(),
            header: z.string(),
            multiSelect: z.boolean().optional(),
            options: z.array(z.object({ label: z.string(), description: z.string() })),
          }),
        ),
      },
      async (args) => {
        // Le spike choisit la première option ; l'Atelier suspendra ici sur une
        // promesse résolue par le formulaire du front.
        const couples = args.questions.map((q) => `"${q.question}"="${q.options[0]?.label ?? ''}"`);
        log('ask_user exécuté par nous', couples.join(', '));
        return {
          content: [
            {
              type: 'text' as const,
              text: `User has answered your questions: ${couples.join(', ')}. You can now continue with the user's answers in mind.`,
            },
          ],
        };
      },
    ),
  ],
});

/**
 * Le CLI exécute AskUserQuestion lui-même et, sans TUI, répond « the user did
 * not answer ». Aucun canal du SDK ne permet de *fournir* un résultat d'outil :
 * ni `canUseTool` (allow/deny), ni les hooks PreToolUse. Le refus, lui, porte un
 * `message` qui devient le tool_result. On s'en sert comme voie de retour.
 */
function répondreÀLaPlaceDuTUI(input: Record<string, unknown>): string {
  const questions = (input.questions ?? []) as Array<{
    question?: string;
    options?: Array<{ label?: string }>;
  }>;
  // Le spike choisit toujours la première option ; l'Atelier affichera un vrai
  // formulaire et enverra le choix de l'utilisateur.
  return questions.map((q) => `${q.question ?? ''} → ${q.options?.[0]?.label ?? ''}`).join(' | ');
}

async function main(): Promise<void> {
  const prompt = PROMPTS[mode];
  if (!prompt) {
    console.error(`Mode inconnu : ${mode}. Attendu : auth | permis | ask.`);
    process.exit(2);
  }

  // Un dossier jetable pour les modes qui écrivent : le spike ne doit rien
  // laisser dans le dépôt, et le slug de projet dérivé sera tout aussi jetable.
  const cwd = mode === 'auth' ? process.cwd() : mkdtempSync(join(tmpdir(), 'aura-spike-'));
  log('cwd', cwd);
  log(
    'ANTHROPIC_API_KEY',
    process.env.ANTHROPIC_API_KEY ? 'PRÉSENTE (le test ne prouve rien)' : 'absente',
  );

  let deltas = 0;
  let sessionId = '';

  const q = query({
    prompt: singleTurn(prompt),
    options: {
      cwd,
      includePartialMessages: true,
      permissionMode: 'default',
      ...(mode === 'ask-mcp'
        ? {
            mcpServers: { atelier },
            toolAliases: { AskUserQuestion: 'mcp__atelier__ask_user' },
          }
        : {}),
      canUseTool: async (toolName, input, opts) => {
        log('canUseTool', {
          toolName,
          title: opts.title ?? null,
          displayName: opts.displayName ?? null,
          toolUseID: opts.toolUseID,
          requestId: opts.requestId,
          input,
        });
        if (mode === 'ask-deny' && toolName === 'AskUserQuestion') {
          const réponse = répondreÀLaPlaceDuTUI(input);
          log('réponse injectée', réponse);
          return { behavior: 'deny', message: `Réponse de l'utilisateur : ${réponse}` };
        }
        // Le pont de l'Atelier répondra ici. Pour le spike : on autorise, en
        // repassant l'input inchangé — le point précis que la Phase 2 doit tenir.
        return { behavior: 'allow', updatedInput: input };
      },
    },
  });

  for await (const message of q) {
    if (message.type === 'system' && message.subtype === 'init') {
      sessionId = message.session_id;
      log('init', {
        apiKeySource: (message as { apiKeySource?: string }).apiKeySource,
        model: (message as { model?: string }).model,
        session_id: message.session_id,
        tools: ((message as { tools?: string[] }).tools ?? []).length,
        askUserQuestionExposé: ((message as { tools?: string[] }).tools ?? []).includes(
          'AskUserQuestion',
        ),
      });
      continue;
    }

    if (message.type === 'stream_event') {
      const ev = (
        message as { event?: { type?: string; content_block?: { type?: string; name?: string } } }
      ).event;
      if (ev?.type === 'content_block_delta') deltas += 1;
      if (ev?.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
        log('tool_use', ev.content_block.name);
      }
      continue;
    }

    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') log('texte', block.text.slice(0, 200));
        if (block.type === 'tool_use')
          log('bloc tool_use', { name: block.name, input: block.input });
      }
      continue;
    }

    if (message.type === 'user') {
      // Les tool_result reviennent côté « user » : c'est là qu'on verra si un
      // outil a échoué (is_error) plutôt que de s'être exécuté.
      const content = message.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (
            typeof block === 'object' &&
            block &&
            'type' in block &&
            block.type === 'tool_result'
          ) {
            const b = block as { is_error?: boolean; content?: unknown };
            log('tool_result', {
              is_error: b.is_error ?? false,
              extrait: JSON.stringify(b.content).slice(0, 300),
            });
          }
        }
      }
      continue;
    }

    if (message.type === 'result') {
      log('result', {
        subtype: message.subtype,
        duration_ms: (message as { duration_ms?: number }).duration_ms,
        is_error: (message as { is_error?: boolean }).is_error,
      });
    }
  }

  log('deltas reçus', deltas);
  log(
    'transcript attendu',
    join(
      process.env.USERPROFILE ?? process.env.HOME ?? '',
      '.claude',
      'projects',
      cwd.replace(/[^A-Za-z0-9]/g, '-'),
      `${sessionId}.jsonl`,
    ),
  );
}

main().catch((err: unknown) => {
  console.error('[échec]', err);
  process.exit(1);
});
