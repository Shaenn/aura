<template>
  <div class="tv">
    <!-- La requête n'est répétée ici que quand l'en-tête de la carte l'a coupée.
         Elle y tient en 80 caractères, ce qui suffit 51 fois sur 55 ; la redire
         systématiquement à deux lignes d'intervalle ne dirait rien de plus. -->
    <p v-if="longQuery" class="wsv-query">« {{ longQuery }} »</p>

    <ToolChips :items="params" />

    <p v-if="denied" class="wsv-denied" role="status">
      <q-icon name="block" size="15px" aria-hidden="true" />
      <span>{{ t('replay.tools.views.webSearch.denied', { why: denied.why }) }}</span>
    </p>

    <template v-else-if="found">
      <!-- Les liens sont dans le résultat sous forme de JSON échappé, sur une
           seule ligne : 69 443 caractères sur les 140 171 du parc, soit la
           moitié du pavé, illisibles et non cliquables. Ce sont pourtant les
           sources de tout ce que Claude dira ensuite. -->
      <section v-if="found.links.length" class="wsv-links">
        <h4 class="wsv-label">
          {{ t('replay.tools.views.webSearch.results', found.links.length) }}
        </h4>
        <ol class="wsv-list">
          <li v-for="(l, i) in found.links" :key="i" class="wsv-item">
            <a :href="l.href" target="_blank" rel="noopener noreferrer" class="wsv-title" :title="l.href">{{ l.title }}</a>
            <span class="wsv-host font-mono">{{ l.host }}</span>
          </li>
        </ol>
      </section>

      <!-- La synthèse est du markdown — titres, listes, gras — rendu jusqu'ici
           en texte brut dans le pavé. C'est la réponse que Claude s'est faite à
           lui-même avant de répondre au lecteur. -->
      <MarkdownView v-if="found.prose" :source="found.prose" />
    </template>

    <!-- Le repli : une forme que la lecture ci-dessus ne reconnaît pas. Sur les
         50 résultats du parc elle n'est jamais atteinte, mais le harness peut
         changer sa phrase — c'est déjà arrivé ailleurs dans cet inventaire. -->
    <OutputPane
      v-else
      :content="text"
      :is-error="block.result?.isError ?? false"
      :tool-use-id="block.id ?? ''"
      :default-open="block.result?.isError ?? false"
    />
  </div>
</template>

<script setup lang="ts">
  import MarkdownView from '@/components/replay/MarkdownView.vue'
  import type { Block } from '@/services/projects'
  import { computed } from 'vue'
  import { useI18n } from 'vue-i18n'
  import OutputPane from '../OutputPane.vue'
  import { permissionDenied } from '../serviceLines'
  import ToolChips from '../ToolChips.vue'
  import { arr, asRecord, chips, str } from '../values'

  const { t } = useI18n()

  const props = defineProps<{ block: Block }>()

  const input = computed(() => asRecord(props.block.input))
  const text = computed(() => props.block.result?.content ?? '')

  const query = computed(() => str(input.value.query))

  /** Ce que l'en-tête de la carte tronque — `oneLine` y coupe à 80 caractères. */
  const longQuery = computed(() => {
    const q = query.value.replace(/\s+/g, ' ').trim()
    return q.length > 80 ? q : ''
  })

  function domains(key: string): string {
    return arr(input.value[key]).filter(Boolean).join(', ')
  }

  const params = computed(() =>
    chips([
      // Deux appels du parc restreignent les domaines, aucun n'en exclut. Les deux
      // sont dans le schéma ; le second est lu pour ne pas le perdre le jour où il
      // servira.
      [t('replay.tools.chips.allowedDomains'), domains('allowed_domains')],
      [t('replay.tools.chips.blockedDomains'), domains('blocked_domains')],
    ]),
  )

  const denied = computed(() => permissionDenied(text.value))

  interface Link {
    title: string
    href: string
    host: string
  }

  /**
   * Le résultat d'une recherche, tel que le harness l'écrit.
   *
   * La forme est rigide — vérifiée sur les 50 résultats aboutis du parc, sans une
   * exception : une ligne d'en-tête qui redit la requête, une ligne vide, une
   * ligne `Links: [...]` dont le JSON tient entier, puis la synthèse en markdown,
   * close par un rappel adressé au modèle.
   *
   * La lecture est faite à la ligne et non par expression régulière sur le tout :
   * 19 requêtes du parc contiennent un guillemet, et une reconnaissance gourmande
   * de l'en-tête avalerait alors le reste du résultat.
   */
  const HEAD = 'Web search results for query: '
  const LINKS = 'Links: '
  const REMINDER = /\n*REMINDER: You MUST include the sources above[^\n]*\n*$/

  /** Seul `http(s)` devient un `href` : un lien qu'on pose dans le DOM est vivant. */
  function toLink(raw: unknown): Link | null {
    const r = asRecord(raw)
    const title = str(r.title).trim()
    const url = str(r.url)
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
      return { title: title || u.hostname, href: u.href, host: u.hostname.replace(/^www\./, '') }
    } catch {
      return null
    }
  }

  const found = computed((): { links: Link[]; prose: string } | null => {
    const t = text.value
    if (!t.startsWith(HEAD)) return null
    const lines = t.split('\n')
    const at = lines.findIndex((l) => l.startsWith(LINKS))
    if (at === -1) return null

    let raw: unknown
    try {
      raw = JSON.parse(lines[at]?.slice(LINKS.length) ?? '')
    } catch {
      return null
    }
    if (!Array.isArray(raw)) return null

    const links = raw.map(toLink).filter((l): l is Link => l !== null)
    const prose = lines
      .slice(at + 1)
      .join('\n')
      .replace(REMINDER, '')
      .trim()
    return { links, prose }
  })
</script>

<style scoped lang="scss">
  .tv {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .wsv-query {
    margin: 0;
    font-size: var(--fs-sm);
    font-style: italic;
    color: var(--muted);
  }
  .wsv-denied {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    margin: 0;
    font-size: var(--fs-sm);
    line-height: 1.5;
    color: var(--muted);
  }
  .wsv-denied > .q-icon {
    flex-shrink: 0;
    height: calc(var(--fs-sm) * 1.5);
  }
  .wsv-links {
    min-width: 0;
  }
  .wsv-label {
    margin: 0 0 var(--space-xs);
    font-size: var(--fs-xs);
    font-weight: 600;
    color: var(--faint);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .wsv-list {
    margin: 0;
    padding: 0 0 0 var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .wsv-item {
    min-width: 0;
    font-size: var(--fs-sm);
    line-height: 1.5;
  }
  .wsv-item::marker {
    color: var(--faint);
    font-size: var(--fs-xs);
  }
  .wsv-title {
    color: var(--brand);
  }
  .wsv-title:hover {
    color: var(--brand-hover);
  }
  // L'hôte à la suite du titre, pas dessous : 465 liens du parc, 10 par recherche
  // en médiane — une ligne par lien tient, deux doubleraient la carte.
  .wsv-host {
    margin-left: var(--space-sm);
    font-size: var(--fs-xs);
    color: var(--faint);
    word-break: break-all;
  }
</style>
