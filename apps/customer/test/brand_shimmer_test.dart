import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sacakly_customer/core/theme/app_theme.dart';
import 'package:sacakly_customer/core/widgets/brand_shimmer.dart';
import 'package:sacakly_customer/modules/home/widgets/food_visual.dart';

void main() {
  testWidgets('loading placeholder shows the brand and stops when removed', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: BrandShimmerScope(
          child: Center(
            child: SizedBox(width: 140, height: 100, child: BrandShimmerBox()),
          ),
        ),
      ),
    );

    expect(find.text('Saçakly'), findsOneWidget);
    expect(find.byType(ShaderMask), findsOneWidget);

    await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('reduced motion keeps the wordmark still', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark,
        home: MediaQuery(
          data: const MediaQueryData(disableAnimations: true),
          child: const BrandShimmerScope(
            child: SizedBox(width: 140, height: 100, child: BrandShimmerBox()),
          ),
        ),
      ),
    );

    expect(find.text('Saçakly'), findsOneWidget);
    expect(find.byType(ShaderMask), findsNothing);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('a product without a photo retains its food fallback', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: const Center(
          child: FoodPhoto(name: 'Mantı', width: 120, height: 120),
        ),
      ),
    );

    expect(find.text('Saçakly'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'a network product photo shows the brand before its first frame',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: const Center(
            child: FoodPhoto(
              name: 'Mantı',
              imageUrl: 'https://example.invalid/dish.png',
              width: 120,
              height: 120,
            ),
          ),
        ),
      );

      expect(find.text('Saçakly'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
