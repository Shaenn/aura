// Une file asynchrone à un seul consommateur : le pont entre les requêtes HTTP
// qui poussent des prompts et l'itérable que le SDK consomme.
//
// L'entrée streamée du SDK veut un `AsyncIterable` qui reste ouvert entre les
// tours. Une requête `POST /send` ne peut pas le nourrir directement — elle ne
// vit que le temps de sa réponse. Cette file les découple : `push` rend la main
// tout de suite, `[Symbol.asyncIterator]` attend.

/** Un seul consommateur : le `for await` du SDK. Pousser depuis n'importe où. */
export class AsyncQueue<T> {
  private readonly items: T[] = []
  private waiting: ((value: IteratorResult<T>) => void) | null = null
  private closed = false

  push(item: T): void {
    if (this.closed) return
    // Un consommateur déjà en attente reçoit directement : ne pas passer par le
    // tableau évite un tour de boucle d'événements par message.
    if (this.waiting) {
      const resolve = this.waiting
      this.waiting = null
      resolve({ value: item, done: false })
      return
    }
    this.items.push(item)
  }

  /** Ferme la file : le `for await` du SDK se termine, donc le tour aussi. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.release()
  }

  /**
   * Le consommateur est parti, mais la file continue.
   *
   * C'est le cas quand la boucle du SDK meurt : elle ne referme pas l'itérateur
   * qu'elle tenait, et il restait donc inscrit comme destinataire du prochain
   * `push`. Le prompt de la relance lui était remis, dans un générateur que plus
   * personne ne tirait — le message ne partait jamais et la session restait « au
   * travail » pour toujours. Le dénouer rend la place au consommateur suivant,
   * et ce qui arrive ensuite l'attend dans le tableau.
   *
   * À la différence de `close`, la file reste ouverte : c'est tout l'objet.
   */
  abandon(): void {
    this.release()
  }

  /** Dénoue l'attente en cours, s'il y en a une. */
  private release(): void {
    if (!this.waiting) return
    const resolve = this.waiting
    this.waiting = null
    resolve({ value: undefined as never, done: true })
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    for (;;) {
      const buffered = this.items.shift()
      if (buffered !== undefined) {
        yield buffered
        continue
      }
      if (this.closed) return
      const next = await new Promise<IteratorResult<T>>((resolve) => {
        this.waiting = resolve
      })
      if (next.done) return
      yield next.value
    }
  }
}
