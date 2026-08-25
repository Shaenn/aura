// Ouvrir un sélecteur de dossier natif.
//
// Le navigateur ne peut pas rendre ce service : `showDirectoryPicker()` donne
// une poignée sur un dossier, jamais son chemin absolu — c'est délibéré côté
// plateforme, et c'est précisément ce dont un `cwd` a besoin. Mais AURA n'est pas
// une application distante : le BFF tourne sur la machine de l'utilisateur, et
// peut donc ouvrir le sélecteur du système.
//
// Conséquence à assumer : la fenêtre s'ouvre là où tourne le serveur. C'est vrai
// ici — même machine — et faux le jour où le BFF serait déporté. La route rend
// alors une erreur claire plutôt qu'une boîte que personne ne verrait.
//
// Windows seulement, par décision et non par oubli : AURA ne tourne que là.
// Écrire les branches macOS et Linux reviendrait à maintenir du code que rien
// n'exécute — et qu'on ne pourrait donc jamais vérifier.

import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { t } from '../i18n/index.ts'

const run = promisify(execFile)

/**
 * Un point de départ que la boîte de dialogue acceptera vraiment.
 *
 * Deux façons de le rater, toutes deux silencieuses — la boîte ne proteste pas,
 * elle s'ouvre simplement sur son dossier par défaut :
 *
 * 1. **Les séparateurs.** `SelectedPath` accepte `C:/Users/…` sans rien dire, et
 *    la propriété relit bien la valeur ; c'est `IFileDialog::SetFolder` qui la
 *    refuse à l'ouverture. L'API des projets rend justement des barres obliques.
 * 2. **L'existence.** Un dossier absent est ignoré de la même manière. On remonte
 *    donc jusqu'au premier parent qui existe : ouvrir un cran trop haut vaut
 *    mieux qu'ouvrir à l'autre bout du disque.
 */
export function normalizeStart(input?: string): string | undefined {
  if (!input?.trim()) return undefined
  let path = resolve(input.trim())
  for (;;) {
    try {
      if (existsSync(path) && statSync(path).isDirectory()) return path
    } catch {
      /* illisible : on remonte */
    }
    const up = dirname(path)
    // `dirname` d'une racine rend la racine : c'est la condition d'arrêt.
    if (up === path) return undefined
    path = up
  }
}

/** Au-delà, c'est que personne ne regarde l'écran : on rend la main. */
const DIALOG_TIMEOUT_MS = 3 * 60_000

export class PickerUnavailable extends Error {}

/**
 * Le dossier choisi, ou `null` si l'utilisateur a annulé.
 *
 * L'annulation n'est pas une erreur : c'est la moitié des ouvertures d'un
 * sélecteur, et l'appelant n'a rien à en dire.
 */
export async function pickFolder(startFrom?: string): Promise<string | null> {
  // Windows seulement, par décision : AURA ne tourne que là. Le `501` n'est pas
  // un chantier à finir mais une réponse honnête, et le front retombe alors sur
  // la saisie du chemin sans rien casser.
  if (process.platform !== 'win32') {
    throw new PickerUnavailable(t('agent.pickerUnavailable', { platform: process.platform }))
  }
  return pickWindows(normalizeStart(startFrom))
}

async function pickWindows(startFrom?: string): Promise<string | null> {
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$d.Description = 'Dossier de travail de la session'",
    '$d.ShowNewFolderButton = $false',
    // `UseDescriptionForTitle` et `InitialDirectory` n'existent que dans le .NET
    // moderne : sous Windows PowerShell 5.1, les assigner lève une erreur. On
    // teste leur présence plutôt que la version de l'hôte, qui ne dit pas
    // laquelle des deux piles WinForms a été chargée.
    "if ($d.PSObject.Properties.Match('UseDescriptionForTitle').Count) { $d.UseDescriptionForTitle = $true }",
    ...(startFrom
      ? [
          // `SelectedPath` existe partout et pré-sélectionne le dossier ;
          // `InitialDirectory` dit à la boîte moderne où *s'ouvrir*.
          `$d.SelectedPath = ${psLiteral(startFrom)}`,
          `if ($d.PSObject.Properties.Match('InitialDirectory').Count) { $d.InitialDirectory = ${psLiteral(startFrom)} }`,
        ]
      : []),
    // Le sélecteur s'ouvrirait derrière la fenêtre du navigateur sans un parent
    // au premier plan : ce formulaire invisible mais « toujours au-dessus » lui
    // en donne un.
    '$top = New-Object System.Windows.Forms.Form',
    '$top.TopMost = $true',
    'if ($d.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }',
    '$top.Dispose()',
  ].join('; ')

  // `-STA` est obligatoire : une boîte WinForms exige un appartement à fil
  // unique. `pwsh` d'abord — son .NET donne la boîte moderne d'Explorateur, là
  // où Windows PowerShell affiche encore le vieil arbre — puis `powershell.exe`,
  // qui lui est toujours présent.
  for (const exe of ['pwsh.exe', 'powershell.exe']) {
    try {
      const { stdout } = await run(exe, ['-NoProfile', '-STA', '-Command', script], {
        timeout: DIALOG_TIMEOUT_MS,
        windowsHide: true,
      })
      return stdout.trim() || null
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
    }
  }
  throw new PickerUnavailable(t('agent.noPowerShell'))
}

/** Une chaîne PowerShell littérale : rien n'y est interprété, les `'` sont doublés. */
function psLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}
