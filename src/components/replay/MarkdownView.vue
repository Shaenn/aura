<template>
  <!-- eslint-disable-next-line vue/no-v-html — input is markdown-it output (html:false, escaped) -->
  <div ref="root" class="md-view" v-html="html"></div>
</template>

<script setup lang="ts">
  import { renderMarkdown } from '@/utils/markdown'
  import { useQuasar } from 'quasar'
  import { computed, ref, watch, nextTick, onMounted } from 'vue'

  const props = withDefaults(
    defineProps<{
      source: string
      /**
       * Interpréter le balisage brut du document plutôt que l'échapper.
       *
       * Réservé aux fichiers du disque, qu'une main a écrits : un README centre ses
       * badges, replie une section dans un `<details>`, commente un bloc qu'il ne
       * publie pas encore. Le rejeu, lui, affiche ce qu'un modèle a produit et
       * garde l'échappement. Dans les deux cas la sortie est assainie.
       */
      allowHtml?: boolean
    }>(),
    { allowHtml: false },
  )
  const html = computed(() => renderMarkdown(props.source ?? '', { html: props.allowHtml }))

  const $q = useQuasar()
  const root = ref<HTMLElement | null>(null)

  // Mermaid is heavy, so it is imported lazily and only when a diagram is present.
  // The fence rule in utils/markdown.ts emits `<pre class="mermaid">…</pre>` blocks;
  // we turn them into SVG here once the HTML is in the DOM, and re-render on theme
  // change. The raw source is stashed on each node so a re-render can restore it.
  async function renderMermaid(): Promise<void> {
    const el = root.value
    if (!el) return
    const nodes = Array.from(el.querySelectorAll<HTMLElement>('pre.mermaid'))
    if (!nodes.length) return

    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({
      startOnLoad: false,
      theme: $q.dark.isActive ? 'dark' : 'default',
      securityLevel: 'strict',
    })

    for (const n of nodes) {
      if (n.dataset.src == null) n.dataset.src = n.textContent ?? ''
      else n.textContent = n.dataset.src
      n.removeAttribute('data-processed')
    }

    try {
      await mermaid.run({ nodes })
    } catch {
      // On invalid syntax mermaid throws after injecting an error box; the raw
      // source stays readable, so nothing more to do.
    }
  }

  /**
   * Les images en chemin relatif ne mènent nulle part.
   *
   * `<img src="docs/captures/rejeu.png">` dans un README désigne un fichier du
   * dépôt ; le navigateur le résout contre l'adresse de l'écran, et AURA ne sert
   * pas l'arborescence des sources. Le résultat est l'icône d'image cassée. On
   * rend plutôt le texte alternatif, qui dit au moins ce qui manquait.
   */
  function markMissingImages(): void {
    const el = root.value
    if (!el) return
    for (const img of Array.from(el.querySelectorAll('img'))) {
      const src = img.getAttribute('src') ?? ''
      if (!src || src.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(src)) continue
      const note = document.createElement('span')
      note.className = 'md-img-missing'
      note.textContent = img.getAttribute('alt') || src
      img.replaceWith(note)
    }
  }

  function decorate(): void {
    markMissingImages()
    void renderMermaid()
  }

  watch(html, () => void nextTick(decorate))
  watch(
    () => $q.dark.isActive,
    () => void nextTick(renderMermaid),
  )
  onMounted(() => void nextTick(decorate))
</script>

<style scoped lang="scss">
  .md-view {
    font-size: var(--fs-base);
    line-height: 1.6;
    color: var(--text);
    word-break: break-word;
    overflow-wrap: anywhere;

    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4) {
      font-weight: 600;
      line-height: 1.3;
      margin: var(--space-lg) 0 var(--space-sm);
    }
    :deep(h1) {
      font-size: var(--fs-lg);
    }
    :deep(h2) {
      font-size: var(--fs-md);
    }
    :deep(h3),
    :deep(h4) {
      font-size: var(--fs-base);
      color: var(--muted);
    }
    :deep(p) {
      margin: var(--space-sm) 0;
    }
    :deep(ul),
    :deep(ol) {
      margin: var(--space-sm) 0;
      padding-left: var(--space-lg);
    }
    :deep(li) {
      margin: 2px 0;
    }
    :deep(a) {
      color: var(--brand);
      text-decoration: none;
    }
    :deep(a:hover) {
      text-decoration: underline;
    }
    :deep(strong) {
      font-weight: 600;
    }
    :deep(blockquote) {
      margin: var(--space-sm) 0;
      padding-left: var(--space-md);
      border-left: 2px solid var(--brand-line);
      color: var(--muted);
    }
    :deep(code) {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 0.9em;
      background: var(--surface-2);
      border: 1px solid var(--line);
      border-radius: var(--radius-xs);
      padding: 1px 5px;
    }
    :deep(pre) {
      background: var(--surface-2);
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      padding: var(--space-md);
      overflow-x: auto;
      margin: var(--space-sm) 0;
    }
    :deep(pre code) {
      background: none;
      border: none;
      padding: 0;
      font-size: var(--fs-sm);
      line-height: 1.5;
    }
    :deep(table) {
      border-collapse: collapse;
      margin: var(--space-sm) 0;
      display: block;
      overflow-x: auto;
    }
    :deep(th),
    :deep(td) {
      border: 1px solid var(--line-2);
      padding: 4px 10px;
      text-align: left;
    }
    :deep(th) {
      background: var(--surface-2);
      font-weight: 600;
    }
    :deep(hr) {
      border: none;
      border-top: 1px solid var(--line-2);
      margin: var(--space-lg) 0;
    }
    :deep(img) {
      max-width: 100%;
    }
    // Le texte alternatif d'une image qu'on ne peut pas servir : présent, discret,
    // et reconnaissable comme un manque plutôt que comme du texte du document.
    :deep(.md-img-missing) {
      display: inline-block;
      padding: 2px 8px;
      border: 1px dashed var(--line-2);
      border-radius: var(--radius-xs);
      color: var(--dim);
      font-size: var(--fs-xs);
    }

    // Diagrammes Mermaid : le conteneur centre le SVG et le laisse défiler
    // horizontalement s'il dépasse ; le <pre> perd son style de bloc de code.
    :deep(.mermaid-block) {
      margin: var(--space-md) 0;
      overflow-x: auto;
    }
    :deep(pre.mermaid) {
      background: none;
      border: none;
      padding: 0;
      margin: 0;
      text-align: center;
      line-height: normal;
    }
    :deep(pre.mermaid svg) {
      max-width: 100%;
      height: auto;
    }
  }
</style>
