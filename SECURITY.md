# Sécurité

**Français** · [English](SECURITY.en.md)

AURA lit et écrit dans `~/.claude`, le dossier où Claude Code range vos transcripts, vos
réglages et vos identifiants. C'est un périmètre sensible, et ce document dit ce que
l'application garantit, ce qu'elle ne garantit pas, et comment signaler un défaut.

## Le modèle

AURA est un outil **local et mono-utilisateur**. Il n'y a ni compte, ni mot de passe, ni
service externe : la frontière est la machine elle-même.

- Le BFF **n'écoute que `127.0.0.1`**, sans option pour en sortir. Aucun appareil du réseau
  ne peut l'atteindre.
- Toute requête `/api/*` est confrontée à son en-tête `Host`, ce qui ferme le **rebinding
  DNS** — l'attaque par laquelle un site visité fait pointer son domaine vers la boucle
  locale pour parler à un serveur local depuis votre navigateur.
- Toute requête qui écrit doit se déclarer de même origine (`Sec-Fetch-Site`), ce qui ferme
  le **CSRF** : une page ouverte dans un autre onglet ne peut pas déclencher une écriture.
- Les chemins venus du client sont ramenés à leur **forme canonique** avant d'être jugés :
  liens symboliques suivis, casse réelle, noms courts Windows. Une denylist ferme les zones
  privées (`.credentials.json`, `sessions`, `file-history`, caches) ; une allowlist borne
  les écritures aux ressources éditables.
- Toute écriture est **prévisualisée puis confirmée**, sauvegardée avant remplacement, et
  refusée si le fichier a changé sur le disque entre-temps.
- Les erreurs internes ne renvoient jamais de chemin absolu : le détail reste au journal du
  serveur.

## Ce qui n'est pas couvert

- **Les autres processus de votre session.** Tout ce qui tourne sous votre compte peut
  atteindre `127.0.0.1:8800`, comme tout ce qui tourne sous votre compte peut lire
  `~/.claude` directement. AURA ne prétend pas s'en défendre.
- **Ce que Claude Code fait.** AURA observe et configure ; les permissions d'outil, les
  hooks et les serveurs MCP sont exécutés par Claude Code, selon ses propres règles.
- **Les serveurs MCP que vous déclarez.** AURA écrit leur configuration ; ce qu'ils font une
  fois lancés ne dépend pas d'elle.

## Signaler une faille

Ouvrez un **avis de sécurité privé** via l'onglet _Security_ du dépôt
(« Report a vulnerability »). Cela permet d'en discuter sans exposer le défaut avant qu'il
soit corrigé.

À défaut, une issue publique reste préférable au silence — mais évitez d'y publier un
scénario d'exploitation détaillé tant que rien n'est corrigé.

Merci d'indiquer la version, le système, et ce qu'il faut faire pour reproduire.

## Versions

Le projet n'entretient qu'une ligne : la branche `main`. Un correctif de sécurité y est
appliqué, sans rétroportage.
