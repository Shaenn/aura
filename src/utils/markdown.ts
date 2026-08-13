// Markdown → sanitised HTML for the replay viewer and read-only resource panes.
//
// markdown-it does the parsing; highlight.js colours fenced code. Code themes
// live in css/highlight.scss (light + dark, token-driven), so we only emit
// `hljs` class names here.
//
// Deux rendus, et la différence n'est pas cosmétique :
//
//   - `renderMarkdown(src)` — `html: false`. Le balisage brut est échappé, donc
//     rien de ce que le modèle a écrit ne peut devenir du HTML. C'est le rendu du
//     rejeu, où le texte vient d'une machine.
//   - `renderMarkdown(src, { html: true })` — le balisage brut est interprété,
//     puis **assaini par DOMPurify**. C'est le rendu d'un fichier du disque : un
//     README s'écrit avec des `<p align="center">`, des `<img>` et des
//     commentaires HTML, et les échapper affichait le balisage en toutes lettres.
//
// L'assainissement n'est pas une précaution de façade : un `CLAUDE.md` venu d'un
// dépôt cloné est du texte étranger, et AURA lit `~/.claude` dans le même
// navigateur. DOMPurify retire scripts, gestionnaires d'événements et sources
// exotiques ; ce qui reste ne peut que s'afficher.

// markdown-it 15 embarque ses déclarations et n'exporte plus la classe par
// défaut : le défaut est une valeur appelable, et le type de l'instance est un
// export nommé. D'où l'alias — sans lui, `MarkdownIt` ne désigne qu'une valeur.
import MarkdownIt, { type MarkdownIt as MarkdownItInstance } from 'markdown-it';
import DOMPurify, { type Config } from 'dompurify';
import hljs from 'highlight.js/lib/common';
import powershell from 'highlight.js/lib/languages/powershell';

// `lib/common` ships the ~35 most used grammars, and PowerShell is not among
// them — yet it is the shell of this machine, and 749 tool calls in the local
// transcripts use it. Register it so those commands colour like Bash does.
hljs.registerLanguage('powershell', powershell);

/** A link the browser would resolve against another origin: `https:`, `mailto:`, `//host`. */
const isExternalHref = (href: string): boolean =>
  href.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(href);

function createRenderer(allowHtml: boolean): MarkdownItInstance {
  const m: MarkdownItInstance = new MarkdownIt({
    html: allowHtml,
    linkify: true,
    breaks: false,
    highlight(str: string, lang: string): string {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
        } catch {
          /* fall through */
        }
      }
      try {
        return hljs.highlightAuto(str).value;
      } catch {
        return '';
      }
    },
  });

  // Mermaid fences: instead of a highlighted code block, emit a container that
  // carries the raw diagram source. MarkdownView renders it client-side (lazy
  // mermaid import) once the HTML is in the DOM. The source is escaped here and
  // re-read as plain textContent by mermaid — no injection.
  const defaultFence =
    m.renderer.rules.fence ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  m.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = token ? token.info.trim().split(/\s+/)[0]?.toLowerCase() : '';
    if (info === 'mermaid' && token) {
      return `<div class="mermaid-block"><pre class="mermaid">${escapeHtml(token.content)}</pre></div>`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };

  // Open external links in a new tab (these point at external docs / repos). Relative
  // hrefs — MEMORY.md's `[Title](file.md)` pointers, say — stay in-document: the
  // browser would otherwise resolve them against the app's own origin. Views that
  // render such Markdown intercept the click and route it themselves.
  const defaultLinkOpen =
    m.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  m.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    // `attrGet` rend `string | number | null` depuis la 15 : un attribut peut
    // porter un nombre (`width`, `colspan`). Un href n'en est jamais un, mais
    // le type l'admet — on ramène au texte plutôt que d'affirmer le contraire.
    if (isExternalHref(String(tokens[idx]?.attrGet('href') ?? ''))) {
      tokens[idx]?.attrSet('target', '_blank');
      tokens[idx]?.attrSet('rel', 'noopener noreferrer');
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  return m;
}

const md = createRenderer(false);
const mdHtml = createRenderer(true);

// L'assainissement garde le balisage de mise en page d'un README — `<p align>`,
// `<div>`, `<img>`, `<details>` — et laisse tomber le reste. `target="_blank"`
// est ajouté par la règle ci-dessus, donc il figure dans les attributs permis ;
// sans lui, DOMPurify le retirerait et un lien externe rouvrirait dans l'onglet.
const PURIFY: Config = {
  ALLOWED_ATTR: [
    'href',
    'src',
    'alt',
    'title',
    'align',
    'width',
    'height',
    'class',
    'target',
    'rel',
    'colspan',
    'rowspan',
    'open',
    'controls',
  ],
  FORBID_TAGS: ['style', 'form', 'input', 'button'],
  ALLOW_DATA_ATTR: false,
};

/**
 * Render a Markdown string to safe HTML.
 *
 * `html: true` interprets the raw markup a hand-written document carries — a
 * README centres its badges, folds a section in a `<details>`, and comments out
 * a block it is not ready to publish. Escaping all that showed the tags. The
 * output is sanitised, so the caller gains layout, not capability.
 */
export function renderMarkdown(src: string, opts?: { html?: boolean }): string {
  if (!opts?.html) return md.render(src ?? '');
  return DOMPurify.sanitize(mdHtml.render(src ?? ''), PURIFY);
}

/** True when highlight.js has a grammar registered under this name. */
export function hasLanguage(lang: string): boolean {
  return Boolean(lang) && Boolean(hljs.getLanguage(lang));
}

/**
 * Highlight a raw code string for a known language (no markdown wrapping).
 *
 * Unlike the fenced-code path above, an unknown language yields escaped plain
 * text rather than `highlightAuto`. Callers pass tool output — a `Bash` result,
 * a `Grep` hit list — where auto-detection reliably mistakes prose for Perl and
 * paints it at random. No colour beats wrong colour.
 */
export function highlightCode(src: string, lang?: string): string {
  if (lang && hasLanguage(lang)) {
    try {
      return hljs.highlight(src, { language: lang, ignoreIllegals: true }).value;
    } catch {
      /* fall through to plain text */
    }
  }
  return escapeHtml(src);
}

/**
 * Highlight `src` and return one HTML string per line, ready for a gutter.
 *
 * Highlighting each line on its own would break every construct that spans
 * lines — block comments, template literals, heredocs. So we highlight the whole
 * text once, then cut the resulting HTML on newlines, closing the `<span>`s that
 * are open at the cut and reopening them on the next line.
 */
export function highlightLines(src: string, lang?: string): string[] {
  const html = highlightCode(src, lang);
  const lines: string[] = [];
  const open: string[] = [];
  let current = '';

  // Text runs never contain `<`: highlight.js escapes them to `&lt;`.
  const token = /(<span[^>]*>)|(<\/span>)|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = token.exec(html)) !== null) {
    if (m[1]) {
      open.push(m[1]);
      current += m[1];
    } else if (m[2]) {
      open.pop();
      current += m[2];
    } else if (m[3]) {
      const parts = m[3].split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          current += '</span>'.repeat(open.length);
          lines.push(current);
          current = open.join('');
        }
        current += parts[i];
      }
    }
  }
  lines.push(current);
  return lines;
}

/** Minimal HTML escape for plain-text panes. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
