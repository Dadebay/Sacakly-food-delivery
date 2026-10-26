import 'package:flutter/material.dart';
import '../../core/l10n/localized_text.dart';
import 'package:flutter/services.dart';
import 'package:hugeicons/hugeicons.dart';

import '../../core/data/customer_store.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_icons.dart';
import '../../core/widgets/dish_card.dart' show addProductToCart;
import '../../core/widgets/empty_state.dart';
import '../catalog/product_detail_screen.dart';
import 'widgets/banner_carousel.dart';
import 'widgets/featured_food_carousel.dart';
import 'widgets/food_visual.dart';

class Cafes extends StatefulWidget {
  const Cafes(this.store, this.openMenu, {super.key});
  final Store store;
  final VoidCallback openMenu;

  @override
  State<Cafes> createState() => _CafesState();
}

class _CafesState extends State<Cafes> {
  final search = TextEditingController();
  String? categoryId;

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final query = search.text.trim().toLowerCase();
    // There is no "all" tile, so one category is always selected: the one the
    // customer tapped, else the first. The cafe can be switched from the app
    // bar, which leaves the previous cafe's category behind; that falls back
    // to the first one too.
    final selectedCategoryId =
        store.categories.any((category) => category['id'] == categoryId)
        ? categoryId
        : store.categories.isEmpty
        ? null
        : store.categories.first['id'] as String?;
    final visibleCategories = store.categories.where((category) {
      if (query.isEmpty) return category['id'] == selectedCategoryId;
      return asList(category['products'] ?? []).any((product) {
        final name = '${product['name']}'.toLowerCase();
        final description = '${product['description'] ?? ''}'.toLowerCase();
        return name.contains(query) || description.contains(query);
      });
    }).toList();
    final featuredDishes = <FeaturedDish>[
      for (final category in visibleCategories)
        for (final product in asList(category['products'] ?? []))
          if (query.isEmpty ||
              '${product['name']} ${product['description'] ?? ''}'
                  .toLowerCase()
                  .contains(query))
            FeaturedDish(product, '${category['name']}'),
    ].take(8).toList();
    // Every dish matching the search, those whose name matches first.
    final results =
        <FeaturedDish>[
          if (query.isNotEmpty)
            for (final category in visibleCategories)
              for (final product in asList(category['products'] ?? []))
                if ('${product['name']} ${product['description'] ?? ''}'
                    .toLowerCase()
                    .contains(query))
                  FeaturedDish(product, '${category['name']}'),
        ]..sort((a, b) {
          int rank(FeaturedDish dish) =>
              '${dish.product['name']}'.toLowerCase().contains(query) ? 0 : 1;
          return rank(a).compareTo(rank(b));
        });

