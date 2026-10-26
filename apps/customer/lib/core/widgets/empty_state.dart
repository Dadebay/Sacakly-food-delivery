import 'package:flutter/material.dart';
import '../l10n/localized_text.dart';

import '../theme/app_colors.dart';

class Empty extends StatelessWidget {
  const Empty(this.message, this.icon, {super.key});
  final String message;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(30),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 54, color: AppPalette.of(context).text),
          const SizedBox(height: 12),
          LText(message, textAlign: TextAlign.center),
        ],
      ),
    ),
  );
}
