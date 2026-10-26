import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';
import '../../../core/l10n/localized_text.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_icons.dart';

Color _pillColor(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark ? Colors.white : onBrand;

Color _onPill(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
    ? const Color(0xFF111111)
    : Colors.white;

/// Motion of the selection pill. Both keep the same look.
enum DockIndicatorStyle {
  /// Original: leading edge overshoots, trailing edge lags behind.
  jelly,

  /// Spring physics: the pill stretches with its speed and squashes slightly
  /// while it travels, and can be redirected mid-flight without a jump.
  spring,
}

class CustomerDock extends StatefulWidget {
  const CustomerDock({
    required this.selectedIndex,
    required this.cartCount,
    required this.onTabSelected,
    required this.onProfile,
    this.indicatorStyle = DockIndicatorStyle.spring,
    super.key,
  });

  final int selectedIndex;
  final int cartCount;
  final ValueChanged<int> onTabSelected;
  final VoidCallback onProfile;
  final DockIndicatorStyle indicatorStyle;

  @override
  State<CustomerDock> createState() => _CustomerDockState();
}

class _CustomerDockState extends State<CustomerDock> {
  late int _lastTabIndex;

  @override
  void initState() {
    super.initState();
    _lastTabIndex = widget.selectedIndex.clamp(0, 2);
  }

  @override
  void didUpdateWidget(CustomerDock oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.selectedIndex >= 0 && widget.selectedIndex <= 2) {
      _lastTabIndex = widget.selectedIndex;
    }
  }

  void _select(int index) {
    if (index != widget.selectedIndex) HapticFeedback.selectionClick();
    widget.onTabSelected(index);
  }

  void _openProfile() {
    if (widget.selectedIndex < 3) HapticFeedback.selectionClick();
    widget.onProfile();
  }

  @override
  Widget build(BuildContext context) {
    final reducedMotion = MediaQuery.disableAnimationsOf(context);

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
        child: Row(
          children: [
            Expanded(
              child: Container(
                height: 68,
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: AppPalette.of(context).surface,
                  borderRadius: BorderRadius.circular(38),
                  border: Border.all(color: AppPalette.of(context).border),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x12000000),
                      blurRadius: 18,
                      offset: Offset(0, 4),
                    ),
                  ],
                ),
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: IgnorePointer(
                        child: AnimatedOpacity(
                          opacity: widget.selectedIndex < 3 ? 1 : 0,
                          duration: reducedMotion
                              ? Duration.zero
                              : const Duration(milliseconds: 160),
                          child: AnimatedScale(
                            scale: widget.selectedIndex < 3 ? 1 : 0.86,
                            duration: reducedMotion
                                ? Duration.zero
                                : const Duration(milliseconds: 220),
                            curve: Curves.easeOutCubic,
                            child: switch (widget.indicatorStyle) {
                              DockIndicatorStyle.jelly => _JellyIndicator(
                                index: _lastTabIndex,
                                reducedMotion: reducedMotion,
                              ),
                              DockIndicatorStyle.spring => _SpringIndicator(
                                index: _lastTabIndex,
                                reducedMotion: reducedMotion,
                              ),
                            },
                          ),
                        ),
                      ),
                    ),
                    Row(
                      children: [
                        _DockTab(
                          label: 'Kafeler',
                          outlineIcon: AppIcons.dockHomeOutline,
                          filledIcon: AppIcons.dockHomeFilled,
                          selected: widget.selectedIndex == 0,
                          motion: _TabMotion.cafe,
                          onTap: () => _select(0),
                        ),
                        _DockTab(
                          label: 'Menü',
                          outlineIcon: AppIcons.dockMenuOutline,
                          filledIcon: AppIcons.dockMenuFilled,
                          selected: widget.selectedIndex == 1,
                          motion: _TabMotion.bowl,
                          onTap: () => _select(1),
                        ),
                        _DockTab(
                          label: 'Sepet',
                          outlineIcon: AppIcons.dockCartOutline,
                          filledIcon: AppIcons.dockCartFilled,
                          badgeCount: widget.cartCount,
                          hasBadge: true,
                          motion: _TabMotion.cart,
                          selected: widget.selectedIndex == 2,
                          onTap: () => _select(2),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 10),
            Semantics(
              button: true,
              selected: widget.selectedIndex >= 3,
              label: tr(context, 'Profil'),
              child: Tooltip(
                message: tr(context, 'Profil'),
                child: _ProfileButton(
                  selected: widget.selectedIndex >= 3,
                  reducedMotion: reducedMotion,
                  onTap: _openProfile,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The selected profile button stands out from the page in both themes.
class _ProfileButton extends StatelessWidget {
  const _ProfileButton({
    required this.selected,
    required this.reducedMotion,
    required this.onTap,
  });

  final bool selected;
  final bool reducedMotion;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final duration = reducedMotion
        ? Duration.zero
        : const Duration(milliseconds: 260);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final palette = AppPalette.of(context);

    return AnimatedContainer(
      duration: duration,
      curve: Curves.easeOutCubic,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: selected ? Colors.white : (dark ? palette.raised : onBrand),
        border: dark && !selected
            ? Border.all(color: palette.border)
            : !dark && selected
            ? Border.all(color: const Color(0xFFDCDCD6))
            : null,
        boxShadow: [
          BoxShadow(
            color: selected
                ? (dark ? const Color(0x1A000000) : const Color(0x1F000000))
                : Colors.transparent,
            blurRadius: selected ? 12 : 0,
            offset: Offset(0, selected ? 3 : 0),
          ),
        ],
      ),
      child: Material(
        type: MaterialType.transparency,
        child: _PressScale(
          builder: (onHighlightChanged, scale) => InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            onHighlightChanged: onHighlightChanged,
            child: AnimatedScale(
              scale: scale,
              duration: reducedMotion
                  ? Duration.zero
                  : const Duration(milliseconds: 120),
              curve: Curves.easeOut,
              child: SizedBox(
                width: 64,
                height: 64,
                child: Center(
                  child: AnimatedSwitcher(
                    duration: duration,
                    switchInCurve: Curves.easeOutBack,
                    switchOutCurve: Curves.easeIn,
                    transitionBuilder: (child, animation) => FadeTransition(
                      opacity: animation,
                      child: ScaleTransition(
                        scale: Tween<double>(
                          begin: 0.7,
                          end: 1,
                        ).animate(animation),
                        child: child,
                      ),
                    ),
                    child: selected
                        ? _LookingUserIcon(
                            key: const ValueKey('profile-filled'),
                            animate: !reducedMotion,
                          )
                        : const Icon(
                            AppIcons.dockProfileOutline,
                            key: ValueKey('profile-outline'),
                            color: Colors.white,
                            size: 25,
                          ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The Kafeler tab: an outline house that melts into a coffee cup when the tab
/// is selected, and back into the house when it is left.
///
/// [progress] (0 = house, 1 = cup) drives the shape change, so it plays in
/// reverse on the way out. Once the cup exists, a one-off scene plays on top
/// of it: coffee pours into the opening, the cup gives a little "cheers" tilt
/// and two hearts float up.
class _HomeCupIcon extends StatefulWidget {
  const _HomeCupIcon({
    required this.progress,
    required this.selected,
    required this.animate,
  });

  final double progress;
  final bool selected;
  final bool animate;

  @override
  State<_HomeCupIcon> createState() => _HomeCupIconState();
}

class _HomeCupIconState extends State<_HomeCupIcon>
    with SingleTickerProviderStateMixin {
  // The scene's first stretch is idle, so it begins once the cup has formed.
  late final AnimationController _scene = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1900),
    value: widget.selected && !widget.animate ? 1 : 0,
  );

  @override
  void initState() {
    super.initState();
    if (widget.selected && widget.animate) _scene.forward();
  }

  @override
  void didUpdateWidget(_HomeCupIcon oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.selected || oldWidget.selected) return;
    if (widget.animate) {
      _scene.forward(from: 0);
    } else {
      _scene.value = 1;
    }
  }

  @override
  void dispose() {
    _scene.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 23,
    height: 23,
    child: AnimatedBuilder(
      animation: _scene,
      builder: (context, _) => CustomPaint(
        key: const ValueKey('home-cafe-icon'),
        painter: _HomeCupPainter(
          progress: widget.progress,
          idleInk: AppPalette.of(context).text,
          selectedInk: _onPill(context),
          pillColor: _pillColor(context),
          // Skip the idle lead-in.
          scene: ((_scene.value - 0.18) / 0.82).clamp(0.0, 1.0),
        ),
      ),
    ),
  );
}

class _HomeCupPainter extends CustomPainter {
  const _HomeCupPainter({
    required this.progress,
    required this.scene,
    required this.idleInk,
    required this.selectedInk,
    required this.pillColor,
  });

  /// 0 = outline house, 1 = solid cup.
  final double progress;

  /// Progress of the cup's own scene, 0 to 1.
  final double scene;
  final Color idleInk;
  final Color selectedInk;
  final Color pillColor;

  static const _coffee = Color(0xFFFFA94D);
  static const _samples = 96;

  // Silhouettes on a 24 x 24 grid. Both are closed, start at the top and run
  // clockwise, so sampling them at equal fractions of their length gives
  // points that correspond well enough to interpolate between.
  //
  // The house is the outline of HugeIcons' strokeRoundedHome01 (AppIcons.home),
  // with its path re-ordered to start at the roof peak and run clockwise. Its
  // little curve under the roofline is left out on purpose.
  static final Path _housePath = Path()
    ..moveTo(12, 2.5)
    ..cubicTo(13.2009, 2.5, 14.2331, 3.30285, 16.2976, 4.90855)
    ..lineTo(18.2976, 6.46411)
    ..cubicTo(19.6247, 7.49628, 20.2882, 8.01237, 20.6441, 8.74005)
    ..cubicTo(21, 9.46773, 21, 10.3083, 21, 11.9896)
    ..lineTo(21, 14.5)
    ..cubicTo(21, 17.7998, 21, 19.4497, 19.9749, 20.4749)
    ..cubicTo(18.9497, 21.5, 17.2998, 21.5, 14, 21.5)
    ..lineTo(10, 21.5)
    ..cubicTo(6.70017, 21.5, 5.05025, 21.5, 4.02513, 20.4749)
    ..cubicTo(3, 19.4497, 3, 17.7998, 3, 14.5)
    ..lineTo(3, 11.9896)
    ..cubicTo(3, 10.3083, 3, 9.46773, 3.3559, 8.74005)
    ..cubicTo(3.71179, 8.01237, 4.37533, 7.49628, 5.70241, 6.46411)
    ..lineTo(7.70242, 4.90855)
    ..cubicTo(9.76689, 3.30285, 10.7991, 2.5, 12, 2.5)
    ..close();

  static final Path _cupPath = Path()
    ..moveTo(10.5, 6.2)
    ..arcToPoint(const Offset(16.5, 8), radius: const Radius.elliptical(6, 1.8))
    ..lineTo(16.5, 11.8)
    ..arcToPoint(const Offset(10.9, 17.4), radius: const Radius.circular(5.6))
    ..lineTo(10.1, 17.4)
    ..arcToPoint(const Offset(4.5, 11.8), radius: const Radius.circular(5.6))
    ..lineTo(4.5, 8)
    ..arcToPoint(
      const Offset(10.5, 6.2),
      radius: const Radius.elliptical(6, 1.8),
    )
    ..close();

  static final List<Offset> _housePoints = _sample(_housePath);
  static final List<Offset> _cupPoints = _sample(_cupPath);

  static List<Offset> _sample(Path path) {
    final metric = path.computeMetrics().first;
    return [
      for (var i = 0; i < _samples; i++)
        metric.getTangentForOffset(metric.length * i / _samples)!.position,
    ];
  }

  static final Path _handle = Path()
    ..moveTo(16.4, 10.2)
    ..cubicTo(21.4, 9.6, 21.2, 15.4, 15.6, 14.9);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 24, size.height / 24);

    final morph = Curves.easeInOutCubic.transform(progress.clamp(0.0, 1.0));
    final handleGrow = Curves.easeOutBack.transform(
      ((progress - 0.55) / 0.40).clamp(0.0, 1.0),
    );
    final saucerGrow = Curves.easeOutCubic.transform(
      ((progress - 0.60) / 0.40).clamp(0.0, 1.0),
    );
    // Outline at rest, solid once it is a cup.
    final fillAmount = ((progress - 0.25) / 0.5).clamp(0.0, 1.0);
    final ink = Color.lerp(idleInk, selectedInk, progress.clamp(0.0, 1.0))!;

    // The house sits centred; shift as it turns into cup + saucer so that
    // pair is centred too.
    canvas.translate(1.2 * morph, -0.6 * morph);

    // The cheers tilt only exists while the scene plays, about the cup's base.
    final tilt = -0.17 * math.sin(math.pi * (scene / 0.5).clamp(0.0, 1.0));
    canvas.save();
    canvas.translate(10.5, 17.4);
    canvas.rotate(tilt);
    canvas.translate(-10.5, -17.4);

    final body = Path()
      ..addPolygon([
        for (var i = 0; i < _samples; i++)
          Offset.lerp(_housePoints[i], _cupPoints[i], morph)!,
      ], true);
    canvas.drawPath(body, Paint()..color = ink.withValues(alpha: fillAmount));
    canvas.drawPath(
      body,
      Paint()
        ..color = ink
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5 * (1 - fillAmount)
        ..strokeJoin = StrokeJoin.round,
    );
    if (handleGrow > 0) {
      final metric = _handle.computeMetrics().first;
      canvas.drawPath(
        metric.extractPath(0, metric.length * handleGrow.clamp(0.0, 1.0)),
        Paint()
          ..color = ink
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.7
          ..strokeCap = StrokeCap.round,
      );
    }

    // The cup's dark opening appears once the shape is a cup, then coffee
    // pours into it, rippling as it settles.
    if (morph > 0.9) {
      final opening = ((morph - 0.9) / 0.1).clamp(0.0, 1.0);
      final pour = Curves.easeOutCubic.transform(
        (scene / 0.35).clamp(0.0, 1.0),
      );
      final ripple = 1 + 0.22 * math.sin(scene * math.pi * 9) * (1 - pour);
      canvas.drawOval(
        Rect.fromCenter(
          center: const Offset(10.5, 8.1),
          width: 9.8,
          height: 2.1 * ripple * opening,
        ),
        Paint()..color = Color.lerp(pillColor, _coffee, pour)!,
      );
    }
    canvas.restore();

    if (saucerGrow > 0) {
      final half = 8.9 * saucerGrow;
      canvas.drawRRect(
        RRect.fromLTRBR(
          10.5 - half,
          19,
          10.5 + half,
          20.8,
          const Radius.circular(0.9),
        ),
        Paint()..color = ink,
      );
    }

    _paintHeart(canvas, const Offset(8.4, 5.6), 1.9, (scene - 0.20) / 0.50);
    _paintHeart(canvas, const Offset(13.0, 5.0), 1.5, (scene - 0.38) / 0.50);
  }

  /// A heart that pops in, drifts up and fades. [t] runs 0 to 1.
  void _paintHeart(Canvas canvas, Offset origin, double size, double t) {
    if (t <= 0 || t >= 1) return;
    final rise = Curves.easeOut.transform(t) * 5.2;
    final pop = Curves.easeOutBack.transform((t * 4).clamp(0.0, 1.0));
    final alpha = math.sin(math.pi * t).clamp(0.0, 1.0);
    final c = origin - Offset(0, rise);
    final s = size * pop;
    final heart = Path()
      ..moveTo(c.dx, c.dy + s * 0.9)
      ..cubicTo(
        c.dx - s * 1.3,
        c.dy + s * 0.1,
        c.dx - s * 1.0,
        c.dy - s * 0.9,
        c.dx,
        c.dy - s * 0.35,
      )
      ..cubicTo(
        c.dx + s * 1.0,
        c.dy - s * 0.9,
        c.dx + s * 1.3,
        c.dy + s * 0.1,
        c.dx,
        c.dy + s * 0.9,
      )
      ..close();
    canvas.drawPath(heart, Paint()..color = brand.withValues(alpha: alpha));
  }

  @override
  bool shouldRepaint(_HomeCupPainter old) =>
      old.progress != progress ||
      old.scene != scene ||
      old.idleInk != idleInk ||
      old.selectedInk != selectedInk ||
      old.pillColor != pillColor;
}

/// The menu icon: four rounded squares that, when selected, melt into a
/// steaming bowl. The lower pair of squares merge into the bowl, the upper pair
/// shrink away while three wisps of steam take their place and keep curling
/// upward for as long as the tab stays selected.
class _SteamingBowlIcon extends StatefulWidget {
  const _SteamingBowlIcon({required this.selected, required this.animate});

  final bool selected;
  final bool animate;

  @override
  State<_SteamingBowlIcon> createState() => _SteamingBowlIconState();
}

class _SteamingBowlIconState extends State<_SteamingBowlIcon>
    with TickerProviderStateMixin {
  late final AnimationController _morph = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 650),
    value: widget.animate ? 0 : 1,
  );
  late final AnimationController _steam = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2600),
  );

  @override
  void initState() {
    super.initState();
    _sync(oldSelected: false);
  }

  @override
  void didUpdateWidget(_SteamingBowlIcon oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync(oldSelected: oldWidget.selected);
  }

  void _sync({required bool oldSelected}) {
    if (!widget.animate) {
      _morph.value = 1;
      _steam.stop();
      return;
    }
    if (widget.selected && !oldSelected) _morph.forward(from: 0);
    if (widget.selected) {
      if (!_steam.isAnimating) _steam.repeat();
    } else {
      // Keep the shape while the icon fades out; only the steam stops.
      _steam.stop();
    }
  }

  @override
  void dispose() {
    _morph.dispose();
    _steam.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 23,
    height: 23,
    child: AnimatedBuilder(
      animation: Listenable.merge([_morph, _steam]),
      builder: (context, _) => CustomPaint(
        painter: _BowlPainter(
          morph: Curves.easeOutCubic.transform(_morph.value),
          steam: widget.animate ? _steam.value : 0.35,
          color: _onPill(context),
        ),
      ),
    ),
  );
}

class _BowlPainter extends CustomPainter {
  const _BowlPainter({
    required this.morph,
    required this.steam,
    required this.color,
  });

  final double morph;
  final double steam;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 24, size.height / 24);
    final m = morph;
    final fill = Paint()..color = color;

    // Lower squares -> two halves of a bowl, meeting at the centre line.
    double l(double a, double b) => lerpDouble(a, b, m)!;
    canvas.drawRRect(
      RRect.fromLTRBAndCorners(
        3,
        l(13.5, 12.2),
        l(10.5, 12.15),
        l(21, 20.8),
        topLeft: Radius.circular(l(2.4, 0.8)),
        topRight: Radius.circular(l(2.4, 0)),
        bottomLeft: Radius.circular(l(2.4, 7.8)),
        bottomRight: Radius.circular(l(2.4, 0)),
      ),
      fill,
    );
    canvas.drawRRect(
      RRect.fromLTRBAndCorners(
        l(13.5, 11.85),
        l(13.5, 12.2),
        21,
        l(21, 20.8),
        topLeft: Radius.circular(l(2.4, 0)),
        topRight: Radius.circular(l(2.4, 0.8)),
        bottomLeft: Radius.circular(l(2.4, 0)),
        bottomRight: Radius.circular(l(2.4, 7.8)),
      ),
      fill,
    );

    // Hides the seam where the two halves meet while they are still moving.
    if (m > 0.6) {
      canvas.drawRect(
        Rect.fromLTRB(11.4, l(13.5, 12.2), 12.6, l(21, 20.8) - 0.4 * m),
        Paint()..color = color.withValues(alpha: (m - 0.6) / 0.4),
      );
    }

    // Rim of the bowl, widening in as the squares merge.
    if (m > 0) {
      final half = 10 * Curves.easeOut.transform(m);
      canvas.drawRRect(
        RRect.fromLTRBR(
          12 - half,
          10.7,
          12 + half,
          12.4,
          const Radius.circular(0.85),
        ),
        Paint()..color = color.withValues(alpha: m.clamp(0.0, 1.0)),
      );
    }

    // Upper squares shrink away toward where the steam appears.
    final squareScale = 1 - Curves.easeIn.transform(m);
    if (squareScale > 0.01) {
      final alpha = (1 - m * 1.6).clamp(0.0, 1.0);
      for (final cx in const [6.75, 17.25]) {
        final half = 3.75 * squareScale;
        final cy = lerpDouble(6.75, 7.5, m)!;
        canvas.drawRRect(
          RRect.fromLTRBR(
            cx - half,
            cy - half,
            cx + half,
            cy + half,
            Radius.circular(lerpDouble(2.4, half, m)!),
          ),
          Paint()..color = color.withValues(alpha: alpha),
        );
      }
    }

    // Three wisps curling upward. Each one is drawn as short segments so it
    // can fade out toward the top and at its ends.
    final visibility = ((m - 0.35) / 0.65).clamp(0.0, 1.0);
    if (visibility > 0) {
      const wisps = [
        (cx: 7.6, top: 3.4, phase: 0.0, amp: 1.1),
        (cx: 12.0, top: 1.4, phase: 0.33, amp: 1.25),
        (cx: 16.4, top: 3.8, phase: 0.66, amp: 1.1),
      ];
      const segments = 14;
      const bottom = 9.8;
      for (final w in wisps) {
        Offset point(double u) => Offset(
          w.cx + w.amp * math.sin(2 * math.pi * (u * 0.9 - steam - w.phase)),
          bottom + (w.top - bottom) * u,
        );
        for (var i = 0; i < segments; i++) {
          final u0 = i / segments;
          final u1 = (i + 1) / segments;
          final mid = (u0 + u1) / 2;
          // Fade in at the bowl, out at the top; the pulse makes puffs travel
          // up the wisp instead of the whole line glowing evenly.
          final envelope = math.pow(math.sin(math.pi * mid), 0.9);
          final pulse =
              0.7 + 0.3 * math.sin(2 * math.pi * (mid - steam * 2 - w.phase));
          final alpha = (envelope * pulse * visibility).clamp(0.0, 1.0);
          canvas.drawLine(
            point(u0),
            point(u1),
            Paint()
              ..color = brand.withValues(alpha: alpha)
              ..strokeWidth = 1.6
              ..strokeCap = StrokeCap.round,
          );
        }
      }
    }
  }

  @override
  bool shouldRepaint(_BowlPainter old) =>
      old.morph != morph || old.steam != steam || old.color != color;
}

/// Filled cart glyph that plays a small scene each time it becomes selected:
/// three little products drop in from above and vanish behind the basket, then
/// the cart lurches to the right and rolls back into place.
class _CartMotionIcon extends StatefulWidget {
  const _CartMotionIcon({
    required this.icon,
    required this.selected,
    required this.animate,
  });

  final IconData icon;
  final bool selected;
  final bool animate;

  @override
  State<_CartMotionIcon> createState() => _CartMotionIconState();
}

class _CartMotionIconState extends State<_CartMotionIcon>
    with SingleTickerProviderStateMixin {
  static const _size = 23.0;

  // Items as (x fraction, colour, size, start, shape). The x positions keep
  // clear of the glyph's handle slot so nothing shows through it.
  static const _items = [
    (0.33, brand, 5.0, 0.06, BoxShape.circle),
    (0.47, Color(0xFFFFA94D), 4.6, 0.14, BoxShape.rectangle),
    (0.82, brand, 4.8, 0.22, BoxShape.circle),
  ];

  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1700),
  );

  // Horizontal position in pill-widths: 0 = at rest, 1 = gone off the right
  // edge, -1 = waiting off the left edge. Starts once the items are in, speeds
  // up as it leaves, then re-enters from the left and brakes into place.
  late final Animation<double> _roll = TweenSequence<double>([
    TweenSequenceItem(tween: ConstantTween(0), weight: 50),
    TweenSequenceItem(
      tween: Tween(
        begin: 0.0,
        end: 1.0,
      ).chain(CurveTween(curve: Curves.easeInCubic)),
      weight: 15,
    ),
    TweenSequenceItem(tween: ConstantTween(-1), weight: 3),
    TweenSequenceItem(
      tween: Tween(
        begin: -1.0,
        end: 0.0,
      ).chain(CurveTween(curve: Curves.easeOutCubic)),
      weight: 24,
    ),
    TweenSequenceItem(tween: ConstantTween(0), weight: 8),
  ]).animate(_controller);

  /// How far the cart travels to be fully outside the tab, in logical pixels.
  static const _travel = 46.0;

  @override
  void didUpdateWidget(_CartMotionIcon oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.selected && !oldWidget.selected && widget.animate) {
      _controller.forward(from: 0);
    }
  }

  @override
  void initState() {
    super.initState();
    if (widget.selected && widget.animate) _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox(
    width: _size,
    height: _size,
    // Clip to the tab so the cart disappears at the pill's edge rather than
    // sliding over the neighbouring tabs.
    child: ClipRect(
      clipper: const _PadClipper(horizontal: 22, vertical: 8),
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final roll = _roll.value;
          return Transform(
            alignment: const Alignment(0, 0.8),
            transform: Matrix4.identity()
              ..translateByDouble(roll * _travel, 0, 0, 1)
              ..rotateZ(roll * 0.1),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                // Behind the glyph: once an item drops past the basket's top
                // edge the solid body hides it, so it reads as "inside".
                for (final (x, color, size, start, shape) in _items)
                  _item(x, color, size, start, shape),
                Icon(widget.icon, color: _onPill(context), size: _size),
              ],
            ),
          );
        },
      ),
    ),
  );

  Widget _item(
    double x,
    Color color,
    double size,
    double start,
    BoxShape shape,
  ) {
    final p = Interval(
      start,
      start + 0.3,
      curve: Curves.easeIn,
    ).transform(_controller.value);
    final y = -0.14 + p * 0.56;
    return Positioned(
      left: x * _size - size / 2,
      top: y * _size - size / 2,
      child: Opacity(
        opacity: (p * 8).clamp(0.0, 1.0),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: color,
            shape: shape,
            borderRadius: shape == BoxShape.circle
                ? null
                : BorderRadius.circular(1.4),
          ),
          child: SizedBox(width: size, height: size),
        ),
      ),
    );
  }
}

