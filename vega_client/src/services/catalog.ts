import { XtreamClient } from '../api/xtream';
import { LiveStream, Series, SeriesInfo, VodInfo, VodStream } from '../api/types';

const TTL_MS = 30 * 60 * 1000;

interface Entry<T> {
  at: number;
  promise: Promise<T>;
}

// Per-session memo over the catalog endpoints. Lists are fetched per category
// so a large library never has to sit in memory all at once; search is the
// one caller that asks for everything.
export class CatalogCache {
  private entries = new Map<string, Entry<unknown>>();

  constructor(private readonly client: XtreamClient) {}

  private memo<T>(key: string, load: () => Promise<T>, force = false): Promise<T> {
    const existing = this.entries.get(key) as Entry<T> | undefined;
    if (!force && existing && Date.now() - existing.at < TTL_MS) return existing.promise;
    const promise = load();
    this.entries.set(key, { at: Date.now(), promise });
    promise.catch(() => {
      if (this.entries.get(key)?.promise === promise) this.entries.delete(key);
    });
    return promise;
  }

  liveStreams(categoryId?: string, force = false): Promise<LiveStream[]> {
    return this.memo(`live:${categoryId ?? '*'}`, () => this.client.getLiveStreams(categoryId), force);
  }

  vodStreams(categoryId?: string, force = false): Promise<VodStream[]> {
    return this.memo(`vod:${categoryId ?? '*'}`, () => this.client.getVodStreams(categoryId), force);
  }

  series(categoryId?: string, force = false): Promise<Series[]> {
    return this.memo(`series:${categoryId ?? '*'}`, () => this.client.getSeries(categoryId), force);
  }

  vodInfo(vodId: number): Promise<VodInfo> {
    return this.memo(`vodInfo:${vodId}`, () => this.client.getVodInfo(vodId));
  }

  seriesInfo(seriesId: number): Promise<SeriesInfo> {
    return this.memo(`seriesInfo:${seriesId}`, () => this.client.getSeriesInfo(seriesId));
  }

  clear(): void {
    this.entries.clear();
  }
}
