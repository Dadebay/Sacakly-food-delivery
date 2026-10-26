import 'package:flutter/material.dart';
import '../../../core/l10n/localized_text.dart';

import '../../../core/data/customer_store.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/app_colors.dart';

class BannerCarousel extends StatelessWidget {
  const BannerCarousel(this.s, this.open, {super.key});
  final Store s;
  final VoidCallback open;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 185,
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: s.banners.length,
      separatorBuilder: (_, _) => const SizedBox(width: 12),
      itemBuilder: (context, index) {
        final banner = s.banners[index];
        return SizedBox(
          width: MediaQuery.sizeOf(context).width - 40,
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: () async {
              final link = '${banner['link'] ?? ''}';
              if (!link.startsWith('app://cafe/')) return;
              final cafeId = link.substring('app://cafe/'.length);
              final matches = s.cafes.where((c) => c['id'] == cafeId);
              if (matches.isEmpty) return;
              await s.selectCafe(matches.first);
              open();
            },
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if ('${banner['imageUrl']}'.startsWith('asset://'))
                    Image.asset(
                      '${banner['imageUrl']}'.substring('asset://'.length),
                      fit: BoxFit.cover,
                      cacheWidth: _bannerDecodeWidth(context),
                    )
                  else
                    Image.network(
                      mediaUrl(banner['imageUrl']) ?? '',
                      fit: BoxFit.cover,
                      cacheWidth: _bannerDecodeWidth(context),
                      errorBuilder: (_, _, _) => Container(color: brand),
                    ),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Color(0xCC2A1512)],
                      ),
                    ),
                  ),
                  Positioned(
                    left: 18,
                    right: 18,
                    bottom: 17,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        LText(
                          '${banner['title']}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        if (banner['subtitle'] != null)
                          LText(
                            '${banner['subtitle']}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.white),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    ),
  );
}

/// Banners are about a screen wide; decoding them any larger only costs time.
int _bannerDecodeWidth(BuildContext context) =>
    (MediaQuery.sizeOf(context).width *
            MediaQuery.devicePixelRatioOf(context) *
            1.1)
        .round()
        .clamp(256, 1600);
