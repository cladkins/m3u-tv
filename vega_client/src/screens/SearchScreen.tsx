import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LiveStream, Series, VodStream } from '../api/types';
import { Loading, TextField } from '../components/common';
import { HorizontalRow } from '../components/HorizontalRow';
import { PosterCard } from '../components/PosterCard';
import { strings } from '../i18n/strings';
import { useRouter } from '../navigation/Router';
import { useSession } from '../state/AppContext';
import { colors, fontSize, s, spacing } from '../theme';
import { yearOf } from '../utils/text';

const MIN_QUERY = 2;
const MAX_RESULTS = 40;
const DEBOUNCE_MS = 400;

interface Results {
  live: LiveStream[];
  movies: VodStream[];
  series: Series[];
}

function matches(name: string | undefined, needle: string): boolean {
  return !!name && name.toLowerCase().includes(needle);
}

export function SearchScreen() {
  const { catalog } = useSession();
  const { push } = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < MIN_QUERY) {
      setResults(null);
      setSearching(false);
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      // Search runs over the full lists; the catalog cache keeps them for the
      // session so later queries filter without another download.
      const [live, movies, series] = await Promise.all([
        catalog.liveStreams().catch(() => [] as LiveStream[]),
        catalog.vodStreams().catch(() => [] as VodStream[]),
        catalog.series().catch(() => [] as Series[]),
      ]);
      if (cancelled) return;
      setResults({
        live: live.filter((c) => matches(c.name, needle)).slice(0, MAX_RESULTS),
        movies: movies.filter((m) => matches(m.name, needle)).slice(0, MAX_RESULTS),
        series: series.filter((x) => matches(x.name, needle)).slice(0, MAX_RESULTS),
      });
      setSearching(false);
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, catalog]);

  const noResults =
    results && results.live.length === 0 && results.movies.length === 0 && results.series.length === 0;

  return (
    <View style={styles.root}>
      <View style={styles.searchBox}>
        <TextField
          label={strings.navSearch}
          value={query}
          onChangeText={setQuery}
          placeholder={strings.searchPlaceholder}
          hasTVPreferredFocus
          returnKeyType="search"
        />
      </View>
      {searching ? (
        <Loading />
      ) : !results ? (
        <Text style={styles.hint}>{strings.searchHint}</Text>
      ) : noResults ? (
        <Text style={styles.hint}>{strings.searchNoResults}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.results}>
          <HorizontalRow
            title={strings.searchLive}
            data={results.live}
            keyOf={(c) => String(c.stream_id)}
            renderItem={(c) => (
              <PosterCard
                title={c.name}
                image={c.stream_icon}
                aspect="logo"
                width={s(240)}
                onPress={() =>
                  push({
                    name: 'player',
                    request: { type: 'live', streamId: c.stream_id, title: c.name, thumbnail: c.stream_icon, channels: results.live },
                  })
                }
              />
            )}
          />
          <HorizontalRow
            title={strings.searchMovies}
            data={results.movies}
            keyOf={(m) => String(m.stream_id)}
            renderItem={(m) => (
              <PosterCard
                title={m.name}
                subtitle={yearOf(m.year)}
                image={m.stream_icon}
                width={s(220)}
                onPress={() => push({ name: 'movie', movie: m })}
              />
            )}
          />
          <HorizontalRow
            title={strings.searchSeries}
            data={results.series}
            keyOf={(x) => String(x.series_id)}
            renderItem={(x) => (
              <PosterCard
                title={x.name}
                subtitle={yearOf(x.year ?? x.releaseDate ?? x.release_date)}
                image={x.cover}
                width={s(220)}
                onPress={() => push({ name: 'series', series: x })}
              />
            )}
          />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: spacing.safeVertical },
  searchBox: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  hint: { color: colors.textSecondary, fontSize: fontSize.md, paddingHorizontal: spacing.lg },
  results: { paddingBottom: s(80) },
});
