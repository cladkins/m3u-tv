import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { HWEvent, useTVEventHandler } from '@amazon-devices/react-native-kepler';
import { KeplerCaptionsView, KeplerVideoSurfaceView } from '@amazon-devices/react-native-w3cmedia';
import { PlayRequest } from '../api/types';
import { AppButton, ProgressBar } from '../components/common';
import { strings } from '../i18n/strings';
import { useBackInterceptor, useRouter } from '../navigation/Router';
import { VideoEngine } from '../player/VideoEngine';
import { NowNext } from '../services/epg';
import { useApp, useSession } from '../state/AppContext';
import { colors, fontSize, s, spacing } from '../theme';
import { formatClock, formatDuration } from '../utils/text';

const OVERLAY_TIMEOUT_MS = 6000;
const LOAD_TIMEOUT_MS = 20000;
const PROGRESS_INTERVAL_MS = 10000;
const SEEK_STEP = 10;
const SKIP_STEP = 30;
const COMPLETED_RATIO = 0.9;

export function PlayerScreen({ request }: { request: PlayRequest }) {
  const { client, epg } = useSession();
  const { reportProgress } = useApp();
  const { pop, replaceTop } = useRouter();
  const isLive = request.type === 'live';

  const engineRef = useRef<VideoEngine | null>(null);
  // The surface outlives engines (a retry builds a new one), so its handles
  // are kept here and handed to each engine as it starts.
  const surfaceHandle = useRef<string | null>(null);
  const captionHandle = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState(request.startPosition ?? 0);
  const [duration, setDuration] = useState(0);
  const [overlay, setOverlay] = useState(true);
  const [nowNext, setNowNext] = useState<NowNext | null>(null);
  const [attempt, setAttempt] = useState(0);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positionRef = useRef(position);
  const durationRef = useRef(0);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);

  const showOverlay = useCallback(() => {
    setOverlay(true);
    clearHideTimer();
    hideTimer.current = setTimeout(() => setOverlay(false), OVERLAY_TIMEOUT_MS);
  }, [clearHideTimer]);

  useEffect(() => {
    showOverlay();
    return clearHideTimer;
  }, [showOverlay, clearHideTimer]);

  // Engine lifecycle: one VideoEngine per mounted player (and per retry).
  useEffect(() => {
    const engine = new VideoEngine();
    engineRef.current = engine;
    if (surfaceHandle.current) engine.attachSurface(surfaceHandle.current);
    if (captionHandle.current) engine.attachCaptions(captionHandle.current);
    let cancelled = false;
    let started = false;
    setLoading(true);
    setError(null);

    const loadTimer = setTimeout(() => {
      if (!cancelled && !started) {
        setLoading(false);
        setError(strings.playerTimeout);
      }
    }, LOAD_TIMEOUT_MS);

    engine.on('playing', () => {
      started = true;
      clearTimeout(loadTimer);
      setLoading(false);
      setError(null);
      setPaused(false);
    });
    engine.on('pause', () => setPaused(true));
    engine.on('waiting', () => setLoading(true));
    engine.on('loadedmetadata', () => {
      durationRef.current = engine.duration;
      setDuration(engine.duration);
    });
    engine.on('timeupdate', () => {
      positionRef.current = engine.currentTime;
      if (engine.duration !== durationRef.current) {
        durationRef.current = engine.duration;
        setDuration(engine.duration);
      }
      if (overlayRef.current) setPosition(engine.currentTime);
    });
    engine.on('ended', () => {
      if (!isLive) pop();
    });
    engine.on('error', () => {
      clearTimeout(loadTimer);
      setLoading(false);
      setError(engine.errorMessage ?? strings.playerError);
    });

    const url = client.urlFor(request.type, request.streamId, request.extension);
    engine.open(url, isLive ? undefined : request.startPosition).catch((e: unknown) => {
      if (cancelled) return;
      clearTimeout(loadTimer);
      setLoading(false);
      setError(e instanceof Error && e.message ? e.message : strings.playerError);
    });

    return () => {
      cancelled = true;
      clearTimeout(loadTimer);
      engineRef.current = null;
      engine.destroy();
      client.stopStream(request.type, request.streamId);
    };
  }, [client, request, isLive, pop, attempt]);

  // Progress: every 10 s while playing and once more on exit (VOD/episodes).
  useEffect(() => {
    if (isLive) return undefined;
    const send = () => {
      const pos = Math.floor(positionRef.current);
      if (pos <= 0) return;
      const dur = Math.floor(durationRef.current);
      reportProgress({
        content_type: request.type === 'episode' ? 'episode' : 'vod',
        stream_id: request.streamId,
        position_seconds: pos,
        duration_seconds: dur > 0 ? dur : undefined,
        completed: dur > 0 && pos / dur >= COMPLETED_RATIO,
        series_id: request.seriesId,
        season_number: request.seasonNumber,
        episode_number: request.episodeNumber,
        title: request.seriesName ?? request.title,
        episode_title: request.type === 'episode' ? request.title : undefined,
        series_name: request.seriesName,
        thumbnail_url: request.thumbnail,
      });
    };
    const interval = setInterval(send, PROGRESS_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      send();
    };
  }, [isLive, reportProgress, request]);

  // Live: show now/next and refresh it every 30 s.
  useEffect(() => {
    if (!isLive) return undefined;
    let cancelled = false;
    const update = () =>
      epg.refreshOne(request.streamId).then((value) => {
        if (!cancelled) setNowNext(value);
      });
    update();
    const interval = setInterval(update, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isLive, epg, request.streamId]);

  // Certification: release the decoder when the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') pop();
    });
    return () => sub.remove();
  }, [pop]);

  const switchChannel = useCallback(
    (delta: number) => {
      const channels = request.channels;
      if (!channels || channels.length < 2) return;
      const index = channels.findIndex((c) => c.stream_id === request.streamId);
      const next = channels[(index + delta + channels.length) % channels.length];
      replaceTop({
        name: 'player',
        request: { ...request, streamId: next.stream_id, title: next.name, thumbnail: next.stream_icon },
      });
    },
    [request, replaceTop],
  );

  const seekBy = useCallback(
    (delta: number) => {
      const engine = engineRef.current;
      if (!engine || isLive) return;
      const target = engine.currentTime + delta;
      engine.seekTo(target);
      positionRef.current = target;
      setPosition(Math.max(0, target));
    },
    [isLive],
  );

  useTVEventHandler((event: HWEvent) => {
    if (event.eventKeyAction !== 0) return;
    const engine = engineRef.current;
    switch (event.eventType) {
      case 'playpause':
      case 'pause':
        engine?.togglePlay();
        showOverlay();
        return;
      case 'skip_forward':
      case 'forward':
        seekBy(SKIP_STEP);
        showOverlay();
        return;
      case 'skip_backward':
      case 'rewind':
        seekBy(-SKIP_STEP);
        showOverlay();
        return;
      case 'channel_up':
        switchChannel(-1);
        return;
      case 'channel_down':
        switchChannel(1);
        return;
      case 'back':
        return;
      default:
        break;
    }
    if (overlayRef.current) {
      showOverlay();
      return;
    }
    // Overlay hidden: arrows act directly instead of moving focus.
    if (event.eventType === 'left') seekBy(-SEEK_STEP);
    else if (event.eventType === 'right') seekBy(SEEK_STEP);
    else if (event.eventType === 'up' && isLive) {
      switchChannel(-1);
      return;
    } else if (event.eventType === 'down' && isLive) {
      switchChannel(1);
      return;
    }
    showOverlay();
  });

  useBackInterceptor(() => {
    if (overlayRef.current && !error) {
      clearHideTimer();
      setOverlay(false);
      return true;
    }
    return false;
  });

  const progress = duration > 0 ? position / duration : 0;

  return (
    <View style={styles.root}>
      <KeplerVideoSurfaceView
        style={styles.surface}
        onSurfaceViewCreated={(handle: string) => {
          surfaceHandle.current = handle;
          engineRef.current?.attachSurface(handle);
        }}
        onSurfaceViewDestroyed={(handle: string) => {
          surfaceHandle.current = null;
          engineRef.current?.detachSurface(handle);
        }}
      />
      <KeplerCaptionsView
        style={styles.captions}
        onCaptionViewCreated={(handle: string) => {
          captionHandle.current = handle;
          engineRef.current?.attachCaptions(handle);
        }}
      />

      {loading && !error ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centerText}>{strings.playerLoading}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>{strings.playerError}</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <View style={styles.buttonRow}>
            <AppButton label={strings.retry} variant="primary" hasTVPreferredFocus onPress={() => setAttempt((n) => n + 1)} />
            <AppButton label={strings.back} onPress={pop} />
          </View>
        </View>
      ) : null}

      {overlay && !error ? (
        <View style={styles.overlay}>
          <View style={styles.topBar}>
            <Text style={styles.title} numberOfLines={1}>
              {request.title}
            </Text>
            {request.subtitle ? <Text style={styles.subtitle}>{request.subtitle}</Text> : null}
          </View>
          <View style={styles.bottomBar}>
            {isLive ? (
              <View style={styles.liveInfo}>
                <View style={styles.liveRow}>
                  <Text style={styles.liveBadge}>{strings.playerLive}</Text>
                  <Text style={styles.nowTitle} numberOfLines={1}>
                    {nowNext?.current.title ?? strings.noProgramInfo}
                  </Text>
                  {nowNext ? (
                    <Text style={styles.timeText}>
                      {formatClock(nowNext.current.start)} – {formatClock(nowNext.current.end)}
                    </Text>
                  ) : null}
                </View>
                {nowNext ? <ProgressBar value={nowNext.progress} /> : null}
                {nowNext?.next ? (
                  <Text style={styles.nextText} numberOfLines={1}>
                    {strings.next}: {nowNext.next.title} · {formatClock(nowNext.next.start)}
                  </Text>
                ) : null}
                {request.channels && request.channels.length > 1 ? (
                  <Text style={styles.hint}>{strings.playerChannelHint}</Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.timeline}>
                <ProgressBar value={progress} height={s(8)} />
                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>{formatDuration(position)}</Text>
                  <Text style={styles.timeText}>{duration > 0 ? formatDuration(duration) : ''}</Text>
                </View>
              </View>
            )}
            <View style={styles.buttonRow}>
              {!isLive ? <AppButton label={`−${SEEK_STEP}s`} onPress={() => seekBy(-SEEK_STEP)} /> : null}
              <AppButton
                label={paused ? strings.play : '❚❚'}
                variant="primary"
                hasTVPreferredFocus
                onPress={() => {
                  engineRef.current?.togglePlay();
                  showOverlay();
                }}
              />
              {!isLive ? <AppButton label={`+${SEEK_STEP}s`} onPress={() => seekBy(SEEK_STEP)} /> : null}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  surface: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 },
  captions: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 2,
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    zIndex: 3,
  },
  centerText: { color: colors.textSecondary, fontSize: fontSize.md },
  errorBox: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.scrimDark,
    zIndex: 4,
    padding: spacing.xl,
  },
  errorTitle: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  errorDetail: { color: colors.textSecondary, fontSize: fontSize.md, textAlign: 'center' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    zIndex: 5,
  },
  topBar: {
    paddingHorizontal: spacing.safeHorizontal,
    paddingTop: spacing.safeVertical,
    paddingBottom: spacing.lg,
    backgroundColor: colors.scrim,
  },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.md, marginTop: spacing.xs },
  bottomBar: {
    paddingHorizontal: spacing.safeHorizontal,
    paddingBottom: spacing.safeVertical,
    paddingTop: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.scrimDark,
  },
  liveInfo: { gap: spacing.sm },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  liveBadge: {
    color: colors.text,
    backgroundColor: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    paddingHorizontal: s(12),
    paddingVertical: s(4),
    borderRadius: s(6),
  },
  nowTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600', flex: 1 },
  nextText: { color: colors.textSecondary, fontSize: fontSize.sm },
  hint: { color: colors.textTertiary, fontSize: fontSize.xs },
  timeline: { gap: spacing.xs },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timeText: { color: colors.textSecondary, fontSize: fontSize.sm },
  buttonRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
});
