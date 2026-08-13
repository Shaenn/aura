// Quels appels d'outils sont partis et ne sont pas revenus.
//
// Un `tool_use` sans résultat a deux sens opposés : il est en train de
// s'exécuter, ou il ne rendra jamais rien — tour interrompu, session coupée. Le
// rejeu ne voit que le second cas, puisqu'il lit un fichier clos ; le direct ne
// voit surtout que le premier. La carte, elle, les affichait pareil : pastille
// grise et « sans résultat », y compris sur un `Bash` en pleine compilation.
//
// La liste ne se déduit d'aucun événement : c'est le suiveur d'activité du BFF
// qui la tient. On l'injecte plutôt que de la faire descendre en prop, parce que
// `ToolCall` est monté quatre étages sous la page. Absente — c'est le cas du
// rejeu — la carte retrouve exactement son comportement d'avant.

import type { InjectionKey, Ref } from 'vue';

export const RUNNING_TOOLS: InjectionKey<Ref<Set<string>>> = Symbol('running-tools');
