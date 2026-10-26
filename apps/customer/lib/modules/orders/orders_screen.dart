import 'package:flutter/material.dart';
import '../../core/l10n/localized_text.dart';

import '../../core/data/customer_store.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_colors.dart';
import 'order_tracking_screen.dart';

const _emptyOrdersAsset = 'assets/images/empty_orders_receipt.png';

class Orders extends StatefulWidget {
  const Orders(this.store, {super.key});
  final Store store;

  @override
  State<Orders> createState() => _OrdersState();
}

class _OrdersState extends State<Orders> {
  Future<List<Map<String, dynamic>>>? future;

  Future<void> _refresh() async {
    final next = widget.store.orders();
    setState(() => future = next);
    try {
      await next;
    } catch (_) {
      // FutureBuilder presents the error with a retry action.
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.store.offlinePreview) {
      return const _OrdersPage(
        content: _OrdersMessage(
          icon: Icons.wifi_off_rounded,
          title: 'Sipariş geçmişi çevrimdışı',
          detail: 'Gerçek siparişlerinizi görmek için sunucuya bağlanın.',
        ),
      );
    }
    if (!widget.store.signedIn) {
      future = null;
      return const _OrdersPage(
        content: _OrdersMessage(
          icon: Icons.receipt_long_outlined,
          imageAsset: _emptyOrdersAsset,
          title: 'Siparişlerinizi görün',
          detail:
              'Geçmiş siparişleriniz hesabınıza giriş yaptıktan sonra burada görünür.',
        ),
      );
    }
    future ??= widget.store.orders();
    return FutureBuilder<List<Map<String, dynamic>>>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const _OrdersPage(
            content: Center(child: CircularProgressIndicator(color: brand)),
          );
        }
        if (snapshot.hasError) {
          return _OrdersPage(
            content: _OrdersMessage(
              icon: Icons.cloud_off_rounded,
              title: 'Siparişler yüklenemedi',
              detail: 'Bağlantınızı kontrol edip tekrar deneyin.',
              action: _refresh,
              actionLabel: 'Yenile',
            ),
          );
        }
        final orders = snapshot.data ?? [];
        if (orders.isEmpty) {
          return const _OrdersPage(
            content: _OrdersMessage(
              icon: Icons.receipt_long_outlined,
              imageAsset: _emptyOrdersAsset,
              title: 'Henüz sipariş yok',
              detail:
                  'İlk siparişiniz ve durum güncellemeleri burada görünecek.',
            ),
          );
        }
        return ColoredBox(
          color: AppPalette.of(context).page,
          child: RefreshIndicator(
            onRefresh: _refresh,
            color: brand,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.fromLTRB(
                20,
                24,
                20,
                112 + MediaQuery.paddingOf(context).bottom,
              ),
              children: [
                _OrdersOverview(count: orders.length),
                const SizedBox(height: 27),
                Row(
                  children: [
                    const Expanded(
                      child: LText(
                        'Tüm siparişler',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    LText(
                      '${orders.length} kayıt',
                      style: TextStyle(
                        color: AppPalette.of(context).muted,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                for (final order in orders) ...[
                  _OrderCard(order: order, api: widget.store.api),
                  const SizedBox(height: 11),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class _OrdersPage extends StatelessWidget {
  const _OrdersPage({required this.content});
  final Widget content;

  @override
  Widget build(BuildContext context) =>
      ColoredBox(color: AppPalette.of(context).page, child: content);
}

class _OrdersOverview extends StatelessWidget {
  const _OrdersOverview({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: brand,
      borderRadius: BorderRadius.circular(24),
    ),
    child: Row(
      children: [
        Container(
          width: 50,
          height: 50,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.68),
            borderRadius: BorderRadius.circular(17),
          ),
          child: const Icon(
            Icons.receipt_long_rounded,
            color: onBrand,
            size: 27,
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const LText(
                'SİPARİŞ GEÇMİŞİNİZ',
                style: TextStyle(
                  color: onBrand,
                  fontSize: 10,
                  letterSpacing: 1,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              LText(
                '$count sipariş',
                style: const TextStyle(
                  color: onBrand,
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
        const Icon(Icons.auto_awesome_rounded, color: onBrand),
      ],
    ),
  );
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.api});
  final Map<String, dynamic> order;
  final Api api;

  @override
  Widget build(BuildContext context) {
    final status = _OrderStatus.from(
      '${order['status'] ?? ''}',
      AppPalette.of(context),
    );
    final branch = '${order['branchName'] ?? ''}'.trim();
    final number = order['number']?.toString() ?? '—';
    final items = order['items'];
    final itemCount = items is List
        ? items.fold<int>(
            0,
            (sum, item) =>
                sum +
                ((item is Map ? item['quantity'] : null) is num
                    ? (item['quantity'] as num).toInt()
                    : 0),
          )
        : null;
    final amount = order['total'];
    final price = amount is num
        ? amount.toStringAsFixed(2)
        : amount?.toString() ?? '—';
    return InkWell(
      borderRadius: BorderRadius.circular(23),
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => OrderTrackingScreen(api: api, order: order),
        ),
      ),
      child: Container(
        padding: const EdgeInsets.all(17),
        decoration: BoxDecoration(
          color: AppPalette.of(context).surface,
          borderRadius: BorderRadius.circular(23),
          border: Border.all(color: AppPalette.of(context).border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 43,
                  height: 43,
                  decoration: BoxDecoration(
                    color: AppPalette.of(context).warm,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(
                    Icons.shopping_bag_outlined,
                    color: AppPalette.of(context).text,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      LText(
                        'Sipariş #$number',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 3),
                      LText(
                        _formatDate(order['createdAt']),
                        style: TextStyle(
                          fontSize: 11,
                          color: AppPalette.of(context).muted,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 9,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: status.color,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: LText(
                    status.label,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: status.ink,
                    ),
                  ),
                ),
              ],
            ),
            if (branch.isNotEmpty) ...[
              const SizedBox(height: 15),
              Row(
                children: [
                  Icon(
                    Icons.storefront_outlined,
                    size: 17,
                    color: AppPalette.of(context).muted,
                  ),
                  const SizedBox(width: 7),
                  Expanded(
                    child: Text(
                      branch,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ],
            Divider(height: 27, color: AppPalette.of(context).border),
            Row(
              children: [
                Expanded(
                  child: LText(
                    itemCount == null
                        ? 'Toplam tutar'
                        : '$itemCount ürün · Toplam',
                    style: TextStyle(
                      color: AppPalette.of(context).muted,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                LText(
                  '$price TMT',
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                LText(
                  'Haritada takip et',
                  style: TextStyle(
                    color: AppPalette.of(context).text,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(width: 4),
                Icon(
                  Icons.arrow_forward_rounded,
                  color: AppPalette.of(context).text,
                  size: 17,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _OrderStatus {
  const _OrderStatus(this.label, this.color, this.ink);
  final String label;
  final Color color;
  final Color ink;

  factory _OrderStatus.from(String value, AppPalette palette) =>
      switch (value) {
        'COOKING' => const _OrderStatus(
          'Hazırlanıyor',
          Color(0xFFFFF1CC),
          Color(0xFF8B5B00),
        ),
        'READY' => const _OrderStatus(
          'Hazır',
          Color(0xFFE7F4DE),
          Color(0xFF3A6C24),
        ),
        'ASSIGNED_TO_COURIER' => const _OrderStatus(
          'Kurye atandı',
          Color(0xFFE7F0FF),
          Color(0xFF315D9F),
        ),
        'OUT_FOR_DELIVERY' => const _OrderStatus(
          'Yolda',
          Color(0xFFE7F0FF),
          Color(0xFF315D9F),
        ),
        'DELIVERED' || 'CASH_RETURNED' || 'RECONCILED' => const _OrderStatus(
          'Teslim edildi',
          Color(0xFFE7F4DE),
          Color(0xFF3A6C24),
        ),
        'CANCELLED' => const _OrderStatus(
          'İptal edildi',
          Color(0xFFFCE9E6),
          Color(0xFF9B3C31),
        ),
        _ => _OrderStatus(
          value.isEmpty ? 'Durum yok' : value,
          palette.raised,
          palette.text,
        ),
      };
}

String _formatDate(dynamic raw) {
  final date = DateTime.tryParse('${raw ?? ''}')?.toLocal();
  if (date == null) return 'Tarih bilgisi yok';
  String two(int value) => value.toString().padLeft(2, '0');
  return '${two(date.day)}.${two(date.month)}.${date.year} · ${two(date.hour)}:${two(date.minute)}';
}

class _OrdersMessage extends StatelessWidget {
  const _OrdersMessage({
    required this.icon,
    this.imageAsset,
    required this.title,
    required this.detail,
    this.action,
    this.actionLabel,
  });
  final IconData icon;
  final String? imageAsset;
  final String title;
  final String detail;
  final VoidCallback? action;
  final String? actionLabel;

  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 110),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (imageAsset == null)
            Container(
              width: 160,
              height: 160,
              decoration: BoxDecoration(
                color: AppPalette.of(context).warm,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 70, color: AppPalette.of(context).text),
            )
          else
            SizedBox(
              width: 234,
              height: 234,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Container(
                    width: 216,
                    height: 216,
                    decoration: BoxDecoration(
                      color: AppPalette.of(context).warm,
                      shape: BoxShape.circle,
                    ),
                  ),
                  Image.asset(
                    imageAsset!,
                    width: 210,
                    height: 210,
                    fit: BoxFit.contain,
                    excludeFromSemantics: true,
                  ),
                ],
              ),
            ),
          const SizedBox(height: 25),
          LText(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          LText(
            detail,
            textAlign: TextAlign.center,
            style: TextStyle(color: AppPalette.of(context).muted, height: 1.5),
          ),
          if (action != null) ...[
            const SizedBox(height: 20),
            FilledButton(
              onPressed: action,
              style: FilledButton.styleFrom(
                backgroundColor: brand,
                foregroundColor: onBrand,
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 14,
                ),
              ),
              child: LText(
                actionLabel ?? 'Devam et',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ],
        ],
      ),
    ),
  );
}
