import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/data/customer_store.dart';
import '../../core/l10n/localized_text.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/dish_card.dart' show addProductToCart;
import '../home/widgets/food_visual.dart';
import 'product_detail_screen.dart';

class Menu extends StatefulWidget {
  const Menu(this.store, {this.openCafes, this.gridView = true, super.key});

  final Store store;
  final VoidCallback? openCafes;
  final bool gridView;

  @override
  State<Menu> createState() => _MenuState();
}

class _MenuState extends State<Menu> {
  void _openCategory(Map<String, dynamic> category) {
    HapticFeedback.selectionClick();
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _CategoryDishesPage(
          store: widget.store,
          categoryId: '${category['id']}',
          categoryName: '${category['name'] ?? ''}',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final cafe = store.cafe;
    final palette = AppPalette.of(context);
    if (cafe == null) {
      return ColoredBox(
        color: palette.page,
        child: Center(
          child: _MenuNotice(
            icon: Icons.storefront_rounded,
            title: 'Önce bir kafe seçin',
            detail:
                'Bir kafe seçtiğinizde menüsündeki lezzetler burada görünecek.',
            actionLabel: widget.openCafes == null ? null : 'Kafelere göz at',
            onAction: widget.openCafes,
          ),
        ),
      );
    }

    final bottomInset = 112 + MediaQuery.paddingOf(context).bottom;

    return ColoredBox(
      color: palette.page,
      child: RefreshIndicator(
        color: brand,
        onRefresh: store.offlinePreview
            ? store.loadCafes
            : () => store.selectCafe(cafe),
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (store.offlinePreview) ...[
                      _InfoBanner(
                        icon: Icons.wifi_off_rounded,
                        text:
                            'Örnek menü gösteriliyor. Sipariş için sunucuya bağlanın.',
                        onRetry: store.loadCafes,
                      ),
                      const SizedBox(height: 16),
                    ] else if (store.error != null) ...[
                      _InfoBanner(
                        icon: Icons.cloud_off_rounded,
                        text: 'Menü güncellenemedi. Tekrar deneyin.',
                        onRetry: () => store.selectCafe(cafe),
                      ),
                      const SizedBox(height: 16),
                    ],
                  ],
                ),
              ),
            ),
            if (store.busy && store.categories.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(child: CircularProgressIndicator(color: brand)),
              )
            else if (store.categories.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: _MenuNotice(
                  icon: Icons.restaurant_menu_rounded,
                  title: 'Menü henüz boş',
                  detail:
                      'Bu kafe yeni yemeklerini eklediğinde burada göreceksiniz.',
                ),
              )
            else if (widget.gridView)
              SliverPadding(
                padding: EdgeInsets.fromLTRB(16, 4, 16, bottomInset),
                sliver: SliverToBoxAdapter(
                  child: _StaggeredCategoryGrid(
                    categories: store.categories,
                    onOpen: _openCategory,
                  ),
                ),
              )
            else
              SliverPadding(
                padding: EdgeInsets.fromLTRB(16, 4, 16, bottomInset),
                sliver: SliverList.builder(
                  itemCount: store.categories.length,
                  itemBuilder: (context, index) {
                    final category = store.categories[index];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: _Reveal(
                        index: index,
                        child: _CategoryRowCard(
                          category: category,
                          index: index,
                          onTap: () => _openCategory(category),
                        ),
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}

const _lightTints = [
  Color(0xFFFFEFBF),
  Color(0xFFFFDDCB),
  Color(0xFFE2F0D9),
  Color(0xFFDDEAF6),
  Color(0xFFF1DEF0),
];
const _darkTints = [
  Color(0xFF3A3217),
  Color(0xFF3B2A22),
  Color(0xFF26332A),
  Color(0xFF242F3A),
  Color(0xFF35283A),
];

Color _tintFor(BuildContext context, int index) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  return (dark ? _darkTints : _lightTints)[index % _lightTints.length];
}

String _indexLabel(int index) => '${index + 1}'.padLeft(2, '0');

/// Fades and lifts the first few cards in. Skipped when the system asks for
/// reduced motion.
class _Reveal extends StatelessWidget {
  const _Reveal({required this.index, required this.child});

  final int index;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (index > 7 || MediaQuery.disableAnimationsOf(context)) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: 360 + index * 70),
      curve: Curves.easeOutCubic,
      builder: (_, t, child) => Opacity(
        opacity: t,
        child: Transform.translate(
          offset: Offset(0, (1 - t) * 18),
          child: child,
        ),
      ),
      child: child,
    );
  }
}

