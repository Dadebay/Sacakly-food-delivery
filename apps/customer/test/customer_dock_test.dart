import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:iconly/iconly.dart';
import 'package:sacakly_customer/core/theme/app_theme.dart';
import 'package:sacakly_customer/modules/shell/widgets/customer_dock.dart';

void main() {
  testWidgets('dark dock uses a white selection with dark label and icon', (
    tester,
  ) async {
    var selected = 0;
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: StatefulBuilder(
          builder: (context, setState) => Scaffold(
            bottomNavigationBar: CustomerDock(
              selectedIndex: selected,
              cartCount: 0,
              onTabSelected: (value) => setState(() => selected = value),
              onProfile: () => setState(() => selected = 3),
            ),
          ),
        ),
      ),
    );

    final indicator = tester.widget<DecoratedBox>(
      find.byKey(const ValueKey('dock-selection-indicator')),
    );
    expect((indicator.decoration as BoxDecoration).color, Colors.white);
    final selectedLabelStyles = find
        .ancestor(
          of: find.text('Kafeler'),
          matching: find.byType(AnimatedDefaultTextStyle),
        )
        .evaluate()
        .map((element) => (element.widget as AnimatedDefaultTextStyle).style);
    expect(
      selectedLabelStyles.any(
        (style) => style.color == const Color(0xFF111111),
      ),
      isTrue,
    );

    await tester.tap(find.byTooltip('Profil'));
    await tester.pumpAndSettle();
    final profileContainers = find
        .descendant(
          of: find.byTooltip('Profil'),
          matching: find.byType(AnimatedContainer),
        )
        .evaluate()
        .map((element) => element.widget as AnimatedContainer);
    expect(
      profileContainers.any(
        (container) =>
            (container.decoration as BoxDecoration?)?.color == Colors.white,
      ),
      isTrue,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('three tabs and separate profile fit on a narrow phone', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    var selected = -1;
    var profileOpened = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          bottomNavigationBar: CustomerDock(
            selectedIndex: 0,
            cartCount: 2,
            onTabSelected: (value) => selected = value,
            onProfile: () => profileOpened = true,
          ),
        ),
      ),
    );

    expect(find.text('Kafeler'), findsOneWidget);
    expect(find.text('Menü'), findsOneWidget);
    expect(find.text('Sepet'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Sepet'));
    expect(selected, 2);
    await tester.tap(find.byTooltip('Profil'));
    expect(profileOpened, isTrue);
  });

  testWidgets('selection glides to the new tab and uses Gilroy labels', (
    tester,
  ) async {
    var selected = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: StatefulBuilder(
          builder: (context, setState) {
            return Scaffold(
              bottomNavigationBar: CustomerDock(
                selectedIndex: selected,
                cartCount: 0,
                onTabSelected: (value) => setState(() => selected = value),
                onProfile: () {},
              ),
            );
          },
        ),
      ),
    );

    final indicator = find.byKey(const ValueKey('dock-selection-indicator'));
    final startX = tester.getCenter(indicator).dx;
    final labelStyles = find
        .ancestor(
          of: find.text('Kafeler'),
          matching: find.byType(AnimatedDefaultTextStyle),
        )
        .evaluate()
        .map((element) => (element.widget as AnimatedDefaultTextStyle).style);
    expect(labelStyles.any((style) => style.fontFamily == 'Gilroy'), isTrue);
    expect(find.byKey(const ValueKey('home-cafe-icon')), findsOneWidget);

    await tester.tap(find.text('Sepet'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 120));
    final middleX = tester.getCenter(indicator).dx;
    await tester.pumpAndSettle();
    final endX = tester.getCenter(indicator).dx;

    expect(middleX, greaterThan(startX));
    expect(endX, greaterThan(middleX));
    expect(find.byIcon(IconlyBold.buy), findsOneWidget);
    expect(find.byKey(const ValueKey('home-cafe-icon')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('cart badge waits for the cart animation to finish', (
    tester,
  ) async {
    var selected = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: StatefulBuilder(
          builder: (context, setState) => Scaffold(
            bottomNavigationBar: CustomerDock(
              selectedIndex: selected,
              cartCount: 3,
              onTabSelected: (value) => setState(() => selected = value),
              onProfile: () {},
            ),
          ),
        ),
      ),
    );
    final badge = find.byKey(const ValueKey('dock-cart-badge'));
    double scale() => tester.widget<AnimatedScale>(badge).scale;

    // Not selected: the badge is simply there.
    await tester.pumpAndSettle();
    expect(scale(), 1);
    expect(find.text('3'), findsOneWidget);

    // Selecting the cart plays its scene; the badge is hidden meanwhile...
    await tester.tap(find.text('Sepet'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    expect(scale(), 0);

    // ...and comes back once the scene is over.
    await tester.pump(const Duration(milliseconds: 1200));
    await tester.pumpAndSettle();
    expect(scale(), 1);
  });
}
