// Une promesse qui attend un humain.
//
// Le SDK suspend l'agent tant que `canUseTool` — ou notre outil de question —
// n'a pas rendu sa valeur. Or celle-ci vient d'une requête HTTP qui n'existe pas
// encore. On rend donc une promesse et on la garde ici, jusqu'à ce qu'un `POST`
// la dénoue.
//
// Avec un garde-fou : les demandes de permission n'ont **pas** d'échéance côté
// CLI. Un onglet fermé au mauvais moment laisserait sinon un processus `claude`
// suspendu pour toujours, invisible et vivant. L'échéance ne sert pas à presser
// l'utilisateur, elle sert à ce que rien ne reste en l'air.

export class PendingAnswer<T> {
  readonly promise: Promise<T>;
  private settleFn!: (value: T) => void;
  private timer: NodeJS.Timeout;
  private done = false;

  constructor(timeoutMs: number, onTimeout: () => T) {
    this.promise = new Promise<T>((resolve) => {
      this.settleFn = resolve;
    });
    this.timer = setTimeout(() => this.settle(onTimeout()), timeoutMs);
    // Une attente d'humain ne doit pas, à elle seule, retenir le processus.
    this.timer.unref?.();
  }

  /** Dénoue l'attente. Rend `false` si elle l'était déjà (double clic, timeout). */
  settle(value: T): boolean {
    if (this.done) return false;
    this.done = true;
    clearTimeout(this.timer);
    this.settleFn(value);
    return true;
  }

  get pending(): boolean {
    return !this.done;
  }
}
