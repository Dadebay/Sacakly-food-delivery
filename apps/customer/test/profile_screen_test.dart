import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sacakly_customer/core/data/customer_store.dart';
import 'package:sacakly_customer/core/network/api_client.dart';
import 'package:sacakly_customer/core/theme/app_theme.dart';
import 'package:sacakly_customer/modules/profile/profile_screen.dart';
import 'package:sacakly_customer/modules/profile/widgets/about_app_dialog.dart';

void main() {
  testWidgets('guest profile fits a narrow phone and keeps its actions', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    SharedPreferences.setMockInitialValues({});
    final store = Store(_ProfileApi(await SharedPreferences.getInstance()));
    var openedOrders = false;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: Profile(store, openOrders: () => openedOrders = true),
        ),
      ),
    );

    expect(find.text('Profilim'), findsOneWidget);
    expect(find.text('Giriş yap'), findsOneWidget);
    expect(
      tester.getSize(find.byKey(const ValueKey('guest-profile-card'))).height,
      lessThan(190),
    );
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Siparişlerim'));
    expect(openedOrders, isTrue);
  });

  testWidgets('signed-in profile shows account and support details', (
    tester,
  ) async {
    const launcherChannel = MethodChannel('plugins.flutter.io/url_launcher');
    String? dialedUrl;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(launcherChannel, (call) async {
          if (call.method == 'launch') {
            dialedUrl =
                (call.arguments as Map<dynamic, dynamic>)['url'] as String;
            return true;
          }
          return null;
        });
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(launcherChannel, null),
    );

    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    SharedPreferences.setMockInitialValues({'access_token': 'test-token'});
    final store = Store(_ProfileApi(await SharedPreferences.getInstance()));
    var openedOrders = false;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: Profile(store, openOrders: () => openedOrders = true),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Myradow Maksat'), findsOneWidget);
    expect(find.text('+99365000000'), findsOneWidget);
    expect(find.text('Bize ulaşın'), findsNothing);
    expect(find.text('+99312000000'), findsNothing);
    expect(find.text('+99362990344'), findsOneWidget);
    expect(find.text('Ara'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Siparişlerim').first);
    expect(openedOrders, isTrue);

    await tester.ensureVisible(find.text('+99362990344'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('+99362990344'));
    await tester.pump();
    expect(dialedUrl, 'tel:+99362990344');
  });

  testWidgets('about dialog fits a narrow phone and closes', (tester) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    SharedPreferences.setMockInitialValues({});
    final store = Store(_ProfileApi(await SharedPreferences.getInstance()));
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: Profile(store, openOrders: () {})),
      ),
    );

    await tester.ensureVisible(find.text('Uygulama hakkında'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Uygulama hakkında'));
    await tester.pumpAndSettle();

    expect(find.byType(AboutAppDialog), findsOneWidget);
    expect(find.text('Saçakly'), findsOneWidget);
    expect(find.text('Sürüm 1.0.0'), findsWidgets);
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('Kapat'));
    await tester.pumpAndSettle();
    expect(find.byType(AboutAppDialog), findsNothing);
  });
}

class _ProfileApi extends Api {
  _ProfileApi(super.prefs);

  @override
  Future<dynamic> request(
    String method,
    String path, {
    Object? data,
    Map<String, dynamic>? query,
    bool auth = false,
    bool canRefresh = true,
  }) async {
    if (path == 'contacts') {
      return <String, dynamic>{'phone': '+99312000000'};
    }
    if (path == 'users/me') {
      return <String, dynamic>{
        'firstName': 'Myradow',
        'lastName': 'Maksat',
        'phone': '+99365000000',
      };
    }
    throw StateError('Unexpected profile request: $method $path');
  }
}
