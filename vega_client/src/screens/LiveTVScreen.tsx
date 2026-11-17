import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, View, ViewToken } from 'react-native';
import { LiveStream } from '../api/types';
import { CategoryBar, CategoryOption } from '../components/CategoryBar';
import { EmptyState, Loading, ProgressBar } from '../components/common';
import { Focusable } from '../components/Focusable';
import { strings } from '../i18n/strings';
import { useRouter } from '../navigation/Router';
import { NowNext } from '../services/epg';
import { readJson, StorageKeys, writeJson } from '../services/storage';
import { useApp, useSession } from '../state/AppContext';
import { colors, fontSize, s, spacing } from '../theme';
import { formatClock } from '../utils/text';

const FAVORITES_ID = '__favorites__';
const ALL_ID = '__all__';
const ROW_HEIGHT = s(112);
const ROW_GAP = s(10);

export function LiveTVScreen() {
  const { catalog, epg } = useSession();
  const { liveCategories, favorites, toggleFavorite } = useApp();
  const { push } = useRouter();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [channels, setChannels] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [epgVersion, setEpgVersion] = useState(0);

  const options = useMemo<CategoryOption[]>(
    () => [
      { id: FAVORITES_ID, name: `★ ${strings.favorites}` },
      { id: ALL_ID, name: strings.all },
      ...liveCategories.map((c) => ({ id: String(c.category_id), name: c.category_name })),
    ],
    [liveCategories],
  );

  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    readJson<string>(StorageKeys.lastLiveCategory).then((saved) => {
      const valid = saved && options.some((o) => o.id === saved);
      setCategoryId(valid ? saved : liveCategories[0] ? String(liveCategories[0].category_id) : ALL_ID);
    });
  }, [options, liveCategories]);

  // Favorite toggles only reload the list while the favorites view is open.
  const favoriteFilter = categoryId === FAVORITES_ID ? favorites.live : null;

  const load = useCallback(async () => {
    if (categoryId === null) return;
    setLoading(true);
    setError(null);
    try {
      if (favoriteFilter) {
        const all = await catalog.liveStreams();
        setChannels(all.filter((c) => favoriteFilter.has(c.stream_id)));
      } else {
        setChannels(await catalog.liveStreams(categoryId === ALL_ID ? undefined : categoryId));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [catalog, categoryId, favoriteFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const selectCategory = useCallback((id: string) => {
    setCategoryId(id);
    writeJson(StorageKeys.lastLiveCategory, id);
  }, []);

  // EPG loads for rows as they scroll into view, in one batch per change.
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const ids = viewableItems.map((v) => (v.item as LiveStream).stream_id);
    if (ids.length === 0) return;
    epg.load(ids).then(() => setEpgVersion((n) => n + 1));
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10, minimumViewTime: 250 }).current;

  useEffect(() => {
    const interval = setInterval(() => setEpgVersion((n) => n + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const play = useCallback(
    (channel: LiveStream) =>
      push({
        name: 'player',
        request: {
          type: 'live',
          streamId: channel.stream_id,
          title: channel.name,
          thumbnail: channel.stream_icon,
          channels,
        },
      }),
    [push, channels],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: LiveStream; index: number }) => (
      <ChannelRow
        channel={item}
        nowNext={epg.nowNext(item.stream_id)}
        favorite={favorites.live.has(item.stream_id)}
        preferred={index === 0}
        onPress={play}
        onLongPress={(c) => toggleFavorite('live', c.stream_id)}
      />
    ),
    // epgVersion is a dependency so rows re-read the guide when new data lands.
    [epg, favorites.live, play, toggleFavorite, epgVersion],
  );

  return (
    <View style={styles.root}>
      <CategoryBar options={options} selectedId={categoryId ?? ''} onSelect={selectCategory} />
      {loading ? (
        <Loading />
      ) : error ? (
        <EmptyState message={error} onRetry={load} />
      ) : channels.length === 0 ? (
        <EmptyState message={strings.noItems} />
      ) : (
        <FlatList
          data={channels}
          extraData={epgVersion}
          keyExtractor={(item) => String(item.stream_id)}
          renderItem={renderItem}
          getItemLayout={(_, index) => ({
            length: ROW_HEIGHT + ROW_GAP,
            offset: (ROW_HEIGHT + ROW_GAP) * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

interface ChannelRowProps {
  channel: LiveStream;
  nowNext: NowNext | null;
  favorite: boolean;
  preferred: boolean;
  onPress: (channel: LiveStream) => void;
  onLongPress: (channel: LiveStream) => void;
}

const ChannelRow = memo(function ChannelRow({
  channel,
  nowNext,
  favorite,
  preferred,
  onPress,
  onLongPress,
}: ChannelRowProps) {
  return (
    <Focusable
      onPress={() => onPress(channel)}
      onLongPress={() => onLongPress(channel)}
      hasTVPreferredFocus={preferred}
      style={(focused) => [styles.row, focused && styles.rowFocused]}
    >
      {(focused) => (
        <View style={styles.rowInner}>
          <View style={styles.logoBox}>
            {channel.stream_icon ? (
              <Image source={{ uri: channel.stream_icon }} style={styles.logo} resizeMode="contain" />
            ) : null}
          </View>
          <View style={styles.info}>
            <Text style={[styles.name, focused && styles.nameFocused]} numberOfLines={1}>
              {channel.num ? `${channel.num}  ` : ''}
              {channel.name}
              {favorite ? '  ★' : ''}
            </Text>
            {nowNext ? (
              <>
                <Text style={styles.now} numberOfLines={1}>
                  {formatClock(nowNext.current.start)}  {nowNext.current.title}
                </Text>
                <ProgressBar value={nowNext.progress} height={s(4)} />
              </>
            ) : (
              <Text style={styles.noEpg}>{strings.noProgramInfo}</Text>
            )}
          </View>
          {nowNext?.next ? (
            <View style={styles.next}>
              <Text style={styles.nextLabel}>{strings.next}</Text>
              <Text style={styles.nextTitle} numberOfLines={2}>
                {formatClock(nowNext.next.start)} {nowNext.next.title}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </Focusable>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: spacing.md },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: s(80) },
  row: {
    height: ROW_HEIGHT,
    marginBottom: ROW_GAP,
    backgroundColor: colors.card,
    borderRadius: s(14),
    borderWidth: s(3),
    borderColor: 'transparent',
  },
  rowFocused: { borderColor: colors.primary, backgroundColor: colors.cardElevated },
  rowInner: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.md },
  logoBox: {
    width: s(120),
    height: s(80),
    borderRadius: s(10),
    backgroundColor: colors.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: '85%', height: '85%' },
  info: { flex: 1, gap: s(6) },
  name: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  nameFocused: { color: colors.text },
  now: { color: colors.textSecondary, fontSize: fontSize.sm },
  noEpg: { color: colors.textTertiary, fontSize: fontSize.sm, fontStyle: 'italic' },
  next: { width: s(360), alignItems: 'flex-end', gap: s(2) },
  nextLabel: { color: colors.textTertiary, fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase' },
  nextTitle: { color: colors.textSecondary, fontSize: fontSize.xs, textAlign: 'right' },
});
