import type { MessageSchema } from '../../fr';

const cost: MessageSchema['replay']['cost'] = {
  error: 'Diagnostics unavailable.',
  none: 'This session produced no priceable reply: there is nothing to break down.',
  floor: 'at least',
  rate: 'at API rates — a Pro or Max plan bills by the month',

  breakdownAria: 'Breakdown: {parts}',
  parts: {
    read: 'Re-reading the history',
    write: 'Building the window',
    input: 'Uncached input',
    output: 'Generating',
  },

  hintHeavy:
    'The {pct} spent re-reading is the price of length: at every turn, the whole conversation goes through again. It is the only item you cut by stopping earlier.',
  hintGrowing:
    'Re-reading is starting to weigh. It grows with the number of turns, not with the work done.',
  hintLight:
    'Re-reading stays marginal: this session mostly pays for what it read and produced once.',

  unpriced: '{models} has no known rate: its tokens are counted, its cost is not.',

  parc: 'Across your fleet — {n} sessions',
  median: 'median {v}',

  rank: {
    bestLow: 'The best of your {n} sessions.',
    lowestLow: 'The lowest of your {n} sessions.',
    betterThan: 'Better than {pct} of your sessions.',
    under: 'Below {pct} of your sessions.',
    highest: 'The highest of your {n} sessions.',
    lowest: 'The lowest of your {n} sessions.',
    moreThan: 'More than {pct} of your sessions.',
    lessThan: 'Less than {pct} of your sessions.',
    aboveA: 'Above {pct} of your sessions.',
  },

  findings: '{n} finding | {n} findings',
  findingPrefix: 'Session {id}… : ',
  more: 'See the fleet diagnostics',
  calm: 'Nothing to report: no rule points at this session.',
};

export default cost;
