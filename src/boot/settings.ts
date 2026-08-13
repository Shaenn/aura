import { defineBoot } from '#q-app/wrappers';
import { useSettingsStore } from 'src/stores/settings';

// Load UI preferences from the BFF before the first paint: nothing is kept in the
// browser, dark mode is applied with no flash, and any legacy localStorage is
// migrated up to the server on first run. Awaited, so the app mounts ready.
export default defineBoot(async () => {
  // The Pinia instance is installed before boot files run (SPA), so the store
  // resolves without passing it explicitly.
  await useSettingsStore().load();
});
