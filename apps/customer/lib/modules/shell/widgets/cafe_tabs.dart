import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/data/customer_store.dart';
import '../../../core/theme/app_colors.dart';
import '../../home/widgets/food_visual.dart';

/// Switches the selected cafe straight away. A cart belongs to one cafe, so
/// the store empties it. Returns whether the cafe was changed.
///
/// [beforeSwitch] runs first, and is awaited, so the
/// screen can fade out the old cafe. [afterSwitch] runs as soon as the store
/// holds the new cafe, while its menu is still loading, so the screen can
/// fade the new one in.
Future<bool> changeCafe(
  BuildContext context,
  Store store,
  Map<String, dynamic> cafe, {
  Future<void> Function()? beforeSwitch,
  VoidCallback? afterSwitch,
}) async {
  if (store.cafe?['id'] == cafe['id']) return false;
  await beforeSwitch?.call();
  final loading = store.selectCafe(cafe);
  afterSwitch?.call();
  await loading;
  return true;
}

/// One tab per cafe, filling the yellow app bar's toolbar. The selected cafe is
/// a white pill that opens up to show its name; the others stay as round photos
/// on a faded pill, so any number of cafes fits and the choice reads at a
/// glance. The selected tab scrolls into view when the cafe changes.
class CafeTabs extends StatefulWidget {
  const CafeTabs({
    required this.store,
    this.beforeSwitch,
    this.afterSwitch,
    super.key,
  });

  final Store store;
  final Future<void> Function()? beforeSwitch;
  final VoidCallback? afterSwitch;

  @override
  State<CafeTabs> createState() => _CafeTabsState();
}

class _CafeTabsState extends State<CafeTabs> {
  final _keys = <String, GlobalKey>{};
  Object? _shownId;
  bool _first = true;

  GlobalKey _keyFor(Object? id) => _keys.putIfAbsent('$id', GlobalKey.new);

  void _revealSelected(Object? id, {required bool animate}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final context = _keyFor(id).currentContext;
      if (!mounted || context == null) return;
      Scrollable.ensureVisible(
        context,
        alignment: 0.5,
        duration: animate && !MediaQuery.disableAnimationsOf(context)
            ? const Duration(milliseconds: 320)
            : Duration.zero,
        curve: Curves.easeOutCubic,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final selectedId = store.cafe?['id'];
    if (selectedId != _shownId) {
      _revealSelected(selectedId, animate: !_first);
      _shownId = selectedId;
      _first = false;
    }
    return SizedBox(
      height: kToolbarHeight,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: store.cafes.length,
        separatorBuilder: (_, _) => const SizedBox(width: 14),
        itemBuilder: (context, index) {
          final cafe = store.cafes[index];
          return _CafeTab(
            key: _keyFor(cafe['id']),
            cafe: cafe,
            selected: selectedId == cafe['id'],
            onTap: () {
              if (selectedId != cafe['id']) HapticFeedback.selectionClick();
              changeCafe(
                context,
                store,
                cafe,
                beforeSwitch: widget.beforeSwitch,
                afterSwitch: widget.afterSwitch,
              );
            },
          );
        },
      ),
    );
  }
}

