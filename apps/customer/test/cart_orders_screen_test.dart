import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sacakly_customer/core/data/customer_store.dart';
import 'package:sacakly_customer/core/network/api_client.dart';
import 'package:sacakly_customer/core/theme/app_theme.dart';
import 'package:sacakly_customer/modules/cart/cart_screen.dart';
import 'package:sacakly_customer/modules/orders/orders_screen.dart';

void main() {
  testWidgets('guest order history uses the new empty illustration', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final store = Store(Api(await SharedPreferences.getInstance()));
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: Orders(store)),
      ),
    );

    expect(find.text('Siparişlerinizi görün'), findsOneWidget);
    expect(find.text('Her lezzetin yolculuğu burada'), findsNothing);
    expect(find.text('Giriş yap'), findsNothing);
    expect(
      find.image(const AssetImage('assets/images/empty_orders_receipt.png')),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('empty signed-in order history uses the illustration', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({'access_token': 'test-token'});
    final api = Api(await SharedPreferences.getInstance());
    api.dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) => handler.resolve(
          Response(
            requestOptions: options,
            statusCode: 200,
            data: {'items': <Object>[]},
          ),
        ),
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: Orders(Store(api))),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Henüz sipariş yok'), findsOneWidget);
    expect(find.text('Her lezzetin yolculuğu burada'), findsNothing);
    expect(
      find.image(const AssetImage('assets/images/empty_orders_receipt.png')),
      findsOneWidget,
    );
  });

  testWidgets('cart quantity updates subtotal and shows empty state', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({});
    final store = Store(Api(await SharedPreferences.getInstance()))
      ..cafe = {'id': 'cafe-1', 'name': 'Güneş Kafe'};
    store.add({'id': 'dish-1', 'name': 'Mantı', 'price': 12});
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: AnimatedBuilder(
            animation: store,
            builder: (context, _) => Cart(store, openMenu: () {}),
          ),
        ),
      ),
    );

    expect(find.text('Güneş Kafe'), findsOneWidget);
    expect(find.text('12.00 TMT'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, -180));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Artır'));
    await tester.pump();
    expect(store.cartCount, 2);
    expect(find.text('24.00 TMT'), findsOneWidget);
    await tester.tap(find.byTooltip('Azalt'));
    await tester.pump();
    await tester.tap(find.byTooltip('Azalt'));
    await tester.pump();
    expect(store.cart, isEmpty);
    expect(find.text('Sepetiniz henüz boş'), findsOneWidget);
    expect(find.byTooltip('Geri'), findsNothing);
    expect(find.text('Menüyü keşfet'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('checkout bar shows the subtotal and explains sample menus', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final store = Store(Api(await SharedPreferences.getInstance()))
      ..cafe = {'id': 'cafe-1', 'name': 'Güneş Kafe'}
      ..offlinePreview = true;
    store.add({'id': 'dish-1', 'name': 'Mantı', 'price': 12});
    store.add({'id': 'dish-1', 'name': 'Mantı', 'price': 12});

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          bottomNavigationBar: AnimatedBuilder(
            animation: store,
            builder: (context, _) => CartCheckoutBar(store),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    // Once in the summary row, once on the yellow checkout pill.
    expect(find.text('24.00 TMT'), findsNWidgets(2));
    expect(find.text('Sipariş ver'), findsOneWidget);

    // The amount follows quantity changes.
    store.changeQuantity(store.cart.first, 3);
    await tester.pumpAndSettle();
    expect(find.text('36.00 TMT'), findsNWidgets(2));

    // A sample (offline) menu can't be ordered, and says so.
    await tester.tap(find.text('Sipariş ver'));
    await tester.pump();
    expect(
      find.textContaining('Örnek menüde sipariş verilemez'),
      findsOneWidget,
    );
  });

  testWidgets('cart menu clears every item', (tester) async {
    tester.view.physicalSize = const Size(360, 760);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({});
    final store = Store(Api(await SharedPreferences.getInstance()))
      ..cafe = {'id': 'cafe-1', 'name': 'Güneş Kafe'};
    store.add({'id': 'dish-1', 'name': 'Mantı', 'price': 12});
    store.add({'id': 'dish-2', 'name': 'Plov', 'price': 30});
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: AnimatedBuilder(
            animation: store,
            builder: (context, _) => Cart(store, openMenu: () {}),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Mantı'), findsOneWidget);
    expect(find.text('Plov'), findsOneWidget);

    // Declining keeps the cart.
    await tester.tap(find.byTooltip('Daha fazla'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sepeti temizle'));
    await tester.pumpAndSettle();
    expect(find.text('Sepeti temizleyelim mi?'), findsOneWidget);
    expect(find.textContaining('2 ürün'), findsOneWidget);
    await tester.tap(find.text('Vazgeç'));
    await tester.pumpAndSettle();
    expect(store.cartCount, 2);
    expect(find.text('Sepeti temizleyelim mi?'), findsNothing);

    // Confirming empties it.
    await tester.tap(find.byTooltip('Daha fazla'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sepeti temizle'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Temizle'));
    await tester.pumpAndSettle();
    expect(store.cart, isEmpty);
    expect(find.text('Sepetiniz henüz boş'), findsOneWidget);
  });

  testWidgets('orders render API status, branch and total', (tester) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({'access_token': 'test-token'});
    final api = Api(await SharedPreferences.getInstance());
    api.dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: {
                'items': [
                  {
                    'number': 42,
                    'status': 'OUT_FOR_DELIVERY',
                    'branchName': 'Güneş Kafe',
                    'createdAt': '2026-10-09T10:30:00Z',
                    'total': 35.5,
                    'items': [
                      {'quantity': 2},
                    ],
                  },
                ],
              },
            ),
          );
        },
      ),
    );
    final store = Store(api);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: Orders(store)),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sipariş #42'), findsOneWidget);
    expect(find.text('Yolda'), findsOneWidget);
    expect(find.text('Güneş Kafe'), findsOneWidget);
    expect(find.text('35.50 TMT'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
