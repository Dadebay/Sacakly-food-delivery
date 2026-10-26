import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../l10n/localized_text.dart';

/// The two states of the heart, as drawn assets.
///
/// These SVGs carry their own colours *and* a white outer halo, so they stay
/// legible straight on top of a dish photo — no tinting and no disc behind
/// them required. That's also why they're assets rather than an icon font:
/// the filled and the empty heart are genuinely different drawings, not the
/// same glyph in two colours.
class FavoriteGlyph extends StatelessWidget {
  const FavoriteGlyph({super.key, required this.active, required this.size});

  final bool active;
  final double size;

  static const _full = 'assets/icons/favorite_full.svg';
  static const _empty = 'assets/icons/favorite_empty.svg';

  @override
  Widget build(BuildContext context) =>
      SvgPicture.asset(active ? _full : _empty, width: size, height: size);
}

/// The heart used on dish cards, ported from the food_delivery customer app.
/// Turning it on pops the heart and sends a ring of it expanding outward.
class FavoriteToggle extends StatelessWidget {
  const FavoriteToggle({
    super.key,
    required this.active,
    required this.onTap,
    this.size = 22,
    this.padding = 3,
    this.background,
    this.tooltip,
  });

  final bool active;
  final VoidCallback onTap;
  final double size;

  /// The ring of space between the glyph and the edge of the disc. Exposed so
  /// a caller can shrink the heart without shrinking the tap target with it.
  final double padding;

  /// Overrides the disc behind the glyph. Left unset, the empty heart gets a
  /// white one — its own fill is white and its outline ink, which vanishes
  /// against a pale dish photo — while the filled heart, red and unmistakable
  /// on anything, keeps the photo showing through.
  final Color? background;

  /// Shown on long-press and read out by screen readers.
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    final button = Material(
      color:
          background ??
          (active ? Colors.transparent : Colors.white.withValues(alpha: 0.92)),
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          // Tight on the glyph — the disc is there to lift the outline off
          // the photo, not to be a button of its own.
          padding: EdgeInsets.all(padding),
          child: SizedBox(
            width: size,
            height: size,
            child: Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.center,
              children: [
                // Only present while active, so it's built fresh — and
                // plays once — every time the heart turns on, rather than
                // replaying on unrelated rebuilds.
                if (active && !reducedMotion)
                  TweenAnimationBuilder<double>(
                    key: const ValueKey('burst'),
                    tween: Tween(begin: 0.0, end: 1.0),
                    duration: const Duration(milliseconds: 420),
                    curve: Curves.easeOut,
                    builder: (context, t, child) => Opacity(
                      opacity: 1 - t,
                      child: Transform.scale(scale: 1 + t * 1.6, child: child),
                    ),
                    child: FavoriteGlyph(active: true, size: size),
                  ),
                TweenAnimationBuilder<double>(
                  // Re-keying on the state restarts the pop every time it
                  // flips.
                  key: ValueKey(active),
                  tween: Tween(
                    begin: active && !reducedMotion ? 1.35 : 1.0,
                    end: 1.0,
                  ),
                  duration: reducedMotion
                      ? Duration.zero
                      : const Duration(milliseconds: 280),
                  curve: Curves.easeOutBack,
                  builder: (context, scale, child) =>
                      Transform.scale(scale: scale, child: child),
                  child: FavoriteGlyph(active: active, size: size),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    return tooltip == null
        ? button
        : Tooltip(message: tr(context, tooltip!), child: button);
  }
}
