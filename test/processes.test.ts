// Reconnaître les processus Claude, et savoir dans quel ordre les couper.
//
// La fixture n'est pas inventée : c'est l'arbre relevé sur le poste le soir où
// cette surface a été décidée. Neuf processus, dont cinq seulement déclaraient un
// fichier de session — les quatre autres étaient un daemon, deux hôtes de
// pseudo-terminal et le pont de l'extension Chrome, c'est-à-dire exactement ceux
// qui avaient survécu à ce qui les avait lancés.
//
// Deux choses comptent ici. Que chaque processus soit reconnu pour ce qu'il est,
// et que l'ordre de coupe place toujours un hôte avant son job : l'inverse a été
// mesuré, le job renaît dans la seconde sous un nouveau PID.

import { describe, expect, it } from 'vitest'
import { buildProcessList, killOrder, spawnedByPid, type RawProcess } from '../server/processes.ts'

/** Le PID du BFF dans ce relevé. Son parent est un `node --watch`, hors table. */
const AURA = 17648

/** Les PID encore vivants au moment du relevé. `24680` est mort, son daemon non. */
const VIVANTS = new Set([17648, 26132, 14864, 18220, 31724, 24332, 17216, 3432, 11232, 16556])
function estVivant(pid: number): boolean {
  return VIVANTS.has(pid)
}

const PARC: RawProcess[] = [
  // Le BFF, lancé par `node --watch` (16556), qui ne parle pas de Claude.
  {
    pid: AURA,
    ppid: 16556,
    command: 'node.EXE --import tsx server/index.ts',
    startedAt: 1_786_478_109_000,
  },
  // Le daemon : réparenté (8164 n'existe plus), et il nomme lui-même son lanceur.
  {
    pid: 26132,
    ppid: 8164,
    command: 'claude.exe daemon run --origin transient --spawned-by "{\\"label\\":\\"claude\\",\\"cwd\\":\\"C:\\\\devl\\\\aura\\",\\"pid\\":24680}"',
    startedAt: 1_786_477_449_000,
  },
  {
    pid: 14864,
    ppid: 26132,
    command: 'claude.exe --bg-pty-host \\\\.\\pipe\\cc-daemon-daec1a76-pty-1a2b3c4d 209 51 --',
    startedAt: 1_786_477_450_000,
  },
  {
    pid: 18220,
    ppid: 14864,
    command: 'claude.exe --session-id 1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d --fork-session --resume',
    startedAt: 1_786_477_450_500,
  },
  {
    pid: 31724,
    ppid: 26132,
    command: 'claude.exe --bg-pty-host \\\\.\\pipe\\cc-daemon-daec1a76-pty-2b3c4d5e 209 51 --',
    startedAt: 1_786_477_450_100,
  },
  {
    pid: 24332,
    ppid: 31724,
    command: 'claude.exe --session-id 2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e --agent claude',
    startedAt: 1_786_477_450_600,
  },
  // Une session ouverte dans un terminal : son parent est un pwsh bien vivant.
  {
    pid: 17216,
    ppid: 3432,
    command: '"C:\\Users\\jean.dupont\\.local\\bin\\claude.exe"',
    startedAt: 1_786_478_056_000,
  },
  // Le pont de l'extension Chrome.
  {
    pid: 20452,
    ppid: 11232,
    command: '"C:\\Users\\jean.dupont\\.local\\bin\\claude.exe"  --chrome-native-host',
    startedAt: 1_786_466_930_000,
  },
  // Une session de l'Atelier : enfant direct du BFF, binaire embarqué du SDK.
  {
    pid: 21000,
    ppid: AURA,
    command: 'C:\\devl\\aura\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe',
    startedAt: 1_786_478_200_000,
  },
]

function liste(): ReturnType<typeof buildProcessList> {
  return buildProcessList(PARC, AURA, [], estVivant)
}

function kindOf(pid: number): string | undefined {
  return liste().find((p) => p.pid === pid)?.kind
}

describe('reconnaître les processus', () => {
  it('donne son rôle à chacun', () => {
    expect(kindOf(AURA)).toBe('aura')
    expect(kindOf(26132)).toBe('daemon')
    expect(kindOf(14864)).toBe('pty-host')
    expect(kindOf(18220)).toBe('bg-job')
    expect(kindOf(24332)).toBe('bg-job')
    expect(kindOf(17216)).toBe('interactive')
    expect(kindOf(20452)).toBe('native-host')
    expect(kindOf(21000)).toBe('atelier')
  })

  it('garde le BFF, qui ne parle pourtant pas de Claude', () => {
    // Sans lui, les sessions de l'Atelier n'auraient plus de parent dans l'arbre.
    expect(liste().map((p) => p.pid)).toContain(AURA)
  })

  it('ne marque orphelin que le daemon dont le lanceur est mort', () => {
    const orphelins = liste()
      .filter((p) => p.orphan)
      .map((p) => p.pid)
    expect(orphelins).toEqual([26132])
  })

  it('ne prend pas une session de terminal pour une abandonnée', () => {
    // Son parent est un shell : absent de la table, bien vivant sur la machine.
    // Juger sur la table plutôt que sur le système les déclarerait toutes perdues.
    expect(liste().find((p) => p.pid === 17216)?.orphan).toBe(false)
  })

  it('lit le lanceur que le daemon inscrit dans sa propre ligne', () => {
    expect(spawnedByPid(PARC[1]?.command ?? '')).toBe(24680)
    expect(spawnedByPid('claude.exe --bg-pty-host truc')).toBe(0)
  })

  it('protège AURA d’elle-même', () => {
    expect(
      liste()
        .filter((p) => p.self)
        .map((p) => p.pid),
    ).toEqual([AURA])
  })

  it('rapproche le fichier de session, quand il y en a un', () => {
    const avecNom = buildProcessList(
      PARC,
      AURA,
      [
        {
          pid: 18220,
          sessionId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
          cwd: 'C:\\devl\\aura',
          name: 'Étude de faisabilité',
          status: 'busy',
          slug: 'C--devl-aura',
        },
      ],
      estVivant,
    )
    const job = avecNom.find((p) => p.pid === 18220)
    expect(job?.name).toBe('Étude de faisabilité')
    expect(job?.status).toBe('busy')
  })
})

describe('ordre de coupe', () => {
  it('place le daemon avant ses hôtes, et chaque hôte avant son job', () => {
    const ordre = killOrder(26132, true, liste())

    expect(ordre[0]).toBe(26132)
    expect(ordre).toHaveLength(5)
    for (const [hôte, job] of [
      [14864, 18220],
      [31724, 24332],
    ]) {
      expect(ordre.indexOf(hôte as number)).toBeLessThan(ordre.indexOf(job as number))
    }
  })

  it('ne coupe que la cible quand on ne demande pas la descendance', () => {
    expect(killOrder(26132, false, liste())).toEqual([26132])
  })

  it('descend d’un hôte à son seul job', () => {
    expect(killOrder(14864, true, liste())).toEqual([14864, 18220])
  })

  it('ne boucle pas si un processus se déclare son propre parent', () => {
    // Un PID recyclé peut former ce cycle ; le balayage ne doit pas y rester.
    const bouclé = buildProcessList([{ pid: 500, ppid: 500, command: 'claude.exe' }], AURA, [], estVivant)
    expect(killOrder(500, true, bouclé)).toEqual([500])
  })
})
