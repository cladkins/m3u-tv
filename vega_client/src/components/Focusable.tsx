import React, { forwardRef, ReactNode, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { useRouter, useScreenKey } from '../navigation/Router';

export interface FocusableProps {
  onPress?: () => void;
  onLongPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle> | ((focused: boolean) => StyleProp<ViewStyle>);
  children: ReactNode | ((focused: boolean) => ReactNode);
  testID?: string;
}

// Vega only restyles Button and TouchableOpacity on focus, so every other
// focusable surface tracks its own focus state and draws its own highlight.
// Each focus is also remembered per screen so Back can return focus to it.
export const Focusable = forwardRef<View | null, FocusableProps>(function Focusable(
  { onPress, onLongPress, onFocus, onBlur, hasTVPreferredFocus, disabled, style, children, testID },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const innerRef = useRef<View>(null);
  const { rememberFocus } = useRouter();
  const screenKey = useScreenKey();
  useImperativeHandle(ref, () => innerRef.current as View, []);

  const handleFocus = useCallback(() => {
    setFocused(true);
    if (innerRef.current) rememberFocus(screenKey, innerRef.current);
    onFocus?.();
  }, [onFocus, rememberFocus, screenKey]);
  const handleBlur = useCallback(() => {
    setFocused(false);
    onBlur?.();
  }, [onBlur]);

  return (
    <Pressable
      ref={innerRef}
      testID={testID}
      focusable={!disabled}
      disabled={disabled}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={typeof style === 'function' ? style(focused) : style}
    >
      {typeof children === 'function' ? children(focused) : children}
    </Pressable>
  );
});
