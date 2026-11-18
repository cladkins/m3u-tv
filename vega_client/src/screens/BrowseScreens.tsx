import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Category, Series, VodStream } from '../api/types';
import { CategoryBar, CategoryOption } from '../components/CategoryBar';
import { EmptyState, Loading } from '../components/common';
import { PosterCard } from '../components/PosterCard';
import { PosterGrid } from '../components/PosterGrid';
import { strings } from '../i18n/strings';
import { useRouter } from '../navigation/Router';
import { useApp, useSession } from '../state/AppContext';
import { colors, fontSize, spacing } from '../theme';
import { yearOf } from '../utils/text';

const FAVORITES_ID = '__favorites__';
const COLUMNS = 6;

interface BrowseProps<T> {
  categories: Category[];
  favoriteIds: Set<number>;
  fetchList: (categoryId?: string) => Promise<T[]>;
  idOf: (item: T) => number;
  titleOf: (item: T) => string;
  imageOf: (item: T) => string | undefined;
  subtitleOf: (item: T) => string | undefined;
  onOpen: (item: T) => void;
  onToggleFavorite: (item: T) => void;
}

function BrowseGrid<T>({
  categories,
  favoriteIds,
  fetchList,
  idOf,
  titleOf,
  imageOf,
  subtitleOf,
  onOpen,
  onToggleFavorite,
}: BrowseProps<T>) {
  const options = useMemo<CategoryOption[]>(
    () => [
      { id: FAVORITES_ID, name: `★ ${strings.favorites}` },
      ...categories.map((c) => ({ id: String(c.category_id), name: c.category_name })),
    ],
    [categories],
  );
  const [categoryId, setCategoryId] = useState<string>(() =>
    categories[0] ? String(categories[0].category_id) : FAVORITES_ID,
  );
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const favoriteFilter = categoryId === FAVORITES_ID ? favoriteIds : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (favoriteFilter) {
        const all = await fetchList();
        setItems(all.filter((item) => favoriteFilter.has(idOf(item))));
      } else {
        setItems(await fetchList(categoryId));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : strings.errorGeneric);
    } finally {
      setLoading(false);
    }
  }, [fetchList, categoryId, favoriteFilter, idOf]);

  useEffect(() => {
    load();
  }, [load]);

  const renderItem = useCallback(
    (item: T, width: number, index: number) => (
      <PosterCard
        title={titleOf(item)}
        subtitle={subtitleOf(item)}
        image={imageOf(item)}
        width={width}
        favorite={favoriteIds.has(idOf(item))}
        hasTVPreferredFocus={index === 0}
        onPress={() => onOpen(item)}
        onLongPress={() => onToggleFavorite(item)}
      />
    ),
    [titleOf, subtitleOf, imageOf, favoriteIds, idOf, onOpen, onToggleFavorite],
  );

  return (
    <View style={styles.root}>
      <CategoryBar options={options} selectedId={categoryId} onSelect={setCategoryId} />
      <Text style={styles.hint}>{strings.favoriteHint}</Text>
      {loading ? (
        <Loading />
      ) : error ? (
        <EmptyState message={error} onRetry={load} />
      ) : (
        <PosterGrid
          data={items}
          columns={COLUMNS}
          keyOf={(item) => String(idOf(item))}
          renderItem={renderItem}
          ListEmptyComponent={<EmptyState message={strings.noItems} />}
        />
      )}
    </View>
  );
}

export function MoviesScreen() {
  const { catalog } = useSession();
  const { vodCategories, favorites, toggleFavorite } = useApp();
  const { push } = useRouter();
  const fetchList = useCallback((categoryId?: string) => catalog.vodStreams(categoryId), [catalog]);
  return (
    <BrowseGrid<VodStream>
      categories={vodCategories}
      favoriteIds={favorites.vod}
      fetchList={fetchList}
      idOf={movieId}
      titleOf={movieTitle}
      imageOf={movieImage}
      subtitleOf={movieSubtitle}
      onOpen={(movie) => push({ name: 'movie', movie })}
      onToggleFavorite={(movie) => toggleFavorite('vod', movie.stream_id)}
    />
  );
}

export function SeriesScreen() {
  const { catalog } = useSession();
  const { seriesCategories, favorites, toggleFavorite } = useApp();
  const { push } = useRouter();
  const fetchList = useCallback((categoryId?: string) => catalog.series(categoryId), [catalog]);
  return (
    <BrowseGrid<Series>
      categories={seriesCategories}
      favoriteIds={favorites.series}
      fetchList={fetchList}
      idOf={seriesId}
      titleOf={seriesTitle}
      imageOf={seriesImage}
      subtitleOf={seriesSubtitle}
      onOpen={(series) => push({ name: 'series', series })}
      onToggleFavorite={(series) => toggleFavorite('series', series.series_id)}
    />
  );
}

const movieId = (m: VodStream) => m.stream_id;
const movieTitle = (m: VodStream) => m.name;
const movieImage = (m: VodStream) => m.stream_icon;
const movieSubtitle = (m: VodStream) => yearOf(m.year);
const seriesId = (s: Series) => s.series_id;
const seriesTitle = (s: Series) => s.name;
const seriesImage = (s: Series) => s.cover;
const seriesSubtitle = (s: Series) => yearOf(s.year ?? s.releaseDate ?? s.release_date);

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: spacing.md },
  hint: { color: colors.textTertiary, fontSize: fontSize.xs, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
});
