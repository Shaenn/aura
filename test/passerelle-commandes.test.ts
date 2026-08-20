// La table des commandes et le routage doivent dire la même chose.
//
// C'est le seul point de ce chantier où trois listes devaient s'accorder à la
// main : le `switch` de `routage.ts`, l'aide, et ce que Telegram propose sous le
// `/`. Les deux dernières viennent maintenant de la table ; ce test tient la
// première. Sans lui, la table redeviendrait une quatrième liste à entretenir.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aide, COMMANDES, pourTelegram } from '../server/passerelle/commandes.ts';
import { parseIntention } from '../server/passerelle/routage.ts';
import { SUPPORTED_LOCALES, withLocale } from '../server/i18n/index.ts';

/**
 * Reconnues, mais volontairement hors de la table.
 *
 * `/help` double `/aide`, et Telegram propose `/start` de lui-même à qui ouvre
 * la conversation. Les annoncer ferait une liste qui se répète.
 */
const ALIAS = ['/start', '/help'];

describe('COMMANDES', () => {
  it('ne déclare que des commandes que le routage reconnaît', () => {
    for (const c of COMMANDES) {
      const intention = parseIntention(`/${c.nom}`);
      expect(intention.kind, `/${c.nom}`).not.toBe('ignorer');
    }
  });

  it('déclare toutes celles que le routage reconnaît, alias exceptés', () => {
    // La lecture inverse, et c'est elle qui attrape le vrai oubli : une commande
    // ajoutée au `switch` et jamais annoncée reste invisible sous le `/`.
    const source = readFileSync(
      new URL('../server/passerelle/routage.ts', import.meta.url),
      'utf8',
    );
    const reconnues = [...source.matchAll(/case '(\/[a-z]+)':/g)].map((m) => m[1] ?? '');
    const declarees = new Set(COMMANDES.map((c) => `/${c.nom}`));
    for (const mot of reconnues) {
      if (ALIAS.includes(mot)) continue;
      expect(declarees.has(mot), `${mot} est routée mais pas déclarée`).toBe(true);
    }
  });

  it('respecte ce que Telegram accepte comme nom', () => {
    // Minuscules, chiffres et soulignés, 32 caractères au plus — et jamais la
    // barre oblique, que `setMyCommands` refuse.
    for (const { command, description } of pourTelegram()) {
      expect(command, command).toMatch(/^[a-z0-9_]{1,32}$/);
      expect(description.length, command).toBeGreaterThan(0);
      expect(description.length, command).toBeLessThanOrEqual(256);
    }
  });

  it('a une description dans chaque langue', () => {
    for (const langue of SUPPORTED_LOCALES) {
      for (const { command, description } of withLocale(langue, pourTelegram)) {
        // `t` rend le chemin quand la clé manque : c'est ce qu'on refuse ici.
        expect(description, `${langue}/${command}`).not.toContain('passerelle.commandes');
      }
    }
  });
});

describe('aide', () => {
  it('nomme chaque commande de la table, dans chaque langue', () => {
    for (const langue of SUPPORTED_LOCALES) {
      const texte = withLocale(langue, aide);
      for (const c of COMMANDES) expect(texte, `${langue}//${c.nom}`).toContain(`/${c.nom}`);
      expect(texte).not.toContain('passerelle.aide');
    }
  });

  it('montre l’argument des commandes qui en prennent un', () => {
    const texte = withLocale('fr', aide);
    expect(texte).toContain('/voir <n>');
    expect(texte).toContain('/sessions —');
  });
});
