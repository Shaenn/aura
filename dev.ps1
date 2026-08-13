# Lance le front (quasar dev) + le BFF (Fastify) en parallele via "pnpm dev:all".
# Ouvre le navigateur sur http://127.0.0.1:9100/ des que le serveur web repond.
# Lancement : clic droit > "Executer avec PowerShell", ou `.\dev.ps1` dans un terminal.
#
# Les ports sont liberes par "pnpm dev:all" lui-meme, avant tout demarrage : un
# superviseur `node --watch` d'une session precedente ne meurt pas d'un echec de
# bind, il attend son heure et reprend le port des qu'il se libere.
#
# Pour arreter : Ctrl+C ici, ou `.\stop.ps1` depuis une autre fenetre.
#
# 127.0.0.1 et non localhost : ce nom se resout d'abord en ::1, que rien n'ecoute
# ici, et l'attente avant le repli IPv4 coute ~300 ms par requete du navigateur.

Set-Location -Path $PSScriptRoot

$url = 'http://127.0.0.1:9100/'

# Tache de fond : attend que le port 9100 accepte une connexion, puis ouvre le navigateur.
# Test TCP portable (compatible Windows PowerShell 5.1 et PowerShell 7+).
$opener = Start-Job -ScriptBlock {
    param($u)
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $client.Connect('127.0.0.1', 9100)
            $client.Close()
            Start-Process $u
            break
        }
        catch {
            Start-Sleep -Seconds 1
        }
    }
} -ArgumentList $url

try {
    Write-Host 'Pour arreter proprement : Ctrl+C ici, ou .\stop.ps1 ailleurs.' -ForegroundColor DarkGray
    pnpm dev:all
}
finally {
    Stop-Job $opener -ErrorAction SilentlyContinue
    Remove-Job $opener -ErrorAction SilentlyContinue
}
