import AVFoundation
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
    /// The one Flutter engine, shared by the phone's window (SceneDelegate)
    /// and the CarPlay screen (CarPlaySceneDelegate). Whichever connects
    /// first starts it: the car can open the app without the phone's window,
    /// so the implicit engine Flutter would create for that window isn't
    /// enough. Created on main, on first use.
    static let sharedEngine: FlutterEngine = {
        let engine = FlutterEngine(name: "m3u_tv", project: nil, allowHeadlessExecution: true)
        engine.run()
        (UIApplication.shared.delegate as? AppDelegate)?.registerPlugins(with: engine)
        return engine
    }()

    private var avKitPlugin: AvKitPlaybackPlugin?
    private var mpvPlugin: MpvPlayerPlugin?
    private var nowPlayingPlugin: NowPlayingPlugin?

    override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Declares that playback can carry 5.1/7.1 and Dolby audio, so the
        // system offers multichannel Spatial Audio on AirPods. mpv's
        // AVFoundation output only declares it for sources above stereo.
        do {
            try AVAudioSession.sharedInstance().setSupportsMultichannelContent(true)
        } catch {
            NSLog("[AppDelegate] Failed to declare multichannel audio content: %@", error.localizedDescription)
        }
        return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }

    private func registerPlugins(with registry: FlutterPluginRegistry) {
        GeneratedPluginRegistrant.register(with: registry)
        registerAvKitPlugin(registry: registry)
        registerMpvPlugin(registry: registry)
        if let registrar = registry.registrar(forPlugin: "NowPlayingPlugin") {
            nowPlayingPlugin = NowPlayingPlugin(messenger: registrar.messenger())
        }
        if let registrar = registry.registrar(forPlugin: "DeepLinkChannel") {
            DeepLinkChannel.shared.attach(messenger: registrar.messenger())
        }
        if let registrar = registry.registrar(forPlugin: "AppScenesChannel") {
            // Whether the phone's window is up for the full-screen player.
            // CarPlay plays through its own audio-only player otherwise: iOS
            // can drop a background window while the car keeps the app running.
            FlutterMethodChannel(
                name: "m3u_tv/app_scenes",
                binaryMessenger: registrar.messenger()
            ).setMethodCallHandler { call, result in
                guard call.method == "phoneWindowConnected" else {
                    result(FlutterMethodNotImplemented)
                    return
                }
                result(AppDelegate.sharedEngine.viewController != nil)
            }
        }
    }

    private func registerMpvPlugin(registry: FlutterPluginRegistry) {
        guard let registrar = registry.registrar(forPlugin: "MpvPlayerPlugin") else { return }
        let messenger = registrar.messenger()

        let plugin = MpvPlayerPlugin()
        plugin.systemUiChannel = FlutterMethodChannel(name: "m3u_tv/system_ui", binaryMessenger: messenger)
        mpvPlugin = plugin

        FlutterMethodChannel(
            name: MpvPlayerPlugin.methodChannelName,
            binaryMessenger: messenger
        ).setMethodCallHandler { [weak plugin] call, result in
            plugin?.handle(call, result: result)
        }

        FlutterEventChannel(
            name: MpvPlayerPlugin.eventChannelName,
            binaryMessenger: messenger
        ).setStreamHandler(plugin)

        registrar.register(
            MpvPlayerPlatformViewFactory(plugin: plugin),
            withId: "m3u_tv/apple_mpv_view"
        )
    }

    private func registerAvKitPlugin(registry: FlutterPluginRegistry) {
        guard let registrar = registry.registrar(forPlugin: "AvKitPlaybackPlugin") else { return }
        let messenger = registrar.messenger()
        let textureRegistry = registrar.textures()

        let plugin = AvKitPlaybackPlugin(textureRegistry: textureRegistry)
        avKitPlugin = plugin

        let methodChannel = FlutterMethodChannel(
            name: AvKitPlaybackPlugin.methodChannelName,
            binaryMessenger: messenger
        )
        methodChannel.setMethodCallHandler { [weak plugin] (call: FlutterMethodCall, result: @escaping FlutterResult) in
            plugin?.handle(call, result: result)
        }

        let eventChannel = FlutterEventChannel(
            name: AvKitPlaybackPlugin.eventChannelName,
            binaryMessenger: messenger
        )
        eventChannel.setStreamHandler(plugin)
    }
}

/// Hands `m3utv://` links the system opened the app with to Dart (see
/// lib/services/deep_link_service.dart).
///
/// Channel: `m3u_tv/deep_link`
///   Dart -> native: `getInitialLink` (a link Dart has not taken yet, once)
///   Native -> Dart: `onLink` (url)
final class DeepLinkChannel {
    static let shared = DeepLinkChannel()

    private var channel: FlutterMethodChannel?
    private var pending: String?

    func attach(messenger: FlutterBinaryMessenger) {
        let channel = FlutterMethodChannel(name: "m3u_tv/deep_link", binaryMessenger: messenger)
        channel.setMethodCallHandler { [weak self] call, result in
            guard call.method == "getInitialLink" else {
                result(FlutterMethodNotImplemented)
                return
            }
            result(self?.pending)
            self?.pending = nil
        }
        self.channel = channel
    }

    /// A link can arrive before the engine exists or before Dart listens
    /// (a cold start), so it is kept until Dart has taken it either way.
    func open(_ url: URL) {
        guard url.scheme?.lowercased() == "m3utv" else { return }
        let link = url.absoluteString
        pending = link
        channel?.invokeMethod("onLink", arguments: link) { [weak self] reply in
            if let reply = reply as? NSObject, reply == FlutterMethodNotImplemented { return }
            if reply is FlutterError { return }
            if self?.pending == link { self?.pending = nil }
        }
    }
}