/// Filled user glyph whose head glances left, right and back to centre once
/// when it appears. The glyph is split at the gap between head and shoulders,
/// so only the head moves; it also narrows a touch at each end of the glance,
/// which sells the turn.
class _LookingUserIcon extends StatefulWidget {
  const _LookingUserIcon({required this.animate, super.key});

  final bool animate;

  @override
  State<_LookingUserIcon> createState() => _LookingUserIconState();
}

class _LookingUserIconState extends State<_LookingUserIcon>
    with SingleTickerProviderStateMixin {
  static const _size = 25.0;

  /// Fraction of the glyph box where the gap between head and shoulders is.
  static const _split = 0.57;

  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1700),
  );

  /// Head direction over time: -1 = looking left, 1 = looking right.
  ///
  /// One continuous swing instead of eased steps: sin(2πu)·sin(πu) goes left,
  /// sweeps through the centre to the right and settles with zero speed at
  /// both ends, so it never stops dead at a pose like a keyframed animation.
  /// The first part of the timeline is a rest while the icon swaps in.
  double _look(double value) {
    final u = ((value - 0.12) / 0.88).clamp(0.0, 1.0);
    // 0.7698 is the peak of sin(2πu)·sin(πu), which normalises it to ±1.
    return -math.sin(2 * math.pi * u) * math.sin(math.pi * u) / 0.7698;
  }

  @override
  void initState() {
    super.initState();
    if (widget.animate) _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final glyph = Icon(
      AppIcons.dockProfileFilled,
      color: Theme.of(context).brightness == Brightness.dark
          ? const Color(0xFF111111)
          : AppPalette.of(context).text,
      size: _size,
    );
    return SizedBox(
      width: _size,
      height: _size,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          AnimatedBuilder(
            animation: _controller,
            builder: (context, _) {
              final look = _look(_controller.value);
              // Shoulders follow a hair in the opposite direction, so the
              // head reads as turning on the neck rather than sliding.
              final shoulders = Transform.translate(
                offset: Offset(-look * 0.5, 0),
                child: ClipRect(
                  clipper: const _BandClipper(_split, 1),
                  child: glyph,
                ),
              );
              final head = Transform(
                alignment: const Alignment(0, -0.45),
                // A real turn about the vertical axis with a little
                // perspective: the circle narrows and shifts as it rotates,
                // plus a slight tilt and dip toward the side it looks at.
                transform: Matrix4.identity()
                  ..setEntry(3, 2, 0.006)
                  ..translateByDouble(look * 1.8, look.abs() * 0.4, 0, 1)
                  ..rotateY(look * 0.6)
                  ..rotateZ(look * 0.07),
                child: ClipRect(
                  clipper: const _BandClipper(0, _split),
                  child: glyph,
                ),
              );
              return Stack(
                clipBehavior: Clip.none,
                children: [shoulders, head],
              );
            },
          ),
        ],
      ),
    );
  }
}

