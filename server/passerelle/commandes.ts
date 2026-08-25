// Les commandes de la Passerelle, en un seul endroit.
//
// Elles doivent s'accorder à trois endroits qui ne se regardent pas : le
// `switch` de `routage.ts`, le texte de l'aide, et la liste que Telegram
// propose quand on tape `/`. Cette dernière était jusqu'ici saisie à la main
// dans `@BotFather`, donc hors du dépôt — invisible à toute relecture.
//
// Une commande annoncée mais retirée du routage est exactement le défaut contre
// lequel la documentation de Telegram met en garde, vu de l'autre côté : « votre
// serveur doit toujours vérifier que les commandes reçues sont valides », parce
// que rien ne garantit qu'une commande proposée existe encore. Sauf que là,
// c'est nous qui aurions créé l'écart.
//
// D'où cette table. Le routage garde son `switch` — il traduit une commande en
// intention, ce qui n'est pas mécanique —, mais un test tient les deux listes
// égales. Rien n'est engendré ; ce qui est engendré, c'est l'accord.

import { t } from '../i18n/index.ts'

/** Ce que Telegram accepte comme nom : minuscules, chiffres, soulignés, 32 max. */
export interface Commande {
  /** Le mot, **sans** la barre oblique : `setMyCommands` la refuse. */
  nom: string
  /**
   * L'argument attendu, s'il y en a un.
   *
   * Il ne sert qu'à l'aide : la liste de Telegram ne montre pas la forme d'une
   * commande, seulement son nom et ce qu'elle fait.
   */
  argument?: boolean
  /** Sous quel intertitre l'aide la range. */
  groupe: 'consulter' | 'travailler'
}

/**
 * L'ordre est celui de l'aide, et il n'est pas alphabétique : on consulte avant
 * d'ouvrir une session, et l'on ferme après avoir ouvert.
 *
 * `/start` et `/help` n'y figurent pas bien qu'ils soient reconnus : ce sont des
 * alias d'`/aide`, et Telegram propose déjà `/start` de lui-même. Les répéter
 * ferait une liste qui dit trois fois la même chose.
 */
export const COMMANDES: readonly Commande[] = [
  { nom: 'projets', groupe: 'consulter' },
  { nom: 'projet', argument: true, groupe: 'consulter' },
  { nom: 'voir', argument: true, groupe: 'consulter' },
  { nom: 'atelier', argument: true, groupe: 'travailler' },
  // Avant `/sessions`, et l'ordre dit la différence : celle-ci regarde la
  // session de cette conversation, celle-là compte le parc.
  { nom: 'etat', groupe: 'travailler' },
  { nom: 'compacter', groupe: 'travailler' },
  { nom: 'sessions', groupe: 'travailler' },
  { nom: 'stop', groupe: 'travailler' },
  { nom: 'fin', groupe: 'travailler' },
  { nom: 'aide', groupe: 'travailler' },
]

/** Ce que fait une commande, dans la langue en vigueur. */
function description(nom: string): string {
  return t(`passerelle.commandes.${nom}`)
}

/**
 * Le message d'aide, composé.
 *
 * Les intertitres n'apparaissent que si leur groupe a des commandes : une table
 * réduite ne doit pas laisser un titre au-dessus du vide.
 */
export function aide(): string {
  const lignes: string[] = [t('passerelle.aideEntete')]
  const argument = t('passerelle.aideArgument')

  for (const groupe of ['consulter', 'travailler'] as const) {
    const dedans = COMMANDES.filter((c) => c.groupe === groupe)
    if (!dedans.length) continue
    lignes.push('', t(groupe === 'consulter' ? 'passerelle.aideConsulter' : 'passerelle.aideTravailler'))
    for (const c of dedans) {
      const forme = c.argument ? `/${c.nom} ${argument}` : `/${c.nom}`
      lignes.push(`${forme} — ${description(c.nom)}`)
    }
  }

  lignes.push('', t('passerelle.aidePied'))
  return lignes.join('\n')
}

/**
 * La liste que Telegram propose sous le `/`.
 *
 * Les descriptions y sont lues **seules**, hors de l'aide : c'est pourquoi elles
 * se suffisent à elles-mêmes plutôt que de renvoyer l'une à l'autre.
 */
export function pourTelegram(): { command: string; description: string }[] {
  return COMMANDES.map((c) => ({ command: c.nom, description: description(c.nom) }))
}
