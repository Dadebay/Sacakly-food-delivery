import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import '../../../core/network/api_client.dart';
import '../../../core/widgets/brand_shimmer.dart';

/// Width to decode an image at, for a frame of [width] x [height] logical
/// pixels. Product photos can be far larger than any frame they are shown in;
/// decoding them at full size makes a long list of dishes stutter and eat
/// memory. The 1.25 leaves headroom for `cover` cropping a non-square photo.
int? _decodeWidth(BuildContext context, double width, double height) {
  final longest = math.max(width, height);
  if (!longest.isFinite || longest <= 0) return null;
  final pixels = longest * MediaQuery.devicePixelRatioOf(context) * 1.25;
  return pixels.round().clamp(64, 1200);
}

/// Uses a product photo when available, then an existing bundled food photo.
/// The bundled photos are displayed as category illustrations and are not
/// presented as photos of the exact product.
class FoodVisual extends StatelessWidget {
  const FoodVisual({
    required this.name,
    required this.size,
    this.imageUrl,
    super.key,
  });

  final String name;
  final double size;
  final dynamic imageUrl;

  @override
  Widget build(BuildContext context) {
    final url = mediaUrl(imageUrl);
    final fallback = _BundledFoodPhoto(name: name, size: size);
    if (url == null) return fallback;

    final decodeWidth = _decodeWidth(context, size, size);
    final loading = SizedBox(
      width: size,
      height: size,
      child: const BrandShimmerBox(wordmarkSize: 15),
    );
    final image = url.startsWith('asset://')
        ? Image.asset(
            url.substring('asset://'.length),
            width: size,
            height: size,
            cacheWidth: decodeWidth,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => fallback,
          )
        : Image.network(
            url,
            width: size,
            height: size,
            cacheWidth: decodeWidth,
            fit: BoxFit.cover,
            frameBuilder: (_, child, frame, wasSynchronouslyLoaded) =>
                wasSynchronouslyLoaded || frame != null ? child : loading,
            errorBuilder: (_, _, _) => fallback,
          );
    return ClipOval(child: image);
  }
}

/// How a photo is fitted into its frame.
enum FoodPhotoFit {
  /// Fills the frame and crops whatever overflows. Fine for square thumbnails.
  cover,

  /// Shows the whole photo uncropped. The space it leaves in the frame is
  /// filled with a blurred, enlarged copy of the same photo, so there are no
  /// empty bars. For large frames, where cropping would cut the dish.
  whole,
}

/// A dish photo as a rounded rectangle that fills its box (cart rows, lists).
/// Without a photo it shows the same bundled illustration [FoodVisual] uses,
/// centred on a warm tile.
class FoodPhoto extends StatelessWidget {
  const FoodPhoto({
    required this.name,
    required this.width,
    required this.height,
    this.imageUrl,
    this.radius = 22,
    this.fit = FoodPhotoFit.cover,
    super.key,
  });

  final String name;
  final double width;
  final double height;
  final dynamic imageUrl;
  final double radius;
  final FoodPhotoFit fit;

  @override
  Widget build(BuildContext context) {
    final url = mediaUrl(imageUrl);
    final side = width > height ? width : height;
    // A bundled dish illustration fills the whole frame, enlarged a little so
    // the rounded corners of the source artwork fall outside it. Anything
    // else (no photo and no illustration) gets a warm tile with an emoji disc.
    final fallback = _photoFor(name) != null
        ? ColoredBox(
            color: const Color(0xFFFFF2CE),
            child: Center(
              child: Transform.scale(
                scale: 1.15,
                child: SizedBox(
                  width: side,
                  height: side,
                  child: _BundledFoodPhoto(name: name, size: side, clip: false),
                ),
              ),
            ),
          )
        : DecoratedBox(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFFFF4D6), Color(0xFFFFE2A8)],
              ),
            ),
            child: Center(
              child: Text(
                emojiForFood(name),
                style: TextStyle(
                  fontSize: (width < height ? width : height) * 0.46,
                  height: 1,
                ),
              ),
            ),
          );
    final decodeWidth = _decodeWidth(context, width, height);
    Widget photo(BoxFit boxFit, {required bool withFallback}) {
      final placeholder = withFallback ? fallback : const SizedBox.shrink();
      final loading = withFallback
          ? BrandShimmerBox(wordmarkSize: side < 80 ? 11 : 20)
          : const SizedBox.shrink();
      if (url!.startsWith('asset://')) {
        return Image.asset(
          url.substring('asset://'.length),
          fit: boxFit,
          cacheWidth: decodeWidth,
          errorBuilder: (_, _, _) => placeholder,
        );
      }
      return Image.network(
        url,
        fit: boxFit,
        cacheWidth: decodeWidth,
        frameBuilder: (_, child, frame, wasSynchronouslyLoaded) =>
            wasSynchronouslyLoaded || frame != null ? child : loading,
        errorBuilder: (_, _, _) => placeholder,
      );
    }

    final Widget child;
    if (url == null) {
      child = fallback;
    } else if (fit == FoodPhotoFit.whole) {
      child = RepaintBoundary(
        child: Stack(
          fit: StackFit.expand,
          children: [
            // The same photo, enlarged and blurred, behind the whole one.
            ImageFiltered(
              imageFilter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
              child: Transform.scale(
                scale: 1.3,
                child: photo(BoxFit.cover, withFallback: false),
              ),
            ),
            ColoredBox(color: Colors.white.withValues(alpha: 0.08)),
            photo(BoxFit.contain, withFallback: true),
          ],
        ),
      );
    } else {
      child = photo(BoxFit.cover, withFallback: true);
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox(width: width, height: height, child: child),
    );
  }
}

