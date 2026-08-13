import type { DiagnosticsCatalog } from './fr-diagnostics.ts';

// Le diagnostic, en anglais. Charte `docs/voice.md` : sobre et direct, et le
// vocabulaire arbitré là-bas — Atelier → Workshop, seuil → threshold,
// garde-fou → guardrail, relevé → reading.

const enDiagnostics: DiagnosticsCatalog = {
  metrics: {
    sessionCost: {
      label: 'Session cost',
      help: 'What the session cost in total, at API rates — main-thread turns and subagents included. Carried by every session whose cost is known and non-zero.',
      guardBasis:
        'A few dollars: below that, no optimisation pays back the time spent reading the session. No effect once your P90 rises above it.',
    },
    cacheReadCost: {
      label: 'History re-reads',
      help: 'What the tokens re-read from cache cost. At every turn the whole history goes back to the model: it is the largest single expense across the fleet, and it grows with the length of the conversation, not with the work done.',
      guardBasis:
        'Three dollars of re-reading alone: half the total-cost floor, since this item can never account for the whole session.',
    },
    toolTokens: {
      label: 'Context consumed by tools',
      help: 'The tokens that tool results put into the window — Read first among them. An estimate: what those results weigh, not what was billed for them.',
      guardBasis:
        'A whole standard window: tool results alone filled the equivalent of a complete context. A high floor, deliberately — feeding the window is a tool’s job, not waste.',
    },
    toolErrorRate: {
      label: 'Failed tool calls',
      help: 'The share of tool calls that came back as errors: tokens spent for nothing, plus the recovery they trigger. Measured on sessions of at least 20 calls — below that, a rate is only a rounding accident.',
      guardBasis:
        'One call in seven failing: below that, trial and error is part of normal work. This signal is worth the friction it reveals, not its monetary stake, which is small.',
    },
    compactionWaste: {
      label: 'Tokens dropped by compactions',
      help: 'What compactions removed from the window, across the sessions that had any. Dropping context is what a compaction is for: only an unusual scale is worth questioning, hence a deliberately high guardrail.',
      guardBasis:
        'Two and a half standard windows. High, deliberately: dropping context is the point of a compaction, and a low floor would flag normal behaviour — an ordinary compaction already drops several windows’ worth.',
    },
    subagentCost: {
      label: 'Subagent cost',
      help: 'What delegations cost, across the sessions that delegate. In dollars rather than as a share of cost: a session whose main thread only starts agents owes them 100% of its spend, and a ratio that saturates no longer singles anyone out.',
      guardBasis:
        'Three dollars of delegation: the price below which running it another way would cost more than it saves.',
    },
    injectedContext: {
      label: 'Context injected by the harness',
      help: 'Memories, CLAUDE.md, the skills catalogue and harness machinery: what enters the window before you have asked anything. Paid at every turn, since the whole history is re-read. An estimate.',
      guardBasis:
        'A twentieth of a standard window, loaded before your first question and re-read every turn. Low on purpose: unlike a tool, the baseline produces nothing in exchange for the room it takes.',
    },
    shortSessionBaseline: {
      label: 'Short-session baseline',
      help: 'The first-turn context of sessions of three turns or fewer: what a session pays before doing anything. Restricted to short sessions, because over a hundred turns the baseline is amortised and says nothing any more.',
      guardBasis:
        'A tenth of a standard window paid for three turns or fewer. Inactive on this fleet: the baseline already exceeds this floor at the median, so the percentile decides. This signal weighs nothing session by session — it is worth its cumulative total.',
    },
    explorationRatio: {
      label: 'Explorations per edit',
      help: 'How many reads and searches for one write. It describes a way of working, it does not grade it: hunting a bug for two hours and fixing it in one line gives a huge ratio and excellent work. On sessions that changed something and made at least 20 calls.',
      guardBasis:
        'Two explorations for one edit: below that, the ratio describes ordinary work. No effect once your P90 rises above it.',
    },
    turnsPerPrompt: {
      label: 'Turns per prompt',
      help: 'How many replies one of your messages triggers — the one signal where lower is worse, and the threshold a P10. Where it has been measured, the most productive sessions run markedly more turns per prompt: one full brief left to run beats ten short nudges. On sessions of at least 3 prompts and 10 turns.',
      guardBasis:
        'Three replies per prompt. Below that, you are nudging rather than working a method. On an inverted signal the floor is a ceiling: it only acts if it falls under the P10.',
    },
    interruptions: {
      label: 'Interruptions',
      help: 'The times you cut in (Esc). Their direct cost is negligible; what they signal is not: each time, the work was heading somewhere other than expected. On sessions carrying at least one.',
      guardBasis:
        'The threshold is crossed beyond two, so on the third interruption: one happens, two are arguable, three make a pattern.',
    },
    rereadTokens: {
      label: 'File re-reads',
      help: 'The tokens put back into the window by a file already read in the same session. A file read three times sits there three times — and is then paid for at every turn. An estimate, on sessions with at least one re-read.',
      guardBasis:
        'A tenth of a standard window, put back in by files already read. Low, because a re-read brings nothing new: the same bytes, paid for once more, then re-read every following turn.',
    },
    contextFill: {
      label: 'Window fill',
      help: 'The peak context reached, against the model’s limit. Approaching the limit heralds a compaction, so lost context and an expensive turn. On sessions where both the peak and the limit are known.',
      guardBasis:
        'Four fifths of the window: the point where compaction becomes likely. That floor is not a judgement but a mechanical fact, and so it has no reason to follow the fleet.',
    },
    cacheHitRatio: {
      label: 'Cache hit rate',
      help: 'The share of history re-read from cache rather than rewritten at full price. Lower is worse — this is the second inverted signal, and its threshold a P10. A low rate betrays a context reshuffled along the way. On sessions of at least 5 turns.',
      guardBasis:
        'Seven tenths: below that, the window is rebuilt more than it is re-read. Only applies to sessions costing at least one dollar — elsewhere there is nothing to lose.',
    },
    paceWindow: {
      label: '5-hour window',
      help: 'What five rolling hours cost, across all sessions. That is the quantity a usage limit counts: it knows nothing of sessions, and a session straddling two windows counts in both.',
      guardBasis:
        'Thirty dollars over five hours: below that, no usage limit makes itself felt. No effect once the P90 of your windows rises above it.',
    },
  },
  rules: {
    'historique-relu': {
      title: 'History re-reads',
      message:
        'Session {id}: {cost} spent re-reading history, {share} of its {total}, over {turns} turns and a window that peaked at {peak} tokens.',
      basis:
        'Cache-read tokens × the model’s rate, day by day. A measured cost, not a promised saving.',
    },
    'cache-faible': {
      title: 'Cache poorly used',
      message:
        'Session {id}: only {ratio} cache over {turns} turns (the fleet sits at {median}). {tokens} tokens came in at full price rather than a tenth of it',
      unpriced: ', on a model with no known rate.',
      priced: ', which is {cost}.',
      basis:
        'Uncached input, plus the cache written (1.25× the input rate). Some of it was unavoidable — the first pass is always paid for.',
    },
    'sous-agents-couteux': {
      title: 'Expensive subagents',
      message:
        'Session {id}: {count} subagent(s) ({types}) for {cost}, {share} of the session’s cost, over {turns} delegated turns.',
      unknownType: 'unknown type',
      basis:
        'Measured cost of the session’s subagent files, at their model’s rate. A recorded expense, not waste: delegating was often the right call.',
    },
    'outils-gourmands': {
      title: 'Tools heavy on context',
      message: 'Session {id}: ~{tokens} tokens of tools, {share} of the window we can name. ',
      top: '{name} accounts for ~{tokens} across {calls} calls ({inputShare} on input).',
      basis:
        'Text of the calls and their results, estimated at 4 characters per token; images counted in 28px tiles.',
    },
    'outils-en-echec': {
      title: 'Failed tool calls',
      message: 'Session {id}: {errors} calls failed out of {calls} ({rate}, fleet at {median})',
      worst: ', mostly {name} ({errors}).',
      noWorst: '.',
      wasted: ' ~{tokens} tokens spent for nothing.',
      basis:
        'Each tool’s weight prorated by its failures — the transcript does not price a failed call separately.',
    },
    'compaction-lourde': {
      title: 'Heavy compactions',
      message:
        'Session {id}: {count} compaction(s) ({kind}) dropped {tokens} tokens of context, from a window that peaked at {peak}.',
      auto: '{count} forced',
      manual: 'all triggered by hand',
      basis: '`preTokens − postTokens` of each compaction, two figures written by the harness.',
    },
    'contexte-injecte': {
      title: 'Context injected by the harness',
      message: 'Session {id}: ~{tokens} tokens of memories, catalogues and hooks',
      top: ' — mostly {list}.',
      noTop: '.',
      basis:
        'Text of the harness attachments, estimated at 4 characters per token. Paid once per window, and again after every compaction.',
    },
    'exploration-sans-fin': {
      title: 'Much searched, little built',
      message:
        'Session {id}: {explorations} reads or searches for {edits} edits, which is {ratio} per edit (the fleet sits at {median}). ~{tokens} tokens entered the window that way.',
      basis:
        'Text of the Read, Grep, Glob and web-search calls and their results, estimated at 4 characters per token. That is what searching put into the window — not what could have been saved.',
    },
    'brief-morcele': {
      title: 'Task given in pieces',
      message:
        'Session {id}: {prompts} prompts for {turns} replies, which is {ratio} turns per prompt where the fleet does {median}. One full brief left to run goes further than ten short nudges.',
      basis:
        'Prompts actually typed (excluding harness injections and tool echoes) against the model’s replies. No cost follows from it: this is a way of working, not an expense.',
    },
    reorientations: {
      title: 'Course corrections mid-run',
      message:
        'Session {id}: {count} interruptions over {turns} turns. What they cost is negligible; what they mark is less so — each time, the work was heading somewhere other than intended.',
      basis:
        '“[Request interrupted by user]” markers counted in the transcript. Work already produced is still billed, but that is not the point: an interruption says the run was going the wrong way.',
    },
    relectures: {
      title: 'Files re-read',
      message:
        'Session {id}: {calls} reads were of a file already read, ~{tokens} tokens put back in',
      share: ' — {share} of what Read brought in.',
      noShare: '.',
      basis:
        'Results of Reads whose path had already been read, estimated at 4 characters per token. A re-read after a compaction is unavoidable — the file was no longer in the window.',
    },
    'fenetre-proche-limite': {
      title: 'Window close to the limit',
      message: 'Session {id}: the window reached {peak} tokens, {fill} of the {limit} limit',
      auto: ', and {count} compaction(s) were forced.',
      noAuto: '.',
      basis:
        'Largest window recorded across the session’s replies, against the model’s limit as its usage reveals it (see `contextLimitFor`).',
    },
    'socle-gaspille': {
      title: 'Sessions opened for nothing',
      message:
        '{sessions} sessions of 3 turns or fewer each paid more than {threshold} tokens of baseline before saying anything: {tokens} tokens in total for {turns} turns, which is {cost}.',
      basis:
        'Measured cost of these sessions, and the exact window size of their first reply — system prompt, tool schemas and memories included.',
    },
    'rythme-5h': {
      title: '5-hour window loaded',
      message:
        'The last 5 hours cost {cost} across {sessions} session(s), where your windows are worth {median} at the median and {p90} at the ninth decile. Your heaviest reached {peak}.',
      basis:
        'Sum of the API replies of the last five hours, each at its model’s rate. That is the quantity a rolling usage limit counts — not waste.',
    },
    'sessions-paralleles': {
      title: 'Sessions run side by side',
      message:
        '{hours} h were spent with at least two sessions open at once ({share} of the time you had one), up to {max} at a time. Two sessions side by side consume the 5-hour window twice as fast.',
      basis:
        'Overlap of your sessions’ bounds, first and last line of each. These hours cost nothing extra in themselves: they say how fast the rolling window fills.',
    },
  },
  recommendations: {
    oneSession: '1 session',
    manySessions: '{n} sessions',
    wholeFleet: 'the whole fleet',
    estimated: ' (estimated)',
    problem: '{where} — {amount}{estimated}.',
    titles: {
      'historique-relu': 'Long sessions pay for their history again every turn',
      'cache-faible': 'Sessions that do not benefit from the cache',
      'sous-agents-couteux': 'Delegations that weigh heavily',
      'outils-gourmands': 'Tool output fills the window',
      'outils-en-echec': 'Tool calls failing in series',
      'compaction-lourde': 'Compactions dropping a great deal',
      'contexte-injecte': 'Memories, catalogues and hooks loaded into every window',
      'socle-gaspille': 'Sessions opened for almost nothing',
      'exploration-sans-fin': 'Sessions that search more than they build',
      'brief-morcele': 'Tasks given in pieces',
      reorientations: 'Work redirected mid-run',
      relectures: 'The same files read several times',
      'fenetre-proche-limite': 'Windows pushed to the limit',
      'rythme-5h': 'Your 5-hour window',
      'sessions-paralleles': 'Several sessions run side by side',
    },
    actions: {
      'historique-relu':
        'I’d suggest cutting these sessions up: /compact at the end of each sub-goal, or a new session with a short brief naming the files that matter. Every extra turn pays for the whole conversation again.',
      'cache-faible':
        'Look for what invalidates the cache mid-run — editing a CLAUDE.md, switching model, a hook that varies on every call. I can’t see it from here, but it is always one of those three.',
      'sous-agents-couteux':
        'I’d suggest keeping delegation for genuinely independent explorations: every subagent starts from a full preamble, which has to be paid for again.',
      'outils-gourmands':
        'Bound your reads (`limit`, `offset`), aim for excerpts rather than whole files, and prefer Grep to a full Read when you are searching.',
      'outils-en-echec':
        'Go and look at these sessions: a tool failing in series points to a malformed command or a path that does not exist, and I bill you for every attempt.',
      'compaction-lourde':
        'Compact earlier: dropping 600k tokens means you paid to build them, then paid to re-read them all the way up to that point.',
      'contexte-injecte':
        'I’d suggest trimming your memories and skill descriptions: they enter every window, and again after every compaction.',
      'socle-gaspille':
        'Group short questions into a session that is already open: the system prompt and the tool schemas are paid for at every opening.',
      'exploration-sans-fin':
        'Say up front where to look — the files, the module, the lead — and let the edit follow. When exploration drags on, it is usually because the target was never named.',
      'brief-morcele':
        'Give the whole task at once, with its finish criterion, and let it run. I am not telling you to take fewer turns: the sessions that produce the most take twice as many per prompt.',
      reorientations:
        'When an interruption is called for, take it as a sign that the brief was missing something: complete it rather than steering as you go.',
      relectures:
        'Keep the file in the window rather than reading it again: target excerpts (`limit`, `offset`). And remember that after a compaction, everything has to be read again anyway.',
      'fenetre-proche-limite':
        'Cut before the limit rather than hitting it: a forced compaction arrives at the worst moment, when the window has already been paid for in full at every turn.',
      'rythme-5h':
        'There is nothing to fix here — this is a state, worth knowing before starting a long session. If the window is already loaded, what follows will not go as far.',
      'sessions-paralleles':
        'Be aware that two sessions side by side empty the window twice as fast. That is a fair choice when the tasks are genuinely independent; it is a surprise when you did not see it coming.',
    },
    bodies: {
      'historique-relu':
        '{sessions} spend {share} of their cost (median) re-reading what they had already read. They run for {turns} turns at the median, with a window that peaked at {peak} tokens. The cache divides that price by ten, it does not cancel it: at every turn, the whole conversation goes back through.',
      'cache-faible':
        '{sessions} run at {ratio} cache (median) where the fleet sits at {median}. Their window is rebuilt rather than re-read.',
      'sous-agents-couteux':
        '{sessions} delegated to {agents} subagents in total, carrying {share} of their session’s cost (median). A subagent does not share its parent’s cache: it rebuilds its own context.',
      'outils-gourmands':
        '{sessions} let tool output take up most of the window we can name. Across the fleet: {top}. What enters at turn 3 is re-read every turn after.',
      'outils-en-echec':
        '{sessions} add up to {errors} failed calls, which is {rate} of their calls (median). A failed call is billed like any other, and its output stays in the window.',
      'compaction-lourde':
        '{sessions} dropped {tokens} tokens per compaction (median){auto} That context had been paid for when it was built, then re-read every turn until then.',
      compactionAuto: ', {n} of them forced for lack of room.',
      compactionManual: ', all triggered by hand.',
      'contexte-injecte':
        '{sessions} load more than the rest of the fleet in memories, skill catalogues and hook output. {top}Those tokens enter every window, and again after every compaction.',
      injectedTop: 'The heaviest across the fleet: {list}. ',
      'socle-gaspille':
        '{sessions} sessions were opened for {turns} turns in total. Each paid for the system prompt, the tool schemas and the memories before doing anything — a fixed cost that only amortises over time.',
      'exploration-sans-fin':
        '{sessions} do {ratio} reads or searches per edit (median), where the fleet does {median}. It is the signal that best separates two ways of working — and it describes, it does not grade: hunting a bug at length to fix it in one line looks exactly like this.',
      'brief-morcele':
        '{sessions} run at {ratio} replies per prompt (median), against {median} across the fleet. The meaning of that figure is the opposite of the intuition: more turns per prompt goes with more finished work, not less. One full brief left to run beats ten short nudges.',
      reorientations:
        '{sessions} add up to {total} interruptions. Their direct cost is negligible; what they mark is less so — each time, the work was heading somewhere other than expected, and had to be steered back.',
      relectures:
        '{sessions} re-read a file already read {calls} times, ~{tokens} tokens put back in. Some of it is unavoidable: after a compaction, the file is no longer in the window. The rest is room taken twice.',
      'fenetre-proche-limite':
        '{sessions} pushed their window to {fill} of the model’s limit (median){auto} Everything in the window is re-read at every turn: near the limit, every reply costs its maximum.',
      windowAuto: ', and {n} compaction(s) were forced for lack of room.',
      windowNoAuto: '.',
    },
    crossings: {
      reluOutils:
        'Worth noting: {n} of these sessions also have a window filled by tool output — that is the volume they are re-reading. Bounding reads acts on both fronts.',
      compactRelu:
        'Worth noting: {n} of these sessions are also among the most expensive in re-reading — the compaction came after the bill had been paid.',
      agentsRelu:
        'Worth noting: {n} of these sessions also re-read a great deal of their own history; delegation did not lighten the main thread.',
    },
    caveats: {
      throughput:
        'The throughput separating the two quarters is a number of edits per hour: I measure activity, not value. A session that hunts a subtle bug for two hours and fixes it in one line sits at the very bottom of my ranking, and it did good work.',
      listPrices:
        'I count at public API rates. A Pro or Max subscription is billed as a flat fee: my amounts say what this usage would have cost the API, not what you paid.',
      unpriced:
        'I don’t know the rate for {count} model(s) ({models}): I counted their tokens, but their cost is missing from my amounts.',
      uncalibrated:
        'I don’t have enough cases to calibrate the threshold for {rules}: those findings rest on a fallback value, not on your fleet.',
      estimates:
        'The token figures marked “~” I estimate at 4 characters per token: they are indications, never a count. The dollar amounts come from counters written by the harness.',
    },
  },
};

export default enDiagnostics;
