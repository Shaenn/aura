// Qui est au bout du fil.
//
// Le serveur n'écoute que `127.0.0.1` (voir `index.ts`), si bien que la réponse
// est toujours « cette machine » : ce qui suit ne trie plus rien à l'usage.
//
// Ce n'est pas pour autant une garde à retirer. Elle porte l'intention des deux
// routes qui éteignent le processus ou tuent un `claude`, et elle sera le
// premier filet si l'écoute venait à s'ouvrir un jour. Ce qu'elle ne fait pas,
// en revanche, c'est protéger du navigateur : celui-ci *est* sur la machine, et
// ses requêtes arrivent bien de la boucle locale — c'est le rôle de `guard.ts`.

/**
 * L'adresse désigne-t-elle cette machine ?
 *
 * Trois écritures pour la même chose : IPv4, IPv6, et la forme mixte que Node
 * rend quand une socket IPv6 accepte une connexion IPv4. Le bloc `127.0.0.0/8`
 * en entier, car la boucle locale ne se limite pas à `127.0.0.1`.
 */
export function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  // `::ffff:127.0.0.1` — l'IPv4 déguisée en IPv6. On la déshabille avant de juger.
  const addr = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (addr === '::1') return true;
  const octets = addr.split('.');
  if (octets.length !== 4) return false;
  return (
    octets[0] === '127' &&
    octets.every((o) => o.length > 0 && o.length <= 3 && /^\d+$/.test(o) && Number(o) <= 255)
  );
}
