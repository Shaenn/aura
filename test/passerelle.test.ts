// La garde de la Passerelle, et ce qu'elle comprend.
//
// Ces cas ne touchent ni le réseau ni le registre : tout ce qui décide vit dans
// `passerelle/routage.ts` et `passerelle/projets.ts`, précisément pour être
// vérifiable sans bot, sans jeton et sans session. Ce sont les deux fichiers qui
// séparent une machine pilotable d'une machine ouverte à tous, et ils ne doivent
// pas dépendre d'un service tiers pour être testés.

import { describe, expect, it } from 'vitest'
import { aplatir, arborescence, compte, descendre, resoudreProjet, type Noeud } from '../server/passerelle/projets.ts'
import { autorise, lireChats, parseIntention } from '../server/passerelle/routage.ts'
import { elargi, grille } from '../server/passerelle/telegram.ts'
import type { ProjectResources, ProjectSummary } from '../shared/projects.ts'

describe('lireChats', () => {
  it('lit une liste séparée par des virgules', () => {
    expect([...lireChats('123,456')]).toEqual([123, 456])
  })

  it('tolère les espaces autour des identifiants', () => {
    expect([...lireChats(' 123 , 456 ')]).toEqual([123, 456])
  })

  it('garde un identifiant négatif : c’est la forme d’un groupe', () => {
    expect([...lireChats('-1001234567890')]).toEqual([-1001234567890])
  })

  it('écarte ce qui n’est pas un entier plutôt que d’en faire un NaN', () => {
    // Un identifiant mal recopié ne doit pas devenir une autorisation.
    expect([...lireChats('123,abc,0x10,12.5,')]).toEqual([123])
  })

  it('rend un ensemble vide quand rien n’est configuré', () => {
    expect(lireChats(undefined).size).toBe(0)
    expect(lireChats('').size).toBe(0)
  })
})

describe('autorise', () => {
  it('laisse passer une conversation listée', () => {
    expect(autorise(lireChats('123'), 123)).toBe(true)
  })

  it('refuse une conversation absente de la liste', () => {
    expect(autorise(lireChats('123'), 999)).toBe(false)
  })

  it('n’autorise personne quand la liste est vide', () => {
    // L'inverse de la convention habituelle où « vide » veut dire « tout » :
    // ici, l'omission ne peut pas ouvrir la machine au premier venu.
    expect(autorise(lireChats(''), 123)).toBe(false)
  })
})

