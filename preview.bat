@echo off
REM Lance le projet tel qu'il sera en production : le build d'abord, puis les
REM serveurs qui le servent -- la section "preview" de lancement\services.json.
REM
REM Le build est DANS le geste, et ce n'est pas un detail : servir sans
REM reconstruire republie le build precedent, et rien a l'ecran ne dit qu'il est
REM vieux. Ce n'est pas le geste de tous les jours : le code modifie ne change
REM rien tant qu'on n'a pas relance. Pour developper, c'est dev.bat.
REM
REM Lancement : double-clic, ou preview.bat dans un terminal.
REM Pour arreter : Ctrl+C ici, fermer la fenetre, ou stop.bat depuis une autre.

cd /d "%~dp0"
call node lancement\lancer.mjs preview

if errorlevel 1 pause
