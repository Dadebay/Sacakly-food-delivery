import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sacakly_customer/app.dart';
import 'package:sacakly_customer/core/data/customer_store.dart';
import 'package:sacakly_customer/core/l10n/app_language.dart';
import 'package:sacakly_customer/core/l10n/localized_text.dart';
import 'package:sacakly_customer/core/network/api_client.dart';
import 'package:sacakly_customer/modules/profile/profile_screen.dart';
import 'package:sacakly_customer/modules/profile/widgets/language_picker_sheet.dart';

void main() {
  testWidgets('customer app opens with Turkmen locale', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    await tester.pumpWidget(CustomerApp(Store(_LanguageApi(prefs))));
    await tester.pump();

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(app.locale, const Locale('tk'));
    // No cafes to choose from: the launch screen lets the customer carry on.
    expect(find.text('Dowam et'), findsOneWidget);
    await tester.tap(find.text('Dowam et'));
    await tester.pump();
    expect(find.text('Kafeler'), findsWidgets);
    expect(tester.takeException(), isNull);

    await tester.tap(find.byTooltip('Profil'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Dil'));
    await tester.pumpAndSettle();
    expect(
      tester.getTopLeft(find.byType(LanguagePickerSheet)).dy,
      greaterThan(40),
    );
    expect(
      find.descendant(
        of: find.byType(LanguagePickerSheet),
        matching: find.byType(SvgPicture),
      ),
      findsNWidgets(3),
    );
    final firstFlag = tester.widget<SvgPicture>(
      find
          .descendant(
            of: find.byType(LanguagePickerSheet),
            matching: find.byType(SvgPicture),
          )
          .first,
    );
    expect(
      (firstFlag.bytesLoader as SvgAssetLoader).assetName,
      'assets/images/flags/tm.svg',
    );
    expect(find.byKey(const ValueKey('language-confirm')), findsNothing);
    final flag = await rootBundle.loadString('assets/images/flags/tm.svg');
    expect(flag, contains('flag-icons-tm'));
    expect(flag, contains('#00843d'));
    await tester.tap(find.byKey(const ValueKey('language-option-en')));
    await tester.pumpAndSettle();
    expect(prefs.getString(AppLanguage.preferenceKey), 'en');
    expect(find.byType(LanguagePickerSheet), findsNothing);
    expect(
      tester.widget<MaterialApp>(find.byType(MaterialApp)).locale,
      const Locale('en'),
    );
    expect(find.text('Profile'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('starts in Turkmen and persists Russian and English choices', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final language = AppLanguage(prefs);
    expect(language.code, 'tk');

    await tester.pumpWidget(
      AppLanguageScope(
        language: language,
        child: const MaterialApp(home: Scaffold(body: LText('Siparişlerim'))),
      ),
    );
    expect(find.text('Sargytlarym'), findsOneWidget);

    await language.setCode('ru');
    await tester.pump();
    expect(find.text('Мои заказы'), findsOneWidget);
    expect(AppLanguage(prefs).code, 'ru');

    await language.setCode('en');
    await tester.pump();
    expect(find.text('My orders'), findsOneWidget);
    expect(AppLanguage(prefs).code, 'en');
    language.dispose();
  });

  testWidgets('profile language picker changes the visible language', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final language = AppLanguage(prefs);
    final store = Store(_LanguageApi(prefs));
    await tester.pumpWidget(
      AppLanguageScope(
        language: language,
        child: MaterialApp(
          home: Scaffold(body: Profile(store, openOrders: () {})),
        ),
      ),
    );
    await tester.pump();
    expect(find.text('Profilim'), findsOneWidget);
    final flagFrame = tester.widget<Container>(
      find.byKey(const ValueKey('selected-language-flag-frame')),
    );
    expect((flagFrame.decoration as BoxDecoration).shape, BoxShape.circle);
    expect(
      tester.getSize(
        find.byKey(const ValueKey('selected-language-flag-frame')),
      ),
      const Size(34, 34),
    );
    final languageRow = find
        .ancestor(of: find.text('Dil'), matching: find.byType(InkWell))
        .first;
    final settingsRow = find
        .ancestor(of: find.text('Sazlamalar'), matching: find.byType(InkWell))
        .first;
    expect(
      tester.getSize(languageRow).height,
      closeTo(tester.getSize(settingsRow).height, 1),
    );
    final selectedFlag = find.byKey(const ValueKey('selected-language-flag'));
    expect(
      find.ancestor(of: selectedFlag, matching: find.byType(ClipOval)),
      findsOneWidget,
    );
    expect(
      (tester.widget<SvgPicture>(selectedFlag).bytesLoader as SvgAssetLoader)
          .assetName,
      'assets/images/flags/tm.svg',
    );
    await tester.tap(find.text('Dil'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('language-option-ru')));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.byType(LanguagePickerSheet), findsNothing);
    expect(find.text('Профиль'), findsOneWidget);
    expect(find.text('Язык'), findsOneWidget);
    expect(
      (tester.widget<SvgPicture>(selectedFlag).bytesLoader as SvgAssetLoader)
          .assetName,
      'assets/images/flags/ru.svg',
    );
    expect(find.text('Русский'), findsNothing);
    expect(prefs.getString('customer.language'), 'ru');
    language.dispose();
  });
}

class _LanguageApi extends Api {
  _LanguageApi(super.prefs);

  @override
  Future<dynamic> request(
    String method,
    String path, {
    Object? data,
    Map<String, dynamic>? query,
    bool auth = false,
    bool canRefresh = true,
  }) async {
    if (path == 'contacts') return <String, dynamic>{};
    if (path == 'marketplace/cafes' || path == 'marketing/banners') {
      return <Map<String, dynamic>>[];
    }
    throw StateError('Unexpected request: $method $path');
  }
}
