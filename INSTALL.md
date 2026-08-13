# Installer AURA

**Français** · [English](INSTALL.en.md)

AURA est une application **locale** : elle tourne sur **votre poste**, ne dépend d'aucun service externe
et ne détient aucun secret. Elle pilote le dossier **`~/.claude`** de votre installation Claude Code.

AURA est développée et testée sous **Windows**, exclusivement. Les commandes ci-dessous
supposent ce système.

## Pré-requis

- **Node.js** ≥ 22.22 installé sur le poste.
- **pnpm** ≥ 10 (`npm i -g pnpm`).
- **Claude Code** installé et lancé au moins une fois, avec un dossier **`~/.claude`** existant
  (sous Windows : `C:\Users\<vous>\.claude`). C'est ce dossier qu'AURA lit et modifie.

## Installation

1. **Récupérer les sources** (clone git, ou copie du dossier du projet).

2. **Installer les dépendances** à la racine du projet :

   ```bash
   pnpm install
   ```

## Lancer

### En développement (front + serveur, rechargement à chaud)

```bash
pnpm dev:all
```

- Application : <http://127.0.0.1:9100> (ouverte automatiquement)
- Serveur (BFF) : <http://127.0.0.1:8800>

La fenêtre console reste ouverte : **c'est le serveur**. La fermer arrête AURA.

### En « production » locale (un seul process)

```bash
pnpm build      # génère le build statique de la SPA
pnpm start      # sert l'app + l'API sur http://127.0.0.1:8800
```

## Configuration (optionnelle)

Aucun secret n'est requis. Deux variables d'environnement facultatives :

- `PORT` — port d'écoute du serveur (défaut `8800`).
- `AURA_CLAUDE_DIR` — surcharge du dossier `.claude` géré (défaut `~/.claude` ; pratique pour tester sur
  une copie sandbox).

On peut les poser dans l'environnement ou dans `server/.env` (ignoré par git), lu par `--env-file`.

## Dépannage

- **Le navigateur ne s'ouvre pas** : allez manuellement sur <http://127.0.0.1:9100> (dev) ou
  <http://127.0.0.1:8800> (prod).
- **L'interface répond lentement** : vérifiez que l'adresse est bien `127.0.0.1` et non `localhost`.
  Ce nom se résout d'abord en `::1`, que rien n'écoute ici, et le navigateur attend environ 300 ms
  avant de se rabattre sur IPv4 — sur chaque requête, soit bien plus que le temps de réponse du
  serveur.
- **Le port est déjà utilisé** : une instance tourne probablement déjà, ou changez `PORT`.
- **« Dossier `.claude` introuvable »** : lancez Claude Code une première fois pour le créer, ou pointez
  `AURA_CLAUDE_DIR` vers le bon dossier.
