import { decodingInfo } from '@amazon-devices/react-native-w3cmedia';

const AUDIO: Array<[string, string]> = [
  ['AAC', 'audio/mp4;codecs=mp4a.40.2'],
  ['HE-AAC', 'audio/mp4;codecs=mp4a.40.5'],
  ['AC-3', 'audio/mp4;codecs=ac-3'],
  ['E-AC-3', 'audio/mp4;codecs=ec-3'],
  ['MP3', 'audio/mpeg'],
];

const VIDEO: Array<[string, string]> = [
  ['H.264', 'video/mp4;codecs=avc1.640028'],
  ['HEVC', 'video/mp4;codecs=hvc1.1.6.L120.90'],
  ['MPEG-2', 'video/mp2t;codecs=mp2v'],
];

let logged = false;

// Decoder support differs between the Virtual Device and Fire TV hardware, so
// the first playback logs what this device reports. A channel that never
// starts can then be matched against its codecs.
export function logDecoderSupport(): void {
  if (logged) return;
  logged = true;
  const ask = (label: string, config: Record<string, unknown>) =>
    (decodingInfo as (c: unknown) => Promise<{ supported: boolean }>)({ type: 'media-source', ...config })
      .then((info) => `${label}=${info.supported ? 'yes' : 'no'}`)
      .catch(() => `${label}=unknown`);
  Promise.all([
    ...AUDIO.map(([label, contentType]) =>
      ask(label, { audio: { contentType, channels: '2', bitrate: 128000, samplerate: 48000 } }),
    ),
    ...VIDEO.map(([label, contentType]) =>
      ask(label, { video: { contentType, width: 1920, height: 1080, bitrate: 8000000, framerate: 30 } }),
    ),
  ])
    .then((results) => console.log(`M3UTV decoders: ${results.join(', ')}`))
    .catch(() => undefined);
}