/// Clips to the child's box grown by a fixed margin on each side.
class _PadClipper extends CustomClipper<Rect> {
  const _PadClipper({required this.horizontal, required this.vertical});

  final double horizontal;
  final double vertical;

  @override
  Rect getClip(Size size) => Rect.fromLTRB(
    -horizontal,
    -vertical,
    size.width + horizontal,
    size.height + vertical,
  );

  @override
  bool shouldReclip(_PadClipper oldClipper) =>
      oldClipper.horizontal != horizontal || oldClipper.vertical != vertical;
}

/// Clips to a horizontal band, given as fractions of the child's height.
class _BandClipper extends CustomClipper<Rect> {
  const _BandClipper(this.top, this.bottom);

  final double top;
  final double bottom;

  @override
  Rect getClip(Size size) => Rect.fromLTRB(
    -size.width,
    size.height * top,
    size.width * 2,
    size.height * bottom,
  );

  @override
  bool shouldReclip(_BandClipper oldClipper) =>
      oldClipper.top != top || oldClipper.bottom != bottom;
}

/// Selection pill that stretches like jelly: the leading edge shoots ahead and
/// overshoots, the trailing edge lags behind and then catches up, so the pill
/// stretches while travelling and squashes slightly as it lands.
class _JellyIndicator extends StatefulWidget {
  const _JellyIndicator({required this.index, required this.reducedMotion});

