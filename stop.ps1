# Arrete AURA proprement : le serveur coupe d'abord ses sessions de l'Atelier,
# puis les processus restants sont ecartes.
#
# A preferer a la fermeture de la fenetre. Un arret brutal laisse derriere lui un
# processus `claude` par session ouverte -- invisible, et comptant toujours sur
# le quota -- ainsi que des sessions fantomes dans ~/.claude/sessions.
#
# Lancement : `.\stop.ps1` dans un terminal, ou clic droit > "Executer avec PowerShell".
#
# Tout le travail est fait par scripts/free-ports.mjs : une seule implementation,
# partagee avec le garde de demarrage de `pnpm dev:all`.

Set-Location -Path $PSScriptRoot

node scripts/free-ports.mjs 8800 9100
exit $LASTEXITCODE
