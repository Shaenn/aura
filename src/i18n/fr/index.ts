import agent from './agent';
import cli from './cli';
import common from './common';
import diagnostics from './diagnostics';
import diff from './diff';
import formats from './formats';
import frontmatter from './frontmatter';
import layout from './layout';
import nav from './nav';
import pages from './pages';
import replay from './replay';
import resources from './resources';
import rules from './rules';
import tools from './tools';

const fr = {
  agent,
  cli,
  common,
  diagnostics,
  diff,
  formats,
  frontmatter,
  layout,
  nav,
  pages,
  replay,
  resources,
  rules,
  tools,
};

/**
 * La forme d'un catalogue, dérivée du français.
 *
 * Le français est la source de vérité : chaque tranche du catalogue anglais
 * s'annote avec sa part de ce type (`const layout: MessageSchema['layout']`),
 * si bien qu'une clé manquante ou en trop casse `vue-tsc` au build. C'est le
 * même principe que `shared/` — une divergence casse le typecheck plutôt que de
 * passer en silence jusqu'à l'écran.
 */
export type MessageSchema = typeof fr;

export default fr;
