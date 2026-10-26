import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sacakly_customer/core/data/customer_store.dart';
import 'package:sacakly_customer/core/data/demo_catalog.dart';
import 'package:sacakly_customer/core/network/api_client.dart';
import 'package:sacakly_customer/core/theme/app_theme.dart';
import 'package:sacakly_customer/modules/home/home_screen.dart';

void main() {
  testWidgets('home carousel filters categories and adds a real menu item', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    SharedPreferences.setMockInitialValues({});
    final store = Store(Api(await SharedPreferences.getInstance()))
      ..cafes = DemoCatalog.cafes
      ..cafe = DemoCatalog.cafes.first
      ..categories = DemoCatalog.categoriesFor('demo-han-tagam')
      ..offlinePreview = true;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: Cafes(store, () {})),
      ),
    );

    expect(find.text('Yemek kategorileri'), findsOneWidget);
    expect(find.text('Tümü'), findsNothing);
    await tester.scrollUntilVisible(
      find.text('Öne çıkan lezzetler'),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Öne çıkan lezzetler'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('featured-carousel')),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sepete ekle').hitTestable().first);
    expect(store.cartCount, 1);

    await tester.drag(
      find.byKey(const ValueKey('featured-carousel')),
      const Offset(-220, 0),
    );
    await tester.pumpAndSettle();
    final carousel = find.byKey(const ValueKey('featured-carousel'));
    expect(
      find.descendant(of: carousel, matching: find.text('Плов с курицей')),
      findsOneWidget,
    );

    // Back to the top, where the category strip is.
    await tester.drag(find.byType(Scrollable).first, const Offset(0, 3000));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Шашлык').first);
    await tester.pumpAndSettle();
    expect(
      find.descendant(of: carousel, matching: find.text('Шашлык из говядины')),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('search lists every matching dish and has no cafe chips', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    SharedPreferences.setMockInitialValues({});
    final store = Store(Api(await SharedPreferences.getInstance()))
      ..cafes = DemoCatalog.cafes
      ..cafe = DemoCatalog.cafes.first
      ..categories = DemoCatalog.categoriesFor('demo-han-tagam')
      ..offlinePreview = true;

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          body: AnimatedBuilder(
            animation: store,
            builder: (context, _) => Cafes(store, () {}),
          ),
        ),
      ),
    );

    // Cafes are chosen from the app bar, not from the home page.
    expect(find.text('Kafeler'), findsNothing);
    expect(find.byType(ChoiceChip), findsNothing);
    expect(find.text('Ne yemek istersin?'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'шашлык');
    await tester.pumpAndSettle();
    expect(find.textContaining('arama sonucu'), findsOneWidget);
    expect(find.byKey(const ValueKey('featured-carousel')), findsNothing);
    expect(find.byTooltip('Шашлык из говядины sepete ekle'), findsOneWidget);
    await tester.tap(find.byTooltip('Шашлык из говядины sepete ekle'));
    await tester.pump();
    expect(store.cartCount, 1);

    // The plus bends into a tick once the dish is really in the cart, holds,
    // then bends back.
    PlusToCheckPainter painter() =>
        tester
                .widget<CustomPaint>(
                  find.descendant(
                    of: find.byTooltip('Шашлык из говядины sepete ekle'),
                    matching: find.byKey(const ValueKey('add-button-icon')),
                  ),
                )
                .painter!
            as PlusToCheckPainter;
    expect(painter().progress, 0);
    await tester.pump(const Duration(milliseconds: 400));
    expect(painter().progress, 1, reason: 'tick while it holds');
    await tester.pumpAndSettle();
    expect(painter().progress, 0, reason: 'back to a plus');

    await tester.enterText(find.byType(TextField), 'zzzz');
    await tester.pumpAndSettle();
    expect(find.text('Bu arama için yemek bulunamadı'), findsOneWidget);

    await tester.tap(find.byTooltip('Aramayı temizle'));
    await tester.pumpAndSettle();
    expect(find.text('Öne çıkan lezzetler'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  for (final width in [320.0, 700.0]) {
    testWidgets('home lists the whole menu by category at width $width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      SharedPreferences.setMockInitialValues({});
      final store = Store(Api(await SharedPreferences.getInstance()))
        ..cafes = DemoCatalog.cafes
        ..cafe = DemoCatalog.cafes.first
        ..categories = DemoCatalog.categoriesFor('demo-han-tagam')
        ..offlinePreview = true;

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: Scaffold(body: Cafes(store, () {})),
        ),
      );

      await tester.scrollUntilVisible(
        find.text('Tüm menü'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      // A dish from the last category is reachable and can be added.
      final lastCategory = store.categories.last;
      final dish = asList(lastCategory['products']).first;
      final add = find.byTooltip('${dish['name']} sepete ekle');
      await tester.scrollUntilVisible(
        add,
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(add);
      await tester.pumpAndSettle();
      await tester.tap(add);
      await tester.pump();
      expect(store.cartCount, 1);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('long menu keeps the last category reachable', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    SharedPreferences.setMockInitialValues({});
    final cafe = {'id': 'long-menu', 'name': 'Uzun Menü'};
    final store = Store(Api(await SharedPreferences.getInstance()))
      ..cafes = [cafe]
      ..cafe = cafe
      ..categories = [
        for (var category = 1; category <= 19; category++)
          {
            'id': 'category-$category',
            'name': 'Kategori $category',
            'products': [
              for (var product = 1; product <= 4; product++)
                {
                  'id': 'dish-$category-$product',
                  'name': 'Yemek $category-$product',
                  'price': 12,
                },
            ],
          },
      ];

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: Cafes(store, () {})),
      ),
    );

    final scrollable = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(
      find.text('Kategori 19'),
      600,
      maxScrolls: 60,
      scrollable: scrollable,
    );
    expect(find.text('Kategori 19'), findsOneWidget);
    final add = find.byTooltip('Yemek 19-4 sepete ekle');
    await tester.scrollUntilVisible(add, 240, scrollable: scrollable);
    await tester.tap(add);
    await tester.pump();
    expect(store.cartCount, 1);
    expect(tester.takeException(), isNull);
  });
}
