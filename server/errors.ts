// Ce qu'une erreur a le droit de dire au client.
//
// Deux familles se ressemblent sur le fil et n'ont rien de commun.
//
// Celles qu'AURA écrit — « Je ne lis pas ce chemin », « Le fichier a changé sur
// le disque depuis la prévisualisation » — sont des messages, rédigés pour être
// lus, et traduits. Elles doivent passer telles quelles : les taire priverait
// l'utilisateur de la seule chose qui lui dise quoi faire.
//
// Celles que Node lève portent le chemin absolu du fichier en cause. Renvoyées
// telles quelles, elles font servir par l'application ce que le dépôt s'applique
// à ne pas écrire :
//
//     GET /api/claude/list?path=Nexistepas
//     {"message":"ENOENT: no such file or directory, scandir
//      'C:\\Users\\jean.dupont\\.claude\\Nexistepas'"}
//
// Le nom du compte, l'arborescence du poste. Elles restent donc au serveur, dans
// le journal, et le client reçoit un constat.

import { PickerUnavailable } from './agent/folder.ts'
import { ConflictError } from './claude/fs.ts'
import { PathError } from './claude/paths.ts'
import { t } from './i18n/index.ts'
import { McpConflictError } from './mcp.ts'
import { ProjectError } from './projects.ts'

/**
 * Les erreurs dont le message est rédigé pour l'utilisateur.
 *
 * Une liste explicite, et non un `instanceof Error` : toute erreur est une
 * `Error`, y compris celles qui portent un chemin. Une classe qui manque ici se
 * traduit par un message plus vague, jamais par une fuite — c'est le sens dans
 * lequel on veut se tromper.
 */
const SPEAKABLE = [PathError, ConflictError, McpConflictError, ProjectError, PickerUnavailable] as const

/** Le message à servir : celui d'AURA, ou un constat qui ne dit rien du disque. */
export function publicMessage(e: unknown): string {
  if (SPEAKABLE.some((cls) => e instanceof cls)) return (e as Error).message
  return t('errors.unexpected')
}
