import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sacakly_customer/core/network/api_client.dart';
import 'package:sacakly_customer/core/data/customer_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('network failure opens read-only bundled catalogue', () async {
    SharedPreferences.setMockInitialValues({});
    final api = Api(await SharedPreferences.getInstance());
    api.dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) => handler.reject(
          DioException(
            requestOptions: options,
            type: DioExceptionType.connectionError,
          ),
        ),
      ),
    );
    final store = Store(api);
    await store.loadCafes();
    expect(store.offlinePreview, isTrue);
    expect(store.error, isNull);
    expect(store.cafes, hasLength(2));
    expect(store.banners, hasLength(2));
    expect(store.categories, hasLength(4));
    store.add(store.categories.first['products'].first as Map<String, dynamic>);
    await store.getQuote(37.96, 58.33);
    expect(store.quote, isNull);
    expect(store.error, contains('Örnek menüde sipariş verilemez'));
  });

  test('home loads cafes and active banners from the local API', () async {
    SharedPreferences.setMockInitialValues({});
    final api = Api(await SharedPreferences.getInstance());
    api.dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) => handler.resolve(
          Response(
            requestOptions: options,
            statusCode: 200,
            data: options.path == 'marketing/banners'
                ? [
                    {'id': 'banner-a', 'title': 'Demo'},
                  ]
                : [
                    {'id': 'cafe-a', 'name': 'Demo cafe'},
                  ],
          ),
        ),
      ),
    );
    final store = Store(api);
    await store.loadCafes();
    expect(store.cafes.single['id'], 'cafe-a');
    expect(store.banners.single['id'], 'banner-a');
  });

  test('switching cafes clears the previous cafe cart', () async {
    SharedPreferences.setMockInitialValues({});
    final api = Api(await SharedPreferences.getInstance());
    api.dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: <Map<String, dynamic>>[],
            ),
          );
        },
      ),
    );
    final store = Store(api);
    final first = {'id': 'cafe-a', 'name': 'A'};
    final second = {'id': 'cafe-b', 'name': 'B'};
    await store.selectCafe(first);
    store.add({'id': 'dish-a', 'name': 'Dish', 'price': 10});
    expect(store.cartCount, 1);
    await store.selectCafe(second);
    expect(store.cart, isEmpty);
    expect(store.cafe?['id'], 'cafe-b');
  });

  test('development OTP response is available to the login screen', () async {
    SharedPreferences.setMockInitialValues({});
    final api = Api(await SharedPreferences.getInstance());
    api.dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) => handler.resolve(
          Response(
            requestOptions: options,
            statusCode: 200,
            data: {'expiresInSeconds': 300, 'devCode': '123456'},
          ),
        ),
      ),
    );
    final store = Store(api);
    await store.requestOtp('+99365000001');
    expect(store.devCode, '123456');
  });
}
