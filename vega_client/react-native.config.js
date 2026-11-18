// Vega links a library's native half from a `kepler.autolink` entry in the
// library's react-native.config.js. Amazon's AsyncStorage port declares its
// entry in a form the build did not pick up on Vega OS 2.0 (the app saw
// "NativeModule: AsyncStorage is null"), so it is restated here at project
// level. The values are copied from that package's own config.
module.exports = {
  dependencies: {
    '@react-native-async-storage/async-storage': {
      platforms: {
        kepler: {
          autolink: {
            AmazonAsyncStorageLib: {
              provider: 'system',
              libraryName: 'libkeplerscript-async-storage-lib-2.so.2',
              linkDynamic: true,
              turbomodules: ['RNCAsyncStorage'],
            },
          },
        },
      },
    },
  },
};
