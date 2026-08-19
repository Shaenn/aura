// Le formulaire d'une question, sans réseau ni session.
//
// C'est la partie qui décide : ce qu'un écran montre, ce qu'une pression change,
// et la forme des réponses remises au modèle. `index.ts` ne fait qu'émettre ce
// que ces fonctions rendent — le tester ici, c'est le tester en entier.

import { describe, expect, it } from 'vitest';
import type { AskQuestion } from '../shared/agent.ts';
import type { InlineKeyboardMarkup } from 'node-telegram-bot-api';
import {
  clavier,
  courante,
  ecran,
  formulaire,
  presse,
  repondLibre,
  reponses,
} from '../server/passerelle/questions.ts';

/** Un identifiant de la forme que `randomUUID` produit — 36 caractères. */
const ID = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

const simple: AskQuestion = {
  question: 'Quel dossier ouvrir ?',
  header: 'Dossier',
  options: [
    { label: 'tos', description: 'Le dépôt courant' },
    { label: 'cronos', description: 'Le socle visuel' },
  ],
};

const multiple: AskQuestion = {
  question: 'Quelles surfaces couvrir ?',
  header: 'Surfaces',
  multiSelect: true,
  options: [
    { label: 'Atelier', description: 'La session pilotée' },
    { label: 'Rejeu', description: 'La timeline' },
    { label: 'Manuel', description: "L'aide" },
  ],
};

function rangs(clavier: InlineKeyboardMarkup): string[] {
  return clavier.inline_keyboard
    .flat()
    .map((b) => ('callback_data' in b ? (b.callback_data ?? '') : ''));
}

function libelles(clavier: InlineKeyboardMarkup): string[] {
  return clavier.inline_keyboard.flat().map((b) => b.text);
}

describe('un choix simple', () => {
  it('avance d’une étape, et conclut à la dernière', () => {
    const f = formulaire(ID, [simple, { ...simple, question: 'Et ensuite ?' }]);
    expect(presse(f, '0')).toBe('suivant');
    expect(f.etape).toBe(1);
    expect(presse(f, '1')).toBe('fini');
    expect(reponses(f)).toEqual({
      'Quel dossier ouvrir ?': 'tos',
      'Et ensuite ?': 'cronos',
    });
  });

  it('garde le message de l’étape quittée, pour qu’on puisse la désarmer', () => {
    // Sans cela, les boutons d'une question déjà répondue restent pressables et
    // s'appliquent à la suivante — ils ne portent qu'un rang.
    const f = formulaire(ID, [simple, multiple]);
    f.messageId = 42;
    presse(f, '0');
    expect(f.messageId).toBe(42);
  });

  it('ignore un rang qui ne désigne aucune option', () => {
    const f = formulaire(ID, [simple]);
    expect(presse(f, '9')).toBe('rien');
    expect(presse(f, 'ok')).toBe('rien');
    expect(f.etape).toBe(0);
  });

  it('n’offre pas de validation : le clic suffit', () => {
    const f = formulaire(ID, [simple]);
    expect(rangs(clavier(f))).toEqual([`q:${ID}:0`, `q:${ID}:1`]);
  });
});

describe('un choix multiple', () => {
  it('coche sans avancer, et ne conclut que sur validation', () => {
    const f = formulaire(ID, [multiple]);
    expect(presse(f, '0')).toBe('coche');
    expect(presse(f, '2')).toBe('coche');
    expect(f.etape).toBe(0);
    expect(presse(f, 'ok')).toBe('fini');
    // La forme du harnais : les choix joints par `, `, celle que le rejeu relit.
    expect(reponses(f)).toEqual({ 'Quelles surfaces couvrir ?': 'Atelier, Manuel' });
  });

  it('décoche ce qui était coché', () => {
    const f = formulaire(ID, [multiple]);
    presse(f, '1');
    presse(f, '1');
    expect(f.choix[0]).toEqual([]);
  });

  it('refuse de valider une réponse vide', () => {
    const f = formulaire(ID, [multiple]);
    expect(presse(f, 'ok')).toBe('rien');
    expect(f.etape).toBe(0);
  });

  it('montre l’état dans le libellé, faute d’autre endroit où le mettre', () => {
    const f = formulaire(ID, [multiple]);
    // La dernière rangée porte la validation, pas une option.
    const cases = libelles(clavier(f)).slice(0, multiple.options.length);
    expect(cases.every((l) => l.startsWith('☐'))).toBe(true);
    presse(f, '0');
    expect(libelles(clavier(f))[0]).toBe('☑ Atelier');
    expect(rangs(clavier(f))).toContain(`q:${ID}:ok`);
  });
});

describe('la réponse écrite', () => {
  it('remplace les cases cochées et avance', () => {
    const f = formulaire(ID, [multiple]);
    presse(f, '0');
    expect(repondLibre(f, 'aucune des trois')).toBe('fini');
    expect(reponses(f)).toEqual({ 'Quelles surfaces couvrir ?': 'aucune des trois' });
  });

  it('ne fait rien quand il n’y a plus de question', () => {
    const f = formulaire(ID, [simple]);
    presse(f, '0');
    expect(courante(f)).toBeUndefined();
    expect(repondLibre(f, 'trop tard')).toBe('rien');
  });
});

describe('l’écran', () => {
  it('tient dans les 64 octets d’un callback_data', () => {
    const f = formulaire(ID, [multiple]);
    for (const donnee of rangs(clavier(f))) {
      expect(Buffer.byteLength(donnee, 'utf8'), donnee).toBeLessThanOrEqual(64);
    }
  });

  it('numérote les options, pour relier le bouton rogné à son texte', () => {
    const { brut } = ecran(formulaire(ID, [simple]));
    expect(brut).toContain('1. tos — Le dépôt courant');
    expect(brut).toContain('2. cronos — Le socle visuel');
  });

  it('ne compte les étapes que s’il y en a plusieurs', () => {
    expect(ecran(formulaire(ID, [simple])).brut).not.toContain('question 1');
    expect(ecran(formulaire(ID, [simple, multiple])).brut).toContain('question 1 sur 2');
  });

  it('rend une maquette dans son propre bloc, et la borne', () => {
    const maquette = 'x'.repeat(5_000);
    const f = formulaire(ID, [
      { ...simple, options: [{ label: 'a', description: '', preview: maquette }] },
    ]);
    const pre = ecran(f).blocs.filter((b) => b.type === 'pre');
    expect(pre).toHaveLength(1);
    // Quatre maquettes démesurées feraient échouer le message entier : mieux
    // vaut couper l'une que perdre tout le formatage.
    const texte = pre[0]?.text;
    expect(typeof texte === 'string' && texte.length < maquette.length).toBe(true);
  });

  it('dit qu’on peut répondre autre chose que ce qui est offert', () => {
    // Sans cette ligne, la réponse libre existe sans que personne ne la trouve.
    expect(ecran(formulaire(ID, [simple])).brut).toContain('écrivez votre réponse');
  });
});
