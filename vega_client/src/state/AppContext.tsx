import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { XtreamClient } from '../api/xtream';
import { AuthResponse, Category, Credentials, FavoriteContentType, ProgressUpdate, Viewer } from '../api/types';
import { CatalogCache } from '../services/catalog';
import { EpgStore } from '../services/epg';
import { readJson, remove, StorageKeys, writeJson } from '../services/storage';

type Status = 'booting' | 'signedOut' | 'ready';

type FavoriteSets = Record<FavoriteContentType, Set<number>>;

interface Session {
  client: XtreamClient;
  catalog: CatalogCache;
  epg: EpgStore;
  auth: AuthResponse;
}

interface AppContextValue {
  status: Status;
  session: Session | null;
  liveCategories: Category[];
  vodCategories: Category[];
  seriesCategories: Category[];
  viewers: Viewer[];
  activeViewer: Viewer | null;
  favorites: FavoriteSets;
  signIn: (credentials: Credentials) => Promise<void>;
  signOut: () => Promise<void>;
  selectViewer: (viewer: Viewer) => Promise<void>;
  toggleFavorite: (type: FavoriteContentType, streamId: number) => Promise<void>;
  reportProgress: (update: ProgressUpdate) => Promise<void>;
  refreshCatalog: () => Promise<void>;
}

const emptyFavorites = (): FavoriteSets => ({ live: new Set(), vod: new Set(), series: new Set() });

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('booting');
  const [session, setSession] = useState<Session | null>(null);
  const [liveCategories, setLiveCategories] = useState<Category[]>([]);
  const [vodCategories, setVodCategories] = useState<Category[]>([]);
  const [seriesCategories, setSeriesCategories] = useState<Category[]>([]);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [activeViewer, setActiveViewer] = useState<Viewer | null>(null);
  const [favorites, setFavorites] = useState<FavoriteSets>(emptyFavorites);
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;

  const loadFavorites = useCallback(async (client: XtreamClient, viewer: Viewer | null) => {
    if (!viewer) {
      setFavorites(emptyFavorites());
      return;
    }
    try {
      const list = await client.getFavorites(viewer.ulid);
      const next = emptyFavorites();
      for (const fav of list) {
        const type = fav.content_type as FavoriteContentType;
        if (type in next) next[type].add(Number(fav.stream_id));
      }
      setFavorites(next);
    } catch {
      setFavorites(emptyFavorites());
    }
  }, []);

  const loadCategories = useCallback(async (client: XtreamClient) => {
    const [live, vod, series] = await Promise.all([
      client.getLiveCategories(),
      client.getVodCategories(),
      client.getSeriesCategories(),
    ]);
    setLiveCategories(live);
    setVodCategories(vod);
    setSeriesCategories(series);
  }, []);

  const loadViewers = useCallback(
    async (client: XtreamClient) => {
      let list: Viewer[] = [];
      try {
        list = await client.getViewers();
      } catch {
        list = [];
      }
      const savedUlid = await readJson<string>(StorageKeys.activeViewer);
      const viewer =
        list.find((v) => v.ulid === savedUlid) ?? list.find((v) => v.is_admin) ?? list[0] ?? null;
      setViewers(list);
      setActiveViewer(viewer);
      if (viewer) await writeJson(StorageKeys.activeViewer, viewer.ulid);
      await loadFavorites(client, viewer);
    },
    [loadFavorites],
  );

  const signIn = useCallback(
    async (credentials: Credentials) => {
      const client = new XtreamClient(credentials);
      const auth = await client.authenticate();
      const proxy = auth.m3u_editor?.proxy;
      console.log(
        `M3UTV server: m3u-editor ${auth.m3u_editor?.version ?? '?'}, proxy forced=${!!proxy?.forced}, profiles=${
          (proxy?.profiles ?? []).map((p) => `${p.id}:${p.name}(${p.format ?? '?'})`).join(', ') || 'none'
        }`,
      );
      await loadCategories(client);
      await writeJson(StorageKeys.credentials, client.credentials);
      setSession({ client, catalog: new CatalogCache(client), epg: new EpgStore(client), auth });
      setStatus('ready');
      loadViewers(client).catch(() => undefined);
    },
    [loadCategories, loadViewers],
  );

  const signOut = useCallback(async () => {
    await remove(StorageKeys.credentials);
    await remove(StorageKeys.activeViewer);
    setSession(null);
    setViewers([]);
    setActiveViewer(null);
    setFavorites(emptyFavorites());
    setLiveCategories([]);
    setVodCategories([]);
    setSeriesCategories([]);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await readJson<Credentials>(StorageKeys.credentials);
      if (!saved) {
        if (!cancelled) setStatus('signedOut');
        return;
      }
      try {
        await signIn(saved);
      } catch {
        // Keep the saved login so a temporarily offline server doesn't sign
        // the user out; the sign-in screen prefills from it.
        if (!cancelled) setStatus('signedOut');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signIn]);

  const selectViewer = useCallback(
    async (viewer: Viewer) => {
      setActiveViewer(viewer);
      await writeJson(StorageKeys.activeViewer, viewer.ulid);
      if (session) await loadFavorites(session.client, viewer);
    },
    [session, loadFavorites],
  );

  const toggleFavorite = useCallback(
    async (type: FavoriteContentType, streamId: number) => {
      if (!session || !activeViewer) return;
      const wasFavorite = favoritesRef.current[type].has(streamId);
      const apply = (favorited: boolean) =>
        setFavorites((prev) => {
          const set = new Set(prev[type]);
          if (favorited) set.add(streamId);
          else set.delete(streamId);
          return { ...prev, [type]: set };
        });
      apply(!wasFavorite);
      try {
        await session.client.toggleFavorite(activeViewer.ulid, type, streamId, !wasFavorite);
      } catch {
        apply(wasFavorite);
      }
    },
    [session, activeViewer],
  );

  const reportProgress = useCallback(
    async (update: ProgressUpdate) => {
      if (!session || !activeViewer) return;
      try {
        await session.client.updateProgress(activeViewer.ulid, update);
      } catch {
        // Progress is best effort; the next report carries the latest position.
      }
    },
    [session, activeViewer],
  );

  const refreshCatalog = useCallback(async () => {
    if (!session) return;
    session.catalog.clear();
    await loadCategories(session.client);
  }, [session, loadCategories]);

  const value = useMemo<AppContextValue>(
    () => ({
      status,
      session,
      liveCategories,
      vodCategories,
      seriesCategories,
      viewers,
      activeViewer,
      favorites,
      signIn,
      signOut,
      selectViewer,
      toggleFavorite,
      reportProgress,
      refreshCatalog,
    }),
    [
      status,
      session,
      liveCategories,
      vodCategories,
      seriesCategories,
      viewers,
      activeViewer,
      favorites,
      signIn,
      signOut,
      selectViewer,
      toggleFavorite,
      reportProgress,
      refreshCatalog,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function useSession(): Session {
  const { session } = useApp();
  if (!session) throw new Error('No active session');
  return session;
}
