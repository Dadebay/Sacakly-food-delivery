import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

/// Fades a snapshot of the old theme over the newly drawn screen.
class ThemeReveal extends StatefulWidget {
  const ThemeReveal({required this.child, super.key});

  final Widget child;

  static ThemeRevealState? maybeOf(BuildContext context) =>
      context.findAncestorStateOfType<ThemeRevealState>();

  @override
  State<ThemeReveal> createState() => ThemeRevealState();
}

class ThemeRevealState extends State<ThemeReveal>
    with SingleTickerProviderStateMixin {
  final _boundary = GlobalKey();
  late final AnimationController _progress;
  late final Animation<double> _oldScreenOpacity;
  ui.Image? _snapshot;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _progress = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 260),
    );
    _oldScreenOpacity = Tween<double>(
      begin: 1,
      end: 0,
    ).animate(CurvedAnimation(parent: _progress, curve: Curves.easeOutCubic));
  }

  Future<void> run(VoidCallback change) async {
    if (_busy) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      change();
      return;
    }
    _busy = true;
    try {
      var timedOut = false;
      final capture = _capture();
      unawaited(
        capture.then((lateImage) {
          if (timedOut) lateImage?.dispose();
        }),
      );
      final image = await capture.timeout(
        const Duration(milliseconds: 350),
        onTimeout: () {
          timedOut = true;
          return null;
        },
      );
      if (!mounted) {
        image?.dispose();
        return;
      }
      if (image == null) {
        change();
        return;
      }

      setState(() => _snapshot = image);
      await WidgetsBinding.instance.endOfFrame;
      change();
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted) return;
      await _progress.forward(from: 0);
    } finally {
      _busy = false;
      if (mounted) {
        final old = _snapshot;
        setState(() => _snapshot = null);
        old?.dispose();
      }
    }
  }

  Future<ui.Image?> _capture() async {
    try {
      var boundary =
          _boundary.currentContext?.findRenderObject()
              as RenderRepaintBoundary?;
      if (boundary == null) return null;
      for (var i = 0; i < 3 && boundary!.debugNeedsPaint; i++) {
        await WidgetsBinding.instance.endOfFrame;
        if (!mounted) return null;
        boundary =
            _boundary.currentContext?.findRenderObject()
                as RenderRepaintBoundary?;
      }
      if (boundary == null || boundary.debugNeedsPaint) return null;
      final ratio = MediaQuery.devicePixelRatioOf(context).clamp(1.0, 2.0);
      return boundary.toImage(pixelRatio: ratio);
    } catch (_) {
      return null;
    }
  }

  @override
  void dispose() {
    _progress.dispose();
    _snapshot?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.passthrough,
    children: [
      RepaintBoundary(key: _boundary, child: widget.child),
      if (_snapshot != null)
        Positioned.fill(
          child: AbsorbPointer(
            child: FadeTransition(
              key: const ValueKey('theme-reveal-fade'),
              opacity: _oldScreenOpacity,
              child: RawImage(image: _snapshot, fit: BoxFit.fill),
            ),
          ),
        ),
    ],
  );
}
