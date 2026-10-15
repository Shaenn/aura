@echo off
REM Arrete le projet : ce que dev.bat ou preview.bat a lance, puis tout ce qui
REM tient encore un port de ports.json.
REM
REM Utile depuis une autre fenetre, ou apres un arret brutal : un port reste
REM alors occupe, et le demarrage suivant echoue sur un message qui ne dit pas
REM pourquoi. Le detail est dans lancement\arreter.mjs.
REM
REM Lancement : double-clic, ou stop.bat dans un terminal.

cd /d "%~dp0"
call node lancement\arreter.mjs

if errorlevel 1 pause