    return ColoredBox(
      color: AppPalette.of(context).page,
      child: RefreshIndicator(
        onRefresh: store.loadCafes,
        child: CustomScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  const LText(
                    'Ne yemek istersin?',
                    style: TextStyle(
                      fontSize: 28,
                      height: 1.1,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 6),
                  LText(
                    'Yemeğin adını veya malzemesini yaz, hemen bulalım',
                    style: TextStyle(
                      color: AppPalette.of(context).muted,
                      fontSize: 13.5,
                      height: 1.3,
                    ),
                  ),
                  const SizedBox(height: 18),
                  _SearchField(
                    controller: search,
                    hasText: query.isNotEmpty,
                    onChanged: (_) => setState(() {}),
                    onClear: () => setState(search.clear),
                  ),
                  if (store.offlinePreview) ...[
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppPalette.of(context).warm,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.wifi_off_outlined,
                            color: AppPalette.of(context).text,
                          ),
                          const SizedBox(width: 10),
                          const Expanded(
                            child: LText(
                              'Örnek menü gösteriliyor. Sipariş için sunucuya bağlanın.',
                              style: TextStyle(fontSize: 12),
                            ),
                          ),
                          TextButton(
                            onPressed: store.loadCafes,
                            child: const LText('Yenile'),
                          ),
                        ],
                      ),
                    ),
                  ],
                  if (store.error != null && !store.offlinePreview) ...[
                    const SizedBox(height: 14),
                    Card(
                      color: AppPalette.of(context).dangerTint,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(
                          children: [
                            Expanded(child: LText(store.error!)),
                            TextButton(
                              onPressed: store.loadCafes,
                              child: const LText('Yenile'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                  if (store.busy && store.cafes.isEmpty)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.all(28),
                        child: CircularProgressIndicator(),
                      ),
                    ),
                  if (!store.busy && store.cafes.isEmpty)
                    const Empty(
                      'Henüz açık kafe yok',
                      Icons.storefront_outlined,
                    ),
                  if (store.categories.isNotEmpty && query.isEmpty) ...[
                    const SizedBox(height: 26),
                    _SectionHeader(
                      title: 'Yemek kategorileri',
                      action: 'Tümü',
                      onAction: widget.openMenu,
                    ),
                    const SizedBox(height: 10),
                    // Runs edge to edge: the page's 16px side padding becomes the
                    // list's own padding, so tiles scroll out under the screen
                    // edge instead of being cut off at the margin.
                    SizedBox(
                      height: 130,
                      child: LayoutBuilder(
                        builder: (context, box) => OverflowBox(
                          minWidth: box.maxWidth + 32,
                          maxWidth: box.maxWidth + 32,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                            itemCount: store.categories.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(width: 12),
                            itemBuilder: (context, index) {
                              final category = store.categories[index];
                              final name = category['name']?.toString() ?? '';
                              final products = asList(
                                category['products'] ?? [],
                              );
                              final selected =
                                  selectedCategoryId == category['id'];
                              return _CategoryTile(
                                name: name,
                                visualName: name,
                                imageUrl: products.isEmpty
                                    ? null
                                    : products.first['displayImageUrl'],
                                selected: selected,
                                onTap: () => setState(
                                  () => categoryId = category['id'] as String?,
                                ),
                              );
                            },
                          ),
                        ),
                      ),
                    ),
                  ],
                  if (query.isNotEmpty) ...[
                    const SizedBox(height: 22),
                    if (results.isNotEmpty) ...[
                      LText(
                        '${results.length} arama sonucu',
                        style: const TextStyle(
                          fontFamily: 'Gilroy',
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 12),
                    ] else if (store.busy)
                      const Center(
                        child: Padding(
                          padding: EdgeInsets.all(28),
                          child: CircularProgressIndicator(),
                        ),
                      )
                    else ...[
                      const Empty(
                        'Bu arama için yemek bulunamadı',
                        Icons.search_off,
                      ),
                      LText(
                        'Başka bir kelime veya kategori deneyin.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: AppPalette.of(context).muted),
                      ),
                    ],
                  ] else ...[
                    const SizedBox(height: 24),
                    _SectionHeader(
                      title: 'Öne çıkan lezzetler',
                      action: 'Tümünü gör',
                      onAction: widget.openMenu,
                    ),
                    const SizedBox(height: 18),
                    if (store.busy && featuredDishes.isEmpty)
                      const Center(
                        child: Padding(
                          padding: EdgeInsets.all(28),
                          child: CircularProgressIndicator(),
                        ),
                      )
                    else if (featuredDishes.isEmpty)
                      const Empty(
                        'Bu kafenin menüsü henüz boş',
                        Icons.no_food_outlined,
                      )
                    else
                      FeaturedFoodCarousel(
                        key: ValueKey(
                          [
                            store.cafe?['id'],
                            selectedCategoryId,
                            query,
                          ].join(':'),
                        ),
                        dishes: featuredDishes,
                        store: store,
                      ),
                  ],
                ]),
              ),
            ),
            if (query.isNotEmpty && results.isNotEmpty)
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverList.builder(
                  itemCount: results.length,
                  itemBuilder: (context, index) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _SearchResultCard(
                      dish: results[index],
                      query: query,
                      store: store,
                    ),
                  ),
                ),
              ),
            // The whole menu of the cafe, one section per category.
            if (query.isEmpty) ..._menuSlivers(context, store),
            SliverPadding(
              padding: EdgeInsets.fromLTRB(
                16,
                0,
                16,
                // The dock floats over the list, so keep the last card
                // scrollable above it.
                28 + MediaQuery.paddingOf(context).bottom,
              ),
              sliver: SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (query.isEmpty && store.banners.isNotEmpty) ...[
                      const SizedBox(height: 30),
                      const LText(
                        'Keşfet',
                        style: TextStyle(
                          fontFamily: 'Gilroy',
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 12),
                      BannerCarousel(store, widget.openMenu),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// One lazy sliver for all category headings and dish rows. Keeping every
  /// category in a separate sliver makes long menus expensive to lay out while
  /// scrolling, even when most of their dishes are outside the viewport.
  List<Widget> _menuSlivers(BuildContext context, Store store) {
    final palette = AppPalette.of(context);
    final sections = [
      for (final category in store.categories)
        if (asList(category['products'] ?? []).isNotEmpty) category,
    ];
    if (sections.isEmpty) return const [];
    const gap = 10.0;
    final viewportWidth = MediaQuery.sizeOf(context).width;
    final availableWidth = viewportWidth - 16;
    final columns = availableWidth >= 560 ? 3 : 2;
    final tileWidth = (availableWidth - gap * (columns - 1)) / columns;
    final entries =
        <({Map<String, dynamic> category, List<Map<String, dynamic>>? row})>[];
    for (final category in sections) {
      entries.add((category: category, row: null));
      final products = asList(category['products'] ?? []);
      for (var start = 0; start < products.length; start += columns) {
        final end = start + columns;
        entries.add((
          category: category,
          row: products.sublist(
            start,
            end < products.length ? end : products.length,
          ),
        ));
      }
    }
    return [
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(16, 30, 16, 0),
        sliver: SliverToBoxAdapter(
          child: LText(
            'Tüm menü',
            style: TextStyle(
              fontFamily: 'Gilroy',
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: palette.text,
            ),
          ),
        ),
      ),
      SliverList.builder(
        itemCount: entries.length,
        itemBuilder: (context, index) {
          final entry = entries[index];
          final category = entry.category;
          final products = entry.row;
          if (products == null) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(14, 18, 14, 12),
              child: Row(
                children: [
                  Container(
                    width: 5,
                    height: 20,
                    decoration: BoxDecoration(
                      color: brand,
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Flexible(
                    child: Text(
                      '${category['name'] ?? ''}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.text,
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  LText(
                    '${asList(category['products'] ?? []).length} lezzet',
                    style: TextStyle(
                      color: palette.muted,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            );
          }

          final hasNextRow =
              index + 1 < entries.length && entries[index + 1].row != null;
          return Padding(
            padding: EdgeInsets.fromLTRB(8, 0, 8, hasNextRow ? gap : 0),
            child: SizedBox(
              height: _MenuProductTile.heightFor(tileWidth),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (var slot = 0; slot < columns; slot++) ...[
                    if (slot > 0) const SizedBox(width: gap),
                    Expanded(
                      child: slot < products.length
                          ? _MenuProductTile(
                              product: products[slot],
                              store: store,
                              categoryName: '${category['name'] ?? ''}',
                            )
                          : const SizedBox.shrink(),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    ];
  }
}

/// Big rounded search box: a yellow search disc, the hint, and a clear button.
class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.hasText,
    required this.onChanged,
    required this.onClear,
  });

  final TextEditingController controller;
  final bool hasText;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    OutlineInputBorder border(Color color, double width) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(26),
      borderSide: BorderSide(color: color, width: width),
    );
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(26),
        boxShadow: [
          BoxShadow(
            color: palette.shadow,
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        textInputAction: TextInputAction.search,
        style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600),
        decoration: InputDecoration(
          hintText: tr(context, 'Yemek veya malzeme ara'),
          hintStyle: TextStyle(
            color: palette.muted,
            fontSize: 15,
            fontWeight: FontWeight.w500,
          ),
          prefixIcon: Padding(
            padding: const EdgeInsets.all(8),
            child: Container(
              width: 40,
              height: 40,
              decoration: const BoxDecoration(
                color: brand,
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: HugeIcon(
                  icon: AppIcons.search,
                  color: onBrand,
                  size: 20,
                ),
              ),
            ),
          ),
          suffixIcon: hasText
              ? IconButton(
                  tooltip: tr(context, 'Aramayı temizle'),
                  onPressed: onClear,
                  icon: Icon(Icons.close_rounded, color: palette.muted),
                )
              : null,
          filled: true,
          fillColor: palette.surface,
          contentPadding: const EdgeInsets.symmetric(vertical: 18),
          border: border(palette.border, 1),
          enabledBorder: border(palette.border, 1),
          focusedBorder: border(brand, 2),
        ),
      ),
    );
  }
}

/// One search hit: photo, name with the matched letters marked, category,
/// price and an add button. Tapping the card opens the dish.
class _SearchResultCard extends StatelessWidget {
  const _SearchResultCard({
    required this.dish,
    required this.query,
    required this.store,
  });

  final FeaturedDish dish;
  final String query;
  final Store store;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final product = dish.product;
    final name = '${product['name'] ?? ''}';
    final price = product['minPrice'] ?? product['price'];
    final nameStyle = TextStyle(
      color: palette.text,
      fontSize: 15.5,
      height: 1.15,
      fontWeight: FontWeight.w800,
    );
    return Material(
      color: palette.surface,
      borderRadius: BorderRadius.circular(26),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) => ProductDetailScreen(
              store: store,
              product: product,
              categoryName: dish.categoryName,
            ),
          ),
        ),
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(26),
            border: Border.all(color: palette.border),
          ),
          child: Row(
            children: [
              FoodPhoto(
                name: name,
                imageUrl: product['displayImageUrl'],
                width: 84,
                height: 84,
                radius: 19,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text.rich(
                      TextSpan(
                        style: nameStyle,
                        children: _highlight(
                          name,
                          query,
                          nameStyle,
                          brand.withValues(alpha: dark ? 0.35 : 0.6),
                        ),
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      dish.categoryName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.muted,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    LText(
                      price == null ? 'Fiyat yok' : '$price TMT',
                      style: TextStyle(
                        color: palette.text,
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _AddButton(
                name: name,
                count: store.cart
                    .where((line) => line.product['id'] == product['id'])
                    .fold<int>(0, (sum, line) => sum + line.quantity),
                onPressed: price == null
                    ? null
                    : () => addProductToCart(context, store, product),
              ),
              const SizedBox(width: 4),
            ],
          ),
        ),
      ),
    );
  }
}

/// Yellow rounded add-to-cart button. It squeezes under the finger. Once the
/// dish really lands in the cart (its [count] goes up, so a cancelled option
/// sheet does not count) the plus turns into a tick, holds for a moment, and
/// turns back into a plus.
class _AddButton extends StatefulWidget {
  const _AddButton({
    required this.name,
    required this.count,
    required this.onPressed,
  });

  final String name;
  final int count;

  /// Null disables the button (a dish with no price cannot be ordered).
  final VoidCallback? onPressed;

  @override
  State<_AddButton> createState() => _AddButtonState();
}

class _AddButtonState extends State<_AddButton>
    with SingleTickerProviderStateMixin {
  /// Plus to tick, a pause on the tick, then back to the plus.
  static final _morph = TweenSequence<double>([
    TweenSequenceItem(
      tween: Tween(
        begin: 0.0,
        end: 1.0,
      ).chain(CurveTween(curve: Curves.easeOutCubic)),
      weight: 20,
    ),
    TweenSequenceItem(tween: ConstantTween(1.0), weight: 55),
    TweenSequenceItem(
      tween: Tween(
        begin: 1.0,
        end: 0.0,
      ).chain(CurveTween(curve: Curves.easeInOutCubic)),
      weight: 25,
    ),
  ]);

  /// 0 to 1 over the whole "added" moment; it rests at 1, which is a plus.
  late final AnimationController _added = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
    value: 1,
  );

  bool _pressed = false;

  @override
  void didUpdateWidget(_AddButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.count > oldWidget.count &&
        !MediaQuery.disableAnimationsOf(context)) {
      _added.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _added.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final enabled = widget.onPressed != null;
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    return Tooltip(
      message: tr(context, '${widget.name} sepete ekle'),
      child: Semantics(
        button: true,
        enabled: enabled,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: enabled
              ? () {
                  HapticFeedback.lightImpact();
                  widget.onPressed!();
                }
              : null,
          onTapDown: enabled ? (_) => setState(() => _pressed = true) : null,
          onTapUp: (_) => setState(() => _pressed = false),
          onTapCancel: () => setState(() => _pressed = false),
          child: AnimatedScale(
            scale: _pressed ? 0.86 : 1,
            duration: reducedMotion
                ? Duration.zero
                : Duration(milliseconds: _pressed ? 90 : 320),
            curve: _pressed ? Curves.easeOut : Curves.elasticOut,
            child: SizedBox(
              width: 42,
              height: 42,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: enabled ? brand : palette.raised,
                        borderRadius: BorderRadius.circular(15),
                      ),
                      child: AnimatedBuilder(
                        animation: _added,
                        builder: (context, _) => CustomPaint(
                          key: const ValueKey('add-button-icon'),
                          painter: PlusToCheckPainter(
                            progress: _morph.evaluate(_added),
                            color: enabled ? onBrand : palette.muted,
                          ),
                        ),
                      ),
                    ),
                  ),
                  if (widget.count > 0)
                    Positioned(
                      top: -6,
                      right: -6,
                      child: Container(
                        constraints: const BoxConstraints(minWidth: 20),
                        height: 20,
                        padding: const EdgeInsets.symmetric(horizontal: 5),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: palette.text,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: palette.surface, width: 2),
                        ),
                        child: Text(
                          '${widget.count}',
                          style: TextStyle(
                            color: palette.surface,
                            fontSize: 10.5,
                            height: 1,
                            fontWeight: FontWeight.w900,
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

/// A plus that bends into a tick as [progress] goes from 0 to 1. Both are two
/// strokes, so each stroke's ends just slide from their place in the plus to
/// their place in the tick.
class PlusToCheckPainter extends CustomPainter {
  const PlusToCheckPainter({required this.progress, required this.color});

  final double progress;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const arm = 7.0;
    final centre = size.center(Offset.zero);
    Offset at(double x, double y) => centre + Offset(x, y);
    Offset morph(Offset from, Offset to) => Offset.lerp(from, to, progress)!;

    // The plus' horizontal bar becomes the tick's short stroke, and its
    // vertical bar the long one; they share the tick's lowest point.
    final shortStart = morph(at(-arm, 0), at(-6, 0.5));
    final bottom = morph(at(arm, 0), at(-1.5, 5));
    final longStart = morph(at(0, -arm), at(-1.5, 5));
    final longEnd = morph(at(0, arm), at(7, -4.5));

    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.8
      ..strokeCap = StrokeCap.round;
    canvas
      ..drawLine(shortStart, bottom, paint)
      ..drawLine(longStart, longEnd, paint);
  }

  @override
  bool shouldRepaint(PlusToCheckPainter old) =>
      old.progress != progress || old.color != color;
}

/// Splits [text] around the first occurrence of [query] (already lower-case)
/// and marks that part.
List<InlineSpan> _highlight(
  String text,
  String query,
  TextStyle style,
  Color mark,
) {
  final lower = text.toLowerCase();
  // Lower-casing can change the length of some letters; then skip marking.
  final start = lower.length == text.length ? lower.indexOf(query) : -1;
  if (start < 0) return [TextSpan(text: text)];
  final end = start + query.length;
  return [
    TextSpan(text: text.substring(0, start)),
    TextSpan(
      text: text.substring(start, end),
      style: style.copyWith(backgroundColor: mark),
    ),
    TextSpan(text: text.substring(end)),
  ];
}

/// One dish in the full menu: a big rounded photo with a round add button on
/// it, then the name and price. Tapping the card opens the dish.
class _MenuProductTile extends StatelessWidget {
  const _MenuProductTile({
    required this.product,
    required this.store,
    required this.categoryName,
  });

  final Map<String, dynamic> product;
  final Store store;
  final String categoryName;

  static const _pad = 8.0;

  static double heightFor(double width) => (width - _pad * 2) / 1.1 + 108;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final name = '${product['name'] ?? ''}';
    final price = product['minPrice'] ?? product['price'];
    final inCart = store.cart
        .where((line) => line.product['id'] == product['id'])
        .fold<int>(0, (sum, line) => sum + line.quantity);
    return Material(
      color: palette.surface,
      borderRadius: BorderRadius.circular(28),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => Navigator.push(
          context,
          MaterialPageRoute<void>(
            builder: (_) => ProductDetailScreen(
              store: store,
              product: product,
              categoryName: categoryName,
            ),
          ),
        ),
        child: Container(
          padding: const EdgeInsets.all(_pad),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: palette.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AspectRatio(
                aspectRatio: 1.1,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(21),
                  child: LayoutBuilder(
                    builder: (context, box) => FoodPhoto(
                      name: name,
                      imageUrl: product['displayImageUrl'],
                      width: box.maxWidth,
                      height: box.maxHeight,
                      radius: 0,
                    ),
                  ),
                ),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(4, 9, 4, 2),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.text,
                          fontSize: 14,
                          height: 1.12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const Spacer(),
                      Row(
                        children: [
                          Expanded(
                            child: LText(
                              price == null ? 'Fiyat yok' : '$price TMT',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: palette.text,
                                fontSize: 14.5,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          _AddButton(
                            name: name,
                            count: inCart,
                            onPressed: price == null
                                ? null
                                : () =>
                                      addProductToCart(context, store, product),
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
    );
  }
}

/// Section title with a round arrow button on the right. [action] names the
/// button for screen readers and the long-press tooltip.
class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    required this.action,
    required this.onAction,
  });

  final String title;
  final String action;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: LText(
            title,
            style: TextStyle(
              fontFamily: 'Gilroy',
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: palette.text,
            ),
          ),
        ),
        Tooltip(
          message: tr(context, action),
          child: Semantics(
            button: true,
            label: tr(context, action),
            child: ExcludeSemantics(
              child: Material(
                color: palette.surface,
                shape: CircleBorder(side: BorderSide(color: palette.border)),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: onAction,
                  child: SizedBox(
                    width: 30,
                    height: 30,
                    child: Center(
                      child: HugeIcon(
                        icon: AppIcons.forward,
                        color: palette.text,
                        size: 15,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// One category: a rounded dish photo with its name. The selected one gets a
/// yellow frame around the photo and its name on a yellow pill.
class _CategoryTile extends StatelessWidget {
  const _CategoryTile({
    required this.name,
    required this.visualName,
    required this.imageUrl,
    required this.selected,
    required this.onTap,
  });

  final String name;
  final String visualName;
  final dynamic imageUrl;
  final bool selected;
  final VoidCallback onTap;

  static const _photo = 72.0;
  static const _frame = 3.0;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    final duration = reducedMotion
        ? Duration.zero
        : const Duration(milliseconds: 260);
    const inner = _photo - _frame * 2;

    return Semantics(
      button: true,
      selected: selected,
      label: name,
      child: ExcludeSemantics(
        child: InkWell(
          borderRadius: BorderRadius.circular(28),
          onTap: () {
            if (!selected) HapticFeedback.selectionClick();
            onTap();
          },
          child: SizedBox(
            width: 80,
            child: Column(
              children: [
                AnimatedContainer(
                  duration: duration,
                  curve: Curves.easeOutCubic,
                  width: _photo,
                  height: _photo,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(27),
                    border: Border.all(
                      color: selected ? brand : Colors.transparent,
                      width: _frame,
                    ),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: FoodPhoto(
                      name: visualName,
                      imageUrl: imageUrl,
                      width: inner,
                      height: inner,
                      radius: 0,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                AnimatedContainer(
                  duration: duration,
                  curve: Curves.easeOutCubic,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: selected ? brand : Colors.transparent,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: DefaultTextStyle.merge(
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontFamily: 'Gilroy',
                      fontSize: 12,
                      height: 1.15,
                      fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                      color: selected ? onBrand : palette.muted,
                    ),
                    child: Text(name),
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
