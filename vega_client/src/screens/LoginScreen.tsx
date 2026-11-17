import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DeviceCode, pollForApproval, requestDeviceCode } from '../api/pairing';
import { Credentials } from '../api/types';
import { AppButton, TextField } from '../components/common';
import { strings } from '../i18n/strings';
import { useBackInterceptor } from '../navigation/Router';
import { readJson, StorageKeys } from '../services/storage';
import { useApp } from '../state/AppContext';
import { colors, fontSize, s, spacing } from '../theme';

export function LoginScreen() {
  const { signIn } = useApp();
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<DeviceCode | null>(null);
  const pairingCancelled = useRef(false);

  useEffect(() => {
    readJson<Credentials>(StorageKeys.credentials).then((saved) => {
      if (!saved) return;
      setServer(saved.server);
      setUsername(saved.username);
      setPassword(saved.password);
    });
  }, []);

  const connect = useCallback(
    async (credentials: Credentials) => {
      setBusy(true);
      setError(null);
      try {
        await signIn(credentials);
      } catch (e) {
        setError(e instanceof Error ? e.message : strings.errorGeneric);
      } finally {
        setBusy(false);
      }
    },
    [signIn],
  );

  const onSignIn = useCallback(() => {
    if (!server.trim() || !username.trim() || !password) {
      setError(strings.loginMissingFields);
      return;
    }
    connect({ server: server.trim(), username: username.trim(), password });
  }, [server, username, password, connect]);

  const cancelPairing = useCallback(() => {
    pairingCancelled.current = true;
    setPairing(null);
  }, []);

  const onPair = useCallback(async () => {
    if (!server.trim()) {
      setError(strings.loginMissingServer);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const code = await requestDeviceCode(server);
      pairingCancelled.current = false;
      setPairing(code);
      setBusy(false);
      const outcome = await pollForApproval(server, code, () => pairingCancelled.current);
      if (pairingCancelled.current) return;
      setPairing(null);
      if (outcome.kind === 'approved') await connect(outcome.credentials);
      else if (outcome.kind === 'expired') setError(strings.loginPairExpired);
      else if (outcome.kind === 'denied') setError(strings.loginPairDenied);
    } catch (e) {
      setPairing(null);
      setBusy(false);
      setError(e instanceof Error ? e.message : strings.errorGeneric);
    }
  }, [server, connect]);

  useEffect(() => () => {
    pairingCancelled.current = true;
  }, []);

  useBackInterceptor(() => {
    if (!pairing) return false;
    cancelPairing();
    return true;
  }, !!pairing);

  if (pairing) {
    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.title}>{strings.loginPairTitle}</Text>
          <Text style={styles.subtitle}>{strings.loginPairInstructions}</Text>
          <Text style={styles.url}>{pairing.verificationUri}</Text>
          <Text style={styles.code}>{pairing.userCode}</Text>
          <View style={styles.waiting}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.subtitle}>{strings.loginPairWaiting}</Text>
          </View>
          <AppButton label={strings.loginPairCancel} onPress={cancelPairing} hasTVPreferredFocus />
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>{strings.loginTitle}</Text>
        <Text style={styles.subtitle}>{strings.loginSubtitle}</Text>
        <TextField
          label={strings.loginServer}
          value={server}
          onChangeText={setServer}
          placeholder={strings.loginServerHint}
          keyboardType="url"
          hasTVPreferredFocus
        />
        <AppButton label={strings.loginPair} variant="primary" onPress={onPair} disabled={busy} />
        <View style={styles.divider} />
        <TextField label={strings.loginUsername} value={username} onChangeText={setUsername} />
        <TextField label={strings.loginPassword} value={password} onChangeText={setPassword} secureTextEntry />
        <AppButton label={strings.loginSignIn} onPress={onSignIn} disabled={busy} />
        {busy ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.safeVertical,
  },
  card: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: s(24),
    padding: spacing.xl,
    gap: spacing.md,
    minWidth: s(820),
    alignItems: 'stretch',
  },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  url: { color: colors.text, fontSize: fontSize.lg, textAlign: 'center', marginTop: spacing.md },
  code: {
    color: colors.primaryLight,
    fontSize: s(96),
    fontWeight: '800',
    letterSpacing: s(12),
    textAlign: 'center',
    marginVertical: spacing.md,
  },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  error: { color: colors.error, fontSize: fontSize.sm },
});
