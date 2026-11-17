import { XtreamClient } from '../api/xtream';
import { Programme } from '../api/types';

const FRESH_MS = 30 * 60 * 1000;

export interface NowNext {
  current: Programme;
  next: Programme | null;
  progress: number;
}

export class EpgStore {
  private programmes = new Map<number, Programme[]>();
  private fetchedAt = new Map<number, number>();
  private inFlight = new Map<number, Promise<void>>();

  constructor(private readonly client: XtreamClient) {}

  private isFresh(id: number): boolean {
    const t = this.fetchedAt.get(id);
    return t !== undefined && Date.now() - t < FRESH_MS;
  }

  async load(streamIds: number[]): Promise<void> {
    const waits: Promise<void>[] = [];
    const missing: number[] = [];
    for (const id of streamIds) {
      const pending = this.inFlight.get(id);
      if (pending) waits.push(pending);
      else if (!this.isFresh(id)) missing.push(id);
    }
    if (missing.length > 0) {
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
      const job = this.client
        .getEpgBatch(missing, [yesterday, today])
        .then((result) => {
          const now = Date.now();
          for (const id of missing) {
            this.programmes.set(id, result.get(id) ?? []);
            this.fetchedAt.set(id, now);
          }
        })
        .catch(() => {
          const now = Date.now();
          for (const id of missing) this.fetchedAt.set(id, now);
        })
        .finally(() => {
          for (const id of missing) this.inFlight.delete(id);
        });
      for (const id of missing) this.inFlight.set(id, job);
      waits.push(job);
    }
    await Promise.all(waits);
  }

  programmesFor(streamId: number): Programme[] {
    return this.programmes.get(streamId) ?? [];
  }

  nowNext(streamId: number, atSeconds = Date.now() / 1000): NowNext | null {
    const list = this.programmes.get(streamId);
    if (!list?.length) return null;
    const index = list.findIndex((p) => p.start <= atSeconds && p.end > atSeconds);
    if (index < 0) return null;
    const current = list[index];
    const progress = Math.min(1, Math.max(0, (atSeconds - current.start) / (current.end - current.start)));
    return { current, next: list[index + 1] ?? null, progress };
  }

  async refreshOne(streamId: number): Promise<NowNext | null> {
    if (!this.isFresh(streamId) || !this.nowNext(streamId)) {
      try {
        const listings = await this.client.getShortEpg(streamId, 4);
        if (listings.length > 0) {
          const merged = new Map<number, Programme>();
          for (const p of this.programmes.get(streamId) ?? []) merged.set(p.start, p);
          for (const p of listings) merged.set(p.start, p);
          this.programmes.set(
            streamId,
            [...merged.values()].sort((a, b) => a.start - b.start),
          );
        }
        this.fetchedAt.set(streamId, Date.now());
      } catch {
        // Keep whatever the batch load had.
      }
    }
    return this.nowNext(streamId);
  }
}