  final int index;
  final bool reducedMotion;

  @override
  State<_JellyIndicator> createState() => _JellyIndicatorState();
}

class _JellyIndicatorState extends State<_JellyIndicator>
    with SingleTickerProviderStateMixin {
  static const _tabCount = 3;
  static const _lead = Curves.easeOutBack;
  static const _trail = Interval(0.14, 1, curve: Curves.easeOutBack);

  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 520),
    value: 1,
  );
  late double _left0 = widget.index.toDouble();
  late double _right0 = widget.index + 1.0;
  late double _left1 = _left0;
  late double _right1 = _right0;
  bool _rightward = true;

  (double, double) get _edges {
    final t = _controller.value;
    final left = lerpDouble(
      _left0,
      _left1,
      (_rightward ? _trail : _lead).transform(t),
    )!;
    final right = lerpDouble(
      _right0,
      _right1,
      (_rightward ? _lead : _trail).transform(t),
    )!;
    // The pill never leaves the track, so overshoot squashes at the ends.
    final l = left.clamp(0.0, _tabCount - 0.5);
    final r = right.clamp(l + 0.5, _tabCount.toDouble());
    return (l, r);
  }

  @override
  void didUpdateWidget(_JellyIndicator oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.index == widget.index) return;
    // Start from wherever the pill currently is so a quick second tap
    // redirects it smoothly instead of snapping.
    final (left, right) = _edges;
    _left0 = left;
    _right0 = right;
    _left1 = widget.index.toDouble();
    _right1 = widget.index + 1.0;
    _rightward = _left1 >= _left0;
    if (widget.reducedMotion) {
      _controller.value = 1;
    } else {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _controller,
    builder: (context, child) {
      final (left, right) = _edges;
      final factor = (right - left) / _tabCount;
      final offset = left / _tabCount;
      return Align(
        alignment: Alignment(
          factor >= 1 ? 0 : offset / (1 - factor) * 2 - 1,
          0,
        ),
        child: FractionallySizedBox(
          widthFactor: factor,
          heightFactor: 1,
          child: child,
        ),
      );
    },
    child: const _PillBody(),
  );
}

