import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sacakly_customer/core/data/customer_store.dart';
import 'package:sacakly_customer/core/network/api_client.dart';
import 'package:sacakly_customer/core/theme/app_theme.dart';
import 'package:sacakly_customer/modules/auth/login_screen.dart';

void main() {
  testWidgets('login stays usable on a narrow phone through SMS verification', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    SharedPreferences.setMockInitialValues({});
    final api = _AuthApi(await SharedPreferences.getInstance());
    final store = Store(api);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => Navigator.push<void>(
                context,
                MaterialPageRoute(builder: (_) => Login(store)),
              ),
              child: const Text('Open login'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open login'));
    await tester.pumpAndSettle();
    expect(find.text('Saçakly’ye hoş geldiniz'), findsOneWidget);
    expect(find.byType(HugeIcon), findsWidgets);
    expect(tester.takeException(), isNull);

    await tester.enterText(find.byType(TextField).first, '65000001');
    await tester.tap(find.text('Kod gönder'));
    await tester.pumpAndSettle();

    expect(api.requestedPhone, '+99365000001');
    expect(
      tester.widget<TextField>(find.byType(TextField).first).readOnly,
      isTrue,
    );
    expect(find.text('SMS kodu'), findsWidgets);
    expect(find.text('Yerel test SMS kodu: 123456'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.ensureVisible(find.text('Kodu yeniden gönder'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kodu yeniden gönder'));
    await tester.pumpAndSettle();
    expect(api.requestCount, 2);
    expect(find.text('Yerel test SMS kodu: 654321'), findsOneWidget);

    tester.view.viewInsets = const FakeViewPadding(bottom: 290);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Kodu doğrula'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    await tester.enterText(find.byType(TextField).last, '654321');
    await tester.ensureVisible(find.text('Kodu doğrula'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kodu doğrula'));
    await tester.pumpAndSettle();

    expect(api.verifiedPhone, '+99365000001');
    expect(api.verifiedCode, '654321');
    expect(find.text('Open login'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

class _AuthApi extends Api {
  _AuthApi(super.prefs);

  String? requestedPhone;
  String? verifiedPhone;
  String? verifiedCode;
  int requestCount = 0;

  @override
  Future<dynamic> request(
    String method,
    String path, {
    Object? data,
    Map<String, dynamic>? query,
    bool auth = false,
    bool canRefresh = true,
  }) async {
    final body = data as Map<String, dynamic>;
    if (method == 'POST' && path == 'auth/otp/request') {
      requestCount++;
      requestedPhone = body['phone'] as String;
      return <String, dynamic>{
        'devCode': requestCount == 1 ? '123456' : '654321',
      };
    }
    if (method == 'POST' && path == 'auth/otp/verify') {
      verifiedPhone = body['phone'] as String;
      verifiedCode = body['code'] as String;
      return <String, dynamic>{
        'accessToken': 'access-token',
        'refreshToken': 'refresh-token',
      };
    }
    throw StateError('Unexpected auth request: $method $path');
  }
}
