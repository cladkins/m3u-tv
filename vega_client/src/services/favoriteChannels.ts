import { LiveStream } from '../api/types';
import { XtreamClient } from '../api/xtream';
import { CatalogCache } from './catalog';
import { readJson, writeJson } from './storage';

function storageKey(client: XtreamClient): string {
  const { server, username } = client.credentials;
  return `m3ue_fav_channels:${server}|${username}`;
}

function slim(channel: LiveStream): LiveStream {
  return {
    stream_id: Number(channel.stream_id),
    name: channel.name,
    stream_icon: channel.stream_icon,
    category_id: channel.category_id,
    epg_channel_id: channel.epg_channel_id,
    num: channel.num,
  };
}

// The server stores favorites as bare stream ids, and the only endpoint that
// turns an id into a channel is the full channel list, which is large enough
// to stall a Fire TV Stick while it downloads and parses. Favorites are
// therefore resolved from what the app already knows: a small copy saved on
// the device, then channels seen this session. The full list is fetched only
// for ids that neither source has (a favorite added on another device).
export async function resolveFavoriteChannels(
  client: XtreamClient,
  catalog: CatalogCache,
  ids: Set<number>,
  onPartial?: (channels: LiveStream[]) => void,
): Promise<LiveStream[]> {
  if (ids.size === 0) return [];
  const key = storageKey(client);
  const saved = (await readJson<LiveStream[]>(key)) ?? [];
  const byId = new Map<number, LiveStream>();
  for (const channel of saved) byId.set(Number(channel.stream_id), channel);

  const found: LiveStream[] = [];
  const missing: number[] = [];
  for (const id of ids) {
    const channel = catalog.knownLive(id) ?? byId.get(id);
    if (channel) found.push(channel);
    else missing.push(id);
  }

  let result = found;
  if (missing.length > 0) {
    if (found.length > 0) onPartial?.(found);
    const all = await catalog.liveStreams();
    result = all.filter((channel) => ids.has(Number(channel.stream_id)));
  }
  result = [...result].sort((a, b) => a.name.localeCompare(b.name));
  writeJson(key, result.map(slim));
  return result;
}
