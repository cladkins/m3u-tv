import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, useWindowDimensions, View, ViewToken } from 'react-native';
import { LiveStream, Programme } from '../api/types';
import { CategoryBar, CategoryOption } from '../components/CategoryBar';
import { AppButton, EmptyState, Loading } from '../components/common';
import { Focusable } from '../components/Focusable';
import { SIDEBAR_WIDTH } from '../components/Sidebar';
import { strings } from '../i18n/strings';
import { useRouter } from '../navigation/Router';
import { EpgStore } from '../services/epg';
import { useApp, useSession } from '../state/AppContext';
import { colors, fontSize, s, spacing } from '../theme';
import { formatClock } from '../utils/text';

const WINDOW_MINUTES = 180;
const SHIFT_MINUTES = 120;
const ROW_HEIGHT = s(96);
const CHANNEL_COLUMN = s(300);
const SLOT_MINUTES = 30;

interface FocusedProgramme {
  channel: LiveStream;
  programme: Programme | null;
}

function windowStartFor(date: Date): number {
  const slot = SLOT_MINUTES * 60;
  return Math.floor(date.getTime() / 1000 / slot) * slot;
}

export function GuideScreen() {
  const { catalog, epg } = useSession();
  const { liveCategories } = useApp();
  const { push } = useRouter();
  const { width } = useWindowDimensions();
  const [categoryId, setCategoryId] = useState<string>(() =>
    liveCategories[0] ? String(liveCategories[0].category_id) : '',
  );
  const [channels, setChannels] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState(() => windowStartFor(new Date()));
  const [epgVersion, setEpgVersion] = useState(0);
  const [focused, setFocused] = useState<FocusedProgramme | null>(null);

  const options = useMemo<CategoryOption[]>(
    () => liveCategories.map((c) => ({ id: String(c.category_id), name: c.category_name })),
    [liveCategories],
  );

  const load = useCallback(async () => {
    if (!categoryId) return;
    setLoading(true);
    setError(null);
    try {
      setChannels(await catalog.liveStreams(categoryId));
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [catalog, categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const ids = viewableItems.map((v) => (v.item as LiveStream).stream_id);
    if (ids.length > 0) epg.load(ids).then(() => setEpgVersion((n) => n + 1));
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10, minimumViewTime: 250 }).current;

  const timelineWidth = width - SIDEBAR_WIDTH - CHANNEL_COLUMN - spacing.lg * 2;
  const pxPerSecond = timelineWidth / (WINDOW_MINUTES * 60);
  const windowEnd = windowStart + WINDOW_MINUTES * 60;

  const play = useCallback(
    (channel: LiveStream) =>
      push({
        name: 'player',
        request: { type: 'live', streamId: channel.stream_id, title: channel.name, thumbnail: channel.stream_icon, channels },
      }),
    [push, channels],
  );

  const onCellFocus = useCallback((channel: LiveStream, programme: Programme | null) => {
    setFocused({ channel, programme });
  }, []);

  const renderRow = useCallback(
    ({ item }: { item: LiveStream }) => (
      <GuideRow
        channel={item}
        epg={epg}
        windowStart={windowStart}
        windowEnd={windowEnd}
        pxPerSecond={pxPerSecond}
        onPress={play}
        onCellFocus={onCellFocus}
      />
    ),
    // epgVersion re-renders rows when new guide data lands.
    [epg, windowStart, windowEnd, pxPerSecond, play, onCellFocus, epgVersion],
  );

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = windowStart; t < windowEnd; t += SLOT_MINUTES * 60) out.push(t);
    return out;
  }, [windowStart, windowEnd]);

  const nowOffset = (Date.now() / 1000 - windowStart) * pxPerSecond;

  return (
    <View style={styles.root}>
      <CategoryBar options={options} selectedId={categoryId} onSelect={setCategoryId} />
      <View style={styles.infoPanel}>
        <View style={styles.infoText}>
          <Text style={styles.infoTitle} numberOfLines={1}>
            {focused?.programme?.title ?? focused?.channel.name ?? ''}
          </Text>
          {focused?.programme ? (
            <Text style={styles.infoMeta} numberOfLines={1}>
              {focused.channel.name} · {formatClock(focused.programme.start)} – {formatClock(focused.programme.end)}
            </Text>
          ) : null}
          {focused?.programme?.description ? (
            <Text style={styles.infoDescription} numberOfLines={2}>
              {focused.programme.description}
            </Text>
          ) : null}
        </View>
        <View style={styles.shiftButtons}>
          <AppButton label="◀" onPress={() => setWindowStart((t) => t - SHIFT_MINUTES * 60)} />
          <AppButton label={strings.guideNow} onPress={() => setWindowStart(windowStartFor(new Date()))} />
          <AppButton label="▶" onPress={() => setWindowStart((t) => t + SHIFT_MINUTES * 60)} />
        </View>
      </View>
      <View style={styles.timeHeader}>
        <View style={{ width: CHANNEL_COLUMN }} />
        <View style={[styles.ticks, { width: timelineWidth }]}>
          {ticks.map((t) => (
            <Text key={t} style={[styles.tick, { left: (t - windowStart) * pxPerSecond }]}>
              {formatClock(t)}
            </Text>
          ))}
        </View>
      </View>
      {loading ? (
        <Loading />
      ) : error ? (
        <EmptyState message={error} onRetry={load} />
      ) : channels.length === 0 ? (
        <EmptyState message={strings.noItems} />
      ) : (
        <View style={styles.gridWrap}>
          <FlatList
            data={channels}
            extraData={epgVersion}
            keyExtractor={(c) => String(c.stream_id)}
            renderItem={renderRow}
            getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            initialNumToRender={7}
            maxToRenderPerBatch={6}
            windowSize={5}
            removeClippedSubviews
            showsVerticalScrollIndicator={false}
          />
          {nowOffset > 0 && nowOffset < timelineWidth ? (
            <View pointerEvents="none" style={[styles.nowLine, { left: CHANNEL_COLUMN + nowOffset }]} />
          ) : null}
        </View>
      )}
    </View>
  );
}

