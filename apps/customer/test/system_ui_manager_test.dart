import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sacakly_customer/core/utils/system_ui_manager.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<MethodCall> calls;
  setUp(() {
    calls = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
          calls.add(call);
          return null;
        });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null);
  });

  testWidgets('hides the bottom bar at startup and after it reappears', (
    tester,
  ) async {
    final manager = SystemUiManager(hideDelay: const Duration(seconds: 3));
    addTearDown(manager.dispose);

    await manager.start();
    List<MethodCall> modeCalls() => calls
        .where(
          (call) => call.method == 'SystemChrome.setEnabledSystemUIOverlays',
        )
        .toList();

    expect(modeCalls(), hasLength(1));
    expect(modeCalls().first.arguments, ['SystemUiOverlay.top']);

    manager.handleBottomPadding(48);
    await tester.pump(const Duration(seconds: 2));
    expect(modeCalls(), hasLength(1));

    await tester.pump(const Duration(seconds: 2));
    expect(modeCalls(), hasLength(2));
  });
}
