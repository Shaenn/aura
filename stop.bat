@echo off
REM Arrete AURA proprement (sessions de l'Atelier coupees avant le serveur).
REM Delegue au script PowerShell.
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0stop.ps1"
