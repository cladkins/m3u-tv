import React, { ReactElement, useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SIDEBAR_WIDTH } from './Sidebar';
import { s, spacing } from '../theme';

interface PosterGridProps<T> {
  data: T[];
  columns: number;
  keyOf: (item: T) => string;
  renderItem: (item: T, width: number, index: number) => ReactElement;
  ListHeaderComponent?: ReactElement | null;
  ListEmptyComponent?: ReactElement | null;
}

// Rows are chunked by hand so card width is computed once from the content
// area (window minus sidebar) and every row virtualizes as one unit.
export function PosterGrid<T>({
  data,
  columns,
  keyOf,
  renderItem,
  ListHeaderComponent,
  ListEmptyComponent,
}: PosterGridProps<T>) {
  const { width: windowWidth } = useWindowDimensions();
  const gap = spacing.md;
  const horizontalPadding = spacing.lg;
  const contentWidth = windowWidth - SIDEBAR_WIDTH - horizontalPadding * 2;
  const itemWidth = Math.floor((contentWidth - gap * (columns - 1)) / columns);

  const rows = useMemo(() => {
    const out: T[][] = [];
    for (let i = 0; i < data.length; i += columns) out.push(data.slice(i, i + columns));
    return out;
  }, [data, columns]);

  const renderRow = useCallback(
    ({ item: row, index }: { item: T[]; index: number }) => (
      <View style={[styles.row, { gap }]}>
        {row.map((item, col) => (
          <React.Fragment key={keyOf(item)}>{renderItem(item, itemWidth, index * columns + col)}</React.Fragment>
        ))}
      </View>
    ),
    [gap, keyOf, renderItem, itemWidth, columns],
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => keyOf(row[0])}
      renderItem={renderRow}
      contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingBottom: s(80) }}
      initialNumToRender={3}
      maxToRenderPerBatch={3}
      windowSize={5}
      removeClippedSubviews
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingVertical: s(16) },
});
