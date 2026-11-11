// The Android Maps key comes from GOOGLE_MAPS_API_KEY_ANDROID, which EAS has and
// a local `eas build` or `eas update` may not. Left in, the runtime version
// computed on this machine differs from the build's and EAS fails the build.
// Its value only fills an AndroidManifest meta-data entry and never changes
// between an update and the binary it lands on, so it is left out of the hash.
/** @type {import('expo/fingerprint').Config} */
module.exports = {
  fileHookTransform: (source, chunk) => {
    if (source.type === 'contents' && source.id === 'expoConfig' && typeof chunk === 'string') {
      return chunk.replace(/"androidGoogleMapsApiKey"\s*:\s*"[^"]*",?/, '');
    }
    return chunk;
  },
};
