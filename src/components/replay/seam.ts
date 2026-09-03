// La couture de l'Atelier : le passé tel que le disque le porte, prolongé du
// direct pour ce que le fichier n'a pas encore.
//
// Les deux sources ne se comparent pas ligne à ligne — les identifiants ne sont
// pas du même espace et les horloges pas de la même origine. Le seul repère
// commun est le tour humain : on compte de part et d'autre, et on coud au
// (n+1)-ième, où n est ce que le fichier couvre.
//
// Ce module est du calcul pur sur deux listes d'événements. Il vit hors du SFC
// pour être exerçable par vitest, qui ne monte pas de composant.

import { isHumanMessage } from '@/composables/useTranscriptTurns'
import type { TranscriptEvent } from '@/services/projects'

/**
 * Le geste humain, des deux côtés de la couture.
 *
 * C'est `isHumanMessage`, celui-là même qui décide dans la timeline où s'ouvre
 * une carte, et c'est délibéré : compter les tours autrement que la timeline ne
 * les découpe ferait poser la couture ailleurs qu'à une frontière de carte, et
 * une carte coupée en deux sources se re-rendrait à chaque relecture.
 */
export function humanTurns(events: readonly TranscriptEvent[]): number {
  return events.filter(isHumanMessage).length
}

/** Où commence le (n+1)-ième tour humain d'une liste, ou sa fin s'il n'y en a pas. */
export function afterTurn(events: readonly TranscriptEvent[], n: number): number {
  let seen = 0
  for (const [i, e] of events.entries()) {
    if (!isHumanMessage(e)) continue
    seen += 1
    if (seen > n) return i
  }
  return events.length
}

/**
 * Ce que les deux sources savent dire toutes les deux, en dehors d'un tour.
 *
 * Une commande `/` et la frontière de compaction qu'elle provoque : le direct
 * les publie sur-le-champ, le fichier les écrit ensuite. Tout le reste de ce que
 * le disque range entre deux tours — résumé conservé, sortie de la commande,
 * hooks — n'existe que là, et ne se compte donc pas.
 */
function isCommand(e: TranscriptEvent): boolean {
  return e.kind === 'compaction' || e.origin === 'slash-command'
}

/** Les commandes qui suivent le dernier tour humain d'une liste. */
function trailingCommands(events: readonly TranscriptEvent[]): TranscriptEvent[] {
  let start = events.length
  while (start > 0 && !isHumanMessage(events[start - 1]!)) start--
  return events.slice(start).filter(isCommand)
}

/**
 * Ce que le direct a vu après le dernier tour humain et que le fichier n'a pas
 * encore.
 *
 * Une commande n'ouvre pas de tour humain — ni ici, ni dans le parseur. La
 * couture n'a donc aucun repère pour la poser, et sans ce complément un
 * `/compact` disparaissait de l'écran à la seconde où il partait, avec la
 * frontière de compaction qu'il provoque, pour ne revenir qu'à la relecture du
 * fichier — trois minutes plus tard, quand elle avait lieu.
 *
 * Les deux listes s'ancrent sur le même événement, le dernier tour humain, ce
 * qui rend leurs comptes comparables ; le direct ne complète que ce qui manque,
 * et ne complète plus rien dès que le disque a rattrapé.
 */
function pendingCommands(disk: readonly TranscriptEvent[], live: readonly TranscriptEvent[]): TranscriptEvent[] {
  const ecrites = trailingCommands(disk)
  // Une compaction se reconnaît, une commande se compte. Les deux sources
  // donnent le même `uuid` à une frontière de compaction — c'est ce que
  // `diskCaughtUp` emploie déjà — alors qu'une commande `/` n'a d'identité
  // commune ni par sa clé ni par son horloge.
  const posees = new Set(ecrites.filter((e) => e.kind === 'compaction').map((e) => e.uuid))
  const comptees = ecrites.filter((e) => e.kind !== 'compaction').length

  // Le complément se faisait par la seule longueur, et la longueur mélangeait
  // les deux familles. Le fichier s'écrit dans un ordre qui n'est pas celui du
  // direct : la frontière y précède la ligne `/compact`. On surprenait donc le
  // disque à mi-chemin — une commande de moins que le direct — et le décalage
  // laissait passer la frontière du direct par-dessus celle du fichier. Le fil
  // affichait alors deux compactions là où la session n'en avait vécu qu'une.
  let vues = 0
  return trailingCommands(live).filter((e) => {
    if (e.kind === 'compaction') return !posees.has(e.uuid)
    vues += 1
    return vues > comptees
  })
}

/**
 * Le fil montré : le fichier jusqu'à la couture, puis le direct.
 *
 * `covered` est le nombre de tours humains que le fichier portait à la dernière
 * relecture faite au repos — pas ce qu'il porte à l'instant : voir `seamTurns`
 * dans `AtelierPage`.
 *
 * On coupe **les deux** côtés au même point, et pas seulement le direct : le
 * fichier est relu pendant l'action, il porte donc déjà une partie de ce qui se
 * joue. Ne couper que le direct ferait apparaître l'action deux fois — sa moitié
 * écrite, puis son intégralité.
 */
export function stitch(disk: readonly TranscriptEvent[], live: readonly TranscriptEvent[], covered: number): TranscriptEvent[] {
  if (!disk.length || !covered) return [...live]

  const tail = live.slice(afterTurn(live, covered))
  if (tail.length) return [...disk.slice(0, afterTurn(disk, covered)), ...tail]

  return [...disk, ...pendingCommands(disk, live)]
}

/**
 * Le disque a-t-il rattrapé le direct ? Sert à savoir s'il faut le redemander.
 *
 * Les tours ne suffisent pas à le dire. Une compaction n'en ajoute aucun : les
 * deux comptes s'égalisaient donc avant que le harnais n'ait fini d'écrire la
 * frontière, la relecture s'arrêtait là, et le fil restait sur un fichier
 * d'avant la compaction jusqu'au tour suivant — ou jusqu'à ce qu'on recharge la
 * page. Le direct et le fichier donnent le même `uuid` à une compaction, ce qui
 * en fait la jointure exacte qui manquait.
 */
export function diskCaughtUp(disk: readonly TranscriptEvent[], live: readonly TranscriptEvent[]): boolean {
  const turns = humanTurns(live)
  if (turns === 0 || humanTurns(disk) < turns) return false

  const written = new Set(disk.filter((e) => e.kind === 'compaction').map((e) => e.uuid))
  return live.every((e) => e.kind !== 'compaction' || written.has(e.uuid))
}
