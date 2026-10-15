# Lancement

Le projet entier se lance depuis ce dossier, avec les mêmes gestes partout dans le parc.

| Geste                            | Double-clic   | Terminal, ou agent                  |
| -------------------------------- | ------------- | ----------------------------------- |
| Développer                       | `dev.bat`     | `node lancement/lancer.mjs dev`     |
| Voir l'application de production | `preview.bat` | `node lancement/lancer.mjs preview` |
| Arrêter                          | `stop.bat`    | `node lancement/arreter.mjs`        |

Ctrl+C dans la fenêtre de lancement, ou sa fermeture, arrête aussi tout.

## Ce qui est propre au projet : `services.json`

C'est le seul fichier à écrire. Les autres fichiers de ce dossier, `lancer.mjs`, `arreter.mjs` et
ce `LISEZMOI.md`, sont communs à tout le parc et distribués par VIGIE. Ne les modifiez pas ici :
VIGIE signale toute copie qui diverge.

```json
{
  "dev": {
    "web": { "dossier": "front", "commande": "pnpm dev" },
    "api": { "dossier": "back/MonApi", "commande": "dotnet watch --non-interactive" }
  },
  "preview": {
    "avant": ["pnpm --dir front build"],
    "services": {
      "api": { "dossier": "back/MonApi", "commande": "dotnet run --configuration Release" }
    }
  }
}
```

- **Le nom d'un service est une clé de `ports.json`.** C'est ainsi que le lanceur affiche son port,
  et que `arreter.mjs` et le radar de VIGIE savent quel port surveiller.
- **`dossier`** est relatif à la racine du dépôt. Sans `dossier`, la commande part de la racine.
- **`commande`** part telle quelle au shell, depuis ce dossier.
- **`preview.avant`** liste les étapes à finir avant de lancer les services, en général le build.
  Une étape s'écrit comme une chaîne, qui s'exécute à la racine, ou comme un objet
  `{ "dossier", "commande" }`.
- **`arret`** (facultatif) est la commande qui demande au service de s'éteindre lui-même, lancée
  depuis la racine tant qu'il tourne encore, avant que quoi que ce soit ne soit coupé. Elle sert au
  service qui a du ménage à faire en partant, par exemple fermer des processus qu'il a lancés hors
  de son arbre. Sous Windows, aucun signal venu de l'extérieur ne l'atteint : `stop.bat`, ou le
  radar de VIGIE, le couperaient sans qu'il ait pu le faire.

### Les variantes

Chaque clé de `services.json` est un mode, qui se lance par `node lancement/lancer.mjs <mode>`.
En plus de `dev` et `preview`, un projet peut déclarer ses variantes. Par exemple, un
développement dont le front vise l'adresse du poste sur le réseau, pour déboguer depuis un autre
appareil :

```json
"dev:device": {
  "libelle": "Debug sur un autre appareil",
  "base": "dev",
  "services": {
    "web": { "dossier": "front", "commande": "pnpm dev:device" }
  }
}
```

- **`base`** reprend les services d'un autre mode. `services` les complète ou les remplace un par
  un : la variante ne redit que ce qui change.
- **`libelle`** est le nom affiché au lancement, et sur la carte du service dans le radar de VIGIE,
  qui propose la variante à côté du développement.

Un lanceur au double-clic pour une variante est propre au projet, par exemple `dev-device.bat`
qui appelle `node lancement\lancer.mjs dev:device`.

### Les scripts du projet

Un script qui ne sert qu'à lancer ou à éteindre un service, par exemple télécharger puis démarrer un
outil, a sa place dans ce dossier, à côté de `services.json`. Il n'a pas sa place dans le
`package.json` du front.

## Ce que fait le lanceur

1. Il arrête d'abord ce qu'une session précédente aurait laissé tourner.
2. Il vérifie que chaque dossier npm a ses dépendances installées. Sinon, il dit où lancer
   `pnpm install`.
3. Il lance chaque service dans son dossier et préfixe chaque ligne du nom du service.
4. Si un service s'arrête, il arrête les autres. À l'arrêt, il lance d'abord les commandes
   `arret`, puis laisse cinq secondes aux services pour partir d'eux-mêmes. Il coupe ensuite chaque
   arbre de processus, y compris un `dotnet watch` qui n'écoute sur aucun port.

Les processus lancés sont notés dans `.local/lancement.json`, que `stop.bat` lit depuis une autre
fenêtre. Ce fichier n'est pas versionné.
