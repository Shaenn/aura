// Shared breadcrumb trail rendered in the top statusbar (after the AURA brand).
// Pages that know a dynamic label (a project name, a session id) push their own
// trail via `setBreadcrumbs`; MainLayout clears the override on every navigation
// and falls back to a static, route-name-derived trail otherwise.
import { ref } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

export interface Crumb {
  label: string;
  /** Omit for the current (non-navigable) segment. */
  to?: RouteLocationRaw;
}

const override = ref<Crumb[] | null>(null);

export function useBreadcrumbs() {
  return { override };
}

/** Set the breadcrumb trail for the current page (segments after the brand). */
export function setBreadcrumbs(crumbs: Crumb[]): void {
  override.value = crumbs;
}

/** Reset to the route-derived default trail (called by the layout on navigation). */
export function clearBreadcrumbs(): void {
  override.value = null;
}
