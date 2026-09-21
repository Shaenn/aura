// Le rapport d'un sous-agent, débarrassé de ce que le harnais enroule autour.
//
// Le `tool_result` d'un `Agent` au premier plan porte deux couches de plomberie.
// Une queue, depuis toujours et sur chaque résultat : la ligne `agentId: … (use
// SendMessage …)` suivie d'un bloc `<usage>`. Et, depuis le CLI 2.1.277, un
// cadre de tête : un paragraphe `[Subagent hand-back] …` qui prévient
// le modèle que ce qui suit n'a pas l'autorité de l'utilisateur, puis le rapport
// décalé de deux espaces sur chaque ligne, lignes vides comprises. Le décalage
// sert à rendre infalsifiable une ligne en colonne zéro ; pour le markdown, il
// pousse d'autant chaque ligne de code.
//
// Les deux s'adressent au modèle, pas au lecteur. Le texte d'origine reste tel
// quel dans le transcript : c'est ce que le modèle a lu, et le serveur s'en sert
// pour estimer le contexte. On ne l'épure qu'au moment de l'afficher.
//
// Le résultat au lancement d'un agent en arrière-plan n'est pas concerné, ni son
// rapport final : celui-ci arrive par `<task-notification>`, sans cadre.

const FRAME = '[Subagent hand-back]'
const FOLLOWS = 'The report follows:\n'

/**
 * La queue du harnais, ancrée en fin de texte et en colonne zéro. Dans un rapport
 * encadré, chaque ligne du sous-agent est décalée : une ligne `agentId:` qu'il
 * aurait écrite lui-même ne peut donc pas être prise pour elle.
 */
const TRAILER = /\n+agentId: [a-f0-9]+ \([^\n]*\)(?:\n<usage>[\s\S]*?<\/usage>)?\s*$/

/** Ce qu'il reste à lire du résultat d'un `Agent`, sans le cadre ni la queue. */
export function agentReport(text: string): string {
  if (!text.startsWith(FRAME)) return text.replace(TRAILER, '').trim()

  // Un cadre dont on ne reconnaît pas la charnière : le texte entier plutôt
  // qu'un rapport amputé sur une supposition.
  const at = text.indexOf(FOLLOWS)
  if (at < 0) return text.trim()

  return text
    .slice(at + FOLLOWS.length)
    .replace(TRAILER, '')
    .split('\n')
    .map((line) => line.replace(/^ {2}/, ''))
    .join('\n')
    .trim()
}
