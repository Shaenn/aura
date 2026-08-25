import type { MessageSchema } from '../../fr'

const usage: MessageSchema['pages']['usage'] = {
  sub: 'tokens · estimated cost · sub-agents',
  rangeAria: 'Period',
  ranges: { d7: '7 d', d30: '30 d', d90: '90 d', all: 'All' },
  caveat:
    'I count at {rates} (Anthropic list, June 2026). A Pro or Max plan is billed at a flat fee: this amount says what this usage would have cost at the API, not what you paid.',
  caveatRates: 'API rates',
  unpriced:
    "I don't know the rate for {n} model ({list}): I counted its tokens, but its cost is missing from the total. | I don't know the rate for {n} models ({list}): I counted their tokens, but their cost is missing from the total.",
  loadError: "I couldn't load the usage",
  unknownError: 'Unknown error',
  totalsAria: 'Period totals',
  tiles: {
    cost: 'Estimated cost',
    costHint: 'API rates',
    sessions: 'Sessions',
    sessionsHint: 'distinct transcripts',
    turns: 'Responses',
    turnsHint: 'model calls',
    input: 'Tokens ↓',
    inputHint: 'input, cache excluded',
    output: 'Tokens ↑',
    outputHint: 'generated',
    cacheRead: 'Cache read',
    cacheReadHint: '10% of the input price',
  },
  daily: 'Cost per day',
  days: '{n} d',
  noActivity: "I don't see any activity in this period.",
  byModel: 'Breakdown by model',
  noModel: "I don't see any model in this period.",
  tableCaption: 'Cost and tokens per model',
  columns: { model: 'Model', turns: 'Responses', cost: 'Cost' },
  topProjects: 'Costliest projects',
  noProject: "I don't see any project in this period.",
  agents: 'Sub-agents',
  agentShare: '{pct}% of the cost',
  noAgent: "I don't see any sub-agent started in this period.",
}

export default usage
