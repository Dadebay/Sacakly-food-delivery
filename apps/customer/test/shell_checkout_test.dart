import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sacakly_customer/core/data/customer_store.dart';
import 'package:sacakly_customer/core/network/api_client.dart';
import 'package:sacakly_customer/core/theme/app_theme.dart';
import 'package:sacakly_customer/modules/cart/cart_screen.dart';
import 'package:sacakly_customer/modules/shell/main_nav_screen.dart';

void main() {
  testWidgets('cart tab swaps the dock for the checkout bar and back', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({});
    final api = Api(await SharedPreferences.getInstance());
    // No server: the store falls back to its bundled sample menu.
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
      MaterialApp(theme: AppTheme.light, home: Home(store)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Menü'));
    await tester.pump();
    // No logo or title above the cafe tabs.
    expect(
      find.descendant(of: find.byType(AppBar), matching: find.text('Menü')),
      findsNothing,
    );
    expect(
      find.descendant(of: find.byType(AppBar), matching: find.text('Saçakly')),
      findsNothing,
    );
    expect(
      find.descendant(
        of: find.byType(AppBar),
        matching: find.byKey(const ValueKey('cafe-tab-demo-han-tagam')),
      ),
      findsOneWidget,
    );
    expect(find.text('Kategoriler'), findsNothing);
    expect(
      find.descendant(
        of: find.byType(AppBar),
        matching: find.byTooltip('Liste görünümü'),
      ),
      findsOneWidget,
    );
    await tester.tap(find.byTooltip('Liste görünümü'));
    await tester.pump();
    expect(find.byTooltip('Izgara görünümü'), findsOneWidget);

    // Empty cart: the dock stays and the cart shows its empty state.
    await tester.tap(find.text('Sepet'));
    await tester.pumpAndSettle();
    expect(find.text('Sepetiniz henüz boş'), findsOneWidget);
    expect(find.byType(CartCheckoutBar), findsNothing);
    expect(find.text('Kafeler'), findsOneWidget);
    expect(find.byTooltip('Geri'), findsNothing);
    expect(find.text('Menüyü keşfet'), findsNothing);
    final dockTop = tester.getTopLeft(find.byKey(const ValueKey('dock'))).dy;
    final contentCenter = tester
        .getCenter(find.byKey(const ValueKey('empty-cart-content')))
        .dy;
    expect(contentCenter, closeTo((56 + dockTop) / 2, 12));

    // With an item in the cart the dock slides away for the checkout bar.
    store.add({'id': 'dish-1', 'name': 'Mantı', 'price': 12});
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 150));
    expect(find.byType(CartCheckoutBar), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.text('Kafeler'), findsNothing);
    expect(find.text('Sipariş ver'), findsOneWidget);

    // Back goes to the menu and the dock returns.
    await tester.tap(find.byTooltip('Geri'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 1000));
    expect(find.byType(CartCheckoutBar), findsNothing);
    expect(find.text('Kafeler'), findsOneWidget);

    await tester.tap(find.byTooltip('Profil'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Siparişlerim').first);
    await tester.pumpAndSettle();
    expect(
      find.descendant(
        of: find.byType(AppBar),
        matching: find.text('Siparişlerim'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(of: find.byType(AppBar), matching: find.text('Saçakly')),
      findsNothing,
    );
    expect(find.byTooltip('Geri'), findsOneWidget);
    await tester.tap(find.byTooltip('Geri'));
    await tester.pumpAndSettle();
    expect(
      find.descendant(of: find.byType(AppBar), matching: find.text('Profilim')),
      findsOneWidget,
    );
  });
}
