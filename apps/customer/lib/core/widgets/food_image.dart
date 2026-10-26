import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import 'brand_shimmer.dart';

class FoodImage extends StatelessWidget {
  const FoodImage(this.url, this.size, {super.key});
  final String? url;
  final double size;
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(13),
    child: url == null
        ? fallback(context)
        : url!.startsWith('asset://')
        ? Image.asset(
            url!.substring('asset://'.length),
            width: size,
            height: size,
            fit: BoxFit.cover,
          )
        : Image.network(
            url!,
            width: size,
            height: size,
            fit: BoxFit.cover,
            frameBuilder: (_, child, frame, wasSynchronouslyLoaded) =>
                wasSynchronouslyLoaded || frame != null
                ? child
                : SizedBox(
                    width: size,
                    height: size,
                    child: const BrandShimmerBox(wordmarkSize: 15),
                  ),
            errorBuilder: (_, error, stack) => fallback(context),
          ),
  );
  Widget fallback(BuildContext context) => Container(
    width: size,
    height: size,
    color: AppPalette.of(context).warm,
    child: Icon(Icons.restaurant, color: AppPalette.of(context).text),
  );
}