/// The selection pill, shared by every indicator style.
class _PillBody extends StatelessWidget {
  const _PillBody();

  @override
  Widget build(BuildContext context) => DecoratedBox(
    key: const ValueKey('dock-selection-indicator'),
    decoration: BoxDecoration(
      color: _pillColor(context),
      borderRadius: BorderRadius.circular(34),
    ),
  );
}

/// Spring-driven pill. Its position follows a damped spring, and its shape
/// follows its speed: the faster it moves the longer and flatter it gets, so
/// it reads as one liquid blob that settles rather than a box sliding around.
class _SpringIndicator extends StatefulWidget {
  const _SpringIndicator({required this.index, required this.reducedMotion});

  final int index;
  final bool reducedMotion;

  @override
  State<_SpringIndicator> createState() => _SpringIndicatorState();
}

class _SpringIndicatorState extends State<_SpringIndicator>
    with SingleTickerProviderStateMixin {
  static const _tabCount = 3;
  static const _spring = SpringDescription(
    mass: 1,
    stiffness: 380,
    damping: 25,
  );

  /// Extra width per tab-per-second of speed, and how far it may stretch.
  static const _stretchPerSpeed = 0.055;
  static const _maxStretch = 0.45;

  // Position of the pill's left edge in tab units; unbounded so the spring
  // can overshoot its target.
  late final AnimationController _controller = AnimationController.unbounded(
    vsync: this,
    value: widget.index.toDouble(),
  );

  @override
  void didUpdateWidget(_SpringIndicator oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.index == widget.index) return;
    final target = widget.index.toDouble();
    if (widget.reducedMotion) {
      _controller.stop();
      _controller.value = target;
      return;
    }
    // Carrying the current velocity over keeps a quick second tap smooth.
    _controller.animateWith(
      SpringSimulation(
        _spring,
        _controller.value,
        target,
        _controller.velocity,
      ),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _controller,
    builder: (context, child) {
      final speed = _controller.velocity.abs();
      final stretch = (speed * _stretchPerSpeed).clamp(0.0, _maxStretch);
      final width = 1 + stretch;
      final center = _controller.value + 0.5;
      // Stay inside the track: overshoot squashes against the ends.
      final left = (center - width / 2).clamp(0.0, _tabCount - width);
      final factor = width / _tabCount;
      final free = 1 - factor;
      return Align(
        alignment: Alignment(
          free <= 0 ? 0 : left / _tabCount / free * 2 - 1,
          0,
        ),
        child: FractionallySizedBox(
          widthFactor: factor,
          // Volume-preserving feel: longer means a little thinner.
          heightFactor: 1 - stretch * 0.28,
          child: child,
        ),
      );
    },
    child: const _PillBody(),
  );
}