class _BundledFoodPhoto extends StatelessWidget {
  const _BundledFoodPhoto({
    required this.name,
    required this.size,
    this.clip = true,
  });

  final String name;
  final double size;

  /// Round the photo off. The collage clips its own cells instead.
  final bool clip;

  @override
  Widget build(BuildContext context) {
    final crop = _photoFor(name);
    if (crop == null) {
      // No photo for this one: a soft warm disc with the emoji centred in it,
      // so it sits beside the real photos instead of looking unfinished.
      return SizedBox(
        width: size,
        height: size,
        child: DecoratedBox(
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFFFF4D6), Color(0xFFFFE2A8)],
            ),
          ),
          child: Center(
            child: Text(
              emojiForFood(name),
              style: TextStyle(fontSize: size * 0.5, height: 1),
            ),
          ),
        ),
      );
    }

    final scale = size / crop.source.width;
    final photo = SizedBox(
      width: size,
      height: size,
      child: Stack(
        clipBehavior: Clip.hardEdge,
        children: [
          Positioned(
            left: -crop.source.left * scale,
            top: -crop.source.top * scale,
            width: crop.imageWidth * scale,
            height: crop.imageHeight * scale,
            child: Image.asset(
              crop.asset,
              fit: BoxFit.fill,
              cacheWidth:
                  (crop.imageWidth *
                          scale *
                          MediaQuery.devicePixelRatioOf(context))
                      .round()
                      .clamp(32, 1600),
            ),
          ),
        ],
      ),
    );
    return clip ? ClipOval(child: photo) : photo;
  }
}

class _PhotoCrop {
  const _PhotoCrop(this.asset, this.imageWidth, this.imageHeight, this.source);

  final String asset;
  final double imageWidth;
  final double imageHeight;
  final Rect source;
}

_PhotoCrop? _photoFor(String name) {
  final text = name.toLowerCase();
  const board2 = 'assets/onboard2.png';
  const board1 = 'assets/onboard1.png';
  if (text.contains('плов') ||
      text.contains('pilav') ||
      text.contains('palow')) {
    return const _PhotoCrop(
      board2,
      941,
      1030,
      Rect.fromLTWH(154, 492, 171, 171),
    );
  }
  if (text.contains('шаш') || text.contains('kebap') || text.contains('şiş')) {
    return const _PhotoCrop(
      board2,
      941,
      1030,
      Rect.fromLTWH(380, 492, 190, 171),
    );
  }
  if (text.contains('лагман') || text.contains('lagman')) {
    return const _PhotoCrop(
      board2,
      941,
      1030,
      Rect.fromLTWH(608, 492, 191, 171),
    );
  }
  if (text.contains('манты') ||
      text.contains('manty') ||
      text.contains('mantı')) {
    return const _PhotoCrop(
      board2,
      941,
      1030,
      Rect.fromLTWH(155, 734, 171, 171),
    );
  }
  if (text.contains('дограма') || text.contains('dogram')) {
    return const _PhotoCrop(
      board2,
      941,
      1030,
      Rect.fromLTWH(380, 734, 190, 171),
    );
  }
  if (text.contains('салат') || text.contains('salad')) {
    return const _PhotoCrop(
      board2,
      941,
      1030,
      Rect.fromLTWH(608, 734, 191, 171),
    );
  }
  if (text.contains('самс') ||
      text.contains('somsa') ||
      text.contains('выпеч')) {
    return const _PhotoCrop(
      board1,
      1024,
      1250,
      Rect.fromLTWH(685, 648, 212, 212),
    );
  }
  return null;
}

String emojiForFood(String value) {
  final text = value.toLowerCase();
  if (text.contains('напит') || text.contains('içecek')) return '🥤';
  if (text.contains('чурек') || text.contains('çörek')) return '🥖';
  return '🍽️';
}
