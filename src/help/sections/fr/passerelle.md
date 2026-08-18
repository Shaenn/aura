---
id: passerelle
title: Passerelle
icon: forum
order: 105
routes: []
---

Piloter l'**Atelier** depuis une messagerie, quand vous n'êtes pas devant ce poste. Vous écrivez à un bot, j'ouvre une session ou je transmets votre message à celle qui travaille déjà, et je vous rends sa réponse.

C'est la seule partie d'AURA qui sorte de cette machine, et **elle n'existe que si vous la configurez**. Sans jeton, elle ne démarre pas, n'appelle rien, et rien ne change. C'est l'état par défaut, et il le reste.

## Ce qu'elle n'ouvre pas

Je continue de n'écouter que la boucle locale. La Passerelle **n'ouvre aucun port** : c'est moi qui vais chercher les messages chez Telegram, jamais Telegram qui vient frapper ici. Aucune porte n'est percée dans le pare-feu, aucune adresse n'est à exposer, et rien de ce qui garde l'API ne change.

C'est la raison d'être de cette forme plutôt que d'un tunnel ou d'une ouverture au réseau : une interface exposée demanderait une authentification à défendre, là où une requête sortante n'en demande aucune.

## Ce que cela vous coûte

Trois choses, et il vaut mieux les peser avant qu'après.

- **Un secret entre chez moi.** Partout ailleurs, je n'en porte aucun. Le jeton du bot vit dans `server/.env`, qui n'est pas versionné, et aucune de mes routes n'est en mesure de le renvoyer.
- **J'appelle un service externe.** Vos messages transitent par les serveurs de Telegram, comme n'importe quelle conversation qui s'y tient.
- **Le pouvoir accordé est celui d'un accès distant.** Qui écrit dans une conversation autorisée peut ouvrir une session, lui faire lancer une commande et autoriser une écriture sur ce poste. La liste des conversations autorisées n'est donc pas un confort : c'est la serrure.

Je refuse de démarrer si cette liste est absente. L'oubli ne doit pas ouvrir la machine au premier venu.

## L'activer

1. Créez un bot auprès de `@BotFather` sur Telegram, qui vous donne un jeton.
2. Récupérez l'identifiant de votre conversation — c'est un nombre ; celui d'un groupe est négatif.
3. Renseignez `server/.env` :

```
AURA_TELEGRAM_TOKEN=le-jeton-de-BotFather
AURA_TELEGRAM_CHATS=votre-identifiant
```

4. Redémarrez le service **entièrement**. Ce fichier est lu au démarrage et n'est pas relu à chaud : une variable ajoutée ne prend effet qu'au prochain lancement.

Une ligne dans mon journal confirme l'ouverture et le nombre de conversations autorisées. Si le jeton est refusé, je le dis et je m'arrête là plutôt que de réessayer indéfiniment — le reste d'AURA continue de fonctionner.

`AURA_TELEGRAM_MODE` fixe le mode de permission des sessions ouvertes de loin. Par défaut `default` : chaque outil sensible vous demande.

## Ce que vous pouvez me dire

Une conversation tient **une** session à la fois.

| Message              | Ce que je fais                                     |
| -------------------- | -------------------------------------------------- |
| `/atelier <dossier>` | J'ouvre une session sur ce dossier                 |
| `/sessions`          | Je liste ce qui tourne, toutes origines confondues |
| `/stop`              | J'interromps le tour en cours                      |
| `/fin`               | Je ferme la session de cette conversation          |
| `/aide`              | Je rappelle ce qui précède                         |

**Tout autre message part à la session comme un tour.** C'est le cas de loin le plus fréquent, et il ne demande aucune syntaxe.

Une commande que je ne connais pas vous est signalée plutôt qu'envoyée à l'agent — sans quoi une faute de frappe passerait pour une panne.

Un message venu d'une conversation non autorisée reste **sans réponse**. C'est délibéré : répondre confirmerait que ce bot existe et à quoi il sert.

## Autoriser un outil de loin

Quand l'agent veut employer un outil que le mode ne laisse pas passer, je vous envoie un message avec deux boutons, **Autoriser** et **Refuser**. Votre réponse débloque le tour immédiatement.

L'échéance de l'Atelier s'applique ici aussi : **sans réponse au bout d'un quart d'heure, la demande est refusée**, jamais l'inverse. Une commande lancée avant de partir ne restera donc pas suspendue indéfiniment.

Une question à choix vous parvient de la même façon, en boutons. Si elle en compte plusieurs, je vous le dis sans y répondre à moitié : ce formulaire-là demande l'écran, et il vous attend dans l'Atelier.

## Ce que je ne vous envoie pas

**La réponse de l'agent en fin de tour, et les demandes qui attendent une décision.** Rien d'autre.

Ni les tokens au fil de leur écriture, ni la ligne d'activité, ni le détail des outils employés. Une messagerie n'est pas une timeline : y déverser un flux de tokens le rendrait illisible et noierait ce qui demande une réponse. Le fil complet est dans l'Atelier, et le **Rejeu** le garde.

Une réponse très longue est coupée plutôt que perdue — un texte tronqué se lit, un envoi échoué ne se voit pas.

## Les deux bornes, et ce qui vous protège

Le plafond de **six sessions** vaut ici comme ailleurs : je vous le dis dans la conversation plutôt que d'échouer sans un mot.

Le ramassage des **trente minutes** ne s'applique pas à une session pilotée d'ici. Tant que la conversation la tient, je la regarde — et une session regardée n'est jamais ramassée. Vous pouvez laisser un travail en plan et le reprendre le soir.

En revanche, une session **ne survit pas au redémarrage du service**. Si vous m'écrivez après un redémarrage, je vous dirai qu'aucune session n'est ouverte ; `/atelier` en rouvre une, et le travail précédent reste sur le disque.

## Ce que cela ne remplace pas

L'Atelier montre ce que la messagerie ne peut pas : le chemin exact qu'un outil vise, les maquettes d'une question, la fenêtre de contexte, les commandes lancées en arrière-plan. La Passerelle sert à lancer, surveiller et débloquer — pas à travailler à l'aveugle.

Les sessions ouvertes de loin sont des sessions comme les autres : elles apparaissent dans l'Atelier, se rejouent, et comptent dans l'**Usage** comme dans le **Diagnostic**.
