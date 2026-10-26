import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import '../../../core/l10n/localized_text.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';

import '../../../core/data/customer_store.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/dish_card.dart';
import '../../../core/widgets/favorite_toggle.dart';
import '../../catalog/product_detail_screen.dart';
import 'food_visual.dart';

class FeaturedDish {
  const FeaturedDish(this.product, this.categoryName);

  final Map<String, dynamic> product;
  final String categoryName;
}

/// Big pastel dish cards fanned out like a hand of cards. They sit on a large
/// circle: each card is turned by the same step as its neighbour, so their
/// bottom corners meet while the tops swing apart, and the one in the middle
/// is drawn last, a little larger and lifted. Each card's photo fills the top
/// 60%, filling the frame edge to edge, with the favourite heart on top of it.
///
/// The swipe is tracked here (not by a PageView) because a PageView paints its
/// pages left to right, which would put the right-hand card over the middle.
class FeaturedFoodCarousel extends StatefulWidget {
  const FeaturedFoodCarousel({
    required this.dishes,
    required this.store,
    super.key,
  });

  final List<FeaturedDish> dishes;
  final Store store;

  @override
  State<FeaturedFoodCarousel> createState() => _FeaturedFoodCarouselState();
}

class _FeaturedFoodCarouselState extends State<FeaturedFoodCarousel>
    with SingleTickerProviderStateMixin {
  /// Room above the cards, for the lift of the one in the middle.
  static const _topRoom = 16.0;
  static const _cardHeight = 300.0;

  /// Extra room below, where the outer cards of the fan sink.
  static const _arcRoom = 40.0;

  /// Angle between neighbouring cards, in radians.
  static const _fanStep = 0.26;

  static const _spring = SpringDescription(
    mass: 1,
    stiffness: 210,
    damping: 25,
  );

  // The page position in cards; fractional while dragging or settling.
  late final AnimationController _page = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );
  late final Set<String> _favorites;
  int _current = 0;

  int get _count => widget.dishes.length;

  /// With enough cards the fan wraps around; with few it stops at the ends.
  bool get _wraps => _count >= 5;

  @override
  void initState() {
    super.initState();
    _favorites =
        (widget.store.api.prefs.getStringList('favorite_product_ids') ??
                <String>[])
            .toSet();
    _page.addListener(_trackCurrent);
  }

  void _trackCurrent() {
    final index = _dishIndex(_page.value.round());
    if (index == _current) return;
    HapticFeedback.selectionClick();
    setState(() => _current = index);
  }

  int _dishIndex(int page) => ((page % _count) + _count) % _count;

  void _toggleFavorite(String id) {
    HapticFeedback.selectionClick();
    setState(() {
      if (!_favorites.add(id)) _favorites.remove(id);
    });
    unawaited(
      widget.store.api.prefs.setStringList(
        'favorite_product_ids',
        _favorites.toList(),
      ),
    );
  }

  Future<void> _openProduct(FeaturedDish dish) async {
    await Navigator.push(
      context,
      MaterialPageRoute<void>(
        builder: (_) => ProductDetailScreen(
          store: widget.store,
          product: dish.product,
          categoryName: dish.categoryName,
        ),
      ),
    );
    if (!mounted) return;
    setState(() {
      _favorites
        ..clear()
        ..addAll(
          widget.store.api.prefs.getStringList('favorite_product_ids') ??
              <String>[],
        );
    });
  }

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  Color _cardColor(int index, int count) {
    if (index == 0) return const Color(0xFFFFC857);
    if (index == count - 1) return const Color(0xFF6CC17C);
    if (index == 1) return const Color(0xFFF2724A);
    return const [
      Color(0xFF9DCAEC),
      Color(0xFFEBA2B8),
      Color(0xFF86CDB6),
    ][index % 3];
  }

  void _onDragUpdate(DragUpdateDetails details, double spacing) {
    var next = _page.value - (details.primaryDelta ?? 0) / spacing;
    if (!_wraps) next = next.clamp(-0.35, _count - 1 + 0.35);
    _page.value = next;
  }

  void _onDragEnd(DragEndDetails details, double spacing) {
    // Cards per second; a flick carries a little further than the finger.
    final velocity = -(details.primaryVelocity ?? 0) / spacing;
    var target = (_page.value + velocity * 0.16).round();
    if (!_wraps) target = target.clamp(0, _count - 1);
    _page.animateWith(
      SpringSimulation(_spring, _page.value, target.toDouble(), velocity),
    );
  }

  @override
  Widget build(BuildContext context) {
    final reducedMotion = MediaQuery.disableAnimationsOf(context);

    return Column(
      children: [
        LayoutBuilder(
          builder: (context, constraints) {
            final cardWidth = (constraints.maxWidth * 0.64).clamp(190.0, 270.0);
            // Neighbours sit exactly one card-width apart along the circle,
            // so their bottom corners touch; the tops open up by the fan.
            final radius = cardWidth / _fanStep;
            return GestureDetector(
              key: const ValueKey('featured-carousel'),
              behavior: HitTestBehavior.opaque,
              onHorizontalDragStart: _count > 1 ? (_) => _page.stop() : null,
              onHorizontalDragUpdate: _count > 1
                  ? (d) => _onDragUpdate(d, cardWidth)
                  : null,
              onHorizontalDragEnd: _count > 1
                  ? (d) => _onDragEnd(d, cardWidth)
                  : null,
              child: SizedBox(
                height: _topRoom + _cardHeight + _arcRoom,
                width: double.infinity,
                child: AnimatedBuilder(
                  animation: _page,
                  builder: (context, _) => Stack(
                    clipBehavior: Clip.none,
                    children: _cards(
                      width: constraints.maxWidth,
                      cardWidth: cardWidth,
                      radius: radius,
                      reducedMotion: reducedMotion,
                    ),
                  ),
                ),
              ),
            );
          },
        ),
        if (_count > 1) ...[
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var index = 0; index < _count; index++)
                AnimatedContainer(
                  duration: reducedMotion
                      ? Duration.zero
                      : const Duration(milliseconds: 260),
                  curve: Curves.easeOutBack,
                  width: _current == index ? 26 : 6,
                  height: 6,
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  decoration: BoxDecoration(
                    color: _current == index
                        ? onBrand
                        : const Color(0xFFCFCFD3),
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }

  List<Widget> _cards({
    required double width,
    required double cardWidth,
    required double radius,
    required bool reducedMotion,
  }) {
    final page = _page.value;
    final base = page.round();
    final entries = <({int slot, int dishIndex, double offset})>[];
    for (var slot = base - 2; slot <= base + 2; slot++) {
      if (!_wraps && (slot < 0 || slot >= _count)) continue;
      entries.add((
        slot: slot,
        dishIndex: _dishIndex(slot),
        offset: slot - page,
      ));
    }
    // Farthest first, so the card in the middle is painted last (on top).
    entries.sort((a, b) => b.offset.abs().compareTo(a.offset.abs()));

    return [
      for (final entry in entries)
        _fanned(
          entry: entry,
          width: width,
          cardWidth: cardWidth,
          radius: radius,
          reducedMotion: reducedMotion,
        ),
    ];
  }

  Widget _fanned({
    required ({int slot, int dishIndex, double offset}) entry,
    required double width,
    required double cardWidth,
    required double radius,
    required bool reducedMotion,
  }) {
    final dish = widget.dishes[entry.dishIndex];
    final id = dish.product['id']?.toString() ?? '';
    final offset = entry.offset;
    final distance = offset.abs().clamp(0.0, 2.2);
    final near = 1 - distance.clamp(0.0, 1.0);

    final angle = reducedMotion ? 0.0 : offset.clamp(-2.2, 2.2) * _fanStep;
    // Position on the circle, measured from the card that is centred.
    final dx = reducedMotion
        ? offset * (cardWidth + 8)
        : radius * math.sin(angle);
    final dy = reducedMotion ? 0.0 : radius * (1 - math.cos(angle));
    // The middle card is a little bigger and lifts forward.
    final scale = reducedMotion ? 1.0 : 0.9 + 0.1 * near;
    final lift = reducedMotion ? 0.0 : -16 * near;
    // Cards beyond the first neighbours dissolve rather than pop.
    final opacity = (2.2 - distance).clamp(0.0, 1.0);

    return Positioned(
      key: ValueKey(entry.slot),
      left: (width - cardWidth) / 2,
      width: cardWidth,
      top: 0,
      height: _topRoom + _cardHeight,
      child: Opacity(
        opacity: opacity,
        child: Transform(
          alignment: Alignment.bottomCenter,
          transform: Matrix4.translationValues(dx, dy + lift, 0)
            ..rotateZ(angle)
            ..scaleByDouble(scale, scale, 1, 1),
          // Painted once and kept as a texture: during a swipe the card is only
          // moved and turned, not redrawn with its photo and soft shadow.
          child: RepaintBoundary(
            child: _FeaturedCard(
              dish: dish,
              store: widget.store,
              color: _cardColor(entry.dishIndex, _count),
              favorite: _favorites.contains(id),
              onFavorite: () => _toggleFavorite(id),
              onOpen: () => _openProduct(dish),
              topRoom: _topRoom,
            ),
          ),
        ),
      ),
    );
  }
}

class _FeaturedCard extends StatelessWidget {
  const _FeaturedCard({
    required this.dish,
    required this.store,
    required this.color,
    required this.favorite,
    required this.onFavorite,
    required this.onOpen,
    required this.topRoom,
  });

  final FeaturedDish dish;
  final Store store;
  final Color color;
  final bool favorite;
  final VoidCallback onFavorite;
  final VoidCallback onOpen;

  /// Empty strip above the card (room for the middle card's lift).
  final double topRoom;

  @override
  Widget build(BuildContext context) {
    final product = dish.product;
    final name = '${product['name']}';
    final price = product['minPrice'] ?? product['price'];
    final rating = _rating(product);

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onOpen,
      child: Padding(
        padding: EdgeInsets.only(top: topRoom, bottom: 8),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(32),
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: 0.38),
                blurRadius: 26,
                offset: const Offset(0, 14),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Column(
              children: [
                // The photo takes 60% of the card, the details the other 40%.
                Expanded(
                  flex: 6,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(25),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        LayoutBuilder(
                          builder: (context, box) => FoodPhoto(
                            name: '${dish.categoryName} $name',
                            imageUrl: product['displayImageUrl'],
                            width: box.maxWidth,
                            height: box.maxHeight,
                            radius: 0,
                          ),
                        ),
                        Positioned(
                          left: 8,
                          bottom: 8,
                          right: 44,
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: _CategoryTag(label: dish.categoryName),
                          ),
                        ),
                        Positioned(
                          top: 8,
                          right: 8,
                          child: FavoriteToggle(
                            active: favorite,
                            onTap: onFavorite,
                            size: 17,
                            padding: 4,
                            tooltip: favorite
                                ? 'Favorilerden çıkar'
                                : 'Favorilere ekle',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Expanded(
                  flex: 4,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(10, 9, 6, 4),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Text(
                                name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontFamily: 'Gilroy',
                                  fontSize: 16,
                                  height: 1.12,
                                  fontWeight: FontWeight.w800,
                                  color: onBrand,
                                ),
                              ),
                            ),
                            if (rating != null) ...[
                              const SizedBox(width: 6),
                              const Icon(
                                Icons.star_rounded,
                                color: Color(0xFFF47E20),
                                size: 17,
                              ),
                              const SizedBox(width: 1),
                              Text(
                                rating.toStringAsFixed(1),
                                style: const TextStyle(
                                  fontFamily: 'Gilroy',
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: onBrand,
                                ),
                              ),
                            ],
                          ],
                        ),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Expanded(
                              flex: 4,
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.centerLeft,
                                child: Text.rich(
                                  TextSpan(
                                    text: '$price',
                                    children: const [
                                      TextSpan(
                                        text: ' TMT',
                                        style: TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ],
                                  ),
                                  maxLines: 1,
                                  style: const TextStyle(
                                    fontFamily: 'Gilroy',
                                    fontSize: 22,
                                    height: 1.1,
                                    fontWeight: FontWeight.w800,
                                    color: onBrand,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            // Loose, so a narrow card shrinks the button's
                            // label instead of overflowing.
                            Flexible(
                              flex: 6,
                              child: _BuyButton(
                                onTap: () =>
                                    addProductToCart(context, store, product),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Dark pill button with a yellow plus that squeezes under the finger and
/// springs back.
class _BuyButton extends StatefulWidget {
  const _BuyButton({required this.onTap});

  final VoidCallback onTap;

  @override
  State<_BuyButton> createState() => _BuyButtonState();
}

class _BuyButtonState extends State<_BuyButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    return AnimatedScale(
      scale: _pressed ? 0.92 : 1,
      duration: reducedMotion
          ? Duration.zero
          : Duration(milliseconds: _pressed ? 90 : 360),
      curve: _pressed ? Curves.easeOut : Curves.elasticOut,
      child: Material(
        color: onBrand,
        borderRadius: BorderRadius.circular(22),
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: () {
            HapticFeedback.lightImpact();
            widget.onTap();
          },
          onHighlightChanged: (value) => setState(() => _pressed = value),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(5, 5, 13, 5),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 24,
                    height: 24,
                    decoration: const BoxDecoration(
                      color: brand,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.add_rounded,
                      size: 17,
                      color: onBrand,
                    ),
                  ),
                  const SizedBox(width: 7),
                  const LText(
                    'Sepete ekle',
                    maxLines: 1,
                    style: TextStyle(
                      fontFamily: 'Gilroy',
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
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

/// Small frosted tag with the dish's category, laid over the photo.
class _CategoryTag extends StatelessWidget {
  const _CategoryTag({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    if (label.trim().isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          fontFamily: 'Gilroy',
          fontSize: 10.5,
          fontWeight: FontWeight.w800,
          color: onBrand,
        ),
      ),
    );
  }
}

double? _rating(Map<String, dynamic> product) {
  final value = product['rating'] ?? product['averageRating'];
  final rating = value is num ? value.toDouble() : double.tryParse('$value');
  if (rating == null || rating < 0 || rating > 5) return null;
  return rating;
}
