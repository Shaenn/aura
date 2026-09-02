// Ce qui donne l'autocomplétion des clés de traduction dans l'éditeur.
//
// `DefineLocaleMessage` est l'interface que vue-i18n laisse vide exprès : tant
// que personne ne l'étend, `t()` accepte n'importe quelle chaîne, et l'éditeur
// n'a rien à proposer. En l'étendant du catalogue français — la source de
// vérité, celle dont `MessageSchema` est déjà dérivé — les clés deviennent
// connues de TypeScript, dans les `.ts` comme dans les templates.
//
// Le gain n'est pas que le confort de frappe : une clé mal orthographiée
// cessait de se voir avant l'écran, elle casse maintenant `vue-tsc`.
//
// Un `.d.ts` plutôt qu'une augmentation dans `index.ts` : ce fichier ne décrit
// que des types, rien n'a besoin de l'importer, et il se lit sans traverser la
// construction de l'instance.

import type { MessageSchema } from './fr'

declare module 'vue-i18n' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Une augmentation de module n'a rien à déclarer : tout le sens est dans le `extends`.
  export interface DefineLocaleMessage extends MessageSchema {}
}
