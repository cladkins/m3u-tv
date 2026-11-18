import { CatalogCache } from '../src/services/catalog';
import { resolveFavoriteChannels } from '../src/services/favoriteChannels';
import { XtreamClient } from '../src/api/xtream';

jest.mock('../src/services/storage', () => {
  const data = new Map<string, unknown>();
  return {
    readJson: jest.fn(async (key: string) => data.get(key) ?? null),
    writeJson: jest.fn(async (key: string, value: unknown) => {
      data.set(key, value);
    }),
  };
});

const channel = (id: number, name: string) => ({ stream_id: id, name });

function setup(all: Array<{ stream_id: number; name: string }>) {
  const client = new XtreamClient({ server: 'tv.example.com', username: 'u', password: 'p' });
  const getLiveStreams = jest.fn(async (categoryId?: string) =>
    categoryId ? all.filter((c) => c.stream_id < 10) : all,
  );
  (client as unknown as { getLiveStreams: unknown }).getLiveStreams = getLiveStreams;
  return { client, catalog: new CatalogCache(client), getLiveStreams };
}

describe('resolveFavoriteChannels', () => {
  it('uses channels already loaded this session without the full list', async () => {
    const { client, catalog, getLiveStreams } = setup([channel(1, 'One'), channel(2, 'Two'), channel(50, 'Fifty')]);
    await catalog.liveStreams('sports');
    const result = await resolveFavoriteChannels(client, catalog, new Set([2]));
    expect(result.map((c) => c.name)).toEqual(['Two']);
    expect(getLiveStreams).toHaveBeenCalledTimes(1);
  });

  it('reads the saved copy on a later launch', async () => {
    const { client, catalog, getLiveStreams } = setup([channel(2, 'Two')]);
    const result = await resolveFavoriteChannels(client, catalog, new Set([2]));
    expect(result.map((c) => c.name)).toEqual(['Two']);
    expect(getLiveStreams).not.toHaveBeenCalled();
  });

  it('fetches the full list only for favorites it has never seen', async () => {
    const { client, catalog, getLiveStreams } = setup([channel(2, 'Two'), channel(50, 'Fifty')]);
    const partial = jest.fn();
    const result = await resolveFavoriteChannels(client, catalog, new Set([2, 50]), partial);
    expect(partial).toHaveBeenCalledWith([expect.objectContaining({ name: 'Two' })]);
    expect(result.map((c) => c.name)).toEqual(['Fifty', 'Two']);
    expect(getLiveStreams).toHaveBeenCalledWith(undefined);
  });
});
