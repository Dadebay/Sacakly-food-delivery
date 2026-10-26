import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

/// Keeps the Android status bar visible while hiding its navigation bar.
/// Android can show the navigation bar again after an edge swipe or app switch.
class SystemUiManager with WidgetsBindingObserver {
  SystemUiManager({this.hideDelay = const Duration(seconds: 3)});

  final Duration hideDelay;
  Timer? _hideTimer;

  Future<void> start() async {
    WidgetsBinding.instance.addObserver(this);
    await apply();
  }

  Future<void> apply() => SystemChrome.setEnabledSystemUIMode(
    SystemUiMode.manual,
    overlays: [SystemUiOverlay.top],
  );

  @override
  void didChangeMetrics() {
    final view = WidgetsBinding.instance.platformDispatcher.implicitView;
    if (view != null) handleBottomPadding(view.viewPadding.bottom);
  }

  void handleBottomPadding(double bottomPadding) {
    if (bottomPadding <= 0) {
      _hideTimer?.cancel();
      _hideTimer = null;
      return;
    }
    if (_hideTimer?.isActive ?? false) return;
    _hideTimer = Timer(hideDelay, apply);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(apply());
  }

  void dispose() {
    _hideTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
  }
}
