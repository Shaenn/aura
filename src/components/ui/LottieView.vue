<template>
  <!--
    Décoratif, et rien d'autre : ce que l'animation raconte est déjà écrit à
    côté, en toutes lettres. Elle est donc retirée de l'arbre d'accessibilité
    plutôt que décrite — un lecteur d'écran n'a que faire d'un robot qui cligne.
  -->
  <div
    ref="host"
    class="lv"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import lottie, { type AnimationItem } from 'lottie-web';

const props = withDefaults(
  defineProps<{
    /** L'animation, déjà chargée en JSON (un `import` du fichier suffit). */
    data: object;
    /** Côté du carré, en pixels. */
    size?: number;
    /** Jouer, ou rester sur la première image. */
    playing?: boolean;
  }>(),
  { size: 40, playing: true },
);

const host = ref<HTMLElement | null>(null);
let animation: AnimationItem | null = null;

/**
 * Le réglage système qui demande moins de mouvement.
 *
 * Une boucle perpétuelle est exactement ce que ce réglage vise : elle bouge
 * sans qu'on l'ait demandé, et elle ne s'arrête jamais. On la fige alors sur sa
 * première image — le robot reste, il ne s'agite plus. Écouté et non lu une
 * fois pour toutes : le réglage se change sans recharger la page.
 */
const reduced = ref(false);
let motionQuery: MediaQueryList | null = null;
function onMotionChange(e: MediaQueryList | MediaQueryListEvent): void {
  reduced.value = e.matches;
}

/** Jouer ou figer, selon ce que la page demande *et* ce que le système autorise. */
function sync(): void {
  if (!animation) return;
  if (props.playing && !reduced.value) animation.play();
  else animation.goToAndStop(0, true);
}

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  onMotionChange(motionQuery);
  motionQuery.addEventListener('change', onMotionChange);

  if (!host.value) return;
  animation = lottie.loadAnimation({
    container: host.value,
    renderer: 'svg',
    loop: true,
    autoplay: false,
    // `structuredClone` : lottie-web écrit dans l'objet qu'on lui donne (il y
    // cache ses valeurs interpolées). Sans copie, deux robots à l'écran
    // partageraient l'état du module importé et se marcheraient dessus.
    animationData: structuredClone(props.data),
  });
  sync();
});

watch([() => props.playing, reduced], sync);

onBeforeUnmount(() => {
  motionQuery?.removeEventListener('change', onMotionChange);
  animation?.destroy();
  animation = null;
});
</script>

<style scoped lang="scss">
.lv {
  flex: none;
  line-height: 0;
}
</style>
