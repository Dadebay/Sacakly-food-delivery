import 'package:flutter/material.dart';

/// Matches the former food_delivery customer's main yellow.
const brand = Color(0xFFF7D148);
const onBrand = Color(0xFF1B1A17);
const accent = Color(0xFFF2761D);
const errorRed = Color(0xFF8E1B12);

@immutable
class AppPalette extends ThemeExtension<AppPalette> {
  const AppPalette({
    required this.canvas,
    required this.page,
    required this.surface,
    required this.raised,
    required this.text,
    required this.muted,
    required this.border,
    required this.warm,
    required this.dangerTint,
    required this.shadow,
  });

  final Color canvas;
  final Color page;
  final Color surface;
  final Color raised;
  final Color text;
  final Color muted;
  final Color border;
  final Color warm;
  final Color dangerTint;
  final Color shadow;

  static const light = AppPalette(
    canvas: Colors.white,
    page: Color(0xFFF7F7F4),
    surface: Colors.white,
    raised: Color(0xFFF5F5F4),
    text: onBrand,
    muted: Color(0xFF777771),
    border: Color(0xFFEAEAE5),
    warm: Color(0xFFFFF3D0),
    dangerTint: Color(0xFFFDECEA),
    shadow: Color(0x16000000),
  );

  static const dark = AppPalette(
    canvas: Color(0xFF090909),
    page: Color(0xFF101010),
    surface: Color(0xFF191919),
    raised: Color(0xFF242424),
    text: Color(0xFFF7F7F7),
    muted: Color(0xFFB5B5B5),
    border: Color(0xFF393939),
    warm: Color(0xFF332B15),
    dangerTint: Color(0xFF3B2020),
    shadow: Color(0x66000000),
  );

  static AppPalette of(BuildContext context) =>
      Theme.of(context).extension<AppPalette>() ?? light;

  @override
  AppPalette copyWith({
    Color? canvas,
    Color? page,
    Color? surface,
    Color? raised,
    Color? text,
    Color? muted,
    Color? border,
    Color? warm,
    Color? dangerTint,
    Color? shadow,
  }) => AppPalette(
    canvas: canvas ?? this.canvas,
    page: page ?? this.page,
    surface: surface ?? this.surface,
    raised: raised ?? this.raised,
    text: text ?? this.text,
    muted: muted ?? this.muted,
    border: border ?? this.border,
    warm: warm ?? this.warm,
    dangerTint: dangerTint ?? this.dangerTint,
    shadow: shadow ?? this.shadow,
  );

  @override
  AppPalette lerp(ThemeExtension<AppPalette>? other, double t) {
    if (other is! AppPalette) return this;
    return AppPalette(
      canvas: Color.lerp(canvas, other.canvas, t)!,
      page: Color.lerp(page, other.page, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      raised: Color.lerp(raised, other.raised, t)!,
      text: Color.lerp(text, other.text, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      border: Color.lerp(border, other.border, t)!,
      warm: Color.lerp(warm, other.warm, t)!,
      dangerTint: Color.lerp(dangerTint, other.dangerTint, t)!,
      shadow: Color.lerp(shadow, other.shadow, t)!,
    );
  }
}
