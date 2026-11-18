// Vega maps this package name (an npm alias of Amazon's port) to the copy
// built into the OS. Importing the @amazon-devices name directly bundles a
// second copy that can't reach the native module and throws on load.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const StorageKeys = {
  credentials: 'm3ue_tv_credentials',
  activeViewer: 'm3ue_tv_active_viewer',
  lastLiveCategory: 'm3ue_last_category',
} as const;

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: settings fall back to defaults next launch.
  }
}

export async function remove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}
