import React, { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Progress, VodInfo, VodStream } from '../api/types';
import { AppButton, Loading, ProgressBar } from '../components/common';
import { strings } from '../i18n/strings';
import { useRouter } from '../navigation/Router';
import { useApp, useSession } from '../state/AppContext';
import { colors, fontSize, s, spacing } from '../theme';
import { firstImage, formatDuration, toNumber, yearOf } from '../utils/text';

const RESUME_MIN_SECONDS = 30;

export function MovieDetailsScreen({ movie }: { movie: VodStream }) {
  const { client, catalog } = useSession();
  const { activeViewer, favorites, toggleFavorite } = useApp();
  const { push } = useRouter();
  const [info, setInfo] = useState<VodInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    let cancelled = false;
    catalog
      .vodInfo(movie.stream_id)
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
  }, [catalog, movie.stream_id]);

  useEffect(() => {
    if (!activeViewer) return;
    let cancelled = false;
    client
      .getProgress(activeViewer.ulid, 'vod', movie.stream_id)
      .then((value) => {
        if (!cancelled) setProgress(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, activeViewer, movie.stream_id]);

  const details = info?.info ?? {};
  const title = details.name || info?.movie_data?.name || movie.name;
  const poster = details.cover_big || details.movie_image || movie.stream_icon;
  const backdrop = firstImage(details.backdrop_path);
  const extension = info?.movie_data?.container_extension || movie.container_extension;
  const durationSecs = toNumber(details.duration_secs);
  const canResume = !!progress && !progress.completed && progress.position_seconds > RESUME_MIN_SECONDS;
  const isFavorite = favorites.vod.has(movie.stream_id);

  const play = useCallback(
    (startPosition?: number) =>
      push({
        name: 'player',
        request: {
          type: 'vod',
          streamId: movie.stream_id,
          title,
          extension,
          startPosition,
          thumbnail: poster,
        },
      }),
    [push, movie.stream_id, title, extension, poster],
  );

  if (loading) return <Loading />;

  const meta = [
    yearOf(details.release_date ?? details.year ?? movie.year),
    durationSecs ? strings.detailsMinutes(Math.round(durationSecs / 60)) : details.duration,
    details.genre,
    details.rating ? `★ ${details.rating}` : undefined,
  ].filter(Boolean);

  return (
    <View style={styles.root}>
      {backdrop ? <Image source={{ uri: backdrop }} style={styles.backdrop} resizeMode="cover" blurRadius={2} /> : null}
      <View style={styles.scrim} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.layout}>
          {poster ? <Image source={{ uri: poster }} style={styles.poster} resizeMode="cover" /> : null}
          <View style={styles.info}>
            <Text style={styles.title}>{title}</Text>
            {meta.length > 0 ? <Text style={styles.meta}>{meta.join('  ·  ')}</Text> : null}
            {details.plot || details.description ? (
              <Text style={styles.plot} numberOfLines={6}>
                {details.plot || details.description}
              </Text>
            ) : null}
            {details.director ? <Text style={styles.credits}>{details.director}</Text> : null}
            {details.cast ? (
              <Text style={styles.credits} numberOfLines={2}>
                {details.cast}
              </Text>
            ) : null}
            {canResume && progress ? (
              <View style={styles.resume}>
                <ProgressBar
                  value={progress.duration_seconds ? progress.position_seconds / progress.duration_seconds : 0}
                />
                <Text style={styles.meta}>{formatDuration(progress.position_seconds)}</Text>
              </View>
            ) : null}
            <View style={styles.buttons}>
              {canResume && progress ? (
                <>
                  <AppButton
                    label={strings.resume}
                    variant="primary"
                    hasTVPreferredFocus
                    onPress={() => play(progress.position_seconds)}
                  />
                  <AppButton label={strings.restart} onPress={() => play(0)} />
                </>
              ) : (
                <AppButton label={strings.play} variant="primary" hasTVPreferredFocus onPress={() => play()} />
              )}
              <AppButton
                label={isFavorite ? strings.unfavorite : strings.favorite}
                onPress={() => toggleFavorite('vod', movie.stream_id)}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.35 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,10,15,0.6)' },
  content: { padding: spacing.safeHorizontal },
  layout: { flexDirection: 'row', gap: spacing.xl },
  poster: { width: s(400), height: s(600), borderRadius: s(16), backgroundColor: colors.card },
  info: { flex: 1, gap: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '800' },
  meta: { color: colors.textSecondary, fontSize: fontSize.sm },
  plot: { color: colors.text, fontSize: fontSize.md, lineHeight: fontSize.md * 1.4 },
  credits: { color: colors.textTertiary, fontSize: fontSize.sm },
  resume: { gap: spacing.xs, maxWidth: s(600) },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});
