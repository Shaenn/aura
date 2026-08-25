import { isLocale, DEFAULT_LOCALE, type AppLocale } from '@/i18n'
import { applyLocale } from '@/i18n/apply'
import { getPreferences, savePreferences, type Preferences } from '@/services/preferences'
import { defineStore } from 'pinia'
import { Dark } from 'quasar'
import { ref, watch } from 'vue'

/**
 * UI preferences for AURA. Persisted **server-side** in the BFF
 * (`.local/preferences.json`) — nothing is kept in the browser. Loaded in
 * `boot/settings.ts`, before first paint, so the theme applies with no flash.
 */

type PersistedSettings = {
  darkMode?: boolean
  locale?: AppLocale
  /** Dossiers inclus dans l'arbre d'un projet, par slug. Voir `includedFolders`. */
  includedFolders?: Record<string, string[]>
}

export const useSettingsStore = defineStore('settings', () => {
  // Dark vs light theme. Default dark (the app's native aesthetic), applied via
  // Quasar's Dark plugin which toggles body--dark / body--light (see app.scss).
  const darkMode = ref(true)

  // Langue de l'interface. Le serveur lit cette même clé dans
  // `.local/preferences.json` pour rendre ses propres messages : c'est pourquoi
  // elle vit ici et non dans le navigateur.
  const locale = ref<AppLocale>(DEFAULT_LOCALE)

  /**
   * Les dossiers d'un projet à montrer dans son arbre, par slug.
   *
   * Une préférence d'affichage, mais pas seulement : **le BFF relit cette clé sur
   * le disque** pour savoir ce qu'il a le droit d'ouvrir hors de `.claude`. C'est
   * ce qui fait qu'un chemin envoyé par un client ne suffit jamais — il faut que
   * le fichier le déclare. Elle vit donc ici, dans le seul objet que le front
   * écrit, plutôt que dans une route à elle.
   */
  const includedFolders = ref<Record<string, string[]>>({})

  function snapshot(): PersistedSettings {
    return {
      darkMode: darkMode.value,
      locale: locale.value,
      includedFolders: includedFolders.value,
    }
  }

  function apply(s: PersistedSettings): void {
    darkMode.value = s.darkMode ?? true
    // Une valeur inconnue sur le disque ne doit pas laisser l'interface sans
    // langue : on retombe sur la référence plutôt que de propager la surprise.
    locale.value = isLocale(s.locale) ? s.locale : DEFAULT_LOCALE
    includedFolders.value = s.includedFolders && typeof s.includedFolders === 'object' ? s.includedFolders : {}
  }

  /** Les dossiers inclus d'un projet, jamais `undefined`. */
  function foldersOf(slug: string): string[] {
    return includedFolders.value[slug] ?? []
  }

  /**
   * Poser la liste d'un projet et l'écrire tout de suite.
   *
   * Sans attente ici : l'appelant recharge l'inventaire dans la foulée, et le
   * serveur doit lire la nouvelle liste, pas celle d'il y a quatre cents
   * millisecondes. Un projet sans dossier inclus voit sa clé disparaître plutôt
   * que de laisser un tableau vide s'accumuler.
   */
  async function setFolders(slug: string, folders: string[]): Promise<void> {
    const next = { ...includedFolders.value }
    if (folders.length) next[slug] = [...folders].sort((a, b) => a.localeCompare(b))
    else delete next[slug]
    includedFolders.value = next
    await savePreferences(snapshot())
  }

  let ready = false

  /** Load preferences from the server; seed the file on first run. */
  async function load(): Promise<void> {
    let server: Preferences | null
    try {
      server = await getPreferences()
    } catch {
      server = null
    }
    if (server && Object.keys(server).length > 0) {
      apply(server)
    } else if (server !== null) {
      try {
        await savePreferences(snapshot())
      } catch {
        /* retry on next change */
      }
    }
    Dark.set(darkMode.value)
    // Awaité : le pack de langue de Quasar est un import dynamique, et le boot
    // n'a d'intérêt que s'il rend l'application prête *avant* le premier rendu.
    await applyLocale(locale.value)
    ready = true
  }

  // Apply theme and language changes live (boot load handles the first paint).
  watch(darkMode, (v) => Dark.set(v))
  watch(locale, (l) => void applyLocale(l))

  // Persist to the server on any change, debounced. Never fires before `load`.
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    [darkMode, locale],
    () => {
      if (!ready) return
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        void savePreferences(snapshot()).catch((e: unknown) =>
          // Une préférence non écrite se rattrape au geste suivant : la signaler à
          // l’écran coûterait plus que ce qu’elle vaut.
          // eslint-disable-next-line no-console
          console.error('Sauvegarde des préférences échouée', e),
        )
      }, 400)
    },
    { deep: true },
  )

  return { darkMode, locale, includedFolders, foldersOf, setFolders, load }
})
