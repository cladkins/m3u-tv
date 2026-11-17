import React, { ReactElement } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SectionTitle } from './common';
import { s, spacing } from '../theme';

interface HorizontalRowProps<T> {
  title: string;
  data: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T, index: number) => ReactElement;
}

export function HorizontalRow<T>({ title, data, keyOf, renderItem }: HorizontalRowProps<T>) {
  if (data.length === 0) return null;
  return (
    <View style={styles.container}>
      <View style={styles.titleWrap}>
        <SectionTitle title={title} />
      </View>
      <FlatList
        horizontal
        data={data}
        keyExtractor={keyOf}
        renderItem={({ item, index }) => renderItem(item, index)}
        contentContainerStyle={styles.content}
        showsHorizontalScrollIndicator={false}
        initialNumToRender={7}
        windowSize={5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  titleWrap: { paddingHorizontal: spacing.lg },
  content: { paddingHorizontal: spacing.lg, paddingVertical: s(12), gap: spacing.md },
});
