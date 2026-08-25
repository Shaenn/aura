@echo off
REM Arrete AURA proprement, par "pnpm stop".
REM
REM A preferer a la fermeture de la fenetre. Le serveur coupe d'abord ses
REM sessions de l'Atelier -- un processus `claude` par session, invisible, et
REM qui compte sur le quota tant qu'il vit -- puis s'eteint. Un arret brutal ne
REM lui en laisse pas le temps.
REM
REM Le detail du travail est dans scripts/free-ports.mjs, atteint par le verbe
REM `stop` du manifeste : les ports ne sont ecrits nulle part ici, ils viennent
REM de ports.json.
REM
REM Lancement : double-clic, ou .\stop.bat dans un terminal.

cd /d "%~dp0"
call pnpm stop

if errorlevel 1 pause
