import 'package:flutter/material.dart';
import '../../core/l10n/localized_text.dart';

import '../../core/data/customer_store.dart';
import '../../core/theme/app_colors.dart';
import '../../core/services/map_service.dart';
import '../cart/widgets/price_row.dart';
import 'delivery_location_screen.dart';

class Checkout extends StatefulWidget {
  const Checkout(this.store, {super.key});
  final Store store;

  @override
  State<Checkout> createState() => _CheckoutState();
}

class _CheckoutState extends State<Checkout> {
  final address = TextEditingController();
  final promo = TextEditingController();
  DeliveryPoint? selectedPoint;

  @override
  void dispose() {
    address.dispose();
    promo.dispose();
    super.dispose();
  }

  void _invalidate() => setState(widget.store.invalidateQuote);
  double? get lat => selectedPoint?.position.latitude;
  double? get lng => selectedPoint?.position.longitude;
  bool get coordinatesOk => selectedPoint != null;

  Future<void> _pickAddress() async {
    final chosen = await Navigator.push<DeliveryPoint>(
      context,
      MaterialPageRoute(
        builder: (_) => DeliveryLocationScreen(
          api: widget.store.api,
          initial: selectedPoint,
        ),
      ),
    );
    if (chosen == null || !mounted) return;
    setState(() {
      selectedPoint = chosen;
      address.text = chosen.address;
      widget.store.invalidateQuote();
    });
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    return AnimatedBuilder(
      animation: store,
      builder: (context, _) => Scaffold(
        appBar: AppBar(title: const LText('Siparişi tamamla')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            LText(
              '${store.cafe?['name'] ?? ''} · ${store.cartCount} ürün',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 16),
            InkWell(
              onTap: _pickAddress,
              borderRadius: BorderRadius.circular(18),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppPalette.of(context).surface,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: AppPalette.of(context).border),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.location_on_rounded,
                      color: AppPalette.of(context).text,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const LText(
                            'Teslimat konumunu seç',
                            style: TextStyle(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 3),
                          LText(
                            address.text.isEmpty
                                ? 'Haritada konum bul veya adres ara'
                                : address.text,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: AppPalette.of(context).muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 15),
            TextField(
              controller: promo,
              onChanged: (_) => _invalidate(),
              decoration: InputDecoration(
                labelText: tr(context, 'Promosyon kodu (isteğe bağlı)'),
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 22),
            if (store.quote == null)
              Price('Ürünler', store.estimatedSubtotal)
            else ...[
              Price('Ürünler', store.quote!['subtotal']),
              Price('İndirim', store.quote!['discount']),
              Price('Teslimat', store.quote!['deliveryFee']),
              const Divider(),
              Price('Toplam', store.quote!['total'], bold: true),
            ],
            if (store.error != null) ...[
              const SizedBox(height: 12),
              LText(store.error!, style: const TextStyle(color: errorRed)),
            ],
            const SizedBox(height: 18),
            FilledButton(
              onPressed: !coordinatesOk || store.busy
                  ? null
                  : () async {
                      await store.getQuote(lat!, lng!, promoCode: promo.text);
                    },
              child: LText(store.busy ? 'Bekleyin…' : 'Güncel tutarı hesapla'),
            ),
            const SizedBox(height: 8),
            FilledButton.tonal(
              onPressed:
                  store.quote == null ||
                      address.text.trim().isEmpty ||
                      store.busy
                  ? null
                  : () async {
                      final order = await store.place(
                        address.text,
                        lat!,
                        lng!,
                        promoCode: promo.text,
                      );
                      if (order != null && context.mounted) {
                        final messenger = ScaffoldMessenger.of(context);
                        Navigator.pop(context);
                        messenger.showSnackBar(
                          SnackBar(
                            content: LText(
                              'Sipariş #${order['number']} alındı',
                            ),
                          ),
                        );
                      }
                    },
              child: const LText('Siparişi onayla'),
            ),
          ],
        ),
      ),
    );
  }
}
