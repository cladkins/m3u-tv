import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Focusable } from './Focusable';
import { TabName, useRouter } from '../navigation/Router';
import { colors, fontSize, s, spacing } from '../theme';
import { strings } from '../i18n/strings';

const ITEMS: Array<{ tab: TabName; label: string }> = [
  { tab: 'home', label: strings.navHome },
  { tab: 'live', label: strings.navLive },
  { tab: 'guide', label: strings.navGuide },
  { tab: 'movies', label: strings.navMovies },
  { tab: 'series', label: strings.navSeries },
  { tab: 'search', label: strings.navSearch },
  { tab: 'settings', label: strings.navSettings },
];

export const SIDEBAR_WIDTH = s(260);

export function Sidebar() {
  const { tab, setTab, registerSidebarItem, setSidebarFocused } = useRouter();
  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Image source={require('../../assets/image/app_icon.png')} style={styles.logo} />
        <Text style={styles.brandText}>{strings.appName}</Text>
      </View>
      <View style={styles.items}>
        {ITEMS.map((item) => {
          const active = item.tab === tab;
          return (
            <Focusable
              key={item.tab}
              ref={(view) => registerSidebarItem(item.tab, view)}
              onPress={() => setTab(item.tab)}
              onFocus={() => setSidebarFocused(true)}
              onBlur={() => setSidebarFocused(false)}
              style={(focused) => [styles.item, active && styles.itemActive, focused && styles.itemFocused]}
            >
              {(focused) => (
                <Text style={[styles.label, (active || focused) && styles.labelActive]} numberOfLines={1}>
                  {item.label}
                </Text>
              )}
            </Focusable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.backgroundElevated,
    paddingVertical: spacing.safeVertical,
    paddingHorizontal: spacing.md,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  logo: { width: s(48), height: s(48), borderRadius: s(10) },
  brandText: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  items: { gap: spacing.xs },
  item: {
    paddingVertical: s(14),
    paddingHorizontal: spacing.md,
    borderRadius: s(12),
    borderWidth: s(2),
    borderColor: 'transparent',
  },
  itemActive: { backgroundColor: colors.focusTint },
  itemFocused: { backgroundColor: colors.primary, borderColor: colors.primaryLight },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '500' },
  labelActive: { color: colors.text, fontWeight: '700' },
});