class _CafeTab extends StatefulWidget {
  const _CafeTab({
    required this.cafe,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final Map<String, dynamic> cafe;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_CafeTab> createState() => _CafeTabState();
}

class _CafeTabState extends State<_CafeTab> {
  /// How far the selected tab's concave corners flare out past its body.
  static const _fillet = 14.0;
  static const _topRadius = 20.0;

  /// Space above the tab and below an unselected one, inside the toolbar.
  static const _top = 8.0;
  static const _lift = 6.0;

  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final selected = widget.selected;
    final palette = AppPalette.of(context);
    final name = '${widget.cafe['name'] ?? ''}';
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    final duration = reducedMotion
        ? Duration.zero
        : const Duration(milliseconds: 300);
    return Semantics(
      button: true,
      selected: selected,
      label: name,
      child: ExcludeSemantics(
        child: GestureDetector(
          key: ValueKey('cafe-tab-${widget.cafe['id']}'),
          behavior: HitTestBehavior.opaque,
          onTap: widget.onTap,
          onTapDown: (_) => setState(() => _pressed = true),
          onTapUp: (_) => setState(() => _pressed = false),
          onTapCancel: () => setState(() => _pressed = false),
          child: AnimatedScale(
            scale: _pressed ? 0.95 : 1,
            alignment: Alignment.bottomCenter,
            duration: reducedMotion
                ? Duration.zero
                : const Duration(milliseconds: 120),
            curve: Curves.easeOut,
            // t is 0 for a faded pill and 1 for the tab that grows into the
            // page below it.
            child: TweenAnimationBuilder<double>(
              tween: Tween(end: selected ? 1 : 0),
              duration: duration,
              curve: Curves.easeOutCubic,
              builder: (context, t, _) => Stack(
                clipBehavior: Clip.none,
                children: [
                  // The selected tab: the page's own colour, running down into
                  // the page with concave corners, so the two read as one.
                  Positioned(
                    left: -_fillet,
                    right: -_fillet,
                    top: _top,
                    bottom: -1,
                    child: Opacity(
                      opacity: t,
                      child: CustomPaint(
                        painter: _MergedTabPainter(
                          color: palette.page,
                          fillet: _fillet,
                          radius: _topRadius,
                        ),
                      ),
                    ),
                  ),
                  // The unselected pill, fading out as the tab is selected.
                  Positioned(
                    left: 0,
                    right: 0,
                    top: _top,
                    bottom: _lift * (1 - t),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: Color.fromRGBO(255, 255, 255, 0.4 * (1 - t)),
                        borderRadius: BorderRadius.circular(22),
                      ),
                    ),
                  ),
                  Padding(
                    padding: EdgeInsets.only(
                      top: _top,
                      bottom: _lift * (1 - t),
                    ),
                    child: Center(
                      child: Padding(
                        padding: EdgeInsets.fromLTRB(2, 0, 2 + 12 * t, 0),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(2),
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: selected ? brand : Colors.white,
                                  width: 2,
                                ),
                              ),
                              child: ClipOval(
                                child: FoodPhoto(
                                  name: name,
                                  imageUrl: widget.cafe['imageUrl'],
                                  width: 30,
                                  height: 30,
                                  radius: 0,
                                ),
                              ),
                            ),
                            AnimatedSize(
                              duration: duration,
                              curve: Curves.easeOutCubic,
                              alignment: Alignment.centerLeft,
                              child: selected
                                  ? Padding(
                                      padding: const EdgeInsets.only(left: 9),
                                      child: ConstrainedBox(
                                        constraints: const BoxConstraints(
                                          maxWidth: 130,
                                        ),
                                        child: Text(
                                          name,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                            color: palette.text,
                                            fontSize: 14,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                      ),
                                    )
                                  : const SizedBox.shrink(),
                            ),
                          ],
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

/// Draws the selected tab: rounded at the top, and flared outwards at the
/// bottom by [fillet] on each side so it melts into the page underneath.
class _MergedTabPainter extends CustomPainter {
  const _MergedTabPainter({
    required this.color,
    required this.fillet,
    required this.radius,
  });

  final Color color;
  final double fillet;
  final double radius;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final f = fillet;
    final r = radius;
    final path = Path()
      ..moveTo(0, h)
      ..quadraticBezierTo(f, h, f, h - f)
      ..lineTo(f, r)
      ..arcToPoint(Offset(f + r, 0), radius: Radius.circular(r))
      ..lineTo(w - f - r, 0)
      ..arcToPoint(Offset(w - f, r), radius: Radius.circular(r))
      ..lineTo(w - f, h - f)
      ..quadraticBezierTo(w - f, h, w, h)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
  }

  @override
  bool shouldRepaint(_MergedTabPainter old) =>
      old.color != color || old.fillet != fillet || old.radius != radius;
}
