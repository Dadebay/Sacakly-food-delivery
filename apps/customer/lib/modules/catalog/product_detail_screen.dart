import 'dart:async';

import 'package:flutter/material.dart';
import '../../core/l10n/localized_text.dart';
import 'package:flutter/services.dart';
import 'package:hugeicons/hugeicons.dart';

import '../../core/data/customer_store.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_icons.dart';
import '../../core/widgets/brand_shimmer.dart';
import '../../core/widgets/dish_card.dart' show addProductToCart;
import '../home/widgets/food_visual.dart';

const _detailSheetOverlap = 44.0;

class ProductDetailScreen extends StatefulWidget {
  const ProductDetailScreen({
    required this.store,
    required this.product,
    required this.categoryName,
    super.key,
  });

  final Store store;
  final Map<String, dynamic> product;
  final String categoryName;

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  late bool _favorite;
  bool _expanded = false;

  String get _productId => '${widget.product['id'] ?? ''}';

  @override
  void initState() {
    super.initState();
    _favorite =
        (widget.store.api.prefs.getStringList('favorite_product_ids') ??
                <String>[])
            .contains(_productId);
    widget.store.addListener(_onStoreChanged);
  }

  @override
  void dispose() {
    widget.store.removeListener(_onStoreChanged);
    super.dispose();
  }

  void _onStoreChanged() {
    if (mounted) setState(() {});
  }

  void _toggleFavorite() {
    if (_productId.isEmpty) return;
    HapticFeedback.selectionClick();
    final ids =
        (widget.store.api.prefs.getStringList('favorite_product_ids') ??
                <String>[])
            .toSet();
    setState(() {
      _favorite = !_favorite;
      if (_favorite) {
        ids.add(_productId);
      } else {
        ids.remove(_productId);
      }
    });
    unawaited(
      widget.store.api.prefs.setStringList(
        'favorite_product_ids',
        ids.toList(),
      ),
    );
  }

  Future<void> _share() async {
    final name = '${widget.product['name'] ?? 'Ürün'}';
    final cafe = '${widget.store.cafe?['name'] ?? 'Saçakly'}';
    await Clipboard.setData(ClipboardData(text: '$name · $cafe'));
    if (!mounted) return;
    _showNotice('Ürün bilgisi kopyalandı');
  }

  Future<void> _addToCart() async {
    final before = widget.store.cartCount;
    await addProductToCart(context, widget.store, widget.product);
    if (!mounted || widget.store.cartCount == before) return;
    HapticFeedback.selectionClick();
    _showNotice('Ürün sepete eklendi');
  }

