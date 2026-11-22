import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:m3u_tv/services/deep_link_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('DeepLinkRequest.parse', () {
    test('reads a live channel link', () {
      expect(
        DeepLinkRequest.parse('m3utv://play?type=live&stream_id=16777'),
        const DeepLinkRequest(type: DeepLinkContentType.live, id: 16777),
      );
    });

    test('reads vod and series links', () {
      expect(
        DeepLinkRequest.parse('m3utv://play?type=vod&stream_id=42'),
        const DeepLinkRequest(type: DeepLinkContentType.vod, id: 42),
      );
      expect(
        DeepLinkRequest.parse('m3utv://play?type=series&stream_id=7'),
        const DeepLinkRequest(type: DeepLinkContentType.series, id: 7),
      );
      expect(
        DeepLinkRequest.parse('m3utv://play?type=series&series_id=7'),
        const DeepLinkRequest(type: DeepLinkContentType.series, id: 7),
      );
    });

    test('defaults to live and ignores case', () {
      expect(
        DeepLinkRequest.parse('M3UTV://PLAY?Stream_ID=5'),
        const DeepLinkRequest(type: DeepLinkContentType.live, id: 5),
      );
      expect(
        DeepLinkRequest.parse('m3utv:///play?type=LIVE&id=5'),
        const DeepLinkRequest(type: DeepLinkContentType.live, id: 5),
      );
    });

    test('rejects other schemes, actions, types and bad ids', () {
      for (final link in <String>[
        'https://play?type=live&stream_id=1',
        'm3utv://open?type=live&stream_id=1',
        'm3utv://play?type=radio&stream_id=1',
        'm3utv://play?type=live',
        'm3utv://play?type=live&stream_id=abc',
        'm3utv://play?type=live&stream_id=0',
        'm3utv://play?type=live&series_id=3',
        '',
      ]) {
        expect(DeepLinkRequest.parse(link), isNull, reason: link);
      }
    });
  });

  group('DeepLinkService', () {
    const channel = MethodChannel('test/deep_link');
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

    tearDown(() => messenger.setMockMethodCallHandler(channel, null));

    Future<void> sendLink(Object? link) => messenger.handlePlatformMessage(
      channel.name,
      channel.codec.encodeMethodCall(MethodCall('onLink', link)),
      (_) {},
    );

    test('delivers the launch link, then later ones', () async {
      messenger.setMockMethodCallHandler(channel, (call) async {
        expect(call.method, 'getInitialLink');
        return 'm3utv://play?type=live&stream_id=1';
      });
      final received = <DeepLinkRequest>[];
      final service = DeepLinkService(channel: channel);
      await service.start(received.add);
      await sendLink('m3utv://play?type=vod&stream_id=2');
      await sendLink('m3utv://nonsense');

      expect(received, const <DeepLinkRequest>[
        DeepLinkRequest(type: DeepLinkContentType.live, id: 1),
        DeepLinkRequest(type: DeepLinkContentType.vod, id: 2),
      ]);
    });

    test('does nothing without a native side', () async {
      final received = <DeepLinkRequest>[];
      await DeepLinkService(channel: channel).start(received.add);
      expect(received, isEmpty);
    });

    test('stops delivering after stop', () async {
      messenger.setMockMethodCallHandler(channel, (call) async => null);
      final received = <DeepLinkRequest>[];
      final service = DeepLinkService(channel: channel);
      await service.start(received.add);
      service.stop(received.add);
      await sendLink('m3utv://play?type=live&stream_id=1');
      expect(received, isEmpty);
    });
  });
}
