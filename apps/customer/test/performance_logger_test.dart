import 'dart:ui' show FrameTiming;

import 'package:flutter_test/flutter_test.dart';
import 'package:sacakly_customer/core/utils/performance_logger.dart';

FrameTiming _frame({required int buildMs, required int rasterMs}) {
  const ms = 1000;
  var t = 0;
  final vsync = t;
  final buildStart = t += 1 * ms;
  final buildFinish = t += buildMs * ms;
  final rasterStart = t += 1 * ms;
  final rasterFinish = t += rasterMs * ms;
  return FrameTiming(
    vsyncStart: vsync,
    buildStart: buildStart,
    buildFinish: buildFinish,
    rasterStart: rasterStart,
    rasterFinish: rasterFinish,
    rasterFinishWallTime: rasterFinish,
    frameNumber: 1,
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('stays quiet while frames are within budget', () {
    final lines = <String>[];
    PerformanceLogger.instance.report([
      _frame(buildMs: 4, rasterMs: 5),
    ], log: lines.add);
    expect(lines, isEmpty);
  });

  test('names the UI side when building is the slow part', () {
    PerformanceLogger.screen = 'home (Han tagam, 8 categories)';
    final lines = <String>[];
    PerformanceLogger.instance.report([
      _frame(buildMs: 4, rasterMs: 5),
      _frame(buildMs: 40, rasterMs: 6),
    ], log: lines.add);
    expect(lines, hasLength(1));
    expect(lines.single, contains('1/2 slow frames'));
    expect(lines.single, contains('build 40ms'));
    expect(lines.single, contains('UI (widgets/layout/paint)'));
    expect(lines.single, contains('home (Han tagam, 8 categories)'));
  });

  test('names the raster side when drawing is the slow part', () {
    final lines = <String>[];
    PerformanceLogger.instance.report([
      _frame(buildMs: 5, rasterMs: 55),
    ], log: lines.add);
    expect(lines.single, contains('RASTER (GPU drawing)'));
  });
}