interface GuideRowProps {
  channel: LiveStream;
  epg: EpgStore;
  windowStart: number;
  windowEnd: number;
  pxPerSecond: number;
  onPress: (channel: LiveStream) => void;
  onCellFocus: (channel: LiveStream, programme: Programme | null) => void;
}

const GuideRow = memo(function GuideRow({
  channel,
  epg,
  windowStart,
  windowEnd,
  pxPerSecond,
  onPress,
  onCellFocus,
}: GuideRowProps) {
  const programmes = epg.programmesFor(channel.stream_id).filter((p) => p.end > windowStart && p.start < windowEnd);
  const nowSeconds = Date.now() / 1000;
  return (
    <View style={styles.row}>
      <View style={styles.channelCell}>
        {channel.stream_icon ? (
          <Image source={{ uri: channel.stream_icon }} style={styles.channelLogo} resizeMode="contain" />
        ) : null}
        <Text style={styles.channelName} numberOfLines={2}>
          {channel.name}
        </Text>
      </View>
      <View style={styles.cells}>
        {programmes.length === 0 ? (
          <GuideCell
            label={strings.noProgramInfo}
            width={(windowEnd - windowStart) * pxPerSecond}
            left={0}
            live={false}
            onPress={() => onPress(channel)}
            onFocus={() => onCellFocus(channel, null)}
          />
        ) : (
          programmes.map((p) => {
            const start = Math.max(p.start, windowStart);
            const end = Math.min(p.end, windowEnd);
            return (
              <GuideCell
                key={p.start}
                label={p.title}
                width={(end - start) * pxPerSecond}
                left={(start - windowStart) * pxPerSecond}
                live={p.start <= nowSeconds && p.end > nowSeconds}
                onPress={() => onPress(channel)}
                onFocus={() => onCellFocus(channel, p)}
              />
            );
          })
        )}
      </View>
    </View>
  );
});

function GuideCell({
  label,
  width,
  left,
  live,
  onPress,
  onFocus,
}: {
  label: string;
  width: number;
  left: number;
  live: boolean;
  onPress: () => void;
  onFocus: () => void;
}) {
  return (
    <Focusable
      onPress={onPress}
      onFocus={onFocus}
      style={(focused) => [
        styles.cell,
        { left, width: Math.max(width - s(4), s(8)) },
        live && styles.cellLive,
        focused && styles.cellFocused,
      ]}
    >
      <Text style={styles.cellText} numberOfLines={2}>
        {label}
      </Text>
    </Focusable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: spacing.md },
  infoPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    minHeight: s(130),
    gap: spacing.lg,
  },
  infoText: { flex: 1, gap: s(4) },
  infoTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  infoMeta: { color: colors.textSecondary, fontSize: fontSize.sm },
  infoDescription: { color: colors.textTertiary, fontSize: fontSize.xs },
  shiftButtons: { flexDirection: 'row', gap: spacing.sm },
  timeHeader: { flexDirection: 'row', paddingHorizontal: spacing.lg, height: s(40), marginTop: spacing.sm },
  ticks: { position: 'relative', height: '100%' },
  tick: { position: 'absolute', top: 0, color: colors.textTertiary, fontSize: fontSize.xs },
  gridWrap: { flex: 1, marginHorizontal: spacing.lg },
  row: { height: ROW_HEIGHT, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  channelCell: {
    width: CHANNEL_COLUMN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  channelLogo: { width: s(80), height: s(56) },
  channelName: { color: colors.text, fontSize: fontSize.xs, flex: 1 },
  cells: { flex: 1, position: 'relative' },
  cell: {
    position: 'absolute',
    top: s(6),
    bottom: s(6),
    backgroundColor: colors.card,
    borderRadius: s(8),
    paddingHorizontal: s(12),
    justifyContent: 'center',
    borderWidth: s(2),
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  cellLive: { backgroundColor: colors.cardElevated },
  cellFocused: { backgroundColor: colors.primary, borderColor: colors.primaryLight },
  cellText: { color: colors.text, fontSize: fontSize.xs },
  nowLine: { position: 'absolute', top: 0, bottom: 0, width: s(3), backgroundColor: colors.primary },
});
