import DefaultTheme from 'vitepress/theme'
import './tokens.css'

// Les deux polices sont déjà des dépendances du projet et servies depuis le build, comme
// dans l'application (`src/boot/fonts.ts`). Aucun CDN : la vitrine d'un outil qui ne fait
// aucun appel sortant ne peut pas en faire un pour ses polices.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono/400.css'

export default DefaultTheme
