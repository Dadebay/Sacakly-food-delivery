import 'package:flutter/material.dart';
import '../../../core/l10n/localized_text.dart';

class Price extends StatelessWidget {
  const Price(this.label, this.value, {super.key, this.bold = false});
  final String label;
  final dynamic value;
  final bool bold;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        LText(
          label,
          style: TextStyle(
            fontWeight: bold ? FontWeight.bold : FontWeight.normal,
          ),
        ),
        LText(
          '${(value as num).toStringAsFixed(2)} TMT',
          style: TextStyle(
            fontWeight: bold ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ],
    ),
  );
}
