import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'core/data/customer_store.dart';
import 'core/network/api_client.dart';
import 'core/services/firebase_messaging_service.dart';
import 'core/utils/performance_logger.dart';
import 'core/utils/system_ui_manager.dart';
import 'firebase_options.dart';

final _androidSystemUi = SystemUiManager();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // The default image cache (100 MB) holds only a screenful or two of dish
  // photos, so scrolling a long menu kept evicting and re-fetching them.
  PaintingBinding.instance.imageCache
    ..maximumSizeBytes = 300 * 1024 * 1024
    ..maximumSize = 1500;
  if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
    await _androidSystemUi.start();
  }
  final api = Api(await SharedPreferences.getInstance());
  PushNotifications? push;
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    push = PushNotifications(api);
  } catch (error) {
    debugPrint('Saçakly Firebase initialization failed: $error');
  }
  PerformanceLogger.instance.start();
  runApp(CustomerApp(Store(api, push: push)));
}
