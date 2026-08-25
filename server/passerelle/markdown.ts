// Couper un document en pages, sans casser ce qui est à cheval.
//
// Ce fichier ne rend rien : le rendu est celui de `riche.ts`, qui traduit le
// Markdown en blocs. Ici on ne décide que d'une chose — **où couper** un
// document trop long pour un seul message.
//
// Aucun réseau ici, et c'est voulu : tout ce fichier se vérifie par un test.

/**
 * Le document en pages, coupées sur des frontières de lignes.
 *
 * Couper au caractère près trancherait au milieu d'un mot, et surtout au milieu
 * d'un bloc de code — dont la clôture se retrouverait sur la page suivante, où
 * elle *ouvrirait* un bloc au lieu de le fermer. D'où le suivi de l'état : une
 * page qui s'arrête dans un bloc le referme, et la suivante le rouvre.
 *
 * `max` est demandé plutôt que défini ici : la borne appartient à ce qui va
 * porter la page — aujourd'hui le message riche — et non au découpage.
 */
export function paginer(markdown: string, max: number): string[] {
  const lignes = markdown.replace(/\r\n?/g, '\n').split('\n')
  const pages: string[] = []
  let courante: string[] = []
  let taille = 0
  let dansCode = false
  let langue = ''

  function cloture(): void {
    if (!courante.length) return
    if (dansCode) courante.push('```')
    pages.push(courante.join('\n'))
    courante = dansCode ? ['```' + langue] : []
    taille = courante.length ? langue.length + 4 : 0
  }

  for (const ligne of lignes) {
    // Une ligne à elle seule plus longue qu'une page : on la coupe, faute de
    // mieux. Rare, et toujours préférable à une page qui ne part jamais.
    for (const part of ligne.length > max ? decoupe(ligne, max) : [ligne]) {
      const ferme = dansCode && /^\s*```/.test(part)
      // La fermeture d'un bloc est rattachée à la page qui l'a ouvert, même si
      // elle déborde : la renvoyer à la suivante y ouvrirait un bloc vide, et
      // la page d'avant en refermerait un qu'elle vient déjà de refermer.
      if (!ferme && taille + part.length + 1 > max) cloture()
      courante.push(part)
      taille += part.length + 1

      if (/^\s*```/.test(part)) {
        if (dansCode) {
          dansCode = false
          langue = ''
        } else {
          dansCode = true
          langue = part.replace(/^\s*```/, '').trim()
        }
      }
    }
  }

  if (courante.length) pages.push(courante.join('\n'))
  return pages.length ? pages : ['']
}

/** Coupe une ligne trop longue en morceaux d'au plus `max`. */
function decoupe(ligne: string, max: number): string[] {
  const out: string[] = []
  for (let i = 0; i < ligne.length; i += max) out.push(ligne.slice(i, i + max))
  return out
}
