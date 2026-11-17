import { Dimensions } from 'react-native';

export const colors = {
  primary: '#ec003f',
  primaryLight: '#ff2056',
  background: '#0a0a0f',
  backgroundElevated: '#12121a',
  card: '#1a1a24',
  cardElevated: '#242430',
  text: '#ffffff',
  textSecondary: '#c4c4d0',
  textTertiary: '#71717a',
  border: '#27272a',
  error: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
  focusTint: 'rgba(236, 0, 63, 0.2)',
  scrim: 'rgba(0, 0, 0, 0.6)',
  scrimDark: 'rgba(0, 0, 0, 0.85)',
};

// Layouts are specified in 1920x1080 design pixels. Vega lays RN 0.83 out on a
// 960x540 dp canvas, so every size goes through s() to match the window.
const DESIGN_WIDTH = 1920;

export function s(px: number): number {
  return Math.round((px * Dimensions.get('window').width) / DESIGN_WIDTH);
}

export const fontSize = {
  xs: s(18),
  sm: s(22),
  md: s(26),
  lg: s(32),
  xl: s(40),
  xxl: s(56),
};

export const spacing = {
  xs: s(8),
  sm: s(12),
  md: s(20),
  lg: s(32),
  xl: s(48),
  safeHorizontal: s(80),
  safeVertical: s(48),
};
