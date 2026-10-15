@echo off
REM Lance le projet en developpement : tous les services de lancement\services.json,
REM dans cette fenetre, chaque ligne prefixee du nom de son service.
REM
REM Ce fichier ne fait QUE deleguer au dossier lancement\, et c'est voulu : une
REM commande de lancement qui vit a deux endroits finit par diverger. Rien d'autre
REM n'a sa place ici -- ni sondage de port, ni ouverture du navigateur, que le
REM serveur de dev fait deja seul.
REM
REM Lancement : double-clic, ou dev.bat dans un terminal.
REM Pour arreter : Ctrl+C ici, fermer la fenetre, ou stop.bat depuis une autre.

cd /d "%~dp0"
call node lancement\lancer.mjs dev

REM La fenetre reste ouverte sur un echec : sans cela, un demarrage qui rate se
REM referme avant qu'on ait pu lire pourquoi.
if errorlevel 1 pause
