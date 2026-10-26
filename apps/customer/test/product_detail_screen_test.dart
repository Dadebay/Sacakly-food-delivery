import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sacakly_customer/core/data/customer_store.dart';
import 'package:sacakly_customer/core/network/api_client.dart';
import 'package:sacakly_customer/core/theme/app_theme.dart';
import 'package:sacakly_customer/modules/catalog/menu_screen.dart';
import 'package:sacakly_customer/modules/catalog/product_detail_screen.dart';
import 'package:sacakly_customer/modules/home/widgets/featured_food_carousel.dart';

void main() {
  testWidgets('menu product opens detail with cafe location and adds to cart', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    SharedPreferences.setMockInitialValues({});
    final store = Store(Api(await SharedPreferences.getInstance()))
      ..cafe = {
        'id': 'cafe',
        'name': 'Han tagam',
        'address': 'Aşgabat, Magtymguly şaýoly',
      }
      ..categories = [
        {
          'id': 'meals',
          'name': 'Yemekler',
          'products': [
            {
              'id': 'manti',
              'name': 'Mantı',
              'description': 'Etli ve taze hazırlanmış mantı.',
              'price': 24,
              'preparationMinutes': 25,
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

    await tester.tap(find.byKey(const ValueKey('menu-category-meals')));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('Mantı'),
      170,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Mantı'));
    await tester.pumpAndSettle();
    expect(find.byType(ProductDetailScreen), findsOneWidget);
    expect(find.text('Han tagam'), findsOneWidget);
    expect(find.text('Aşgabat, Magtymguly şaýoly'), findsOneWidget);
    expect(find.text('Kategori'), findsOneWidget);
    expect(find.text('Başlangıç'), findsOneWidget);
    expect(find.text('25 dk'), findsOneWidget);
    expect(find.text('24.00 TMT'), findsNWidgets(2));
    expect(tester.takeException(), isNull);

    await tester.tap(find.byTooltip('Favorilere ekle'));
    await tester.pump();
    expect(
      store.api.prefs.getStringList('favorite_product_ids'),
      contains('manti'),
    );
    String? copiedText;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          copiedText = (call.arguments as Map)['text'] as String?;
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );
    await tester.tap(find.byTooltip('Ürün bilgisini kopyala'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(copiedText, 'Mantı · Han tagam');
    await tester.tap(find.text('Sepete ekle'));
    await tester.pump();
    expect(store.cartCount, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'featured product opens detail and missing location stays honest',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final store = Store(Api(await SharedPreferences.getInstance()))
        ..cafe = {'id': 'cafe', 'name': 'Panda'};
      final product = {'id': 'tea', 'name': 'Çay', 'price': 8};
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: Scaffold(
            body: FeaturedFoodCarousel(
              dishes: [FeaturedDish(product, 'İçecekler')],
              store: store,
            ),
          ),
        ),
      );

      await tester.tap(find.text('Çay'));
      await tester.pumpAndSettle();
      expect(find.byType(ProductDetailScreen), findsOneWidget);
      expect(find.text('Panda'), findsOneWidget);
      expect(find.text('Konum bilgisi eklenmemiş'), findsOneWidget);
      await tester.tap(find.byTooltip('Favorilere ekle'));
      await tester.tap(find.byTooltip('Geri'));
      await tester.pumpAndSettle();
      expect(find.byType(ProductDetailScreen), findsNothing);
      expect(find.byTooltip('Favorilerden çıkar'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
