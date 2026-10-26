import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sacakly_customer/core/data/customer_store.dart';
import 'package:sacakly_customer/core/data/demo_catalog.dart';
import 'package:sacakly_customer/core/network/api_client.dart';
import 'package:sacakly_customer/core/theme/app_theme.dart';
import 'package:sacakly_customer/modules/catalog/menu_screen.dart';

void main() {
  testWidgets('menu opens categories and adds a product on a narrow phone', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    SharedPreferences.setMockInitialValues({});
    final store = Store(Api(await SharedPreferences.getInstance()))
      ..cafe = DemoCatalog.cafes.first
      ..categories = DemoCatalog.categoriesFor('demo-han-tagam')
      ..offlinePreview = true;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: AnimatedBuilder(
            animation: store,
            builder: (context, _) => Menu(store),
          ),
        ),
      ),
    );

    expect(find.text('Han tagam'), findsNothing);
    expect(find.text('SEÇİLİ KAFE'), findsNothing);
    expect(find.byType(TextField), findsNothing);
    expect(find.text('Kategoriler'), findsNothing);
    expect(
      find.byKey(const ValueKey('menu-category-demo-plov')),
      findsOneWidget,
    );
    expect(find.text('Плов по-ашхабадски'), findsNothing);
    expect(tester.takeException(), isNull);

    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('menu-category-demo-somsa')),
      190,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('menu-category-demo-somsa')));
    await tester.pumpAndSettle();
    expect(find.text('Мясная самса'), findsOneWidget);
    await tester.tap(find.byTooltip('Мясная самса sepete ekle'));
    await tester.pump();
    expect(store.cartCount, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('empty menu leads back to cafe selection', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final store = Store(Api(await SharedPreferences.getInstance()));
    var openedCafes = false;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: Menu(store, openCafes: () => openedCafes = true)),
      ),
    );
    await tester.tap(find.text('Kafelere göz at'));
    expect(openedCafes, isTrue);
  });

  testWidgets('variant selection keeps the selected price in cart', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final store = Store(Api(await SharedPreferences.getInstance()))
      ..cafe = {'id': 'cafe', 'name': 'Deneme Kafe'}
      ..categories = [
        {
          'id': 'drinks',
          'name': 'İçecekler',
          'products': [
            {
              'id': 'tea',
              'name': 'Çay',
              'minPrice': 5,
              'variants': [
                {'id': 'small', 'name': 'Küçük', 'price': 5, 'isActive': true},
                {'id': 'large', 'name': 'Büyük', 'price': 8, 'isActive': true},
              ],
            },
          ],
        },
      ];
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: Menu(store)),
      ),
    );

    await tester.tap(find.byKey(const ValueKey('menu-category-drinks')));
    await tester.pumpAndSettle();
    expect(find.text('İçecekler'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.byTooltip('Çay sepete ekle'),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byTooltip('Çay sepete ekle'));
    await tester.pumpAndSettle();
    expect(find.text('Seçenek seçin'), findsOneWidget);
    await tester.tap(find.text('Büyük'));
    await tester.pumpAndSettle();
    expect(store.cartCount, 1);
    expect(store.cart.single.variant?['id'], 'large');
    expect(store.cart.single.price, 8);
    expect(tester.takeException(), isNull);
  });
}
