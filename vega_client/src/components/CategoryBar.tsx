import React, { memo } from 'react';
import { FlatList, StyleSheet, Text } from 'react-native';
import { Focusable } from './Focusable';
import { colors, fontSize, s, spacing } from '../theme';

export interface CategoryOption {
  id: string;
  name: string;
}

interface CategoryBarProps {
  options: CategoryOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export const CategoryBar = memo(function CategoryBar({ options, selectedId, onSelect }: CategoryBarProps) {
  return (
    <FlatList
      horizontal
      data={options}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={styles.list}
      initialNumToRender={12}
      windowSize={5}
      renderItem={({ item }) => {
        const active = item.id === selectedId;
        return (
          <Focusable
            onPress={() => onSelect(item.id)}
            style={(focused) => [styles.chip, active && styles.chipActive, focused && styles.chipFocused]}
          >
            {(focused) => (
              <Text style={[styles.label, (active || focused) && styles.labelActive]} numberOfLines={1}>
                {item.name}
              </Text>
            )}
          </Focusable>
        );
      }}
    />
  );
});

const styles = StyleSheet.create({
  list: { flexGrow: 0 },
  content: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  chip: {
    paddingHorizontal: s(28),
    paddingVertical: s(12),
    borderRadius: s(50),
    backgroundColor: colors.card,
    borderWidth: s(2),
    borderColor: 'transparent',
    maxWidth: s(420),
  },
  chipActive: { backgroundColor: colors.focusTint, borderColor: colors.primary },
  chipFocused: { backgroundColor: colors.primary, borderColor: colors.primaryLight, transform: [{ scale: 1.06 }] },
  label: { color: colors.textSecondary, fontSize: fontSize.sm },
  labelActive: { color: colors.text, fontWeight: '700' },
});
