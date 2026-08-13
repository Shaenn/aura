@echo off
REM Lance le front (quasar dev) + le BFF (Fastify) et ouvre le navigateur.
REM Delegue au script PowerShell (logique d'ouverture du navigateur partagee).
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0dev.ps1"
