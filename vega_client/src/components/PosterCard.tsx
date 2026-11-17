import React, { memo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Focusable } from './Focusable';
import { ProgressBar } from './common';
import { colors, fontSize, s, spacing } from '../theme';

export interface PosterCardProps {
  title: string;
  subtitle?: string;
  image?: string;
  width: number;
  aspect?: 'poster' | 'landscape' | 'logo';
  progress?: number;
  favorite?: boolean;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onFocus?: () => void;
}

const RATIOS = { poster: 1.5, landscape: 0.5625, logo: 0.75 };

export const PosterCard = memo(function PosterCard({
  title,
  subtitle,
  image,
  width,
  aspect = 'poster',
  progress,
  favorite,
  hasTVPreferredFocus,
  onPress,
  onLongPress,
  onFocus,
}: PosterCardProps) {
  const [failed, setFailed] = useState(false);
  const height = Math.round(width * RATIOS[aspect]);
  const showImage = !!image && !failed;
  return (
    <Focusable
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={onFocus}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={{ width }}
    >
      {(focused) => (
        <View>
          <View style={[styles.frame, { width, height }, focused && styles.frameFocused]}>
            {showImage ? (
              <Image
                source={{ uri: image }}
                style={aspect === 'logo' ? styles.logoImage : styles.fill}
                resizeMode={aspect === 'logo' ? 'contain' : 'cover'}
                onError={() => setFailed(true)}
              />
            ) : (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText} numberOfLines={3}>
                  {title}
                </Text>
              </View>
            )}
            {favorite ? <Text style={styles.star}>★</Text> : null}
            {progress !== undefined && progress > 0 ? (
              <View style={styles.progress}>
                <ProgressBar value={progress} height={s(6)} />
              </View>
            ) : null}
          </View>
          <Text style={[styles.title, focused && styles.titleFocused]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}
    </Focusable>
  );
});

const styles = StyleSheet.create({
  frame: {
    borderRadius: s(12),
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: s(3),
    borderColor: 'transparent',
  },
  frameFocused: { borderColor: colors.primary, transform: [{ scale: 1.05 }] },
  fill: { width: '100%', height: '100%' },
  logoImage: { width: '80%', height: '80%', margin: '10%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  placeholderText: { color: colors.textSecondary, fontSize: fontSize.sm, textAlign: 'center' },
  star: { position: 'absolute', top: s(8), right: s(12), color: colors.warning, fontSize: fontSize.md },
  progress: { position: 'absolute', left: s(10), right: s(10), bottom: s(10) },
  title: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.xs },
  titleFocused: { color: colors.text, fontWeight: '600' },
  subtitle: { color: colors.textTertiary, fontSize: fontSize.xs },
});
