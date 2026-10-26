import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app_colors.dart';

class AppTheme {
  const AppTheme._();

  static final ThemeData light = _build(AppPalette.light, Brightness.light);
  static final ThemeData dark = _build(AppPalette.dark, Brightness.dark);

  static ThemeData _build(
    AppPalette palette,
    Brightness brightness,
  ) => ThemeData(
    useMaterial3: true,
    brightness: brightness,
    fontFamily: 'Gilroy',
    extensions: [palette],
    scaffoldBackgroundColor: palette.canvas,
    dividerColor: palette.border,
    iconTheme: IconThemeData(color: palette.text),
    colorScheme: ColorScheme.fromSeed(seedColor: brand, brightness: brightness)
        .copyWith(
          primary: brand,
          onPrimary: onBrand,
          secondary: accent,
          onSecondary: Colors.white,
          surface: palette.surface,
          onSurface: palette.text,
          surfaceContainerLowest: palette.canvas,
          surfaceContainerLow: palette.page,
          surfaceContainer: palette.surface,
          surfaceContainerHigh: palette.raised,
          surfaceContainerHighest: palette.raised,
          onSurfaceVariant: palette.muted,
          outline: palette.border,
          outlineVariant: palette.border,
          error: errorRed,
        ),
    appBarTheme: const AppBarTheme(
      backgroundColor: brand,
      foregroundColor: onBrand,
      elevation: 0,
      systemOverlayStyle: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        statusBarBrightness: Brightness.light,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: palette.surface,
      indicatorColor: brand,
    ),
    cardTheme: CardThemeData(
      color: palette.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    dialogTheme: DialogThemeData(backgroundColor: palette.surface),
    bottomSheetTheme: BottomSheetThemeData(backgroundColor: palette.surface),
    inputDecorationTheme: InputDecorationTheme(
      fillColor: palette.raised,
      hintStyle: TextStyle(color: palette.muted),
    ),
  );
}
