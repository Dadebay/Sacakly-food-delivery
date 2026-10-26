import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../network/api_client.dart';
import '../models/cart_line.dart';
import '../services/firebase_messaging_service.dart';
import 'demo_catalog.dart';

class Store extends ChangeNotifier {
  Store(this.api, {this.push});
  final Api api;
  final PushNotifications? push;
  List<Map<String, dynamic>> cafes = [];
  List<Map<String, dynamic>> banners = [];
  List<Map<String, dynamic>> categories = [];
  Map<String, dynamic>? cafe;
  final List<CartLine> cart = [];
  Map<String, dynamic>? quote;
  String? orderKey;
  bool busy = false;
  String? error;
  String? devCode;
  bool offlinePreview = false;
  bool get signedIn => api.accessToken != null;
  int get cartCount => cart.fold(0, (sum, line) => sum + line.quantity);
  double get estimatedSubtotal =>
      cart.fold(0, (sum, line) => sum + line.price * line.quantity);

  Future<void> loadCafes() async {
    await _run(() async {
      try {
        final liveCafes = asList(await api.request('GET', 'marketplace/cafes'));
        List<Map<String, dynamic>> liveBanners;
        try {
          liveBanners = asList(await api.request('GET', 'marketing/banners'));
        } catch (_) {
          liveBanners = [];
        }
        final selected = liveCafes.where((entry) => entry['id'] == cafe?['id']);
        final nextCafe = selected.isNotEmpty
            ? selected.first
            : liveCafes.isNotEmpty
            ? liveCafes.first
            : null;
        final liveCategories = nextCafe == null
            ? <Map<String, dynamic>>[]
            : asList(
                await api.request(
                  'GET',
                  'catalog/categories',
                  query: {'cafeId': nextCafe['id']},
                ),
              );
        if (offlinePreview) {
          cart.clear();
          invalidateQuote();
        }
        offlinePreview = false;
        cafes = liveCafes;
        banners = liveBanners;
        cafe = nextCafe;
        categories = liveCategories;
      } on ApiError catch (failure) {
        if (failure.status != null) rethrow;
        if (!offlinePreview) {
          cart.clear();
          invalidateQuote();
        }
        offlinePreview = true;
        cafes = DemoCatalog.cafes;
        banners = DemoCatalog.banners;
        final selected = cafes.where((entry) => entry['id'] == cafe?['id']);
        cafe = selected.isNotEmpty ? selected.first : cafes.first;
        categories = DemoCatalog.categoriesFor('${cafe!['id']}');
      }
    });
  }

  Future<void> selectCafe(Map<String, dynamic> selected) async {
    if (cafe?['id'] != selected['id']) {
      cart.clear();
      invalidateQuote();
    }
    cafe = selected;
    categories = offlinePreview
        ? DemoCatalog.categoriesFor('${selected['id']}')
        : [];
    notifyListeners();
    if (offlinePreview) return;
    await _run(() async {
      categories = asList(
        await api.request(
          'GET',
          'catalog/categories',
          query: {'cafeId': selected['id']},
        ),
      );
    });
  }

  void add(Map<String, dynamic> product, [Map<String, dynamic>? variant]) {
    final key = '${product['id']}:${variant?['id'] ?? ''}';
    final existing = cart.where((line) => line.key == key);
    if (existing.isEmpty) {
      cart.add(CartLine(product, variant, 1));
    } else if (existing.first.quantity < 50) {
      existing.first.quantity++;
    }
    invalidateQuote();
    notifyListeners();
  }

  void changeQuantity(CartLine line, int quantity) {
    if (quantity <= 0) {
      cart.remove(line);
    } else {
      line.quantity = quantity.clamp(1, 50);
    }
    invalidateQuote();
    notifyListeners();
  }

  /// Empties the cart (the cart screen's "clear" action).
  void clearCart() {
    cart.clear();
    invalidateQuote();
    notifyListeners();
  }

  void invalidateQuote() {
    quote = null;
    orderKey = null;
  }

  Future<void> requestOtp(String phone) => _run(() async {
    devCode = null;
    final response = asMap(
      await api.request('POST', 'auth/otp/request', data: {'phone': phone}),
    );
    devCode = kDebugMode ? response['devCode'] as String? : null;
  });

  Future<void> verifyOtp(String phone, String code) => _run(() async {
    final session = asMap(
      await api.request(
        'POST',
        'auth/otp/verify',
        data: {'phone': phone, 'code': code},
      ),
    );
    await api.saveSession(session);
    devCode = null;
    if (push != null) unawaited(push!.register());
  });

  Future<void> logout() => _run(() async {
    await push?.unregister();
    await api.clearSession();
    devCode = null;
    invalidateQuote();
  });

  List<Map<String, dynamic>> get items =>
      cart.map((line) => line.toRequest()).toList();

  Future<void> getQuote(
    double latitude,
    double longitude, {
    String? promoCode,
  }) {
    if (offlinePreview) {
      error = 'Örnek menüde sipariş verilemez. Sunucuya bağlanın.';
      notifyListeners();
      return Future.value();
    }
    return _run(() async {
      quote = null;
      quote = asMap(
        await api.request(
          'POST',
          'marketplace/checkout/quote',
          auth: true,
          data: {
            'cafeId': cafe!['id'],
            'items': items,
            'latitude': latitude,
            'longitude': longitude,
            if (promoCode != null && promoCode.trim().isNotEmpty)
              'promoCode': promoCode.trim(),
          },
        ),
      );
    });
  }

  Future<Map<String, dynamic>?> place(
    String address,
    double latitude,
    double longitude, {
    String? promoCode,
  }) async {
    if (offlinePreview) {
      error = 'Örnek menüde sipariş verilemez. Sunucuya bağlanın.';
      notifyListeners();
      return null;
    }
    Map<String, dynamic>? placed;
    orderKey ??= const Uuid().v4();
    await _run(() async {
      placed = asMap(
        await api.request(
          'POST',
          'marketplace/checkout/orders',
          auth: true,
          data: {
            'cafeId': cafe!['id'],
            'items': items,
            'address': address.trim(),
            'latitude': latitude,
            'longitude': longitude,
            'idempotencyKey': orderKey,
            if (promoCode != null && promoCode.trim().isNotEmpty)
              'promoCode': promoCode.trim(),
          },
        ),
      );
      cart.clear();
      invalidateQuote();
    });
    return placed;
  }

  Future<List<Map<String, dynamic>>> orders() async {
    if (offlinePreview) return [];
    final data = asMap(await api.request('GET', 'orders', auth: true));
    return asList(data['items']);
  }

  Future<void> _run(Future<void> Function() task) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      await task();
    } catch (e) {
      error = e.toString();
    } finally {
      busy = false;
      notifyListeners();
    }
  }
}
