// Les actions qu'AURA ne fait pas elle-même : elle donne la commande Claude Code
// et s'arrête là. Le dialogue est partagé par Plugins et MCP.

export default {
  defaultTitle: 'Commande à exécuter',
  copyAria: 'Copier la commande',
  copied: 'Commande copiée.',
  copyFailed: "Je n'ai pas pu copier : le navigateur me refuse le presse-papiers.",
  /** `claude …` est composé en chasse fixe, d'où le slot. */
  hint: 'À exécuter dans Claude Code (ou en terminal avec {cmd}).',
}
