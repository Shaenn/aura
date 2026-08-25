// Shared state of the contextual help drawer, in the shape of useBreadcrumbs:
// a module-level ref, no Pinia store — nothing here is persisted or fetched.
//
// `pinned` is the drawer's only subtlety. Left null, the drawer follows the
// route: navigating from Hooks to MCP swaps the manual page under it. A section
// opened explicitly (from a "voir aussi" link) pins itself until the next
// navigation, which the layout resets.
import { ref } from 'vue'

const open = ref(false)
const pinned = ref<string | null>(null)

export function useHelp() {
  return { open, pinned }
}

/** Open the drawer, on a given section or on the one documenting the route. */
export function openHelp(sectionId?: string): void {
  pinned.value = sectionId ?? null
  open.value = true
}

export function closeHelp(): void {
  open.value = false
}

export function toggleHelp(): void {
  if (open.value) closeHelp()
  else openHelp()
}

/** Drop the pinned section so the drawer tracks the route again. */
export function unpinHelp(): void {
  pinned.value = null
}
