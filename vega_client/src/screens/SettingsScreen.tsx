import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton, SectionTitle } from '../components/common';
import { Focusable } from '../components/Focusable';
import { strings } from '../i18n/strings';
import { useApp, useSession } from '../state/AppContext';
import { colors, fontSize, s, spacing } from '../theme';

const APP_VERSION: string = require('../../package.json').version;

function formatExpiry(value: unknown): string | undefined {
  const n = Number(value);
  if (!value || !Number.isFinite(n) || n <= 0) return undefined;
  return new Date(n * 1000).toLocaleDateString();
}

export function SettingsScreen() {
  const { client, auth } = useSession();
  const { viewers, activeViewer, selectViewer, refreshCatalog, signOut } = useApp();
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const rows: Array<[string, string | undefined]> = [
    [strings.settingsServer, client.credentials.server],
    [strings.settingsUser, client.credentials.username],
    [strings.settingsVersion, auth.m3u_editor?.version],
    [strings.settingsExpires, formatExpiry(auth.user_info?.exp_date)],
  ];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>{strings.navSettings}</Text>

      <View style={styles.section}>
        <SectionTitle title={strings.settingsConnection} />
        {rows
          .filter(([, value]) => !!value)
          .map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
        <View style={styles.buttons}>
          <AppButton
            label={strings.settingsRefresh}
            hasTVPreferredFocus
            disabled={refreshing}
            onPress={async () => {
              setRefreshing(true);
              try {
                await refreshCatalog();
                setMessage(strings.settingsRefreshed);
              } catch (e) {
                setMessage(e instanceof Error ? e.message : strings.errorGeneric);
              } finally {
                setRefreshing(false);
              }
            }}
          />
          <AppButton label={strings.settingsSignOut} onPress={signOut} />
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>

      {viewers.length > 1 ? (
        <View style={styles.section}>
          <SectionTitle title={strings.settingsViewer} />
          <Text style={styles.label}>{strings.settingsViewerHint}</Text>
          <View style={styles.viewers}>
            {viewers.map((viewer) => {
              const active = viewer.ulid === activeViewer?.ulid;
              return (
                <Focusable
                  key={viewer.ulid}
                  onPress={() => selectViewer(viewer)}
                  style={(focused) => [styles.viewer, active && styles.viewerActive, focused && styles.viewerFocused]}
                >
                  <Text style={styles.viewerName}>{viewer.name}</Text>
                </Focusable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionTitle title={strings.settingsAbout} />
        <View style={styles.row}>
          <Text style={styles.label}>{strings.settingsAppVersion}</Text>
          <Text style={styles.value}>{APP_VERSION}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.safeVertical, paddingBottom: s(80) },
  heading: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '800', marginBottom: spacing.lg },
  section: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: s(18),
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', gap: spacing.lg },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, minWidth: s(320) },
  value: { color: colors.text, fontSize: fontSize.sm, flex: 1 },
  buttons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  message: { color: colors.textSecondary, fontSize: fontSize.sm },
  viewers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  viewer: {
    paddingHorizontal: s(28),
    paddingVertical: s(14),
    borderRadius: s(50),
    backgroundColor: colors.card,
    borderWidth: s(2),
    borderColor: 'transparent',
  },
  viewerActive: { backgroundColor: colors.focusTint, borderColor: colors.primary },
  viewerFocused: { backgroundColor: colors.primary, borderColor: colors.primaryLight },
  viewerName: { color: colors.text, fontSize: fontSize.sm },
});
