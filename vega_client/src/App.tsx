import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTVEventHandler } from '@amazon-devices/react-native-kepler';
import { Loading } from './components/common';
import { Sidebar } from './components/Sidebar';
import { handleRemoteEvent } from './navigation/longPress';
import { RouterProvider, ScreenKeyProvider, StackRoute, TabName, useRouter } from './navigation/Router';
import { GuideScreen } from './screens/GuideScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LiveTVScreen } from './screens/LiveTVScreen';
import { LoginScreen } from './screens/LoginScreen';
import { MovieDetailsScreen } from './screens/MovieDetailsScreen';
import { MoviesScreen, SeriesScreen } from './screens/BrowseScreens';
import { PlayerScreen } from './screens/PlayerScreen';
import { SearchScreen } from './screens/SearchScreen';
import { SeriesDetailsScreen } from './screens/SeriesDetailsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AppProvider, useApp } from './state/AppContext';
import { colors } from './theme';

function TabScreen({ tab }: { tab: TabName }) {
  switch (tab) {
    case 'home':
      return <HomeScreen />;
    case 'live':
      return <LiveTVScreen />;
    case 'guide':
      return <GuideScreen />;
    case 'movies':
      return <MoviesScreen />;
    case 'series':
      return <SeriesScreen />;
    case 'search':
      return <SearchScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}

function StackScreen({ route }: { route: StackRoute }) {
  switch (route.name) {
    case 'movie':
      return <MovieDetailsScreen movie={route.movie} />;
    case 'series':
      return <SeriesDetailsScreen series={route.series} />;
    case 'player':
      return <PlayerScreen request={route.request} />;
  }
}

// Screens under the top of the stack stay mounted (display: none) so Back
// returns to them with their scroll position and loaded data intact. The
// player never stays mounted underneath anything: it always sits on top.
function Shell() {
  const { tab, stack } = useRouter();
  const top = stack.length - 1;
  return (
    <View style={styles.fill}>
      <View style={[styles.shell, top >= 0 && styles.hidden]}>
        <ScreenKeyProvider screenKey="sidebar">
          <Sidebar />
        </ScreenKeyProvider>
        <View style={styles.content}>
          <ScreenKeyProvider key={tab} screenKey={`tab:${tab}`}>
            <TabScreen tab={tab} />
          </ScreenKeyProvider>
        </View>
      </View>
      {stack.map((entry, index) => (
        <View key={entry.key} style={[styles.stackLayer, index !== top && styles.hidden]}>
          <ScreenKeyProvider screenKey={entry.key}>
            <StackScreen route={entry.route} />
          </ScreenKeyProvider>
        </View>
      ))}
    </View>
  );
}

function Root() {
  const { status } = useApp();
  useTVEventHandler(handleRemoteEvent);
  if (status === 'booting') return <Loading />;
  if (status === 'signedOut') return <LoginScreen />;
  return <Shell />;
}

export function App() {
  return (
    <View style={styles.app}>
      <AppProvider>
        <RouterProvider>
          <Root />
        </RouterProvider>
      </AppProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  shell: { flex: 1, flexDirection: 'row' },
  content: { flex: 1 },
  stackLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.background },
  hidden: { display: 'none' },
});
