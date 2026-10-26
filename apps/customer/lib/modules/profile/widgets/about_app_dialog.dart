import 'package:flutter/material.dart';

import '../../../core/l10n/localized_text.dart';
import '../../../core/theme/app_colors.dart';

class AboutAppDialog extends StatelessWidget {
  const AboutAppDialog({super.key});

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
      backgroundColor: palette.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
      clipBehavior: Clip.antiAlias,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 390),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: 190,
                width: double.infinity,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Positioned.fill(child: ColoredBox(color: brand)),
                    Positioned(
                      top: -94,
                      left: -50,
                      child: _AccentRing(size: 220),
                    ),
                    Positioned(
                      bottom: -110,
                      right: -42,
                      child: _AccentRing(size: 220),
                    ),
                    Container(
                      width: 122,
                      height: 122,
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: palette.surface,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: palette.shadow,
                            blurRadius: 24,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      child: Image.asset(
                        'assets/logo_icon.png',
                        fit: BoxFit.contain,
                        semanticLabel: 'Saçakly',
                      ),
                    ),
                    Positioned(
                      top: 14,
                      right: 14,
                      child: IconButton.filledTonal(
                        tooltip: MaterialLocalizations.of(
                          context,
                        ).closeButtonTooltip,
                        style: IconButton.styleFrom(
                          backgroundColor: onBrand.withValues(alpha: 0.1),
                          foregroundColor: onBrand,
                        ),
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close_rounded, size: 20),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
                child: Column(
                  children: [
                    LText(
                      'Uygulama hakkında',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontFamily: 'Gilroy',
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: palette.muted,
                      ),
                    ),
                    const SizedBox(height: 7),
                    Text(
                      'Saçakly',
                      style: TextStyle(
                        fontFamily: 'Gilroy',
                        fontSize: 31,
                        height: 1.05,
                        fontWeight: FontWeight.w800,
                        color: palette.text,
                      ),
                    ),
                    const SizedBox(height: 12),
                    LText(
                      'Kafelerden sevdiğin lezzetleri kolayca keşfet.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontFamily: 'Gilroy',
                        fontSize: 14,
                        height: 1.45,
                        color: palette.muted,
                      ),
                    ),
                    const SizedBox(height: 24),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 13,
                      ),
                      decoration: BoxDecoration(
                        color: palette.raised,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.info_outline_rounded,
                            color: palette.muted,
                            size: 18,
                          ),
                          const SizedBox(width: 9),
                          LText(
                            'Sürüm 1.0.0',
                            style: TextStyle(
                              fontFamily: 'Gilroy',
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: palette.text,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: FilledButton(
                        onPressed: () => Navigator.pop(context),
                        style: FilledButton.styleFrom(
                          backgroundColor: brand,
                          foregroundColor: onBrand,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        child: const LText(
                          'Kapat',
                          style: TextStyle(
                            fontFamily: 'Gilroy',
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AccentRing extends StatelessWidget {
  const _AccentRing({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      border: Border.all(color: onBrand.withValues(alpha: 0.08), width: 24),
    ),
  );
}