describe('parseIntention', () => {
  it('traite un message ordinaire comme un tour à envoyer', () => {
    expect(parseIntention('relis le diff')).toEqual({ kind: 'parler', texte: 'relis le diff' })
  })

  it('ignore un message vide sans rien répondre', () => {
    expect(parseIntention('   ')).toEqual({ kind: 'ignorer', raison: 'vide' })
  })

  it('ouvre une session sur la référence donnée', () => {
    // Un chemin comme un rang : c'est `resoudreProjet` qui tranche ensuite, et
    // lui seul décide si la référence désigne un projet connu.
    expect(parseIntention('/atelier C:\\devl\\tos')).toEqual({
      kind: 'ouvrir',
      ref: 'C:\\devl\\tos',
    })
    expect(parseIntention('/atelier 3')).toEqual({ kind: 'ouvrir', ref: '3' })
  })

  it('garde un argument à espaces d’un seul tenant', () => {
    // Un chemin Windows en porte volontiers. Découper en mots ferait d'un
    // dossier deux arguments dont aucun ne désignerait rien.
    expect(parseIntention('/atelier C:\\Mes Documents\\projet')).toEqual({
      kind: 'ouvrir',
      ref: 'C:\\Mes Documents\\projet',
    })
  })

  it('montre les projets plutôt que d’ouvrir sans référence', () => {
    // Ce sont eux qui portent les numéros que la commande attend : renvoyer à
    // l'aide obligerait à une commande de plus pour la même information.
    expect(parseIntention('/atelier')).toEqual({ kind: 'projets' })
    expect(parseIntention('/atelier   ')).toEqual({ kind: 'projets' })
  })

  it('lit les commandes de consultation', () => {
    expect(parseIntention('/projets')).toEqual({ kind: 'projets' })
    expect(parseIntention('/projet 2')).toEqual({ kind: 'projet', ref: '2' })
    expect(parseIntention('/voir 7')).toEqual({ kind: 'voir', ref: '7' })
  })

  it('distingue l’état de cette session du parc entier', () => {
    // Deux commandes voisines qui ne répondent pas à la même question : `/etat`
    // regarde la session d'ici et sa fenêtre, `/sessions` compte le parc.
    expect(parseIntention('/etat')).toEqual({ kind: 'etat' })
    expect(parseIntention('/compacter')).toEqual({ kind: 'compacter' })
    expect(parseIntention('/sessions')).toEqual({ kind: 'sessions' })
  })

  it('retombe sur les projets quand /projet n’a pas d’argument', () => {
    expect(parseIntention('/projet')).toEqual({ kind: 'projets' })
  })

  it('reconnaît une commande suffixée du nom du bot', () => {
    // Telegram écrit `/fin@monbot` dans un groupe ; sans cela la commande
    // passerait pour un tour à envoyer à l'agent.
    expect(parseIntention('/fin@aura_bot')).toEqual({ kind: 'fin' })
  })

  it('signale une commande inconnue au lieu de l’envoyer à l’agent', () => {
    expect(parseIntention('/nimporte')).toEqual({
      kind: 'ignorer',
      raison: 'commande-inconnue',
      commande: '/nimporte',
    })
  })

  it('accepte les deux noms de l’aide', () => {
    for (const mot of ['/aide', '/help']) {
      expect(parseIntention(mot)).toEqual({ kind: 'aide' })
    }
  })

  it('distingue l’accueil de l’aide', () => {
    // `/start` est le geste que Telegram propose de lui-même à qui ouvre la
    // conversation : il arrive avant qu'on sache quoi demander. Une liste de
    // commandes ne répond pas à ça, d'où deux intentions et non un alias.
    expect(parseIntention('/start')).toEqual({ kind: 'accueil' })
  })

  it('ne confond pas un chemin en début de message avec une commande', () => {
    // Un message qui commence par une barre oblique n'est une commande que si
    // le mot qui suit en est une ; sinon on répondrait « inconnue » à un texte.
    expect(parseIntention('/usr/bin est-il dans le PATH ?')).toEqual({
      kind: 'ignorer',
      raison: 'commande-inconnue',
      commande: '/usr/bin',
    })
  })
})

describe('resoudreProjet', () => {
  const projets = [
    { slug: 'C--devl-tos', path: 'C:\\Users\\jean\\devl\\tos', name: 'tos' },
    { slug: 'C--devl-autre', path: 'C:\\Users\\jean\\devl\\autre', name: 'autre' },
  ] as ProjectSummary[]

  it('désigne un projet par son rang, à partir de 1', () => {
    expect(resoudreProjet(projets, '1')?.name).toBe('tos')
    expect(resoudreProjet(projets, '2')?.name).toBe('autre')
  })

  it('ne rend rien pour un rang hors liste', () => {
    expect(resoudreProjet(projets, '0')).toBeUndefined()
    expect(resoudreProjet(projets, '3')).toBeUndefined()
  })

  it('désigne un projet par son chemin, quel que soit le séparateur', () => {
    // Un chemin recopié depuis un écran arrive volontiers en barres obliques ;
    // le disque, lui, le déclare en antislashs.
    expect(resoudreProjet(projets, 'C:/Users/jean/devl/tos')?.name).toBe('tos')
    expect(resoudreProjet(projets, 'C:\\Users\\JEAN\\devl\\TOS')?.name).toBe('tos')
    expect(resoudreProjet(projets, 'C:\\Users\\jean\\devl\\tos\\')?.name).toBe('tos')
  })

  it('désigne un projet par son nom ou son slug', () => {
    expect(resoudreProjet(projets, 'autre')?.slug).toBe('C--devl-autre')
    expect(resoudreProjet(projets, 'C--devl-tos')?.name).toBe('tos')
  })

  it('ne rend rien pour un chemin que Claude Code ne connaît pas', () => {
    // La garde de `/atelier` à distance. Un dossier quelconque de la machine ne
    // tombe sur rien : il n'y a pas de règle à contourner, seulement une liste
    // dans laquelle il faut déjà figurer.
    expect(resoudreProjet(projets, 'C:\\Windows\\System32')).toBeUndefined()
    expect(resoudreProjet(projets, 'C:\\')).toBeUndefined()
    expect(resoudreProjet(projets, '..')).toBeUndefined()
    expect(resoudreProjet(projets, '')).toBeUndefined()
  })

  it('ne trouve rien dans une liste vide', () => {
    expect(resoudreProjet([], '1')).toBeUndefined()
    expect(resoudreProjet([], 'C:\\Users\\jean\\devl\\tos')).toBeUndefined()
  })
})

