import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LiveStream, Progress } from '../api/types';
import { Loading } from '../components/common';
import { HorizontalRow } from '../components/HorizontalRow';
import { PosterCard } from '../components/PosterCard';
import { strings } from '../i18n/strings';
import { useRouter } from '../navigation/Router';
import { resolveFavoriteChannels } from '../services/favoriteChannels';
import { useApp, useSession } from '../state/AppContext';
import { colors, fontSize, s, spacing } from '../theme';

const CARD_WIDTH = s(360);
const CHANNEL_WIDTH = s(240);

export function HomeScreen() {
  const { client, catalog } = useSession();
  const { activeViewer, favorites, liveCategories } = useApp();
  const { push } = useRouter();
  const [recent, setRecent] = useState<Progress[]>([]);
  const [channels, setChannels] = useState<LiveStream[]>([]);
  const [firstCategory, setFirstCategory] = useState<LiveStream[]>([]);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!activeViewer) return;
    let cancelled = false;
    client
      .getRecentlyWatched(activeViewer.ulid, 20)
      .then((list) => {
        if (!cancelled) setRecent(list.filter((p) => p.content_type === 'vod' || p.content_type === 'episode'));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, activeViewer]);

  useEffect(() => {
    let cancelled = false;
    resolveFavoriteChannels(client, catalog, favorites.live, (partial) => {
      if (!cancelled) setChannels(partial);
    })
      .then((list) => {
        if (!cancelled) setChannels(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, catalog, favorites.live]);

  useEffect(() => {
    const first = liveCategories[0];
    if (!first) {
      setSettled(true);
      return;
    }
    let cancelled = false;
    catalog
      .liveStreams(first.category_id)
      .then((list) => {
        if (!cancelled) setFirstCategory(list.slice(0, 30));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [catalog, liveCategories]);

  const openProgress = useCallback(
    (item: Progress) => {
      const startPosition = item.up_next ? 0 : item.position_seconds;
      if (item.content_type === 'vod') {
        push({
          name: 'movie',
          movie: { stream_id: item.stream_id, name: item.title ?? '', stream_icon: item.thumbnail_url ?? undefined },
        });
        return;
      }
      push({
        name: 'player',
        request: {
          type: 'episode',
          streamId: item.stream_id,
          title: item.episode_title ?? item.title ?? '',
          subtitle: item.series_name ?? undefined,
          seriesId: item.series_id ?? undefined,
          seriesName: item.series_name ?? undefined,
          seasonNumber: item.season_number ?? undefined,
          episodeNumber: item.episode_number ?? undefined,
          thumbnail: item.thumbnail_url ?? undefined,
          startPosition,
        },
      });
    },
    [push],
  );

  const playChannel = useCallback(
    (channel: LiveStream, list: LiveStream[]) =>
      push({
        name: 'player',
        request: {
          type: 'live',
          streamId: channel.stream_id,
          title: channel.name,
          thumbnail: channel.stream_icon,
          channels: list,
        },
      }),
    [push],
  );

  const recentSubtitle = useCallback((item: Progress) => {
    if (item.up_next) return strings.homeUpNext;
    if (item.content_type === 'episode' && item.season_number && item.episode_number) {
      return `${strings.detailsEpisodeShort(item.season_number, item.episode_number)} · ${item.episode_title ?? ''}`;
    }
    return undefined;
  }, []);

  const isEmpty = useMemo(
    () => recent.length === 0 && channels.length === 0 && firstCategory.length === 0,
    [recent, channels, firstCategory],
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>{strings.navHome}</Text>
      {isEmpty && !settled ? (
        <View style={styles.loading}>
          <Loading />
        </View>
      ) : null}
      {isEmpty && settled ? <Text style={styles.empty}>{strings.homeEmpty}</Text> : null}
      <HorizontalRow
        title={strings.homeContinueWatching}
        data={recent}
        keyOf={(item) => `${item.content_type}:${item.stream_id}`}
        renderItem={(item, index) => (
          <PosterCard
            title={item.series_name ?? item.title ?? ''}
            subtitle={recentSubtitle(item)}
            image={item.backdrop_url ?? item.thumbnail_url ?? undefined}
            aspect="landscape"
            width={CARD_WIDTH}
            hasTVPreferredFocus={index === 0}
            progress={
              item.duration_seconds && !item.up_next ? item.position_seconds / item.duration_seconds : undefined
            }
            onPress={() => openProgress(item)}
          />
        )}
      />
      <HorizontalRow
        title={strings.homeFavoriteChannels}
        data={channels}
        keyOf={(item) => String(item.stream_id)}
        renderItem={(item, index) => (
          <PosterCard
            title={item.name}
            image={item.stream_icon}
            aspect="logo"
            width={CHANNEL_WIDTH}
            hasTVPreferredFocus={recent.length === 0 && index === 0}
            onPress={() => playChannel(item, channels)}
          />
        )}
      />
      <HorizontalRow
        title={liveCategories[0]?.category_name ?? strings.homeLiveNow}
        data={firstCategory}
        keyOf={(item) => String(item.stream_id)}
        renderItem={(item, index) => (
          <PosterCard
            title={item.name}
            image={item.stream_icon}
            aspect="logo"
            width={CHANNEL_WIDTH}
            hasTVPreferredFocus={recent.length === 0 && channels.length === 0 && index === 0}
            onPress={() => playChannel(item, firstCategory)}
          />
        )}
      />
      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.safeVertical },
  heading: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  loading: { height: s(400) },
  empty: { color: colors.textSecondary, fontSize: fontSize.md, paddingHorizontal: spacing.lg },
  bottomSpace: { height: s(80) },
});
