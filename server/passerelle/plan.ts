// Le plan qu'une session soumet avant de passer à l'acte.

import type { PermissionRequest } from '../../shared/agent.ts'

/**
 * Le texte du plan qu'une demande de permission soumet, s'il y en a un.
 *
 * `ExitPlanMode` est le seul appel dont l'argument **est** la décision : partout
 * ailleurs le nom de l'outil et son chemin suffisent à juger, ici il n'y a rien
 * à juger sans le texte. Le CLI le passe en clair (`input.plan`, du markdown) en
 * même temps que `input.planFilePath` — c'est le premier qu'on lit, le fichier
 * n'étant pas lisible de loin.
 *
 * Un plan vide rend la chaîne vide : mieux vaut retomber sur le bandeau
 * ordinaire que d'envoyer un message riche qui ne porte que son en-tête.
 */
export function planPropose(demande: PermissionRequest): string {
  if (demande.toolName !== 'ExitPlanMode') return ''
  const plan = demande.input.plan
  return typeof plan === 'string' ? plan.trim() : ''
}
