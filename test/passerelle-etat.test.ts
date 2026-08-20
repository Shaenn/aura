// L'état de la fenêtre, sans session ni bot.
//
// C'est la partie qui décide : ce qu'un relevé vaut rapporté à la limite du
// modèle, ce que `/etat` écrit, et quand la fenêtre mérite qu'on en parle sans
// qu'on ait demandé. `index.ts` ne fait qu'émettre ce que ces fonctions rendent.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { alerte, lignes, part, SEUIL_ALERTE, type Fenetre } from '../server/passerelle/etat.ts';
import { contextLimitFor } from '../server/context.ts';

const PETITE = 200_000;

function fenetre(tokens: number, limite = PETITE): Fenetre {
  return { tokens, limite };
}

describe('la part occupée', () => {
  it('rend zéro tant qu’aucun tour n’a répondu', () => {
    expect(part(fenetre(0))).toBe(0);
  });

  it('ne divise jamais par zéro', () => {
    // Une limite nulle ne devrait pas arriver — mais un `Infinity` affiché en
    // pourcentage serait un défaut bien plus visible que la cause.
    expect(part({ tokens: 1_000, limite: 0 })).toBe(0);
  });

  it('se borne à un', () => {
    // La fenêtre déduite peut être la petite alors que la session tourne sur la
    // grande, le temps qu'une preuve arrive : « 118 % » ferait douter du reste
    // de l'écran là où « 100 % » dit déjà tout.
    expect(part(fenetre(236_000))).toBe(1);
  });

  it('rapporte le relevé à la limite', () => {
    expect(part(fenetre(100_000))).toBeCloseTo(0.5);
  });
});

describe('le seuil', () => {
  it('vaut le garde-fou du signal `contextFill`', () => {
    // Recopié et non importé — `SPECS` est privé dans `thresholds.ts`, et les
    // deux mesures ne portent pas sur la même chose. Ce test est ce qui empêche
    // les deux surfaces d'annoncer deux remplissages différents.
    const source = readFileSync(
      new URL('../server/diagnostics/thresholds.ts', import.meta.url),
      'utf8',
    );
    const bloc = /contextFill:\s*\{[^}]*\}/s.exec(source)?.[0] ?? '';
    const garde = /guard:\s*([\d.]+)/.exec(bloc)?.[1];
    expect(garde, 'le garde-fou de contextFill est introuvable').toBeDefined();
    expect(Number(garde)).toBe(SEUIL_ALERTE);
  });

  it('alerte une fois, puis se tait', () => {
    expect(alerte(false, SEUIL_ALERTE)).toBe(true);
    expect(alerte(true, SEUIL_ALERTE)).toBe(false);
    expect(alerte(true, 0.99)).toBe(false);
  });

  it('ne dit rien sous le seuil', () => {
    expect(alerte(false, SEUIL_ALERTE - 0.01)).toBe(false);
    expect(alerte(false, 0)).toBe(false);
  });
});

describe('ce que /etat écrit', () => {
  it('donne le dénominateur, pas seulement le pourcentage', () => {
    // Un pourcentage seul ne se vérifie pas : la limite dépend du modèle, et
    // c'est justement ce qu'on ne peut pas deviner de loin.
    const texte = lignes(fenetre(100_000), 'C:\\devl\\tos', 'Opus 5', 'default').join('\n');
    expect(texte).toContain('50 %');
    expect(texte).toContain('200');
    expect(texte).toContain('C:\\devl\\tos');
    expect(texte).toContain('Opus 5');
    expect(texte).toContain('default');
  });

  it('ne montre aucun chiffre quand il n’y a pas de relevé', () => {
    // Un zéro se lirait comme une mesure, alors que c'est l'absence de mesure.
    const texte = lignes(fenetre(0), 'C:\\devl\\tos', 'Opus 5', 'default').join('\n');
    expect(texte).not.toContain('%');
    expect(texte).toContain('C:\\devl\\tos');
  });

  it('abrège les nombres plutôt que de les faire compter', () => {
    // `30 527 / 1 000 000` demande de compter les chiffres des deux côtés pour
    // saisir le rapport ; `31 k / 1 M` le donne. C'est lu sur un téléphone.
    const texte = lignes(fenetre(30_527, 1_000_000), 'x', 'y', 'default').join('\n');
    expect(texte).toContain('31 k');
    expect(texte).toContain('1 M');
    expect(texte).not.toContain('30527');
    expect(texte).not.toContain('1000000');
  });

  it('n’affiche aucune décimale : les limites sont exactes', () => {
    // Un « 1,0 M » laisserait croire à un arrondi qui n'a pas eu lieu.
    const texte = lignes(fenetre(100_000, 200_000), 'x', 'y', 'default').join('\n');
    expect(texte).toContain('200 k');
    expect(texte).not.toMatch(/[.,]0/);
  });
});

describe('la limite du modèle', () => {
  it('déduit la grande fenêtre d’un contexte qui dépasse la petite', () => {
    // Le piège que `contextLimitFor` existe pour éviter : un modèle à fenêtre
    // longue s'enregistre **sans** son suffixe `[1m]`. Seule la preuve compte.
    expect(contextLimitFor(['claude-opus-5'], 0, false)).toBe(200_000);
    expect(contextLimitFor(['claude-opus-5'], 236_000, false)).toBe(1_000_000);
    expect(contextLimitFor(['claude-opus-5'], 0, true)).toBe(1_000_000);
  });

  it('rend un pourcentage cohérent sur la grande fenêtre', () => {
    const limite = contextLimitFor(['claude-opus-5'], 300_000, false);
    expect(Math.round(part(fenetre(500_000, limite)) * 100)).toBe(50);
  });
});

describe('le total d’une fenêtre', () => {
  it('compte le cache, qui occupe la place autant que le reste', () => {
    // La somme que `releveFenetre` fait dans le runner, et la même que
    // `transcript.ts` emploie pour ancrer la page Contexte. Ne compter que
    // `input_tokens` annoncerait quelques milliers de tokens sur une session
    // bien cachée là où la fenêtre en porte cent mille.
    const usage = {
      input_tokens: 1_200,
      cache_read_input_tokens: 98_000,
      cache_creation_input_tokens: 13_200,
      output_tokens: 900,
    };
    const total =
      usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens;
    expect(total).toBe(112_400);
    expect(part(fenetre(total))).toBeCloseTo(0.562);
  });
});
