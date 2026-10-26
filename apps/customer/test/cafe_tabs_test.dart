import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sacakly_customer/core/data/customer_store.dart';
import 'package:sacakly_customer/core/network/api_client.dart';
import 'package:sacakly_customer/core/theme/app_theme.dart';
import 'package:sacakly_customer/modules/shell/main_nav_screen.dart';

Future<Store> _offlineStore() async {
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
  return Store(api);
}

void main() {
  for (final width in [320.0, 390.0]) {
    testWidgets('app bar cafe tabs switch cafe at width $width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final store = await _offlineStore();

      await tester.pumpWidget(
        MaterialApp(theme: AppTheme.light, home: Home(store)),
      );
      await tester.pumpAndSettle();
      expect(store.cafe?['id'], 'demo-han-tagam');

      expect(find.byKey(const ValueKey('cafe-tab-demo-panda')), findsOneWidget);
      double fade() => tester
          .widget<Opacity>(find.byKey(const ValueKey('cafe-switch-fade')))
          .opacity;
      expect(fade(), 1);
      // Only the selected cafe's tab shows its name.
      expect(find.text('Han tagam'), findsOneWidget);
      expect(find.text('Panda'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('cafe-tab-demo-panda')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(fade(), lessThan(1), reason: 'old cafe fades out');
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 150));
      expect(fade(), inInclusiveRange(0, 1));
      await tester.pumpAndSettle();
      expect(fade(), 1, reason: 'new cafe is fully shown again');
      expect(store.cafe?['id'], 'demo-panda');
      expect(find.text('Panda'), findsOneWidget);
      expect(find.text('Han tagam'), findsNothing);
      expect(tester.takeException(), isNull);

      // The menu tab keeps both the cafe tabs and the grid/list toggle.
      await tester.tap(find.text('Menü'));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byKey(const ValueKey('cafe-tab-demo-panda')), findsOneWidget);
      expect(find.byTooltip('Liste görünümü'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('switching cafe with a full cart does not ask first', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final store = await _offlineStore();

    await tester.pumpWidget(
      MaterialApp(theme: AppTheme.light, home: Home(store)),
    );
    await tester.pumpAndSettle();
    store.add(asList(store.categories.first['products']).first);
    expect(store.cartCount, 1);

    await tester.tap(find.byKey(const ValueKey('cafe-tab-demo-panda')));
    await tester.pumpAndSettle();

    expect(find.byType(AlertDialog), findsNothing);
    expect(store.cafe?['id'], 'demo-panda');
    expect(store.cartCount, 0);
    expect(tester.takeException(), isNull);
  });
}
