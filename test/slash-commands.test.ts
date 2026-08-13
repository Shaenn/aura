// Les commandes `/` que l'Atelier propose à la saisie.
//
// Elles arrivent par deux chemins qu'un seul filtre traverse : la réponse à
// `supportedCommands()`, typée, et le message `commands_changed`, qui ne l'est
// pas. C'est ce second chemin qui justifie ces tests — un champ manquant y passe
// sans que rien ne s'en plaigne, et une entrée sans nom insérerait une barre
// oblique seule dans le composeur.

import { describe, expect, it } from 'vitest';
import { toCommands } from '../server/agent/runner.ts';

describe('toCommands', () => {
  it('garde ce que le SDK décrit, alias compris', () => {
    expect(
      toCommands([
        { name: 'usage', description: 'Voir la consommation', argumentHint: '', aliases: ['cost'] },
        { name: 'compact', description: 'Compacter', argumentHint: '<instructions>' },
      ]),
    ).toEqual([
      { name: 'usage', description: 'Voir la consommation', aliases: ['cost'] },
      { name: 'compact', description: 'Compacter', argumentHint: '<instructions>' },
    ]);
  });

  it('écarte ce qui n’a pas de nom : une commande sans nom ne s’insère pas', () => {
    expect(toCommands([{ description: 'orpheline' }, { name: '' }, null, 'compact'])).toEqual([]);
  });

  it('ne transporte ni indice vide ni liste d’alias vide', () => {
    expect(toCommands([{ name: 'context', argumentHint: '', aliases: [] }])).toEqual([
      { name: 'context', description: '' },
    ]);
  });

  it('rend une liste vide sur autre chose qu’un tableau', () => {
    expect(toCommands(undefined)).toEqual([]);
    expect(toCommands({ commands: [] })).toEqual([]);
  });
});
