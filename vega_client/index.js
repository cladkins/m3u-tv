import { AppRegistry } from 'react-native';
import { App } from './src/App';
import { name as appName } from './app.json';

// Uncaught JS errors abort the app process on Vega and the crash dump has no
// JS stack, so log them first under a tag the device log can be grepped for.
const previousHandler = global.ErrorUtils?.getGlobalHandler?.();
global.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
  console.error(`M3UTV ${isFatal ? 'fatal' : 'error'}: ${error?.message}\n${error?.stack ?? ''}`);
  previousHandler?.(error, isFatal);
});

AppRegistry.registerComponent(appName, () => App);
