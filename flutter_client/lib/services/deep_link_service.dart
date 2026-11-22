import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

enum DeepLinkContentType { live, vod, series }

/// A parsed `m3utv://play?type=live&stream_id=16777` link. The ids are the
/// ones the Xtream API hands out (`stream_id`, `series_id`).
@immutable
class DeepLinkRequest {
  const DeepLinkRequest({required this.type, required this.id});

  static const scheme = 'm3utv';

  final DeepLinkContentType type;
  final int id;

  /// Null for anything that isn't a well-formed play link. `type` defaults
  /// to live; `id` and (for series) `series_id` are accepted for `stream_id`.
  static DeepLinkRequest? parse(String link) {
    final uri = Uri.tryParse(link.trim());
    if (uri == null || uri.scheme.toLowerCase() != scheme) return null;
    final action = uri.host.isNotEmpty
        ? uri.host
        : uri.pathSegments.firstOrNull ?? '';
    if (action.toLowerCase() != 'play') return null;

    final query = <String, String>{
      for (final entry in uri.queryParameters.entries)
        entry.key.toLowerCase(): entry.value,
    };
    final type = switch ((query['type'] ?? 'live').toLowerCase()) {
      'live' || 'channel' => DeepLinkContentType.live,
      'vod' || 'movie' => DeepLinkContentType.vod,
      'series' => DeepLinkContentType.series,
      _ => null,
    };
    if (type == null) return null;
    final rawId =
        query['stream_id'] ??
        (type == DeepLinkContentType.series ? query['series_id'] : null) ??
        query['id'];
    final id = int.tryParse(rawId ?? '');
    if (id == null || id <= 0) return null;
    return DeepLinkRequest(type: type, id: id);
  }

  @override
  bool operator ==(Object other) =>
      other is DeepLinkRequest && other.type == type && other.id == id;

  @override
  int get hashCode => Object.hash(type, id);

  @override
  String toString() => 'DeepLinkRequest(${type.name}, $id)';
}

/// Receives `m3utv://` links the system opened the app with (tvOS, iOS,
/// Android); a no-op where the native side has no channel.
///
/// Channel: `m3u_tv/deep_link`
///   Dart -> native: `getInitialLink` (the link that arrived before Dart
///   was listening, handed over once)
///   Native -> Dart: `onLink` (url)
class DeepLinkService {
  DeepLinkService({MethodChannel? channel})
    : _channel = channel ?? const MethodChannel(channelName);

  static const channelName = 'm3u_tv/deep_link';

  static final DeepLinkService instance = DeepLinkService();

  final MethodChannel _channel;
  ValueChanged<DeepLinkRequest>? _onLink;

  /// Starts delivering links to [onLink], beginning with the one that
  /// launched the app, if any. One listener at a time.
  Future<void> start(ValueChanged<DeepLinkRequest> onLink) async {
    _onLink = onLink;
    _channel.setMethodCallHandler(_handleCall);
    try {
      _deliver(await _channel.invokeMethod<String>('getInitialLink'));
    } on MissingPluginException {
      // Desktop, web, and native builds that predate the channel.
    } on PlatformException catch (error) {
      debugPrint('[DeepLink] getInitialLink failed: ${error.message}');
    }
  }

  void stop(ValueChanged<DeepLinkRequest> onLink) {
    if (_onLink != onLink) return;
    _onLink = null;
    _channel.setMethodCallHandler(null);
  }

  Future<void> _handleCall(MethodCall call) async {
    if (call.method != 'onLink') throw MissingPluginException();
    final arguments = call.arguments;
    _deliver(arguments is String ? arguments : null);
  }

  void _deliver(String? link) {
    final onLink = _onLink;
    if (link == null || onLink == null) return;
    final request = DeepLinkRequest.parse(link);
    if (request == null) {
      debugPrint('[DeepLink] Ignored unsupported link');
      return;
    }
    onLink(request);
  }
}