  void _showNotice(String message) {
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: LText(message),
        behavior: SnackBarBehavior.floating,
        margin: EdgeInsets.fromLTRB(
          16,
          0,
          16,
          102 + MediaQuery.paddingOf(context).bottom,
        ),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final cafe = widget.store.cafe ?? const <String, dynamic>{};
    final cafeName = '${cafe['name'] ?? 'Kafe'}';
    final description = '${product['description'] ?? ''}'.trim();
    final price = product['minPrice'] ?? product['price'];
    final rating = _rating(product);
    final preparation = _positiveInt(product['preparationMinutes']);
    final location = _location(cafe);
    final viewport = MediaQuery.sizeOf(context);
    final heroHeight = (viewport.height * 0.56).clamp(335.0, 520.0);
    final inCart = widget.store.cart
        .where((line) => line.product['id'] == product['id'])
        .fold<int>(0, (count, line) => count + line.quantity);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: AppPalette.of(context).page,
        body: Stack(
          children: [
            Positioned.fill(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  SizedBox(
                    height: heroHeight,
                    child: _ProductHero(
                      product: product,
                      categoryName: widget.categoryName,
                    ),
                  ),
                  Transform.translate(
                    offset: const Offset(0, -_detailSheetOverlap),
                    child: Container(
                      constraints: BoxConstraints(
                        minHeight:
                            viewport.height - heroHeight + _detailSheetOverlap,
                      ),
                      padding: EdgeInsets.fromLTRB(
                        24,
                        25,
                        24,
                        135 + MediaQuery.paddingOf(context).bottom,
                      ),
                      decoration: BoxDecoration(
                        color: AppPalette.of(context).surface,
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(31),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: LText(
                                  '${product['name'] ?? ''}',
                                  style: const TextStyle(
                                    fontSize: 26,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: -0.6,
                                    height: 1.1,
                                  ),
                                ),
                              ),
                              if (rating != null) ...[
                                const SizedBox(width: 10),
                                const HugeIcon(
                                  icon: AppIcons.star,
                                  color: accent,
                                  size: 18,
                                ),
                                const SizedBox(width: 2),
                                Text(
                                  rating.toStringAsFixed(1),
                                  style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ],
                            ],
                          ),
                          if (widget.categoryName.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(
                              widget.categoryName,
                              style: TextStyle(
                                color: AppPalette.of(context).muted,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                          const SizedBox(height: 21),
                          _CafeIdentity(
                            cafe: cafe,
                            name: cafeName,
                            location: location,
                          ),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Expanded(
                                child: _FactTile(
                                  icon: AppIcons.restaurant,
                                  label: 'Kategori',
                                  value: widget.categoryName,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _FactTile(
                                  icon: AppIcons.tag,
                                  label: 'Başlangıç',
                                  value: _priceLabel(price),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 25),
                          const LText(
                            'Açıklama',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 10),
                          if (description.isEmpty)
                            LText(
                              'Bu ürün için açıklama eklenmemiş.',
                              style: TextStyle(
                                color: AppPalette.of(context).muted,
                                fontSize: 13,
                              ),
                            )
                          else ...[
                            AnimatedSize(
                              duration: MediaQuery.disableAnimationsOf(context)
                                  ? Duration.zero
                                  : const Duration(milliseconds: 180),
                              curve: Curves.easeOutCubic,
                              child: Text(
                                description,
                                maxLines: _expanded ? null : 3,
                                overflow: _expanded
                                    ? null
                                    : TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: AppPalette.of(context).muted,
                                  fontSize: 13,
                                  height: 1.55,
                                ),
                              ),
                            ),
                            if (description.length > 130)
                              TextButton(
                                onPressed: () =>
                                    setState(() => _expanded = !_expanded),
                                style: TextButton.styleFrom(
                                  padding: EdgeInsets.zero,
                                ),
                                child: LText(
                                  _expanded ? 'Daha az göster' : 'Devamını oku',
                                ),
                              ),
                          ],
                          if (preparation != null) ...[
                            const SizedBox(height: 16),
                            Row(
                              children: [
                                HugeIcon(
                                  icon: AppIcons.history,
                                  color: AppPalette.of(context).muted,
                                  size: 16,
                                ),
                                const SizedBox(width: 6),
                                LText(
                                  'Hazırlanma',
                                  style: TextStyle(
                                    color: AppPalette.of(context).muted,
                                    fontSize: 12,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                LText(
                                  '$preparation dk',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ],
                          if (inCart > 0) ...[
                            const SizedBox(height: 18),
                            LText(
                              'Sepetinizde $inCart adet var',
                              style: TextStyle(
                                color: AppPalette.of(context).text,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Positioned(
              top: MediaQuery.paddingOf(context).top + 13,
              left: 19,
              right: 19,
              child: Row(
                children: [
                  _CircleAction(
                    tooltip: 'Geri',
                    icon: AppIcons.back,
                    onTap: () => Navigator.pop(context),
                  ),
                  const Spacer(),
                  _CircleAction(
                    tooltip: _favorite
                        ? 'Favorilerden çıkar'
                        : 'Favorilere ekle',
                    icon: AppIcons.favorite,
                    color: _favorite ? const Color(0xFFE45A48) : onBrand,
                    onTap: _toggleFavorite,
                  ),
                  const SizedBox(width: 10),
                  _CircleAction(
                    tooltip: 'Ürün bilgisini kopyala',
                    icon: AppIcons.share,
                    onTap: _share,
                  ),
                ],
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: _PurchaseBar(
                price: price,
                onAdd: price == null ? null : _addToCart,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProductHero extends StatelessWidget {
  const _ProductHero({required this.product, required this.categoryName});
  final Map<String, dynamic> product;
  final String categoryName;

  @override
  Widget build(BuildContext context) {
    final name = '${product['name'] ?? ''}';
    final image = LayoutBuilder(
      builder: (context, box) => FoodPhoto(
        name: '$categoryName $name',
        imageUrl: product['displayImageUrl'],
        width: box.hasBoundedWidth ? box.maxWidth : 360,
        height: box.hasBoundedHeight ? box.maxHeight : 390,
        radius: 0,
        fit: FoodPhotoFit.whole,
      ),
    );
    return Stack(
      fit: StackFit.expand,
      children: [
        image,
        const DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0x77000000),
                Colors.transparent,
                Color(0x22000000),
              ],
              stops: [0, 0.37, 1],
            ),
          ),
        ),
      ],
    );
  }
}

class _CircleAction extends StatelessWidget {
  const _CircleAction({
    required this.tooltip,
    required this.icon,
    required this.onTap,
    this.color = onBrand,
  });
  final String tooltip;
  final HugeIconData icon;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: tr(context, tooltip),
    onPressed: onTap,
    padding: EdgeInsets.zero,
    constraints: const BoxConstraints.tightFor(width: 48, height: 48),
    icon: Material(
      color: Colors.white,
      shape: const CircleBorder(),
      elevation: 3,
      child: SizedBox.square(
        dimension: 38,
        child: Center(
          child: HugeIcon(icon: icon, color: color, size: 19),
        ),
      ),
    ),
  );
}

class _CafeIdentity extends StatelessWidget {
  const _CafeIdentity({
    required this.cafe,
    required this.name,
    required this.location,
  });
  final Map<String, dynamic> cafe;
  final String name;
  final String location;

  @override
  Widget build(BuildContext context) {
    final imageUrl = mediaUrl(cafe['imageUrl']);
    const fallback = HugeIcon(
      icon: AppIcons.restaurant,
      color: onBrand,
      size: 25,
    );
    final avatar = imageUrl == null
        ? fallback
        : imageUrl.startsWith('asset://')
        ? Image.asset(
            imageUrl.substring('asset://'.length),
            width: 58,
            height: 58,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => fallback,
          )
        : Image.network(
            imageUrl,
            width: 58,
            height: 58,
            fit: BoxFit.cover,
            frameBuilder: (_, child, frame, wasSynchronouslyLoaded) =>
                wasSynchronouslyLoaded || frame != null
                ? child
                : const SizedBox(
                    width: 58,
                    height: 58,
                    child: BrandShimmerBox(wordmarkSize: 10),
                  ),
            errorBuilder: (_, _, _) => fallback,
          );
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppPalette.of(context).warm,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppPalette.of(context).border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 58,
                height: 58,
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFEFC1),
                  borderRadius: BorderRadius.circular(17),
                ),
                child: Center(child: avatar),
              ),
              const SizedBox(width: 13),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    LText(
                      'BU ÜRÜNÜ HAZIRLAYAN KAFE',
                      style: TextStyle(
                        color: AppPalette.of(context).muted,
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(
                      name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: AppPalette.of(context).text,
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        height: 1.15,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
            decoration: BoxDecoration(
              color: AppPalette.of(context).surface,
              borderRadius: BorderRadius.circular(13),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const HugeIcon(
                  icon: AppIcons.location,
                  size: 17,
                  color: Color(0xFFB77828),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    location,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: AppPalette.of(context).muted,
                      fontSize: 12,
                      height: 1.25,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FactTile extends StatelessWidget {
  const _FactTile({
    required this.icon,
    required this.label,
    required this.value,
  });
  final HugeIconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Container(
    height: 68,
    padding: const EdgeInsets.symmetric(horizontal: 10),
    decoration: BoxDecoration(
      color: AppPalette.of(context).raised,
      borderRadius: BorderRadius.circular(16),
    ),
    child: Row(
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: AppPalette.of(context).surface,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: HugeIcon(
              icon: icon,
              color: AppPalette.of(context).text,
              size: 18,
            ),
          ),
        ),
        const SizedBox(width: 7),
        Expanded(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              LText(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: AppPalette.of(context).muted,
                  fontSize: 10,
                ),
              ),
              const SizedBox(height: 4),
              LText(
                value.isEmpty ? '—' : value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _PurchaseBar extends StatelessWidget {
  const _PurchaseBar({required this.price, required this.onAdd});
  final dynamic price;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    final priceLabel = _priceLabel(price);
    final amount = price == null
        ? priceLabel
        : priceLabel.substring(0, priceLabel.length - 4);
    return Container(
      padding: EdgeInsets.fromLTRB(
        20,
        12,
        20,
        12 + MediaQuery.paddingOf(context).bottom,
      ),
      decoration: BoxDecoration(
        color: AppPalette.of(context).surface,
        boxShadow: [
          BoxShadow(
            color: Color(0x14000000),
            blurRadius: 20,
            offset: Offset(0, -5),
          ),
        ],
      ),
      child: Container(
        height: 58,
        padding: const EdgeInsets.fromLTRB(24, 6, 6, 6),
        decoration: BoxDecoration(
          color: onAdd == null ? const Color(0xFFBDBDB9) : accent,
          borderRadius: BorderRadius.circular(32),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text.rich(
                TextSpan(
                  text: amount,
                  children: [
                    if (price != null)
                      const TextSpan(
                        text: ' TMT',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                  ],
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(width: 8),
            TextButton(
              onPressed: onAdd,
              style: TextButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: onBrand,
                minimumSize: const Size(143, 46),
                padding: const EdgeInsets.symmetric(horizontal: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(26),
                ),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  HugeIcon(icon: AppIcons.cart, color: onBrand, size: 17),
                  SizedBox(width: 6),
                  LText(
                    'Sepete ekle',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _priceLabel(dynamic price) {
  if (price == null) return 'Fiyat yok';
  final value = price is num ? price.toDouble() : double.tryParse('$price');
  return value == null ? '$price TMT' : '${value.toStringAsFixed(2)} TMT';
}

int? _positiveInt(dynamic raw) {
  final value = raw is num ? raw.toInt() : int.tryParse('$raw');
  return value != null && value > 0 ? value : null;
}

double? _rating(Map<String, dynamic> product) {
  final raw = product['rating'] ?? product['averageRating'];
  final value = raw is num ? raw.toDouble() : double.tryParse('$raw');
  return value != null && value >= 0 && value <= 5 ? value : null;
}

String _location(Map<String, dynamic> cafe) {
  for (final key in ['location', 'address', 'branchAddress']) {
    final value = cafe[key];
    if (value is String && value.trim().isNotEmpty) return value.trim();
  }
  final branches = cafe['branches'];
  if (branches is List) {
    for (final branch in branches) {
      if (branch is Map &&
          branch['address'] is String &&
          (branch['address'] as String).trim().isNotEmpty) {
        return (branch['address'] as String).trim();
      }
    }
  }
  return 'Konum bilgisi eklenmemiş';
}
