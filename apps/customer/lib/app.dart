import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'core/data/customer_store.dart';
import 'core/l10n/app_language.dart';
import 'core/l10n/turkmen_platform_localizations.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_controller.dart';
import 'core/theme/theme_reveal.dart';
import 'core/widgets/brand_shimmer.dart';
import 'modules/shell/cafe_select_screen.dart';

class CustomerApp extends StatefulWidget {
  const CustomerApp(this.store, {super.key});
  final Store store;

  @override
  State<CustomerApp> createState() => _CustomerAppState();
}

class _CustomerAppState extends State<CustomerApp> {
  late final AppLanguage language = AppLanguage(widget.store.api.prefs);
  late final ThemeController theme = ThemeController(widget.store.api.prefs);

  @override
  void dispose() {
    language.dispose();
    theme.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: Listenable.merge([language, theme]),
    builder: (context, _) => MaterialApp(
      title: 'Saçakly',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: theme.mode,
      themeAnimationDuration: const Duration(milliseconds: 220),
      themeAnimationCurve: Curves.easeOutCubic,
      locale: language.locale,
      supportedLocales: AppLanguage.supportedLocales,
      localizationsDelegates: const [
        TurkmenMaterialLocalizations.delegate,
        TurkmenCupertinoLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) => BrandShimmerScope(
        child: ThemeScope(
          controller: theme,
          child: AppLanguageScope(
            language: language,
            child: ThemeReveal(child: child ?? const SizedBox.shrink()),
          ),
        ),
      ),
      home: LaunchGate(widget.store),
    ),
  );
}
