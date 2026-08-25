import { t } from '@/i18n'
import type { Severity } from './index'

// ── Gravité ──────────────────────────────────────────────────────────────────
//
// La couleur ne porte jamais l'information seule : chaque pastille est doublée
// d'une icône distincte et d'un nom accessible.
//
// Partagé parce qu'un même constat se montre à plusieurs endroits — dans la
// liste du panneau de session et, replié, dans l'en-tête qui le coiffe. Deux
// tables auraient fini par diverger, et un « critique » d'un côté deviendrait
// un « à surveiller » de l'autre.

// Le libellé n'est plus dans la table : il dépend de la langue, là où l'icône et
// la couleur n'en dépendent pas. Le mettre ici en aurait figé une seule version.
export const SEVERITY: Record<Severity, { icon: string; color: string }> = {
  critical: { icon: 'error', color: 'var(--danger)' },
  warn: { icon: 'warning', color: 'var(--warn)' },
  info: { icon: 'info', color: 'var(--series-1)' },
}

/** Ordre de gravité : la pire l'emporte quand une seule peut être montrée. */
export const SEVERITY_RANK: Record<Severity, number> = { critical: 3, warn: 2, info: 1 }

export function severityIcon(s: Severity): string {
  return SEVERITY[s].icon
}
export function severityColor(s: Severity): string {
  return SEVERITY[s].color
}
export function severityLabel(s: Severity): string {
  return t(`diagnostics.severity.${s}`)
}

/** La plus grave d'un lot, ou `null` s'il est vide. */
export function worstSeverity(items: { severity: Severity }[]): Severity | null {
  return items.reduce<Severity | null>((w, i) => (!w || SEVERITY_RANK[i.severity] > SEVERITY_RANK[w] ? i.severity : w), null)
}