/// Tracks the pressed state so a child can shrink slightly under the finger.
class _PressScale extends StatefulWidget {
  const _PressScale({required this.builder});

  final Widget Function(ValueChanged<bool> onHighlightChanged, double scale)
  builder;

  @override
  State<_PressScale> createState() => _PressScaleState();
}

class _PressScaleState extends State<_PressScale> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) => widget.builder(
    (pressed) => setState(() => _pressed = pressed),
    _pressed ? 0.9 : 1,
  );
}

/// Item count shown on the Sepet tab. Brand-yellow pill with a ring that
/// matches whatever is behind it (white dock, or the dark selection pill), so
/// it reads as sitting on the icon's corner. It springs in, bumps when the
/// count changes, rolls its digits, and can be hidden on demand.
class _CountBadge extends StatefulWidget {
  const _CountBadge({
    required this.count,
    required this.visible,
    required this.ringColor,
    required this.reducedMotion,
  });

  final int count;

  /// False hides the badge (it shrinks away); true springs it back in.
  final bool visible;
  final Color ringColor;
  final bool reducedMotion;

  @override
  State<_CountBadge> createState() => _CountBadgeState();
}

class _CountBadgeState extends State<_CountBadge>
    with SingleTickerProviderStateMixin {
  late final AnimationController _bump = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 420),
  );
  late final Animation<double> _bumpScale = TweenSequence<double>([
    TweenSequenceItem(
      tween: Tween(
        begin: 1.0,
        end: 1.3,
      ).chain(CurveTween(curve: Curves.easeOut)),
      weight: 35,
    ),
    TweenSequenceItem(
      tween: Tween(
        begin: 1.3,
        end: 1.0,
      ).chain(CurveTween(curve: Curves.elasticOut)),
      weight: 65,
    ),
  ]).animate(_bump);

  // Kept so the number doesn't flash "0" while the badge shrinks away.
  late int _shown = widget.count;

  @override
  void didUpdateWidget(_CountBadge oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.count > 0) _shown = widget.count;
    if (widget.count != oldWidget.count &&
        widget.count > 0 &&
        oldWidget.count > 0 &&
        widget.visible &&
        !widget.reducedMotion) {
      _bump.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _bump.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final visible = widget.visible && widget.count > 0;
    return IgnorePointer(
      child: AnimatedScale(
        key: const ValueKey('dock-cart-badge'),
        scale: visible ? 1 : 0,
        duration: widget.reducedMotion
            ? Duration.zero
            : Duration(milliseconds: visible ? 480 : 140),
        curve: visible ? Curves.elasticOut : Curves.easeIn,
        child: ScaleTransition(
          scale: _bumpScale,
          child: AnimatedContainer(
            duration: widget.reducedMotion
                ? Duration.zero
                : const Duration(milliseconds: 220),
            constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
            padding: const EdgeInsets.symmetric(horizontal: 4),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: brand,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: widget.ringColor, width: 2),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x24000000),
                  blurRadius: 6,
                  offset: Offset(0, 2),
                ),
              ],
            ),
            child: ClipRect(
              child: AnimatedSwitcher(
                duration: widget.reducedMotion
                    ? Duration.zero
                    : const Duration(milliseconds: 240),
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeIn,
                transitionBuilder: (child, animation) => FadeTransition(
                  opacity: animation,
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(0, 0.7),
                      end: Offset.zero,
                    ).animate(animation),
                    child: child,
                  ),
                ),
                child: Text(
                  _shown > 99 ? '99+' : '$_shown',
                  key: ValueKey(_shown),
                  style: const TextStyle(
                    fontFamily: 'Gilroy',
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    height: 1.15,
                    color: onBrand,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Scene a tab's filled icon plays when it becomes selected.
enum _TabMotion { none, cart, bowl, cafe }

class _DockTab extends StatefulWidget {
  const _DockTab({
    required this.label,
    required this.outlineIcon,
    required this.filledIcon,
    required this.selected,
    required this.onTap,
    this.badgeCount = 0,
    this.hasBadge = false,
    this.motion = _TabMotion.none,
  });

  final String label;
  final IconData outlineIcon;
  final IconData filledIcon;

  final bool selected;
  final VoidCallback onTap;
  final int badgeCount;

  /// Whether this tab can show a count badge at all.
  final bool hasBadge;

  /// Which scene the filled icon plays when the tab becomes selected.
  final _TabMotion motion;

  @override
  State<_DockTab> createState() => _DockTabState();
}

class _DockTabState extends State<_DockTab>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    value: widget.selected ? 1 : 0,
  );
  // Selected icon springs in with an elastic wobble; deselecting is a plain
  // ease-in so nothing bounces on the way out.
  late final Animation<double> _pop = CurvedAnimation(
    parent: _controller,
    curve: Curves.elasticOut,
    reverseCurve: Curves.easeIn,
  );

  @override
  void didUpdateWidget(_DockTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selected == widget.selected) return;
    _holdBadgeWhileMotionPlays();
    if (!widget.selected) {
      if (widget.motion == _TabMotion.cafe) {
        _controller.animateBack(
          0,
          duration: MediaQuery.disableAnimationsOf(context)
              ? Duration.zero
              : const Duration(milliseconds: 420),
          curve: Curves.easeInOutCubic,
        );
      } else {
        _controller.value = 0;
      }
      return;
    }
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    _controller.animateTo(
      1,
      duration: reducedMotion
          ? Duration.zero
          : Duration(
              milliseconds: widget.motion == _TabMotion.cafe ? 640 : 520,
            ),
    );
  }

  /// The cart's badge stays out of the way while its icon plays the "items
  /// drop in" scene, and springs in once the scene is over.
  bool _badgeHeld = false;
  Timer? _badgeTimer;

  static const _cartSceneLength = Duration(milliseconds: 1650);

  void _holdBadgeWhileMotionPlays() {
    _badgeTimer?.cancel();
    _badgeTimer = null;
    final plays =
        widget.selected &&
        widget.motion == _TabMotion.cart &&
        !MediaQuery.disableAnimationsOf(context);
    _badgeHeld = plays;
    if (!plays) return;
    _badgeTimer = Timer(_cartSceneLength, () {
      if (mounted) setState(() => _badgeHeld = false);
    });
  }

  @override
  void dispose() {
    _badgeTimer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Widget _icon() {
    if (widget.motion == _TabMotion.cafe) {
      return SizedBox(
        width: 24,
        height: 24,
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, _) => _HomeCupIcon(
            progress: _controller.value,
            selected: widget.selected,
            animate: !MediaQuery.disableAnimationsOf(context),
          ),
        ),
      );
    }
    return SizedBox(
      width: 24,
      height: 24,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) {
          final t = _controller.value;
          return Stack(
            alignment: Alignment.center,
            children: [
              if (t < 1)
                Opacity(
                  // Keys keep the filled icon's State alive when the outline icon
                  // leaves the list; otherwise it is rebuilt and replays motion.
                  key: const ValueKey('outline'),
                  opacity: (1 - t * 3).clamp(0.0, 1.0),
                  child: Transform.scale(
                    scale: 1 - 0.15 * t,
                    child: Icon(
                      widget.outlineIcon,
                      color: AppPalette.of(context).text,
                      size: 23,
                    ),
                  ),
                ),
              if (t > 0)
                Opacity(
                  key: const ValueKey('filled'),
                  opacity: (t * 3).clamp(0.0, 1.0),
                  child: Transform.scale(
                    scale: 0.65 + 0.35 * _pop.value,
                    child: switch (widget.motion) {
                      _TabMotion.cart => _CartMotionIcon(
                        icon: widget.filledIcon,
                        selected: widget.selected,
                        animate: !MediaQuery.disableAnimationsOf(context),
                      ),
                      _TabMotion.bowl => _SteamingBowlIcon(
                        selected: widget.selected,
                        animate: !MediaQuery.disableAnimationsOf(context),
                      ),
                      _TabMotion.cafe => const SizedBox.shrink(),
                      _TabMotion.none => Icon(
                        widget.filledIcon,
                        color: _onPill(context),
                        size: 23,
                      ),
                    },
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    final duration = reducedMotion
        ? Duration.zero
        : const Duration(milliseconds: 200);

    return Expanded(
      child: Semantics(
        button: true,
        selected: widget.selected,
        label: tr(context, widget.label),
        child: Material(
          color: Colors.transparent,
          child: _PressScale(
            builder: (onHighlightChanged, scale) => InkWell(
              borderRadius: BorderRadius.circular(34),
              onTap: widget.onTap,
              onHighlightChanged: onHighlightChanged,
              child: AnimatedScale(
                scale: scale,
                duration: reducedMotion
                    ? Duration.zero
                    : const Duration(milliseconds: 120),
                curve: Curves.easeOut,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Stack(
                      clipBehavior: Clip.none,
                      children: [
                        _icon(),
                        if (widget.hasBadge)
                          Positioned(
                            top: -8,
                            right: -12,
                            child: _CountBadge(
                              count: widget.badgeCount,
                              visible: !_badgeHeld,
                              ringColor: widget.selected
                                  ? _pillColor(context)
                                  : AppPalette.of(context).surface,
                              reducedMotion: reducedMotion,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    // Constant weight: switching weights re-flows the glyphs
                    // and makes the label jitter, so only the colour animates.
                    AnimatedDefaultTextStyle(
                      duration: duration,
                      curve: Curves.easeOutCubic,
                      style: TextStyle(
                        fontFamily: 'Gilroy',
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: widget.selected
                            ? _onPill(context)
                            : AppPalette.of(context).muted,
                      ),
                      child: LText(
                        widget.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
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