describe('aplatir', () => {
  function noeud(rel: string) {
    return {
      rel,
      name: rel,
      title: '',
      description: '',
      size: 0,
      mtime: 0,
    }
  }

  it('garde les trois origines distinctes, car elles ne se lisent pas pareil', () => {
    // C'est `source` qui décide du lecteur — donc du bac à sable. Le cas qui a
    // motivé ce test : un document de dossier inclus rangé en `arbre` était
    // refusé, parce que `sourceFileKind` ne nomme ni `SPEC-014_x.md` ni aucun
    // fichier de sous-dossier. Il lui faut son propre lecteur.
    const entrees = aplatir({
      resources: [{ ...noeud('agents/revue.md'), category: 'agents' }],
      memories: [{ ...noeud('CLAUDE.md'), category: 'memory' }],
      repoDocs: [{ ...noeud('README.md'), category: 'repo' }],
      folders: [
        {
          rel: 'workflow',
          files: [{ ...noeud('workflow/specs/SPEC-014_notes-projet.md'), category: 'repo' }],
        },
      ],
    } as unknown as ProjectResources)

    expect(entrees.map((e) => [e.label, e.source])).toEqual([
      ['.claude/agents/revue.md', 'claude'],
      ['CLAUDE.md', 'arbre'],
      ['README.md', 'arbre'],
      ['workflow/specs/SPEC-014_notes-projet.md', 'inclus'],
    ])
    // Le `rel` reste celui que le lecteur attend, préfixe d'affichage exclu.
    expect(entrees[0]?.rel).toBe('agents/revue.md')
  })

  it('rend une liste vide pour un projet sans rien à lire', () => {
    const vide = { resources: [], memories: [], repoDocs: [], folders: [] }
    expect(aplatir(vide as unknown as ProjectResources)).toEqual([])
  })
})

describe('arborescence', () => {
  function e(label: string) {
    return { rel: label, label, source: 'claude' as const }
  }
  /** Ce que la navigation affiche d'un nœud : son nom, et ce qu'il contient. */
  function vue(n: Noeud) {
    return n.enfants.map((x) => `${x.nom}${x.fichier ? '' : `/ ${compte(x)}`}`)
  }

  it('reconstruit les dossiers depuis les chemins', () => {
    const racine = arborescence([e('a/x.md'), e('a/y.md'), e('b.md')])
    expect(vue(racine)).toEqual(['a/ 2', 'b.md'])
    expect(vue(descendre(racine, ['a']) as Noeud)).toEqual(['x.md', 'y.md'])
  })

  it('garde le rang de la liste plate sur les feuilles', () => {
    // Le rang voyage dans les boutons, et c'est le même que `/voir <n>`
    // attend : les deux chemins doivent désigner le même fichier.
    const racine = arborescence([e('a/x.md'), e('b.md'), e('a/y.md')])
    const a = descendre(racine, ['a']) as Noeud
    expect(a.enfants.map((n) => n.fichier?.rang)).toEqual([1, 3])
    expect(racine.enfants.find((n) => n.nom === 'b.md')?.fichier?.rang).toBe(2)
  })

  it('fond les dossiers qui n’ont qu’un dossier pour enfant', () => {
    // `rules/back/application/` compterait sinon trois clics pour n'offrir
    // aucun choix.
    const racine = arborescence([e('rules/back/application/x.md')])
    expect(vue(racine)).toEqual(['rules/back/application/ 1'])
    expect(vue(descendre(racine, ['rules/back/application']) as Noeud)).toEqual(['x.md'])
  })

  it('ne fond pas un dossier dont l’unique enfant est un fichier', () => {
    // Il y a bien un choix à montrer : celui d'ouvrir ce fichier.
    expect(vue(arborescence([e('a/x.md')]))).toEqual(['a/ 1'])
  })

  it('range les dossiers avant les fichiers, puis par ordre alphabétique', () => {
    const racine = arborescence([e('z.md'), e('b/x.md'), e('a.md'), e('a/y.md')])
    expect(vue(racine)).toEqual(['a/ 1', 'b/ 1', 'a.md', 'z.md'])
  })

  it('ne confond pas un dossier et un fichier de même nom', () => {
    const racine = arborescence([e('a'), e('a/x.md')])
    expect(vue(racine)).toEqual(['a/ 1', 'a'])
  })

  it('compte les fichiers à toute profondeur', () => {
    const racine = arborescence([e('a/b/x.md'), e('a/c/y.md'), e('a/z.md')])
    expect(compte(racine)).toBe(3)
    expect(compte(descendre(racine, ['a']) as Noeud)).toBe(3)
  })

  it('ne descend nulle part par un chemin qui n’existe pas', () => {
    const racine = arborescence([e('a/x.md')])
    expect(descendre(racine, ['inconnu'])).toBeUndefined()
    // Un fichier n'est pas un dossier : on ne descend pas dedans.
    expect(descendre(racine, ['a', 'x.md'])).toBeUndefined()
  })

  it('rend une racine vide pour une liste vide', () => {
    const racine = arborescence([])
    expect(racine.enfants).toEqual([])
    expect(compte(racine)).toBe(0)
  })
})

