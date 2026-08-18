// La garde de la Passerelle, et ce qu'elle comprend.
//
// Ces cas ne touchent ni le réseau ni le registre : tout ce qui décide vit dans
// `passerelle/routage.ts`, précisément pour être vérifiable sans bot, sans jeton
// et sans session. C'est le fichier qui sépare une machine pilotable d'une
// machine ouverte à tous, et il ne doit pas dépendre d'un service tiers pour
// être testé.

import { describe, expect, it } from 'vitest';
import { autorise, lireChats, parseIntention } from '../server/passerelle/routage.ts';

describe('lireChats', () => {
  it('lit une liste séparée par des virgules', () => {
    expect([...lireChats('123,456')]).toEqual([123, 456]);
  });

  it('tolère les espaces autour des identifiants', () => {
    expect([...lireChats(' 123 , 456 ')]).toEqual([123, 456]);
  });

  it('garde un identifiant négatif : c’est la forme d’un groupe', () => {
    expect([...lireChats('-1001234567890')]).toEqual([-1001234567890]);
  });

  it('écarte ce qui n’est pas un entier plutôt que d’en faire un NaN', () => {
    // Un identifiant mal recopié ne doit pas devenir une autorisation.
    expect([...lireChats('123,abc,0x10,12.5,')]).toEqual([123]);
  });

  it('rend un ensemble vide quand rien n’est configuré', () => {
    expect(lireChats(undefined).size).toBe(0);
    expect(lireChats('').size).toBe(0);
  });
});

describe('autorise', () => {
  it('laisse passer une conversation listée', () => {
    expect(autorise(lireChats('123'), 123)).toBe(true);
  });

  it('refuse une conversation absente de la liste', () => {
    expect(autorise(lireChats('123'), 999)).toBe(false);
  });

  it('n’autorise personne quand la liste est vide', () => {
    // L'inverse de la convention habituelle où « vide » veut dire « tout » :
    // ici, l'omission ne peut pas ouvrir la machine au premier venu.
    expect(autorise(lireChats(''), 123)).toBe(false);
  });
});

describe('parseIntention', () => {
  it('traite un message ordinaire comme un tour à envoyer', () => {
    expect(parseIntention('relis le diff')).toEqual({ kind: 'parler', texte: 'relis le diff' });
  });

  it('ignore un message vide sans rien répondre', () => {
    expect(parseIntention('   ')).toEqual({ kind: 'ignorer', raison: 'vide' });
  });

  it('ouvre une session sur le dossier donné', () => {
    expect(parseIntention('/atelier C:\\devl\\tos')).toEqual({
      kind: 'ouvrir',
      cwd: 'C:\\devl\\tos',
    });
  });

  it('renvoie à l’aide plutôt que d’ouvrir sans dossier', () => {
    expect(parseIntention('/atelier')).toEqual({ kind: 'aide' });
    expect(parseIntention('/atelier   ')).toEqual({ kind: 'aide' });
  });

  it('reconnaît une commande suffixée du nom du bot', () => {
    // Telegram écrit `/fin@monbot` dans un groupe ; sans cela la commande
    // passerait pour un tour à envoyer à l'agent.
    expect(parseIntention('/fin@aura_bot')).toEqual({ kind: 'fin' });
  });

  it('signale une commande inconnue au lieu de l’envoyer à l’agent', () => {
    expect(parseIntention('/nimporte')).toEqual({
      kind: 'ignorer',
      raison: 'commande-inconnue',
      commande: '/nimporte',
    });
  });

  it('accepte les trois portes d’entrée de l’aide', () => {
    for (const mot of ['/aide', '/start', '/help']) {
      expect(parseIntention(mot)).toEqual({ kind: 'aide' });
    }
  });

  it('ne confond pas un chemin en début de message avec une commande', () => {
    // Un message qui commence par une barre oblique n'est une commande que si
    // le mot qui suit en est une ; sinon on répondrait « inconnue » à un texte.
    expect(parseIntention('/usr/bin est-il dans le PATH ?')).toEqual({
      kind: 'ignorer',
      raison: 'commande-inconnue',
      commande: '/usr/bin',
    });
  });
});
