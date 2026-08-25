@echo off
REM Lance AURA en developpement : le front (quasar dev) et le BFF (Fastify)
REM ensemble, par "pnpm dev:all".
REM
REM Ce fichier ne fait QUE deleguer au manifeste, et c'est voulu : une commande
REM de lancement qui vit a deux endroits finit par diverger, et c'est celle du
REM manifeste qui fait foi.
REM
REM Il a longtemps delegue a un dev.ps1 qui attendait le port puis ouvrait le
REM navigateur -- travail que quasar.config.ts fait deja seul (devServer.open),
REM si bien que le lancement ouvrait deux fenetres. Cette logique retiree, plus
REM rien ne justifiait PowerShell.
REM
REM Lancement : double-clic, ou .\dev.bat dans un terminal.
REM Pour arreter : Ctrl+C ici, ou stop.bat depuis une autre fenetre.

cd /d "%~dp0"
call pnpm dev:all

REM La fenetre reste ouverte sur un echec : sans cela, un demarrage qui rate se
REM referme avant qu'on ait pu lire pourquoi.
if errorlevel 1 pause
