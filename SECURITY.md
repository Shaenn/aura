# Sécurité

**Français** · [English](SECURITY.en.md)

AURA lit et écrit dans `~/.claude`, le dossier où Claude Code range vos transcripts, vos
réglages et vos identifiants. C'est un périmètre sensible, et ce document dit ce que
l'application garantit, ce qu'elle ne garantit pas, et comment signaler un défaut.

## Le modèle

AURA est un outil **local et mono-utilisateur**. Il n'y a ni compte, ni mot de passe, ni
service externe : la frontière est la machine elle-même. Une seule fonctionnalité, éteinte par
défaut, déplace cette frontière — voir _La Passerelle_ plus bas.

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

## La Passerelle, et ce qu'elle change

Une seule fonctionnalité sort de ce modèle, et **elle n'existe que si vous l'activez** : la
Passerelle, qui relie une messagerie à l'Atelier pour piloter une session à distance. Sans
jeton configuré, elle ne démarre pas, n'appelle rien, et ce qui précède reste vrai mot pour
mot.

Ce qu'elle ne change pas :

- **Elle n'ouvre aucun port.** L'échange est sortant — c'est le serveur qui va chercher les
  messages. Le BFF continue de n'écouter que `127.0.0.1`, et les gardes `Host` et
  `Sec-Fetch-Site` sont inchangées.
- **Elle ne passe pas par l'API.** Elle appelle le registre de sessions dans le même
  processus : aucune route n'est ouverte, aucune requête n'est à authentifier.

Ce qu'elle change, et qu'il faut peser :

- **Un secret existe désormais.** Le jeton du bot vit dans `server/.env`, non versionné. Il
  ne traverse pas la configuration partagée du serveur et aucune route n'est en mesure de le
  renvoyer.
- **Le serveur appelle un service externe.** Vos messages transitent par ce service.
- **C'est un accès distant à votre machine.** Qui écrit dans une conversation autorisée peut
  ouvrir une session, lui faire exécuter une commande et approuver une écriture. La liste
  blanche des conversations est la seule garde qui l'en empêche : elle est **obligatoire**,
  la Passerelle refuse de démarrer sans elle, et un message venu d'ailleurs reste sans
  réponse.
- **La sûreté du canal devient la vôtre.** Quiconque obtient l'accès à une conversation
  autorisée — appareil déverrouillé, compte compromis — obtient ce même pouvoir. AURA ne
  peut pas le distinguer de vous.

**L'usage personnel est celui pour lequel la Passerelle est faite ; l'usage professionnel ne
l'est pas.** Tout ce qui transite — vos messages, les réponses de l'agent, le contenu des
fichiers consultés de loin — passe par les serveurs de la messagerie, sans chiffrement de bout
en bout : une conversation avec un bot n'en offre pas. Le compromis se tient pour des projets
personnels ; il ne se tient pas pour du code d'entreprise ou des données de clients. Une forme
sans tiers est cherchée — un réseau privé (Tailscale ou équivalent) rendant l'Atelier joignable
depuis un téléphone sans rien exposer, ce qui demanderait d'adapter l'interface à cet écran —
mais elle n'existe pas aujourd'hui, et rien dans le code ne distingue un projet personnel d'un
projet de travail.

Les demandes de permission continuent d'être posées, et se refusent d'elles-mêmes sans
réponse. `AURA_TELEGRAM_MODE=plan` ouvre les sessions distantes en mode plan, où rien ne
s'exécute.

## Ce qui n'est pas couvert

- **Les autres processus de votre session.** Tout ce qui tourne sous votre compte peut
  atteindre `127.0.0.1:8788`, comme tout ce qui tourne sous votre compte peut lire
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
