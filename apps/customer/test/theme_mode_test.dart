import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sacakly_customer/app.dart';
import 'package:sacakly_customer/core/data/customer_store.dart';
import 'package:sacakly_customer/core/network/api_client.dart';
import 'package:sacakly_customer/core/theme/app_colors.dart';
import 'package:sacakly_customer/core/theme/theme_controller.dart';
import 'package:sacakly_customer/core/theme/theme_reveal.dart';
import 'package:sacakly_customer/modules/profile/widgets/theme_picker.dart';

void main() {
  test('theme choice is saved and restored', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final controller = ThemeController(prefs);
    expect(controller.mode, ThemeMode.light);
    controller.setMode(ThemeMode.dark);
    expect(controller.mode, ThemeMode.dark);
    expect(prefs.getString('customer_theme_mode'), 'dark');
    expect(ThemeController(prefs).mode, ThemeMode.dark);
    controller.dispose();
  });

  testWidgets('theme transition fades the old screen over the new one', (
    tester,
  ) async {
    final key = GlobalKey<ThemeRevealState>();
    late StateSetter update;
    var dark = false;
    await tester.pumpWidget(
      StatefulBuilder(
        builder: (context, setState) {
          update = setState;
          return MaterialApp(
            theme: dark ? ThemeData.dark() : ThemeData.light(),
            home: ThemeReveal(
              key: key,
              child: Center(child: Text(dark ? 'Dark screen' : 'Light screen')),
            ),
          );
        },
      ),
    );
    await tester.pump();

    final transition = key.currentState!.run(() => update(() => dark = true));
    for (var i = 0; i < 4; i++) {
      await tester.pump();
    }
    expect(find.text('Dark screen'), findsOneWidget);
    final snapshotFade = find.byKey(const ValueKey('theme-reveal-fade'));
    expect(snapshotFade, findsOneWidget);

    await tester.pump(const Duration(milliseconds: 130));
    final fade = tester.widget<FadeTransition>(snapshotFade);
    expect(fade.opacity.value, greaterThan(0));
    expect(fade.opacity.value, lessThan(1));

    await tester.pumpAndSettle();
    await transition;
    expect(snapshotFade, findsNothing);
  });

  testWidgets('profile theme picker changes the whole app', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final api = Api(prefs);
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

    await tester.pumpWidget(CustomerApp(Store(api)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('cafe-select-demo-han-tagam')));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Profil'));
    await tester.pumpAndSettle();
    // The theme switch now sits right on the profile page.
    expect(find.byType(ThemePicker), findsOneWidget);
    await tester.ensureVisible(find.text('Sazlamalar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sazlamalar'));
    await tester.pumpAndSettle();
    expect(find.byType(ThemePicker), findsOneWidget);
    expect(tester.widget<AppBar>(find.byType(AppBar)).centerTitle, isTrue);
    expect(
      Theme.of(tester.element(find.byType(ThemePicker))).brightness,
      Brightness.light,
    );

    await tester.tap(find.byKey(const ValueKey('theme-dark')));
    await tester.pumpAndSettle(const Duration(seconds: 2));
    expect(prefs.getString('customer_theme_mode'), 'dark');
    expect(
      Theme.of(tester.element(find.byType(ThemePicker))).brightness,
      Brightness.dark,
    );
    expect(
      AppPalette.of(tester.element(find.byType(ThemePicker))).canvas,
      AppPalette.dark.canvas,
    );

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sebet'));
    await tester.pumpAndSettle();
    expect(
      Theme.of(tester.element(find.text('Sebediňiz entek boş'))).brightness,
      Brightness.dark,
    );
    await tester.tap(find.byTooltip('Profil'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Sazlamalar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sazlamalar'));
    await tester.pumpAndSettle();
    expect(find.byType(ThemePicker), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('theme-light')));
    await tester.pumpAndSettle(const Duration(seconds: 2));
    expect(prefs.getString('customer_theme_mode'), 'light');
    expect(
      Theme.of(tester.element(find.byType(ThemePicker))).brightness,
      Brightness.light,
    );
  });
}
