import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/l10n/localized_text.dart';
import '../../../core/theme/app_colors.dart';

/// Light / dark switch: a pill slides between the two options while the icon
/// of the chosen mode tints and turns, so the change reads as one motion.
class ThemePicker extends StatelessWidget {
  const ThemePicker({required this.mode, required this.onChanged, super.key});

  final ThemeMode mode;
  final ValueChanged<ThemeMode> onChanged;

  static const _options = [
    (ThemeMode.light, 'theme-light', 'Açık', Icons.light_mode_rounded),
    (ThemeMode.dark, 'theme-dark', 'Koyu', Icons.dark_mode_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    final duration = reduceMotion
        ? Duration.zero
        : const Duration(milliseconds: 300);
    final index = mode == ThemeMode.dark ? 1 : 0;

    return Container(
      height: 58,
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: palette.raised,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: palette.border),
      ),
      child: Stack(
        children: [
          AnimatedAlign(
            duration: duration,
            curve: Curves.easeOutCubic,
            alignment: Alignment(index == 0 ? -1 : 1, 0),
            child: FractionallySizedBox(
              widthFactor: 1 / _options.length,
              heightFactor: 1,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: brand,
                  borderRadius: BorderRadius.circular(15),
                  boxShadow: [
                    BoxShadow(
                      color: brand.withValues(alpha: 0.38),
                      blurRadius: 14,
                      offset: const Offset(0, 5),
                    ),
                  ],
                ),
              ),
            ),
          ),
          Row(
            children: [
              for (final option in _options)
                Expanded(
                  child: _ThemeOption(
                    key: ValueKey(option.$2),
                    label: option.$3,
                    icon: option.$4,
                    selected: mode == option.$1,
                    duration: duration,
                    onTap: () => _choose(option.$1),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  void _choose(ThemeMode next) {
    if (next == mode) return;
    HapticFeedback.selectionClick();
    onChanged(next);
  }
}

class _ThemeOption extends StatefulWidget {
  const _ThemeOption({
    super.key,
    required this.label,
    required this.icon,
    required this.selected,
    required this.duration,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final Duration duration;
  final VoidCallback onTap;

  @override
  State<_ThemeOption> createState() => _ThemeOptionState();
}

class _ThemeOptionState extends State<_ThemeOption> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    final color = widget.selected ? onBrand : palette.muted;
    return Semantics(
      button: true,
      selected: widget.selected,
      label: tr(context, '${widget.label} tema'),
      excludeSemantics: true,
      child: AnimatedScale(
        scale: _pressed && !reduceMotion ? 0.96 : 1,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOutCubic,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(15),
            splashColor: brand.withValues(alpha: 0.14),
            highlightColor: Colors.transparent,
            onHighlightChanged: (pressed) => setState(() => _pressed = pressed),
            onTap: widget.onTap,
            child: Center(
              child: TweenAnimationBuilder<Color?>(
                tween: ColorTween(end: color),
                duration: widget.duration,
                builder: (context, tint, _) => Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AnimatedRotation(
                      turns: widget.selected ? 0 : -0.12,
                      duration: widget.duration,
                      curve: Curves.easeOutBack,
                      child: AnimatedScale(
                        scale: widget.selected ? 1.12 : 1,
                        duration: widget.duration,
                        curve: Curves.easeOutBack,
                        child: Icon(widget.icon, size: 21, color: tint),
                      ),
                    ),
                    const SizedBox(width: 8),
                    LText(
                      widget.label,
                      style: TextStyle(
                        fontFamily: 'Gilroy',
                        color: tint,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
