import {
  clearLongPressTarget,
  handleRemoteEvent,
  pressIsSuppressed,
  setLongPressTarget,
} from '../src/navigation/longPress';

describe('remote long press', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    handleRemoteEvent({ eventType: 'select', eventKeyAction: 1 });
    jest.advanceTimersByTime(5000);
    jest.useRealTimers();
  });

  it('fires once when Select is held, ignoring key repeats', () => {
    const action = jest.fn();
    setLongPressTarget(action);
    handleRemoteEvent({ eventType: 'select', eventKeyAction: 0 });
    jest.advanceTimersByTime(300);
    handleRemoteEvent({ eventType: 'select', eventKeyAction: 0 });
    jest.advanceTimersByTime(400);
    expect(action).toHaveBeenCalledTimes(1);
    expect(pressIsSuppressed()).toBe(true);
    clearLongPressTarget(action);
  });

  it('does not fire for a short press or after focus moves away', () => {
    const action = jest.fn();
    setLongPressTarget(action);
    handleRemoteEvent({ eventType: 'select', eventKeyAction: 0 });
    jest.advanceTimersByTime(200);
    handleRemoteEvent({ eventType: 'select', eventKeyAction: 1 });
    jest.advanceTimersByTime(1000);
    handleRemoteEvent({ eventType: 'select', eventKeyAction: 0 });
    clearLongPressTarget(action);
    jest.advanceTimersByTime(1000);
    expect(action).not.toHaveBeenCalled();
  });

  it('fires on the Menu key', () => {
    const action = jest.fn();
    setLongPressTarget(action);
    handleRemoteEvent({ eventType: 'menu', eventKeyAction: 0 });
    expect(action).toHaveBeenCalledTimes(1);
    clearLongPressTarget(action);
  });
});
