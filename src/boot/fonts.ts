import { defineBoot } from '#q-app';

// UI font: Inter (weights used across the app).
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

// Monospace for durations / console-style readouts.
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';

export default defineBoot(() => {
  // Font CSS is bundled via the imports above; nothing to run at boot.
});
