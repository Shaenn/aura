// Repère le texte français qui n'est pas encore passé par le catalogue.
//
// Ce n'est pas un linter : il ne sait pas décider, il sait *montrer*. La vraie
// règle — « une page se traite avec tout son arbre de composants » — ne se
// vérifie pas à l'œil sur 103 fichiers, et c'est ce qu'il rend praticable.
//
//   node scripts/i18n-scan.mjs                  tous les fichiers restants
//   node scripts/i18n-scan.mjs src/pages/McpPage.vue    un fichier et son arbre
//
// Le second usage suit les imports de composants : c'est lui qui répond à
// « ai-je oublié un composant de cette page ? ».

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

/** Un mot français d'au moins quatre lettres, ou un accent : assez pour lever la main. */
const FRENCH =
  /[éèêàçùûôîœ]|\b(le|la|les|des|une|un|du|aux|sur|pour|dans|avec|sans|par|est|sont|pas|plus|tout|toute|cette|ces|vous|votre|vos|qui|que|quoi|dont|aucun|aucune|chaque|entre|depuis|selon)\b/i;

/** Ce qui ressemble à du texte destiné à l'écran, pas à du code. */
function candidates(source) {
  const out = [];
  const lines = source.split('\n');

  let inScript = false;
  let inStyle = false;
  let inComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/<script/.test(line)) inScript = true;
    if (/<\/script>/.test(line)) inScript = false;
    if (/<style/.test(line)) inStyle = true;
    if (/<\/style>/.test(line)) inStyle = false;
    if (inStyle) continue;

    // Commentaires : ils restent en français, c'est la consigne du dépôt.
    if (/\/\*/.test(line) && !/\*\//.test(line)) inComment = true;
    const commented = inComment || /^\s*(\/\/|\*|<!--)/.test(line);
    if (/\*\//.test(line)) inComment = false;
    if (commented) continue;

    const stripped = line.replace(/\/\/.*$/, '').replace(/<!--.*?-->/g, '');

    const hits = [];
    // Attribut littéral : label="…", title='…' — mais pas :label="t('…')".
    for (const m of stripped.matchAll(
      /(?<!:)\b(label|title|placeholder|hint|caption|aria-label|no-description|empty-label|delete-title|delete-note|subtitle)\s*=\s*"([^"]{2,})"/g,
    )) {
      if (FRENCH.test(m[2])) hits.push(m[2]);
    }
    // Texte de nœud entre balises, hors interpolation.
    if (!inScript) {
      for (const m of stripped.matchAll(/>([^<>{}]{3,})</g)) {
        const text = m[1].trim();
        if (text && FRENCH.test(text)) hits.push(text);
      }
    }
    // Littéral de chaîne dans le script.
    if (inScript) {
      for (const m of stripped.matchAll(/'([^'\\]{4,})'|"([^"\\]{4,})"/g)) {
        const text = (m[1] ?? m[2] ?? '').trim();
        if (text && FRENCH.test(text) && !/^[a-z-]+\/[a-z-]+$/.test(text)) hits.push(text);
      }
    }

    for (const h of hits) out.push({ line: i + 1, text: h.slice(0, 90) });
  }
  return out;
}

/** Les composants qu'un fichier monte, résolus en chemins réels. */
function imports(file) {
  const source = fs.readFileSync(file, 'utf8');
  const out = [];
  for (const m of source.matchAll(/from\s+'([^']+\.vue)'/g)) {
    const spec = m[1];
    let resolved;
    if (spec.startsWith('src/')) resolved = path.join(ROOT, spec);
    else if (spec.startsWith('components/')) resolved = path.join(SRC, spec);
    else if (spec.startsWith('pages/')) resolved = path.join(SRC, spec);
    else if (spec.startsWith('layouts/')) resolved = path.join(SRC, spec);
    else if (spec.startsWith('.')) resolved = path.resolve(path.dirname(file), spec);
    else continue;
    if (fs.existsSync(resolved)) out.push(resolved);
  }
  return out;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'i18n') walk(p, acc);
    } else if (/\.(vue|ts)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const arg = process.argv[2];
let files;

if (arg) {
  // L'arbre d'une page : elle-même, puis ses composants, récursivement.
  const seen = new Set();
  const queue = [path.resolve(arg)];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f)) continue;
    seen.add(f);
    queue.push(...imports(f));
  }
  files = [...seen];
} else {
  files = walk(SRC);
}

let total = 0;
for (const f of files.sort()) {
  const hits = candidates(fs.readFileSync(f, 'utf8'));
  if (!hits.length) continue;
  total += hits.length;
  console.log(`\n${path.relative(ROOT, f)}  (${hits.length})`);
  for (const h of hits.slice(0, 12)) console.log(`  ${h.line}: ${h.text}`);
  if (hits.length > 12) console.log(`  … ${hits.length - 12} de plus`);
}
console.log(`\n${total} chaîne(s) à reprendre dans ${files.length} fichier(s) examiné(s).`);
