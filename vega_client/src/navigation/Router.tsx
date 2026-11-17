import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { findNodeHandle, View } from 'react-native';
import { BackHandler, FocusManager } from '@amazon-devices/react-native-kepler';
import { PlayRequest, Series, VodStream } from '../api/types';

function focusView(view: View | null | undefined): boolean {
  const tag = view ? findNodeHandle(view) : null;
  if (tag === null) return false;
  try {
    FocusManager.focus(tag);
    return true;
  } catch {
    return false;
  }
}

export type TabName = 'home' | 'live' | 'guide' | 'movies' | 'series' | 'search' | 'settings';

export type StackRoute =
  | { name: 'movie'; movie: VodStream }
  | { name: 'series'; series: Series }
  | { name: 'player'; request: PlayRequest };

interface StackEntry {
  key: string;
  route: StackRoute;
}

type BackInterceptor = () => boolean;

interface RouterValue {
  tab: TabName;
  stack: StackEntry[];
  setTab: (tab: TabName) => void;
  push: (route: StackRoute) => void;
  replaceTop: (route: StackRoute) => void;
  pop: () => void;
  registerSidebarItem: (tab: TabName, view: View | null) => void;
  setSidebarFocused: (focused: boolean) => void;
  addBackInterceptor: (interceptor: BackInterceptor) => () => void;
  rememberFocus: (screenKey: string, view: View) => void;
}

const RouterContext = createContext<RouterValue | null>(null);
const ScreenKeyContext = createContext<string>('tab:home');

let entryCounter = 0;

export function RouterProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<TabName>('home');
  const [stack, setStack] = useState<StackEntry[]>([]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const sidebarItems = useRef(new Map<TabName, View | null>());
  const sidebarFocused = useRef(false);
  const interceptors = useRef<BackInterceptor[]>([]);
  const focusMemory = useRef(new Map<string, View>());

  const restoreFocus = useCallback((screenKey: string) => {
    const view = focusMemory.current.get(screenKey);
    if (!view) return;
    // Vega doesn't restore focus when a screen comes back; FocusManager calls
    // made in the same frame as the re-render can be dropped, so wait a tick.
    // If the remembered view unmounted, default focus applies.
    setTimeout(() => focusView(view), 60);
  }, []);

  const setTab = useCallback((next: TabName) => {
    setStack([]);
    setTabState(next);
  }, []);

  const push = useCallback((route: StackRoute) => {
    entryCounter += 1;
    setStack((prev) => [...prev, { key: `stack:${entryCounter}`, route }]);
  }, []);

  const replaceTop = useCallback((route: StackRoute) => {
    entryCounter += 1;
    setStack((prev) => [...prev.slice(0, -1), { key: `stack:${entryCounter}`, route }]);
  }, []);

  const pop = useCallback(() => {
    const current = stackRef.current;
    if (current.length === 0) return;
    const nextTop = current.length > 1 ? current[current.length - 2].key : `tab:${tabRef.current}`;
    setStack(current.slice(0, -1));
    restoreFocus(nextTop);
  }, [restoreFocus]);

  const focusSidebar = useCallback(() => {
    return focusView(sidebarItems.current.get(tabRef.current));
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const handlers = interceptors.current;
      for (let i = handlers.length - 1; i >= 0; i--) {
        if (handlers[i]()) return true;
      }
      if (stackRef.current.length > 0) {
        pop();
        return true;
      }
      if (!sidebarFocused.current && focusSidebar()) return true;
      if (tabRef.current !== 'home') {
        setTab('home');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [pop, setTab, focusSidebar]);

  const value = useMemo<RouterValue>(
    () => ({
      tab,
      stack,
      setTab,
      push,
      replaceTop,
      pop,
      registerSidebarItem: (name, view) => {
        sidebarItems.current.set(name, view);
      },
      setSidebarFocused: (focused) => {
        sidebarFocused.current = focused;
      },
      addBackInterceptor: (interceptor) => {
        interceptors.current.push(interceptor);
        return () => {
          interceptors.current = interceptors.current.filter((h) => h !== interceptor);
        };
      },
      rememberFocus: (screenKey, view) => {
        focusMemory.current.set(screenKey, view);
      },
    }),
    [tab, stack, setTab, push, replaceTop, pop],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside RouterProvider');
  return ctx;
}

export function ScreenKeyProvider({ screenKey, children }: { screenKey: string; children: ReactNode }) {
  return <ScreenKeyContext.Provider value={screenKey}>{children}</ScreenKeyContext.Provider>;
}

export function useScreenKey(): string {
  return useContext(ScreenKeyContext);
}

// Lets a screen consume Back before the router does (e.g. hide the player
// overlay, cancel pairing). Return true to swallow the press.
export function useBackInterceptor(handler: BackInterceptor, enabled = true) {
  const { addBackInterceptor } = useRouter();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!enabled) return undefined;
    return addBackInterceptor(() => handlerRef.current());
  }, [addBackInterceptor, enabled]);
}
