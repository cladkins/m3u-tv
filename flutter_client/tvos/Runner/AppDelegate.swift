import AVFoundation
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
    private var avKitPlugin: AvKitPlaybackPlugin?
    private var mpvPlugin: MpvPlayerPlugin?

    override func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        return super.application(application, didFinishLaunchingWithOptions: launchOptions)
    }

    // UIScene lifecycle (required for apps built with the tvOS 27 SDK): the
    // scene builds its window from Main.storyboard, whose FlutterViewController
    // creates the implicit engine, so plugins register here, not against a
    // window/view controller made in application(_:didFinishLaunchingWithOptions:).
    func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
        GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
        registerAvKitPlugin(with: engineBridge.pluginRegistry)
        registerMpvPlugin(with: engineBridge.pluginRegistry)
        registerExternalUrlChannel(with: engineBridge.pluginRegistry)
        if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "DeepLinkChannel") {
            DeepLinkChannel.shared.attach(messenger: registrar.messenger())
        }
    }

    /// `url_launcher` isn't registered on tvOS, so trailer links (see
    /// lib/shared/trailer_button.dart) open other apps through this channel.
    /// Replies `{opened, canOpen}`: `opened` is true only when the system
    /// actually handed the URL to an app; `canOpen` is `canOpenURL` (only
    /// meaningful for schemes listed in LSApplicationQueriesSchemes).
    private func registerExternalUrlChannel(with registry: FlutterPluginRegistry) {
        guard let registrar = registry.registrar(forPlugin: "ExternalUrlChannel") else { return }
        FlutterMethodChannel(
            name: "m3u_tv/external_url",
            binaryMessenger: registrar.messenger()
        ).setMethodCallHandler { call, result in
            guard call.method == "open" else {
                result(FlutterMethodNotImplemented)
                return
            }
            guard let args = call.arguments as? [String: Any],
                  let raw = args["url"] as? String,
                  let url = URL(string: raw) else {
                result(["opened": false, "canOpen": false])
                return
            }
            let canOpen = UIApplication.shared.canOpenURL(url)
            UIApplication.shared.open(url, options: [:]) { opened in
                result(["opened": opened, "canOpen": canOpen])
            }
        }
    }

    private func registerAvKitPlugin(with registry: FlutterPluginRegistry) {
        guard let registrar = registry.registrar(forPlugin: "AvKitPlaybackPlugin") else { return }
        let plugin = AvKitPlaybackPlugin(textureRegistry: registrar.textures())
        avKitPlugin = plugin

        FlutterMethodChannel(
            name: AvKitPlaybackPlugin.methodChannelName,
            binaryMessenger: registrar.messenger()
        ).setMethodCallHandler { [weak plugin] call, result in
            plugin?.handle(call, result: result)
        }

        FlutterEventChannel(
            name: AvKitPlaybackPlugin.eventChannelName,
            binaryMessenger: registrar.messenger()
        ).setStreamHandler(plugin)
    }

    private func registerMpvPlugin(with registry: FlutterPluginRegistry) {
        guard let registrar = registry.registrar(forPlugin: "MpvPlayerPlugin") else { return }
        let plugin = MpvPlayerPlugin()
        mpvPlugin = plugin

        FlutterMethodChannel(
            name: MpvPlayerPlugin.methodChannelName,
            binaryMessenger: registrar.messenger()
        ).setMethodCallHandler { [weak plugin] call, result in
            plugin?.handle(call, result: result)
        }

        FlutterEventChannel(
            name: MpvPlayerPlugin.eventChannelName,
            binaryMessenger: registrar.messenger()
        ).setStreamHandler(plugin)

        registrar.register(
            MpvPlayerPlatformViewFactory(plugin: plugin),
            withId: "m3u_tv/apple_mpv_view"
        )
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

/// The app's window scene. FlutterSceneDelegate builds the window from
/// Main.storyboard; this adds the `m3utv://` links the system delivers to
/// the scene, at launch (in the connection options) and while running.
class SceneDelegate: FlutterSceneDelegate {
    override func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        super.scene(scene, willConnectTo: session, options: connectionOptions)
        if let url = connectionOptions.urlContexts.first?.url {
            DeepLinkChannel.shared.open(url)
        }
    }

    override func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        super.scene(scene, openURLContexts: URLContexts)
        if let url = URLContexts.first?.url {
            DeepLinkChannel.shared.open(url)
        }
    }
}