describe('elargi', () => {
  const BLANC = String.fromCharCode(0x2800)

  it('complète un en-tête court pour que le clavier prenne la largeur', () => {
    // Mesuré : la bulle dimensionne le clavier, et un en-tête court donne des
    // boutons de soixante pixels. Retirer ce remplissage rétrécirait les
    // boutons sans que rien d'autre ne change à l'écran.
    const large = elargi('.claude — 59 fichiers.')
    // Le texte visible reste intact et **sur sa ligne** : c'est tout l'intérêt
    // de reléguer le remplissage à la ligne suivante. Collé au texte, il le
    // poussait au-delà du bord d'un écran de téléphone et coupait la phrase.
    expect(large.split('\n')[0]).toBe('.claude — 59 fichiers.')
    expect(large.endsWith(BLANC)).toBe(true)
  })

  it('met assez de blancs pour que leur ligne atteigne seule la cible', () => {
    // Le piège corrigé : sur sa propre ligne, le remplissage ne complète pas
    // le texte, il le remplace dans le calcul de la largeur. En mettre juste
    // « ce qui manque » rétrécissait la bulle au lieu de l’élargir.
    const court = elargi('a').split('\n')[1] ?? ''
    const presqueLong = elargi('x'.repeat(60)).split('\n')[1] ?? ''
    expect(court).toHaveLength(presqueLong.length)
    expect(court.length).toBeGreaterThanOrEqual(39)
  })

  it('n’ajoute rien à un texte déjà assez long', () => {
    const long = 'x'.repeat(70)
    expect(elargi(long)).toBe(long)
  })

  it('mesure la ligne la plus longue, celle qui fixe la largeur', () => {
    // Une ligne courte après une longue ne rétrécit pas la bulle : c'est la
    // plus longue qui décide, et elle seule.
    expect(elargi(`${'x'.repeat(70)}\nabc`)).toBe(`${'x'.repeat(70)}\nabc`)
  })

  it('n’insère qu’un saut de ligne et des blancs invisibles', () => {
    const ajout = elargi('court').slice('court'.length)
    expect(ajout.startsWith('\n')).toBe(true)
    expect(ajout.slice(1)).toBe(BLANC.repeat(ajout.length - 1))
  })
})

describe('grille', () => {
  function b(texte: string) {
    return { texte, donnee: 'x' }
  }

  it('remplit une rangée tant que les libellés tiennent', () => {
    const k = grille([b('aa'), b('bb'), b('cc')])
    expect(k.inline_keyboard).toHaveLength(1)
  })

  it('ne met jamais plus de trois boutons sur une rangée', () => {
    // Pas une limite de l'API mais du doigt : au-delà, la cible est trop
    // étroite pour être touchée.
    const k = grille([b('a'), b('b'), b('c'), b('d'), b('e')])
    expect(k.inline_keyboard[0]).toHaveLength(3)
  })

  it('isole un libellé trop long pour partager une rangée', () => {
    const k = grille([b('court'), b('un libellé vraiment très long pour une rangée')])
    expect(k.inline_keyboard).toHaveLength(2)
  })

  it('donne aux boutons « solo » leur propre rangée pleine largeur', () => {
    const k = grille([b('aa')], [b('◀ Retour')])
    expect(k.inline_keyboard).toHaveLength(2)
    expect(k.inline_keyboard[1]).toHaveLength(1)
  })

  it('rend un clavier vide quand il n’y a rien à montrer', () => {
    expect(grille([]).inline_keyboard).toEqual([])
  })
})
