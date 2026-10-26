import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:latlong2/latlong.dart';
import 'package:sacakly_customer/core/network/api_client.dart';
import 'package:sacakly_customer/core/services/map_service.dart';
import 'package:sacakly_customer/modules/checkout/delivery_location_screen.dart';
import 'package:sacakly_customer/modules/orders/order_tracking_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('maps use the same default tile server as food delivery', () {
    expect(mapTileUrl, 'https://a7-tagam.com.tm/tile/{z}/{x}/{y}.png');
  });

  testWidgets('address search chooses a real map point', (tester) async {
    tester.view.physicalSize = const Size(360, 760);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({'access_token': 'test-token'});
    final api = Api(await SharedPreferences.getInstance());
    api.dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: options.path == 'geocoding/search'
                  ? {
                      'items': [
                        {
                          'label': 'Parahat 7, Aşgabat',
                          'latitude': 37.96,
                          'longitude': 58.34,
                        },
                      ],
                    }
                  : {'line': 'Parahat 7, Aşgabat'},
            ),
          );
        },
      ),
    );
    DeliveryPoint? chosen;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () async {
                chosen = await Navigator.push<DeliveryPoint>(
                  context,
                  MaterialPageRoute(
                    builder: (_) => DeliveryLocationScreen(
                      api: api,
                      initial: const DeliveryPoint(
                        LatLng(37.95, 58.32),
                        'Eski adres',
                      ),
                    ),
                  ),
                );
              },
              child: const Text('Adres seç'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Adres seç'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Eski adres'), findsOneWidget);
    expect(
      tester
          .widget<HugeIcon>(find.byKey(const ValueKey('location-search-icon')))
          .size,
      15,
    );
    expect(
      tester.getSize(find.byKey(const ValueKey('location-search-icon'))),
      const Size(15, 15),
    );
    expect(
      tester
          .widget<HugeIcon>(find.byKey(const ValueKey('location-address-icon')))
          .size,
      16,
    );
    expect(
      tester.getSize(find.byKey(const ValueKey('location-address-icon'))),
      const Size(16, 16),
    );
    expect(find.text('© OpenStreetMap contributors'), findsNothing);
    expect(find.text('© OpenStreetMap'), findsOneWidget);
    expect(find.byTooltip('Ara'), findsNothing);
    await tester.enterText(find.byType(TextField).first, 'Parahat');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Parahat 7, Aşgabat'), findsOneWidget);
    await tester.tap(find.text('Parahat 7, Aşgabat'));
    await tester.pump();
    await tester.tap(find.text('Bu konumu kullan'));
    await tester.pump();
    expect(chosen?.address, 'Parahat 7, Aşgabat');
    expect(chosen?.position, const LatLng(37.96, 58.34));
    expect(tester.takeException(), isNull);
  });

  testWidgets('tracking uses live route duration and courier details', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    SharedPreferences.setMockInitialValues({'access_token': 'test-token'});
    final api = Api(await SharedPreferences.getInstance());
    final order = <String, dynamic>{
      'id': 'order-a',
      'number': 42,
      'status': 'OUT_FOR_DELIVERY',
      'address': 'Parahat 7',
      'latitude': 37.95,
      'longitude': 58.34,
      'branchLatitude': 37.97,
      'branchLongitude': 58.32,
      'courier': {
        'firstName': 'Myrat',
        'lastName': 'Amanow',
        'phone': '+99360000000',
      },
    };
    api.dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final data = switch (options.path) {
            'orders/order-a' => order,
            'tracking/orders/order-a/courier-location' => {
              'location': {
                'latitude': 37.96,
                'longitude': 58.32,
                'recordedAt': DateTime.now().toIso8601String(),
              },
            },
            'tracking/orders/order-a/route' => {
              'routingStatus': 'READY',
              'durationSeconds': 540,
              'geometry': {
                'coordinates': [
                  [58.32, 37.96],
                  [58.34, 37.95],
                ],
              },
            },
            _ => <String, dynamic>{},
          };
          handler.resolve(
            Response(requestOptions: options, statusCode: 200, data: data),
          );
        },
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: OrderTrackingScreen(api: api, order: order),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Yaklaşık 9 dk'), findsOneWidget);
    expect(find.text('Myrat Amanow'), findsOneWidget);
    expect(
      find.textContaining('Siparişiniz size doğru yola çıktı'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('tracking does not invent ETA while courier GPS is missing', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({'access_token': 'test-token'});
    final api = Api(await SharedPreferences.getInstance());
    final order = <String, dynamic>{
      'id': 'order-b',
      'number': 43,
      'status': 'OUT_FOR_DELIVERY',
      'address': 'Aşgabat',
      'latitude': 37.95,
      'longitude': 58.34,
    };
    api.dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          handler.resolve(
            Response(
              requestOptions: options,
              statusCode: 200,
              data: options.path == 'orders/order-b'
                  ? order
                  : {'location': null},
            ),
          );
        },
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: OrderTrackingScreen(api: api, order: order),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Teslimat süresi hesaplanıyor'), findsOneWidget);
    expect(find.text('Kurye konumu bekleniyor'), findsOneWidget);
    expect(find.textContaining('Yaklaşık'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
