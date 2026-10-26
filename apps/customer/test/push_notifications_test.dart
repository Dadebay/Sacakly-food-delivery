import 'package:flutter_test/flutter_test.dart';
import 'package:sacakly_customer/core/services/firebase_messaging_service.dart';

void main() {
  test('notification routes stay inside the app allowlist', () {
    expect(PushNotifications.tabForDeepLink('/orders'), 3);
    expect(PushNotifications.tabForDeepLink('/cart'), 2);
    expect(PushNotifications.tabForDeepLink('https://example.com'), isNull);
    expect(PushNotifications.tabForDeepLink('/orders/other-user'), isNull);
  });
}
