/**
 * « Table des rendus en vol » (tâche 15, §9.2) : dédoublonne les requêtes
 * concurrentes pour la MÊME clé (un seul `sips` tourne, les autres attendent
 * le même résultat) et limite le nombre total de rendus simultanés — toutes
 * clés confondues — à un sémaphore fixe.
 */
export class InFlightRenders {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private running = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(private readonly concurrency: number) {}

  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing !== undefined) {
      return existing as Promise<T>;
    }

    const promise = this.execute(work).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  private async execute<T>(work: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await work();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.running < this.concurrency) {
      this.running++;
      return;
    }
    await new Promise<void>((resolve) => { this.waiters.push(resolve); });
    this.running++;
  }

  private release(): void {
    this.running--;
    const next = this.waiters.shift();
    if (next !== undefined) {
      next();
    }
  }
}
