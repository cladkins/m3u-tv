import type AsyncStorageStatic from '@react-native-async-storage/async-storage';
import { safeRequire } from '../utils/safeRequire';

export const StorageKeys = {
  credentials: 'm3ue_tv_credentials',
  activeViewer: 'm3ue_tv_active_viewer',
  lastLiveCategory: 'm3ue_last_category',
} as const;

type Store = Pick<typeof AsyncStorageStatic, 'getItem' | 'setItem' | 'removeItem'>;

const memory = new Map<string, string>();
const memoryStore: Store = {
  getItem: async (key: string) => memory.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: async (key: string) => {
    memory.delete(key);
  },
};

let store: Store | null = null;

// Vega links this package name (an npm alias of Amazon's port, see
// package.json) to the copy built into the OS. The module throws on load when
// its native half isn't linked, so it is required lazily and the app falls
// back to session-only memory instead of failing to start. safeRequire keeps
// that load failure from being reported as fatal.
function getStore(): Store {
  if (store) return store;
  try {
    const loaded = safeRequire(() => require('@react-native-async-storage/async-storage'));
    store = (loaded.default ?? loaded) as Store;
    console.log('M3UTV storage: persistent storage ready');
  } catch (e) {
    console.warn(`M3UTV storage unavailable, settings won't persist: ${e instanceof Error ? e.message : e}`);
    store = memoryStore;
  }
  return store;
}

export function isPersistent(): boolean {
  return getStore() !== memoryStore;
}

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await getStore().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await getStore().setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: settings fall back to defaults next launch.
  }
}

export async function remove(key: string): Promise<void> {
  try {
    await getStore().removeItem(key);
  } catch {
    // ignore
  }
}
