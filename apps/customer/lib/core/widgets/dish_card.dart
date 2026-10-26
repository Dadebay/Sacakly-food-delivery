import 'package:flutter/material.dart';
import '../l10n/localized_text.dart';
import 'package:hugeicons/hugeicons.dart';

import '../data/customer_store.dart';
import '../network/api_client.dart';
import '../theme/app_colors.dart';
import '../theme/app_icons.dart';
import 'food_image.dart';

class DishCard extends StatelessWidget {
  const DishCard({required this.product, required this.store, super.key});

  final Map<String, dynamic> product;
  final Store store;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    child: Padding(
      padding: const EdgeInsets.all(10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(child: FoodImage(mediaUrl(product['displayImageUrl']), 116)),
          const SizedBox(height: 9),
          LText(
            '${product['name']}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
          ),
          LText(
            '${product['description'] ?? ''}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12, color: AppPalette.of(context).muted),
          ),
          const Spacer(),
          Row(
            children: [
              Expanded(
                child: LText(
                  '${product['minPrice'] ?? product['price']} TMT',
                  style: const TextStyle(
                    color: accent,
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              IconButton.filled(
                tooltip: tr(context, 'Sepete ekle'),
                onPressed: () => addProductToCart(context, store, product),
                icon: const HugeIcon(
                  icon: AppIcons.add,
                  color: onBrand,
                  size: 19,
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

Future<void> addProductToCart(
  BuildContext context,
  Store store,
  Map<String, dynamic> product,
) async {
  final variants = asList(
    product['variants'] ?? [],
  ).where((variant) => variant['isActive'] != false).toList();
  if (variants.isEmpty) {
    store.add(product);
    return;
  }
  final chosen = await showModalBottomSheet<Map<String, dynamic>>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => SafeArea(
      top: false,
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.72,
        ),
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 24),
        decoration: BoxDecoration(
          color: AppPalette.of(context).surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: AppPalette.of(context).border,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
            const SizedBox(height: 19),
            const LText(
              'Seçenek seçin',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 4),
            LText(
              '${product['name']}',
              style: TextStyle(color: AppPalette.of(context).muted),
            ),
            const SizedBox(height: 18),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: variants.length,
                separatorBuilder: (_, _) => const SizedBox(height: 9),
                itemBuilder: (context, index) {
                  final variant = variants[index];
                  return Material(
                    color: AppPalette.of(context).raised,
                    borderRadius: BorderRadius.circular(16),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () => Navigator.pop(context, variant),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 15,
                          vertical: 15,
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: LText(
                                '${variant['name']}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            LText(
                              '${variant['price']} TMT',
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Icon(
                              Icons.arrow_forward_ios_rounded,
                              size: 13,
                              color: AppPalette.of(context).text,
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    ),
  );
  if (chosen != null) store.add(product, chosen);
}
