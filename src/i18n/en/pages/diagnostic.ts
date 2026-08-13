import type { MessageSchema } from '../../fr';

const diagnostic: MessageSchema['pages']['diagnostic'] = {
  title: 'Cost diagnostic',
  sub: 'what the numbers say · and what to do about it',
  loadError: "I couldn't establish the diagnostic",
  unknownError: 'Unknown error',
  summaryAria: 'Period summary',
  tiles: {
    cost: 'Period cost',
    costHint: 'API rates',
    sessions: 'Sessions',
    sessionsHint: 'analysed',
    findings: 'Findings',
    findingsHint: 'all rules',
    critical: 'Critical',
    criticalHint: 'at least 2× the threshold',
  },
  actions: 'To do, in this order',
  noAction:
    'Nothing to report over this period. Thresholds are calibrated on your own corpus: no finding means nothing stands out, not that nothing was measured.',

  work: 'How you work',
  workSessions: '{n} session | {n} sessions',
  workIntro:
    'Your sessions of at least ten turns that produced a change, split into quarters by their edits per hour. This throughput measures {activity}: a session that hunts a bug for two hours and fixes it in one line sits at the very bottom, and it worked well. What the table shows is two ways of working — not a good one and a bad one.',
  workIntroActivity: 'activity, not value',
  workCaption: 'Gestures compared between the least and the most productive quarter',
  workColumns: {
    gesture: 'Gesture',
    bottom: 'Least productive quarter',
    top: 'Most productive quarter',
  },
  workEmpty:
    'Too few comparable sessions over this period: two quarters of a handful of sessions do not contrast. Widen the period to see this table.',
  rows: {
    editsPerHour: 'Edits per hour',
    editsPerHourWhat:
      'Write calls over the session duration, from its first to its last line. This is the criterion that splits the quarters, not a result: the next three lines are what we observe *within* those two quarters.',
    editsPerHourReading:
      'A session left open without being touched counts its idle hours, and so falls into the bottom quarter — which says nothing about its value.',
    explorationRatio: 'Explorations per change',
    explorationRatioWhat:
      'How many reads and searches for one write. Searching is necessary; the question is the ratio, and it has no good value in the absolute.',
    turnsPerPrompt: 'Turns per prompt',
    turnsPerPromptWhat:
      'How many replies one of your messages triggers. A high number means a brief left to run; a low one, short follow-ups that take back control at every step.',
    interrupted: 'Sessions with an interruption',
    interruptedWhat:
      'The share of sessions in the quarter where you cut in at least once. The direct cost of an interruption is negligible; what it signals is not — the work was heading somewhere unexpected.',
  },
  readings: {
    same: 'Your two quarters behave the same here: this gesture does not separate them.',
    exploreMore:
      'Here, the most productive quarter explores more: it searches more than it builds, and still delivers.',
    exploreLess: 'Here, the most productive quarter searches less than it builds.',
    turnsMore:
      'Here, the most productive quarter takes more turns per prompt — the result nobody expects, and a “too many turns” rule would have advised the opposite of the right move.',
    turnsLess: 'Here, the most productive quarter takes fewer turns per prompt.',
  },
  workReading: {
    prefix: 'On your corpus: {parts}.',
    explore:
      'your most productive sessions search less than they build ({top} exploration per change against {bottom})',
    turns:
      'they take {top} turns per prompt where the others take {bottom} — one complete brief left to run, not ten short follow-ups',
    none: 'Your two quarters look alike on these gestures: nothing clearly separates them here.',
  },

  pace: 'Pace',
  paceWindow: '{n} h window',
  current: 'The last 5 hours',
  currentWhat:
    'What was spent in the last five hours, across every project and every session — the quantity a usage limit counts.',
  currentHint: '{sessions} — {rank}',
  currentRank: {
    none: 'nothing spent in this window',
    busier: 'busier than {pct}% of your windows',
    calmer: 'calmer than {pct}% of your windows',
    above: 'above {pct}% of your windows',
  },
  currentReading: {
    none: 'Nothing was spent in this window.',
    fallback: 'Too few windows to settle on your corpus: the {threshold} mark is a fallback value.',
    over: 'Past your {threshold} mark — max(P90 of your windows, guardrail), as everywhere here.',
    under: 'Your mark is at {threshold}: max(P90 of your windows, guardrail), as everywhere here.',
  },
  windows: 'Your 5 h windows',
  windowsWhat:
    'The distribution of all your five-hour windows: a window is measured at each API response, which describes the moments when you work rather than calendar hours — those are mostly empty and would drag everything to zero.',
  windowsHint: 'median · P90 {p90} · peak {peak}{day}',
  windowsPeakDay: ' on {date}',
  windowsReading:
    '{n} windows measured. They overlap widely — one per response — so the peak is not a day but a moment: the five most expensive hours you strung together.',
  concurrency: 'Concurrent sessions',
  concurrencyWhat:
    'The highest number of sessions open at the same time, from the overlap of their bounds — first to last line of each.',
  concurrencyReading:
    'A session left open without being touched counts as open: that is what it was. Running two sessions at once fills the 5 h window twice as fast.',
  concurrencyHint:
    'at most — {hours} h at two or more, that is {share} of the time a session was open',
  paceReading:
    'A sliding window knows nothing about sessions: it counts what was spent in the last five hours, all sessions together. Two sessions run at once fill it twice as fast.',

  detail: 'The detail',
  rulesCount: '{n} rules',
  nothing: 'I have nothing to report.',
  affected: '{n} session | {n} sessions',
  uncalibratedTag: ' · uncalibrated threshold',
  measured: 'Measured',
  estimated: 'Estimated',
  uncalibratedWarn:
    'Too few cases to calibrate this threshold on your corpus: it comes from a fallback value. These findings are plausible, not calibrated.',
  heaviest: 'The heaviest cases',

  thresholds: 'The thresholds',
  thresholdsCalibrated: 'calibrated',
  thresholdsPartial: 'partial',
  thresholdsIntro:
    'Each threshold is {formula}. The percentile says “unusual here”, the guardrail “big enough to act on”. A threshold decided by its guardrail means the corpus is healthy on that signal.',
  thresholdsFormula: 'max(P90 of your corpus, a guardrail)',
  thresholdsCaption: 'Threshold kept per signal, and what decided it',
  thresholdColumns: {
    signal: 'Signal',
    sessions: 'Sessions',
    median: 'Median',
    threshold: 'Threshold',
    decidedBy: 'Decided by',
    hits: 'Cases',
  },
  boundWeak: 'sample too small',
  boundGuard: 'guardrail',
  boundPark: 'your corpus',
  reviewed:
    'Guardrails last reviewed by hand on {date}. Your corpus holds {sessions} today. How to recalibrate them is in the {link}.',
  reviewedLink: 'manual',
  caveats: "What this report doesn't know",

  bound: {
    uncal:
      '{n} sessions carry this signal, fewer than the 30 required: the percentile is set aside and the guardrail ({guard}) decides alone. The findings stay plausible, they are not calibrated.',
    whichHigh: 'the higher of the two',
    whichLow: 'the lower of the two',
    weightNone: 'No session crosses it: on this signal, your corpus is healthy.',
    weight: 'To compare with the {n} cases kept{cost}.',
    weightCost: ', which weigh {cost}',
    silenced: ', which silences {n} session{cost} | , which silences {n} sessions{cost}',
    silencedCost: ' weighing {cost}',
    orphansNone: ' None of them disappears for all that: each is flagged by another signal.',
    orphans:
      ' {n} of them ({cost}) are named by no other signal — that is what this floor really costs; the others are duplicates.',
    guardLine:
      '{rank} of your corpus {p} · guardrail {guard} → we keep {which}, so the guardrail{silenced}. {weight}{orphans}',
    parkLine:
      '{rank} of your corpus {p} · guardrail {guard} → we keep {which}, so your corpus: {verdict}. {weight}',
    verdictSame: 'both land in the same place, and there is nothing between them to silence',
    verdictPassed: 'the floor is passed and has nothing to silence',
  },

  read: {
    dist: ' Your corpus: median {p50}, P75 {p75}, P90 {p90}, max {max}, over {n} sessions.',
    senseLow: ' Here, lower is worse.',
    sideHigh: 'below',
    sideLow: 'above',
    uncal:
      'Only {n} session carries this signal, fewer than the 30 needed: a percentile would mean nothing there. The threshold is the guardrail alone ({value}), which is the cautious position — it can only silence. | Only {n} sessions carry this signal, fewer than the 30 needed: a percentile would mean nothing there. The threshold is the guardrail alone ({value}), which is the cautious position — it can only silence.',
    percentile:
      'Threshold = {rank} of your corpus, so 90% of your {n} sessions stay {side} {value}. The {hits} cases are that decile, not detected anomalies.',
    guard:
      'Threshold = guardrail: the {rank} of your corpus{p} does not reach what is worth acting on, and the floor ({value}) takes over.{silenced}',
    guardP: ' ({p})',
    guardSilenced: ' The {n} sessions in between are silenced{cost}.',
    guardSilencedCost: ' — {cost} in total',
  },
};

export default diagnostic;
