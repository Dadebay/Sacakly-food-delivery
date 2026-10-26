import 'dart:async';

import 'package:flutter/material.dart';
import 'package:hugeicons/hugeicons.dart';

import '../../core/l10n/localized_text.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_icons.dart';
import '../../core/theme/theme_controller.dart';
import '../../core/theme/theme_reveal.dart';
import 'widgets/theme_picker.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = ThemeScope.maybeOf(context);
    final mode =
        controller?.mode ??
        (Theme.of(context).brightness == Brightness.dark
            ? ThemeMode.dark
            : ThemeMode.light);
    return Scaffold(
      appBar: AppBar(
        centerTitle: true,
        leading: IconButton(
          tooltip: tr(context, 'Geri'),
          onPressed: () => Navigator.of(context).maybePop(),
          icon: const HugeIcon(icon: AppIcons.back, color: onBrand, size: 24),
        ),
        title: const LText(
          'Ayarlar',
          style: TextStyle(fontFamily: 'Gilroy', fontWeight: FontWeight.w800),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 28, 16, 24),
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
            child: LText(
              'Tema seçimi',
              style: TextStyle(
                color: AppPalette.of(context).muted,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          ThemePicker(
            mode: mode,
            onChanged: (next) {
              if (controller == null) return;
              void change() => controller.setMode(next);
              final reveal = ThemeReveal.maybeOf(context);
              if (reveal == null) {
                change();
              } else {
                unawaited(reveal.run(change));
              }
            },
          ),
        ],
      ),
    );
  }
}
