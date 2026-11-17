import React, { forwardRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { Focusable } from './Focusable';
import { colors, fontSize, s, spacing } from '../theme';
import { strings } from '../i18n/strings';

export function Loading({ label = strings.loading }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.muted}>{message}</Text>
      {onRetry ? <AppButton label={strings.retry} onPress={onRetry} /> : null}
    </View>
  );
}

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'tonal';
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
}

export const AppButton = forwardRef<View | null, AppButtonProps>(function AppButton(
  { label, onPress, variant = 'tonal', hasTVPreferredFocus, disabled },
  ref,
) {
  return (
    <Focusable
      ref={ref}
      onPress={onPress}
      disabled={disabled}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={(focused) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        focused && styles.buttonFocused,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Focusable>
  );
});

export function ProgressBar({ value, height = s(6) }: { value: number; height?: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View style={[styles.progressTrack, { height, borderRadius: height / 2 }]}>
      <View style={[styles.progressFill, { width: `${pct}%`, borderRadius: height / 2 }]} />
    </View>
  );
}

export function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

export const TextField = forwardRef<TextInput, TextInputProps & { label: string }>(function TextField(
  { label, ...props },
  ref,
) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        {...props}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  muted: { color: colors.textSecondary, fontSize: fontSize.md, textAlign: 'center' },
  button: {
    paddingHorizontal: s(36),
    paddingVertical: s(16),
    borderRadius: s(50),
    backgroundColor: colors.card,
    borderWidth: s(3),
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: s(200),
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonFocused: { borderColor: colors.text, transform: [{ scale: 1.05 }] },
  buttonDisabled: { opacity: 0.4 },
  buttonLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  progressTrack: { width: '100%', backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  field: { gap: spacing.xs },
  fieldLabel: { color: colors.textSecondary, fontSize: fontSize.sm },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: s(12),
    borderWidth: s(2),
    borderColor: colors.border,
    minWidth: s(640),
  },
});
