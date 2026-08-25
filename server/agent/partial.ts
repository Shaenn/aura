// Lire une entrée d'outil qui n'a pas fini d'arriver.
//
// Le SDK streame l'entrée d'un `tool_use` en fragments de JSON (`input_json_delta`).
// Pris tels quels ils ne veulent rien dire — `{"command": "git sta` n'est pas un
// objet. On a longtemps préféré ne rien montrer et attendre le message complet ;
// mais c'est justement ce qui rendait l'écran mort pendant qu'une commande se
// composait, là où le CLI la montre s'écrire.
//
// D'où cette réparation : on coupe le fragment au dernier endroit refermable,
// puis on referme. Une chaîne de *valeur* en cours, elle, est conservée et close
// à l'endroit où elle s'arrête — c'est précisément ce qu'on veut voir grandir.
// Une clé à demi tapée est jetée : `{"comm` n'apprend rien, et une clé inventée
// ferait afficher un argument qui n'existe pas.
//
// Rien de tout cela ne fait autorité : le message `assistant` livre l'entrée
// entière quelques centaines de millisecondes plus tard et l'écrase.

type Rec = Record<string, unknown>

/** Ce qu'il reste à fermer, et si une chaîne y serait lue comme une clé. */
interface Level {
  close: '}' | ']'
  expectKey: boolean
}

function asRecord(v: unknown): Rec | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null
}

/**
 * L'objet que porte un fragment de JSON, au plus près de ce qui est arrivé.
 * Rend `null` quand rien d'exploitable ne s'en tire — un fragment trop court,
 * ou une racine qui n'est pas un objet.
 */
export function repairJson(fragment: string): Rec | null {
  if (!fragment.trim()) return null
  try {
    return asRecord(JSON.parse(fragment))
  } catch {
    // Le cas nominal pendant la frappe : on répare plus bas.
  }

  const stack: Level[] = []
  // Le plus long préfixe qu'il suffit de refermer pour obtenir du JSON valide,
  // et l'état de la pile à cet endroit-là.
  let safe = 0
  let safeStack: Level[] = []
  function mark(at: number): void {
    safe = at
    safeStack = stack.map((l) => ({ ...l }))
  }

  let inString = false
  let escaped = false
  /** La chaîne en cours est-elle une clé ? Une clé tronquée se jette. */
  let keyString = false

  for (let i = 0; i < fragment.length; i++) {
    const ch = fragment[i]

    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') {
        inString = false
        if (!keyString) mark(i + 1)
      }
      continue
    }

    const top = stack[stack.length - 1]
    if (ch === '"') {
      inString = true
      escaped = false
      keyString = top?.expectKey === true
    } else if (ch === '{' || ch === '[') {
      stack.push({ close: ch === '{' ? '}' : ']', expectKey: ch === '{' })
      // Un conteneur qu'on vient d'ouvrir est déjà refermable : `{` donne `{}`.
      mark(i + 1)
    } else if (ch === '}' || ch === ']') {
      stack.pop()
      mark(i + 1)
    } else if (ch === ':') {
      if (top) top.expectKey = false
    } else if (ch === ',') {
      if (top) top.expectKey = top.close === '}'
    }
  }

  // Une valeur textuelle en cours : on la garde et on la ferme ici même.
  // `escaped` en suspens veut dire qu'on s'est arrêté sur l'antislash d'une
  // séquence d'échappement — le retrancher évite de clore sur `\"`.
  let patched: string
  let closing: Level[]
  if (inString && !keyString) {
    patched = (escaped ? fragment.slice(0, -1) : fragment) + '"'
    closing = stack
  } else {
    patched = fragment.slice(0, safe)
    closing = safeStack
  }

  for (let i = closing.length - 1; i >= 0; i--) patched += closing[i]!.close

  try {
    return asRecord(JSON.parse(patched))
  } catch {
    return null
  }
}