class _CategoryInfo {
  _CategoryInfo(BuildContext context, Map<String, dynamic> category)
    : id = '${category['id']}',
      name = '${category['name'] ?? ''}' {
    final products = asList(category['products'] ?? []);
    final first = products.isEmpty ? null : products.first;
    imageUrl = category['imageUrl'] ?? first?['displayImageUrl'];
    visualName = '${first?['name'] ?? name}';
    countLabel = tr(context, '${products.length} lezzet');
  }

  final String id;
  final String name;
  late final dynamic imageUrl;
  late final String visualName;
  late final String countLabel;
}

/// Two columns where the right one starts lower and card heights alternate,
/// so the categories read like a gallery wall instead of a table.
class _StaggeredCategoryGrid extends StatelessWidget {
  const _StaggeredCategoryGrid({
    required this.categories,
    required this.onOpen,
  });

  final List<Map<String, dynamic>> categories;
  final ValueChanged<Map<String, dynamic>> onOpen;

  static const _gap = 14.0;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final columns = constraints.maxWidth >= 600 ? 3 : 2;
      final width = (constraints.maxWidth - _gap * (columns - 1)) / columns;
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var column = 0; column < columns; column++) ...[
            if (column > 0) const SizedBox(width: _gap),
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(top: column.isOdd ? 30 : 0),
                child: Column(
                  children: [
                    for (var i = column; i < categories.length; i += columns)
                      Padding(
                        padding: const EdgeInsets.only(bottom: _gap),
                        child: _Reveal(
                          index: i,
                          child: SizedBox(
                            height: _CategoryGridCard.heightFor(width),
                            child: _CategoryGridCard(
                              category: categories[i],
                              onTap: () => onOpen(categories[i]),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ],
      );
    },
  );
}

/// Grid card: the photo fills the card and a frosted label with the name,
/// the dish count and a yellow arrow floats over its bottom edge.
class _CategoryGridCard extends StatelessWidget {
  const _CategoryGridCard({required this.category, required this.onTap});

  final Map<String, dynamic> category;
  final VoidCallback onTap;

  static double heightFor(double width) => width * 1.22;

  @override
  Widget build(BuildContext context) {
    final info = _CategoryInfo(context, category);
    final palette = AppPalette.of(context);
    return Semantics(
      key: ValueKey('menu-category-${info.id}'),
      button: true,
      label: '${info.name}, ${info.countLabel}',
      child: ExcludeSemantics(
        child: Material(
          color: palette.warm,
          borderRadius: BorderRadius.circular(30),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            fit: StackFit.expand,
            children: [
              LayoutBuilder(
                builder: (context, box) => FoodPhoto(
                  name: info.visualName,
                  imageUrl: info.imageUrl,
                  width: box.maxWidth,
                  height: box.maxHeight,
                  radius: 0,
                ),
              ),
              Positioned(
                left: 8,
                right: 8,
                bottom: 8,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(13, 9, 8, 9),
                  decoration: BoxDecoration(
                    color: palette.surface.withValues(alpha: 0.94),
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              info.name,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: palette.text,
                                fontSize: 14,
                                height: 1.1,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              info.countLabel,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: palette.muted,
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        width: 30,
                        height: 30,
                        decoration: const BoxDecoration(
                          color: brand,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.arrow_outward_rounded,
                          size: 15,
                          color: onBrand,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Positioned.fill(child: InkWell(onTap: onTap)),
            ],
          ),
        ),
      ),
    );
  }
}

/// List card: a faint oversized number, the text, and a round photo that
/// bleeds off the right edge.
class _CategoryRowCard extends StatelessWidget {
  const _CategoryRowCard({
    required this.category,
    required this.index,
    required this.onTap,
  });

  final Map<String, dynamic> category;
  final int index;
  final VoidCallback onTap;

  static const _height = 140.0;
  static const _photoWidth = 146.0;

  @override
  Widget build(BuildContext context) {
    final info = _CategoryInfo(context, category);
    final palette = AppPalette.of(context);
    return Semantics(
      key: ValueKey('menu-category-${info.id}'),
      button: true,
      label: '${info.name}, ${info.countLabel}',
      child: ExcludeSemantics(
        child: SizedBox(
          height: _height,
          child: Material(
            color: _tintFor(context, index),
            borderRadius: BorderRadius.circular(34),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onTap,
              child: Stack(
                children: [
                  Positioned(
                    left: 16,
                    bottom: -16,
                    child: Text(
                      _indexLabel(index),
                      style: TextStyle(
                        color: palette.text.withValues(alpha: 0.07),
                        fontSize: 84,
                        height: 1,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  Positioned(
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: _photoWidth,
                    child: ClipRRect(
                      borderRadius: const BorderRadius.horizontal(
                        left: Radius.circular(30),
                      ),
                      child: LayoutBuilder(
                        builder: (context, photo) => FoodPhoto(
                          name: info.visualName,
                          imageUrl: info.imageUrl,
                          width: photo.maxWidth,
                          height: photo.maxHeight,
                          radius: 0,
                        ),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      20,
                      14,
                      _photoWidth + 10,
                      14,
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          info.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: palette.text,
                            fontSize: 20,
                            height: 1.1,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.fromLTRB(4, 4, 11, 4),
                          decoration: BoxDecoration(
                            color: palette.surface,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 22,
                                height: 22,
                                decoration: const BoxDecoration(
                                  color: brand,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(
                                  Icons.restaurant_menu_rounded,
                                  size: 13,
                                  color: onBrand,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text(
                                  info.countLabel,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: palette.text,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
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

class _CategoryDishesPage extends StatelessWidget {
  const _CategoryDishesPage({
    required this.store,
    required this.categoryId,
    required this.categoryName,
  });

  final Store store;
  final String categoryId;
  final String categoryName;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: store,
    builder: (context, _) {
      final current = store.categories.where(
        (category) => category['id'] == categoryId,
      );
      final products = current.isEmpty
          ? <Map<String, dynamic>>[]
          : asList(current.first['products'] ?? []);
      final palette = AppPalette.of(context);
      return Scaffold(
        backgroundColor: palette.page,
        appBar: AppBar(
          backgroundColor: palette.page,
          scrolledUnderElevation: 0,
        ),
        body: products.isEmpty
            ? const Center(
                child: _MenuNotice(
                  icon: Icons.restaurant_menu_rounded,
                  title: 'Menü henüz boş',
                  detail:
                      'Bu kafe yeni yemeklerini eklediğinde burada göreceksiniz.',
                ),
              )
            : ListView.separated(
                padding: EdgeInsets.fromLTRB(
                  16,
                  4,
                  16,
                  32 + MediaQuery.paddingOf(context).bottom,
                ),
                itemCount: products.length + 1,
                separatorBuilder: (_, index) =>
                    SizedBox(height: index == 0 ? 20 : 14),
                itemBuilder: (context, index) {
                  if (index == 0) {
                    return _CategoryHeader(
                      name: categoryName,
                      count: products.length,
                    );
                  }
                  return _Reveal(
                    index: index - 1,
                    child: _MenuProductCard(
                      product: products[index - 1],
                      store: store,
                      categoryName: categoryName,
                      photoOnLeft: index.isOdd,
                    ),
                  );
                },
              ),
      );
    },
  );
}

class _CategoryHeader extends StatelessWidget {
  const _CategoryHeader({required this.name, required this.count});

  final String name;
  final int count;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          name,
          style: TextStyle(
            color: palette.text,
            fontSize: 32,
            height: 1.05,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Container(
              width: 34,
              height: 6,
              decoration: BoxDecoration(
                color: brand,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            const SizedBox(width: 10),
            LText(
              '$count lezzet',
              style: TextStyle(
                color: palette.muted,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _InfoBanner extends StatelessWidget {
  const _InfoBanner({
    required this.icon,
    required this.text,
    required this.onRetry,
  });
  final IconData icon;
  final String text;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(12, 9, 8, 9),
    decoration: BoxDecoration(
      color: AppPalette.of(context).warm,
      borderRadius: BorderRadius.circular(16),
    ),
    child: Row(
      children: [
        Icon(icon, color: AppPalette.of(context).text, size: 18),
        const SizedBox(width: 9),
        Expanded(
          child: LText(text, style: const TextStyle(fontSize: 11, height: 1.3)),
        ),
        TextButton(onPressed: onRetry, child: const LText('Yenile')),
      ],
    ),
  );
}

/// Dish card: photo and text swap sides on every row, the photo has a leaf
/// shape with the price stuck to its corner, and the add button is a dark disc.
class _MenuProductCard extends StatelessWidget {
  const _MenuProductCard({
    required this.product,
    required this.store,
    required this.categoryName,
    required this.photoOnLeft,
  });
  final Map<String, dynamic> product;
  final Store store;
  final String categoryName;
  final bool photoOnLeft;

  static const _photoWidth = 112.0;
  static const _photoHeight = 132.0;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final name = '${product['name'] ?? ''}';
    final description = '${product['description'] ?? ''}'.trim();
    final price = product['minPrice'] ?? product['price'];
    final inCart = store.cart
        .where((line) => line.product['id'] == product['id'])
        .fold<int>(0, (sum, line) => sum + line.quantity);

    const big = Radius.circular(34);
    const small = Radius.circular(12);
    final photoShape = photoOnLeft
        ? const BorderRadius.only(
            topLeft: big,
            bottomRight: big,
            topRight: small,
            bottomLeft: small,
          )
        : const BorderRadius.only(
            topRight: big,
            bottomLeft: big,
            topLeft: small,
            bottomRight: small,
          );

    final photo = SizedBox(
      width: _photoWidth,
      height: _photoHeight,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: photoShape,
            child: FoodPhoto(
              name: name,
              imageUrl: product['displayImageUrl'],
              width: _photoWidth,
              height: _photoHeight,
              radius: 0,
            ),
          ),
          Positioned(
            left: photoOnLeft ? 0 : null,
            right: photoOnLeft ? null : 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
              decoration: BoxDecoration(
                color: price == null ? palette.raised : brand,
                borderRadius: BorderRadius.only(
                  topRight: photoOnLeft
                      ? const Radius.circular(16)
                      : Radius.zero,
                  topLeft: photoOnLeft
                      ? Radius.zero
                      : const Radius.circular(16),
                  bottomLeft: photoOnLeft ? big : Radius.zero,
                  bottomRight: photoOnLeft ? Radius.zero : big,
                ),
              ),
              child: LText(
                price == null ? 'Fiyat yok' : '$price TMT',
                maxLines: 1,
                style: TextStyle(
                  color: price == null ? palette.muted : onBrand,
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
        ],
      ),
    );

    final details = Expanded(
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: _photoHeight),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: palette.text,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    height: 1.15,
                  ),
                ),
                if (description.isNotEmpty) ...[
                  const SizedBox(height: 5),
                  Text(
                    description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: palette.muted,
                      fontSize: 11.5,
                      height: 1.25,
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                if (inCart > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: palette.warm,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.shopping_bag_rounded,
                          size: 12,
                          color: palette.text,
                        ),
                        const SizedBox(width: 4),
                        LText(
                          '$inCart',
                          style: TextStyle(
                            color: palette.text,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                const Spacer(),
                IconButton(
                  tooltip: tr(context, '$name sepete ekle'),
                  onPressed: price == null
                      ? null
                      : () => addProductToCart(context, store, product),
                  style: IconButton.styleFrom(
                    fixedSize: const Size(40, 40),
                    minimumSize: const Size(40, 40),
                    padding: EdgeInsets.zero,
                    backgroundColor: dark ? brand : onBrand,
                    foregroundColor: dark ? onBrand : brand,
                    disabledBackgroundColor: palette.raised,
                    disabledForegroundColor: palette.muted,
                  ),
                  icon: const Icon(Icons.add_rounded, size: 22),
                ),
              ],
            ),
          ],
        ),
      ),
    );

    return Material(
      color: palette.surface,
      borderRadius: BorderRadius.circular(40),
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
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(40),
            border: Border.all(color: palette.border),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: photoOnLeft
                ? [
                    photo,
                    const SizedBox(width: 14),
                    details,
                    const SizedBox(width: 6),
                  ]
                : [
                    const SizedBox(width: 8),
                    details,
                    const SizedBox(width: 14),
                    photo,
                  ],
          ),
        ),
      ),
    );
  }
}

class _MenuNotice extends StatelessWidget {
  const _MenuNotice({
    required this.icon,
    required this.title,
    required this.detail,
    this.actionLabel,
    this.onAction,
  });
  final IconData icon;
  final String title;
  final String detail;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 38),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 104,
          height: 104,
          decoration: BoxDecoration(
            color: AppPalette.of(context).warm,
            shape: BoxShape.circle,
          ),
          child: Icon(icon, size: 45, color: AppPalette.of(context).text),
        ),
        const SizedBox(height: 18),
        LText(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 6),
        LText(
          detail,
          textAlign: TextAlign.center,
          style: TextStyle(color: AppPalette.of(context).muted, height: 1.4),
        ),
        if (onAction != null && actionLabel != null) ...[
          const SizedBox(height: 18),
          FilledButton(
            onPressed: onAction,
            style: FilledButton.styleFrom(
              backgroundColor: brand,
              foregroundColor: onBrand,
            ),
            child: LText(
              actionLabel!,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ],
    ),
  );
}
