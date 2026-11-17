import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { Episode, Progress, Series, SeriesInfo } from '../api/types';
import { AppButton, EmptyState, Loading, ProgressBar } from '../components/common';
import { Focusable } from '../components/Focusable';
import { strings } from '../i18n/strings';
import { useRouter } from '../navigation/Router';
import { useApp, useSession } from '../state/AppContext';
import { colors, fontSize, s, spacing } from '../theme';
import { firstImage, toNumber, yearOf } from '../utils/text';

const RESUME_MIN_SECONDS = 30;

export function SeriesDetailsScreen({ series }: { series: Series }) {
  const { client, catalog } = useSession();
  const { activeViewer, favorites, toggleFavorite } = useApp();
  const { push } = useRouter();
  const [info, setInfo] = useState<SeriesInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Map<number, Progress>>(new Map());
  const [season, setSeason] = useState<number | null>(null);
  // The first episode takes focus on open only; once the user browses seasons,
  // focus stays in the season list while episodes swap.
  const [autoFocusEpisode, setAutoFocusEpisode] = useState(true);

  useEffect(() => {
    let cancelled = false;
    catalog
      .seriesInfo(series.series_id)
      .then((value) => {
        if (!cancelled) setInfo(value);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalog, series.series_id]);

  useEffect(() => {
    if (!activeViewer) return;
    let cancelled = false;
    client
      .getSeriesProgress(activeViewer.ulid, series.series_id)
      .then((list) => {
        if (!cancelled) setProgress(new Map(list.map((p) => [Number(p.stream_id), p])));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, activeViewer, series.series_id]);

  // Seasons come from the episodes map; the `seasons` array is often missing
  // or lists seasons with no episodes.
  const seasonNumbers = useMemo(() => {
    const keys = Object.keys(info?.episodes ?? {})
      .map(Number)
      .filter((n) => Number.isFinite(n) && (info?.episodes?.[String(n)]?.length ?? 0) > 0);
    return keys.sort((a, b) => a - b);
  }, [info]);

  useEffect(() => {
    if (season === null && seasonNumbers.length > 0) {
      const furthest = [...progress.values()].sort(
        (a, b) => (b.season_number ?? 0) - (a.season_number ?? 0),
      )[0]?.season_number;
      setSeason(furthest && seasonNumbers.includes(furthest) ? furthest : seasonNumbers[0]);
    }
  }, [season, seasonNumbers, progress]);

  const episodes = useMemo<Episode[]>(() => {
    if (season === null) return [];
    const list = info?.episodes?.[String(season)] ?? [];
    return [...list].sort((a, b) => (toNumber(a.episode_num) ?? 0) - (toNumber(b.episode_num) ?? 0));
  }, [info, season]);

  const details = info?.info ?? series;
  const title = details.name || series.name;
  const backdrop = firstImage(details.backdrop_path) ?? firstImage(series.backdrop_path);
  const cover = details.cover || series.cover;
  const isFavorite = favorites.series.has(series.series_id);

  const playEpisode = useCallback(
    (episode: Episode, fromStart = false) => {
      const id = Number(episode.id);
      const saved = progress.get(id);
      const resume =
        !fromStart && saved && !saved.completed && saved.position_seconds > RESUME_MIN_SECONDS
          ? saved.position_seconds
          : 0;
      const seasonNumber = toNumber(episode.season) ?? season ?? undefined;
      const episodeNumber = toNumber(episode.episode_num);
      push({
        name: 'player',
        request: {
          type: 'episode',
          streamId: id,
          extension: episode.container_extension,
          title: episode.title || strings.detailsEpisode(episodeNumber ?? 0),
          subtitle:
            seasonNumber && episodeNumber
              ? `${title} · ${strings.detailsEpisodeShort(seasonNumber, episodeNumber)}`
              : title,
          seriesId: series.series_id,
          seriesName: title,
          seasonNumber,
          episodeNumber,
          thumbnail: episode.info?.movie_image || cover,
          startPosition: resume,
        },
      });
    },
    [push, progress, season, series.series_id, title, cover],
  );

  if (loading) return <Loading />;

  const meta = [yearOf(details.releaseDate ?? details.release_date ?? series.year), details.genre]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <View style={styles.root}>
      {backdrop ? <Image source={{ uri: backdrop }} style={styles.backdrop} resizeMode="cover" /> : null}
      <View style={styles.scrim} />
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        {details.plot ? (
          <Text style={styles.plot} numberOfLines={3}>
            {details.plot}
          </Text>
        ) : null}
        <View style={styles.headerButtons}>
          <AppButton
            label={isFavorite ? strings.unfavorite : strings.favorite}
            onPress={() => toggleFavorite('series', series.series_id)}
          />
        </View>
      </View>
      {seasonNumbers.length === 0 ? (
        <EmptyState message={strings.detailsNoEpisodes} />
      ) : (
        <View style={styles.body}>
          <FlatList
            style={styles.seasons}
            data={seasonNumbers}
            keyExtractor={(n) => String(n)}
            renderItem={({ item }) => (
              <Focusable
                onPress={() => setSeason(item)}
                onFocus={() => {
                  setAutoFocusEpisode(false);
                  setSeason(item);
                }}
                style={(focused) => [
                  styles.season,
                  item === season && styles.seasonActive,
                  focused && styles.seasonFocused,
                ]}
              >
                <Text style={[styles.seasonLabel, item === season && styles.seasonLabelActive]}>
                  {strings.detailsSeason(item)}
                </Text>
              </Focusable>
            )}
          />
          <FlatList
            style={styles.episodes}
            data={episodes}
            keyExtractor={(e) => String(e.id)}
            initialNumToRender={6}
            windowSize={5}
            renderItem={({ item, index }) => (
              <EpisodeRow
                episode={item}
                fallbackImage={cover}
                progress={progress.get(Number(item.id))}
                preferred={autoFocusEpisode && index === 0}
                onPress={playEpisode}
              />
            )}
          />
        </View>
      )}
    </View>
  );
}

interface EpisodeRowProps {
  episode: Episode;
  fallbackImage?: string;
  progress?: Progress;
  preferred: boolean;
  onPress: (episode: Episode) => void;
}

const EpisodeRow = memo(function EpisodeRow({ episode, fallbackImage, progress, preferred, onPress }: EpisodeRowProps) {
  const number = toNumber(episode.episode_num);
  const image = episode.info?.movie_image || fallbackImage;
  const durationSecs = toNumber(episode.info?.duration_secs);
  const watched =
    progress && progress.duration_seconds ? progress.position_seconds / progress.duration_seconds : undefined;
  return (
    <Focusable
      onPress={() => onPress(episode)}
      hasTVPreferredFocus={preferred}
      style={(focused) => [styles.episode, focused && styles.episodeFocused]}
    >
      <View style={styles.thumbBox}>
        {image ? <Image source={{ uri: image }} style={styles.thumb} resizeMode="cover" /> : null}
        {watched !== undefined ? (
          <View style={styles.thumbProgress}>
            <ProgressBar value={progress?.completed ? 1 : watched} height={s(5)} />
          </View>
        ) : null}
      </View>
      <View style={styles.episodeInfo}>
        <Text style={styles.episodeTitle} numberOfLines={1}>
          {number !== undefined ? `${number}. ` : ''}
          {episode.title || strings.detailsEpisode(number ?? 0)}
        </Text>
        {durationSecs ? (
          <Text style={styles.meta}>{strings.detailsMinutes(Math.round(durationSecs / 60))}</Text>
        ) : null}
        {episode.info?.plot ? (
          <Text style={styles.episodePlot} numberOfLines={2}>
            {episode.info.plot}
          </Text>
        ) : null}
      </View>
    </Focusable>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, height: s(560), opacity: 0.35 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,10,15,0.55)' },
  header: {
    paddingHorizontal: spacing.safeHorizontal,
    paddingTop: spacing.safeVertical,
    gap: spacing.sm,
  },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '800' },
  meta: { color: colors.textSecondary, fontSize: fontSize.sm },
  plot: { color: colors.text, fontSize: fontSize.sm, maxWidth: s(1300) },
  headerButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  body: { flex: 1, flexDirection: 'row', paddingHorizontal: spacing.safeHorizontal, paddingTop: spacing.lg, gap: spacing.lg },
  seasons: { width: s(280), flexGrow: 0 },
  season: {
    paddingVertical: s(14),
    paddingHorizontal: spacing.md,
    borderRadius: s(12),
    marginBottom: spacing.xs,
    borderWidth: s(2),
    borderColor: 'transparent',
  },
  seasonActive: { backgroundColor: colors.focusTint },
  seasonFocused: { backgroundColor: colors.primary, borderColor: colors.primaryLight },
  seasonLabel: { color: colors.textSecondary, fontSize: fontSize.sm },
  seasonLabelActive: { color: colors.text, fontWeight: '700' },
  episodes: { flex: 1 },
  episode: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: s(14),
    backgroundColor: colors.card,
    borderWidth: s(3),
    borderColor: 'transparent',
  },
  episodeFocused: { borderColor: colors.primary, backgroundColor: colors.cardElevated },
  thumbBox: { width: s(320), height: s(180), borderRadius: s(10), overflow: 'hidden', backgroundColor: colors.backgroundElevated },
  thumb: { width: '100%', height: '100%' },
  thumbProgress: { position: 'absolute', left: s(8), right: s(8), bottom: s(8) },
  episodeInfo: { flex: 1, gap: s(6), justifyContent: 'center' },
  episodeTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  episodePlot: { color: colors.textSecondary, fontSize: fontSize.xs },
});
