import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../network/api_client.dart';
import '../l10n/app_language.dart';
import '../../firebase_options.dart';

const _channel = AndroidNotificationChannel(
  'sacakly_orders',
  'Saçakly bildirimleri',
  description: 'Sipariş ve kampanya bildirimleri',
  importance: Importance.high,
);

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
}

/// Firebase is the transport; the Saçakly API owns users and the inbox.
class PushNotifications with WidgetsBindingObserver {
  PushNotifications(this.api);

  final Api api;
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();
  final ValueNotifier<int?> pendingTab = ValueNotifier<int?>(null);
  bool _started = false;
  String? _registeredToken;
  final Set<String> _openedCampaigns = {};

  static int? tabForDeepLink(Object? value) => switch (value) {
    '/' || '/home' => 0,
    '/catalog' || '/categories' => 1,
    '/cart' => 2,
    '/orders' || '/orders/current' => 3,
    _ => null,
  };

  Future<void> start() async {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    try {
      await _local.initialize(
        const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
        ),
        onDidReceiveNotificationResponse: (response) =>
            _openDeepLink(response.payload),
      );
      await _local
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >()
          ?.createNotificationChannel(_channel);
      await _messaging.requestPermission(alert: true, badge: true, sound: true);
      await _messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );

      FirebaseMessaging.onMessage.listen(_foreground);
      FirebaseMessaging.onMessageOpenedApp.listen(_opened);
      _messaging.onTokenRefresh.listen((_) {
        unawaited(register());
        unawaited(_subscribePublic());
      });
      final initial = await _messaging.getInitialMessage();
      if (initial != null) _opened(initial);
      await _subscribePublic();
      await register();
    } catch (error) {
      debugPrint('Saçakly push initialization failed: $error');
    }
  }

  Future<String?> _token() async {
    if (Platform.isIOS) {
      // Apple can issue its APNs token after Firebase initializes.
      for (var attempt = 0; attempt < 10; attempt++) {
        if (await _messaging.getAPNSToken() != null) break;
        await Future<void>.delayed(const Duration(seconds: 1));
      }
      if (await _messaging.getAPNSToken() == null) return null;
    }
    return _messaging.getToken();
  }

  Future<void> _subscribePublic() async {
    try {
      if (await _token() != null) {
        // Matches the current Saçakly backend's public campaign topic.
        await _messaging.subscribeToTopic('a7-tagam');
      }
    } catch (error) {
      debugPrint('Saçakly public push subscription failed: $error');
    }
  }

  Future<void> register() async {
    if (api.accessToken == null) return;
    try {
      final token = await _token();
      if (token == null) return;
      await api.request(
        'PUT',
        'notifications/devices',
        auth: true,
        data: {
          'installationId': token,
          'platform': Platform.isIOS ? 'IOS' : 'ANDROID',
          'locale': AppLanguage.savedCode(api.prefs),
        },
      );
      _registeredToken = token;
    } catch (error) {
      debugPrint('Saçakly push registration failed: $error');
    }
  }

  Future<void> unregister() async {
    final token = _registeredToken;
    if (token == null || api.accessToken == null) return;
    try {
      await api.request(
        'DELETE',
        'notifications/devices/${Uri.encodeComponent(token)}',
        auth: true,
      );
      _registeredToken = null;
    } catch (error) {
      debugPrint('Saçakly push removal failed: $error');
    }
  }

  void _foreground(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null || Platform.isIOS) return;
    unawaited(
      _local.show(
        message.messageId?.hashCode ?? DateTime.now().millisecondsSinceEpoch,
        notification.title,
        notification.body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            'sacakly_orders',
            'Saçakly bildirimleri',
            channelDescription: 'Sipariş ve kampanya bildirimleri',
            importance: Importance.high,
            priority: Priority.high,
          ),
        ),
        payload: message.data['deepLink'],
      ),
    );
  }

  void _opened(RemoteMessage message) {
    final campaignId = message.data['campaignId'];
    if (campaignId != null && !_openedCampaigns.add(campaignId)) return;
    _openDeepLink(message.data['deepLink']);
  }

  void _openDeepLink(String? deepLink) {
    final tab = tabForDeepLink(deepLink);
    if (tab != null) pendingTab.value = tab;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(register());
      unawaited(_subscribePublic());
    }
  }
}
