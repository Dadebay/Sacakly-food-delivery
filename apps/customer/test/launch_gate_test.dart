import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sacakly_customer/core/data/customer_store.dart';
import 'package:sacakly_customer/core/network/api_client.dart';
import 'package:sacakly_customer/core/theme/app_theme.dart';
import 'package:sacakly_customer/modules/shell/cafe_select_screen.dart';
import 'package:sacakly_customer/modules/shell/widgets/customer_dock.dart';

void main() {
  testWidgets('app opens on the cafe list without the bottom bar', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({});
    final api = Api(await SharedPreferences.getInstance());
    api.dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) => handler.reject(
          DioException(
            requestOptions: options,
            type: DioExceptionType.connectionError,
          ),
        ),
      ),
    );
    final store = Store(api);

    await tester.pumpWidget(
      MaterialApp(theme: AppTheme.light, home: LaunchGate(store)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Nereden sipariş vermek istersiniz?'), findsOneWidget);
    expect(find.byType(CustomerDock), findsNothing);
    expect(find.byKey(const ValueKey('cafe-select-demo-han-tagam')), findsOne);
    expect(tester.takeException(), isNull);

    await tester.tap(find.byKey(const ValueKey('cafe-select-demo-panda')));
    await tester.pumpAndSettle();

    expect(store.cafe?['id'], 'demo-panda');
    expect(find.byType(CustomerDock), findsOneWidget);
    expect(find.text('Nereden sipariş vermek istersiniz?'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
