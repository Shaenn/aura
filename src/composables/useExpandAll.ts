// One "expand / collapse everything" command, broadcast down the replay tree.
//
// The things that fold in a transcript are nested three levels deep and written
// three different ways: a turn and a tool call fold with a `ref` and a `v-if`,
// eight other spots are plain `<details>`. Threading a prop through every layer
// would touch each intermediate component for something none of them care about,
// so the page provides a command and whoever folds injects it.
//
// The command carries a sequence number, not just a boolean. Collapsing after a
// reader has manually opened one card must still close that card — with a bare
// boolean the value would not change, no watcher would fire, and the card would
// stay open. The counter makes every press a distinct event.

import { inject, provide, ref, watch, type InjectionKey, type Ref } from 'vue'

interface ExpandCommand {
  open: boolean
  seq: number
  /**
   * L'ordre vaut aussi pour ce qui se monte après lui. Un flux en direct ajoute
   * des outils au tour en cours seconde après seconde : sans cela, chacun
   * arriverait replié, la commande étant passée avant sa naissance. Un bouton
   * « tout déplier », lui, s'adresse à ce qui est là — d'où le défaut à faux.
   */
  sticky: boolean
}

const EXPAND_ALL: InjectionKey<Ref<ExpandCommand>> = Symbol('replay:expand-all')

/** Call once, in the page that owns the toolbar. */
export function provideExpandAll(): {
  expandAll: () => void
  collapseAll: () => void
} {
  const command = ref<ExpandCommand>({ open: false, seq: 0, sticky: false })
  const setAll = (open: boolean): void => {
    command.value = { open, seq: command.value.seq + 1, sticky: false }
  }
  provide(EXPAND_ALL, command)
  return { expandAll: () => setAll(true), collapseAll: () => setAll(false) }
}

/**
 * La même commande, mais bornée à un sous-arbre : un tour peut déplier son
 * propre contenu sans toucher au reste du flux. Elle relaie d'abord celle de la
 * page — sinon « tout déplier » s'arrêterait net à la frontière du sous-arbre.
 *
 * À appeler après les `useExpandable()` du composant lui-même : ceux-là doivent
 * suivre la commande de la page, pas celle qu'il fournit à ses descendants.
 */
export function provideScopedExpandAll(): {
  setAll: (open: boolean, sticky?: boolean) => void
} {
  const parent = inject(EXPAND_ALL, null)
  const command = ref<ExpandCommand>({ open: false, seq: 0, sticky: false })
  const setAll = (open: boolean, sticky = false): void => {
    command.value = { open, seq: command.value.seq + 1, sticky }
  }
  if (parent) {
    watch(
      () => parent.value.seq,
      () => setAll(parent.value.open, parent.value.sticky),
    )
  }
  provide(EXPAND_ALL, command)
  return { setAll }
}

/**
 * An open/closed ref that follows the page's expand-all command while staying
 * free to be toggled on its own. `initial` is this element's own default — a
 * turn opens, a tool call does not — and is what it shows until a command lands.
 *
 * A fold nested in a collapsed parent does not exist when the command fires: a
 * tool call mounts its result pane only once opened. Such a pane keeps its own
 * default, so each press of "tout déplier" opens the level it can see and
 * reveals the next — the fold unwraps one layer at a time, on purpose.
 *
 * `followSticky: false` opts a fold out of the *automatic* orders only — the
 * ones nobody asked for, given because a turn happens to be live. A press on
 * « tout déplier » still reaches it: that one is a decision.
 *
 * Safe outside a provider: the ref is then simply local (keeps the components
 * usable in isolation, and in tests).
 */
export function useExpandable(initial = false, { followSticky = true }: { followSticky?: boolean } = {}): Ref<boolean> {
  const command = inject(EXPAND_ALL, null)
  // Un ordre adhésif déjà donné vaut pour ce qui naît sous lui : l'outil qui
  // vient d'apparaître dans le tour suivi en direct s'ouvre comme les autres.
  const sticky = (): boolean => Boolean(command?.value.sticky) && followSticky
  const open = ref(sticky() ? command!.value.open : initial)
  if (command) {
    watch(
      () => command.value.seq,
      () => {
        // Un ordre adhésif ignoré ne referme pas non plus : le repli de fin de
        // direct, lui, n'est pas adhésif et continue de s'appliquer.
        if (command.value.sticky && !followSticky) return
        open.value = command.value.open
      },
    )
  }
  return open
}

/**
 * Bind a native `<details>` both ways: `:open` drives it, this reads back what
 * the user did to it. Without the read-back the ref goes stale after the first
 * manual click and the next expand-all silently no-ops on that element.
 */
export function syncDetails(open: Ref<boolean>): (e: Event) => void {
  return (e: Event) => {
    open.value = (e.target as HTMLDetailsElement).open
  }
}

/**
 * The raw command, for a component holding many folds at once (a `v-for` of
 * sections) where one boolean ref per element would not do.
 */
export function onExpandAll(handler: (open: boolean) => void): void {
  const command = inject(EXPAND_ALL, null)
  if (!command) return
  watch(
    () => command.value.seq,
    () => handler(command.value.open),
  )
}
