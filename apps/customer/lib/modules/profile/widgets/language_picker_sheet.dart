import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../../../core/l10n/app_language.dart';
import '../../../core/l10n/localized_text.dart';
import '../../../core/theme/app_colors.dart';

/// Three native language names paired with their country flags.
class LanguagePickerSheet extends StatefulWidget {
  const LanguagePickerSheet({
    required this.language,
    required this.onSelect,
    super.key,
  });

  final AppLanguage language;
  final Future<void> Function(String code) onSelect;

  @override
  State<LanguagePickerSheet> createState() => _LanguagePickerSheetState();
}

class _LanguagePickerSheetState extends State<LanguagePickerSheet> {
  bool _saving = false;
  late String _selected = widget.language.code;

  Future<void> _select(String code) async {
    if (_saving) return;
    HapticFeedback.selectionClick();
    setState(() {
      _saving = true;
      _selected = code;
    });
    try {
      await widget.onSelect(code);
      if (!mounted) return;
      // Let the chosen tile finish its animation before the sheet closes.
      if (!MediaQuery.disableAnimationsOf(context)) {
        await Future<void>.delayed(const Duration(milliseconds: 220));
      }
      if (mounted) Navigator.pop(context);
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
          _selected = widget.language.code;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 22),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: palette.border,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
                const SizedBox(height: 22),
                Row(
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        color: brand,
                        borderRadius: BorderRadius.circular(15),
                      ),
                      child: const Icon(
                        Icons.language_rounded,
                        color: onBrand,
                        size: 25,
                      ),
                    ),
                    const SizedBox(width: 13),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          LText(
                            'Dil seçin',
                            style: TextStyle(
                              fontFamily: 'Gilroy',
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                              color: palette.text,
                            ),
                          ),
                          const SizedBox(height: 3),
                          LText(
                            'Uygulama dilini seçin',
                            style: TextStyle(
                              fontFamily: 'Gilroy',
                              fontSize: 13,
                              color: palette.muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: MaterialLocalizations.of(
                        context,
                      ).closeButtonTooltip,
                      onPressed: () => Navigator.pop(context),
                      icon: Icon(Icons.close_rounded, color: palette.muted),
                    ),
                  ],
                ),
                const SizedBox(height: 23),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (var i = 0; i < _options.length; i++) ...[
                      if (i > 0) const SizedBox(width: 10),
                      Expanded(
                        child: _LanguageOption(
                          option: _options[i],
                          selected: _selected == _options[i].code,
                          onTap: () => _select(_options[i].code),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LanguageOptionData {
  const _LanguageOptionData(this.code, this.name, this.detail, this.flag);
  final String code;
  final String name;
  final String detail;
  final String flag;
}

const _options = [
  _LanguageOptionData('tk', 'Türkmençe', 'Türkmen dili', 'tm'),
  _LanguageOptionData('ru', 'Русский', 'Русский язык', 'ru'),
  _LanguageOptionData('en', 'English', 'English language', 'gb'),
];

/// The same three language tiles as the sheet, but standing on the page
/// itself so they are one tap away (profile, guest or signed in).
class LanguageSelector extends StatelessWidget {
  const LanguageSelector({
    required this.language,
    required this.onSelect,
    super.key,
  });

  final AppLanguage language;
  final Future<void> Function(String code) onSelect;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      for (var i = 0; i < _options.length; i++) ...[
        if (i > 0) const SizedBox(width: 10),
        Expanded(
          child: _LanguageOption(
            option: _options[i],
            compact: true,
            selected: language.code == _options[i].code,
            onTap: () {
              if (language.code == _options[i].code) return;
              HapticFeedback.selectionClick();
              onSelect(_options[i].code);
            },
          ),
        ),
      ],
    ],
  );
}

class _LanguageOption extends StatefulWidget {
  const _LanguageOption({
    required this.option,
    required this.selected,
    required this.onTap,
    this.compact = false,
  });

  final _LanguageOptionData option;
  final bool selected;
  final VoidCallback onTap;

  /// Smaller flag and no secondary line, for use inside a page section.
  final bool compact;

  @override
  State<_LanguageOption> createState() => _LanguageOptionState();
}

class _LanguageOptionState extends State<_LanguageOption> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    final duration = reduceMotion
        ? Duration.zero
        : const Duration(milliseconds: 260);
    final selected = widget.selected;
    final option = widget.option;
    return Semantics(
      button: true,
      selected: selected,
      label: option.name,
      excludeSemantics: true,
      child: AnimatedScale(
        scale: _pressed && !reduceMotion ? 0.96 : 1,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOutCubic,
        child: AnimatedContainer(
          duration: duration,
          curve: Curves.easeOutCubic,
          decoration: BoxDecoration(
            color: selected ? brand : palette.raised,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: selected ? brand : palette.border),
            boxShadow: selected
                ? [
                    BoxShadow(
                      color: brand.withValues(alpha: 0.38),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ]
                : const [],
          ),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              key: ValueKey(
                '${widget.compact ? 'language-inline' : 'language-option'}-${option.code}',
              ),
              onTap: widget.onTap,
              borderRadius: BorderRadius.circular(22),
              splashColor: brand.withValues(alpha: 0.14),
              highlightColor: Colors.transparent,
              onHighlightChanged: (pressed) =>
                  setState(() => _pressed = pressed),
              child: Stack(
                children: [
                  Padding(
                    padding: widget.compact
                        ? const EdgeInsets.fromLTRB(8, 14, 8, 12)
                        : const EdgeInsets.fromLTRB(8, 18, 8, 14),
                    child: Column(
                      children: [
                        AnimatedScale(
                          scale: selected ? 1.08 : 1,
                          duration: duration,
                          curve: Curves.easeOutBack,
                          child: AnimatedContainer(
                            duration: duration,
                            width: widget.compact ? 44 : 54,
                            height: widget.compact ? 44 : 54,
                            padding: const EdgeInsets.all(2),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: selected
                                    ? onBrand.withValues(alpha: 0.85)
                                    : palette.border,
                                width: 2,
                              ),
                            ),
                            child: ClipOval(
                              child: SvgPicture.asset(
                                'assets/images/flags/${option.flag}.svg',
                                fit: BoxFit.cover,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          child: AnimatedDefaultTextStyle(
                            duration: duration,
                            style: TextStyle(
                              fontFamily: 'Gilroy',
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: selected ? onBrand : palette.text,
                            ),
                            child: Text(option.name, maxLines: 1),
                          ),
                        ),
                        if (!widget.compact) ...[
                        const SizedBox(height: 3),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          child: AnimatedDefaultTextStyle(
                            duration: duration,
                            style: TextStyle(
                              fontFamily: 'Gilroy',
                              fontSize: 11.5,
                              color: selected
                                  ? onBrand.withValues(alpha: 0.72)
                                  : palette.muted,
                            ),
                            child: Text(option.detail, maxLines: 1),
                          ),
                        ),
                        ],
                      ],
                    ),
                  ),
                  Positioned(
                    top: 8,
                    right: 8,
                    child: AnimatedScale(
                      scale: selected ? 1 : 0,
                      duration: duration,
                      curve: Curves.easeOutBack,
                      child: Container(
                        width: 20,
                        height: 20,
                        decoration: const BoxDecoration(
                          color: onBrand,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.check_rounded,
                          size: 14,
                          color: brand,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
