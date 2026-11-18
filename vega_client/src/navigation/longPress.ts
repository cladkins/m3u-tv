import { HWEvent } from '@amazon-devices/react-native-kepler';

const HOLD_MS = 600;
const COOLDOWN_MS = 1000;

type Action = () => void;

let target: Action | null = null;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let selectHeld = false;
let lastFired = 0;

// A clock that jumps backwards must not leave the cooldown stuck on.
function inCooldown(): boolean {
  const since = Date.now() - lastFired;
  return since >= 0 && since < COOLDOWN_MS;
}

function cancelHold() {
  if (holdTimer !== null) clearTimeout(holdTimer);
  holdTimer = null;
}

// One path for every long-press source (held Select, Menu key, Pressable's
// own onLongPress) so a device that reports more than one doesn't toggle twice.
export function fireLongPress(action: Action | null = target): void {
  if (!action || inCooldown()) return;
  lastFired = Date.now();
  action();
}

// True right after a long press, so the Select release that ends the hold
// isn't also treated as a normal press.
export function pressIsSuppressed(): boolean {
  return inCooldown();
}

export function setLongPressTarget(action: Action): void {
  target = action;
}

export function clearLongPressTarget(action: Action): void {
  if (target !== action) return;
  target = null;
  cancelHold();
}

// Pressable's onLongPress doesn't fire for a held Select on Fire TV hardware,
// so the hold is timed from the remote's key events instead. Menu does the
// same thing in one press.
export function handleRemoteEvent(event: HWEvent): void {
  if (event.eventType === 'menu') {
    if (event.eventKeyAction === 0) fireLongPress();
    return;
  }
  if (event.eventType !== 'select') return;
  if (event.eventKeyAction === 1) {
    selectHeld = false;
    cancelHold();
    return;
  }
  if (event.eventKeyAction !== 0 || selectHeld) return;
  selectHeld = true;
  const held = target;
  if (!held) return;
  cancelHold();
  holdTimer = setTimeout(() => {
    holdTimer = null;
    if (target === held) fireLongPress(held);
  }, HOLD_MS);
}
