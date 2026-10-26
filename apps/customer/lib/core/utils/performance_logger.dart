import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';

/// Prints a `[PERF]` line for every batch of frames that missed their budget,
/// to find out where scrolling stutters. It is off in release builds.
///
/// Each line says which side was slow:
/// * `UI` is the Dart side: widget builds, layout and recording the paint.
///   Too many rebuilds or too much layout show up here.
/// * `RASTER` is the GPU side: drawing the recorded frame. Big images,
///   blurred shadows, clips and layers (opacity, filters) show up here.
///
/// The line also carries [screen], set by the shell to what is on display, and
/// the image cache, since a cache that keeps filling up and evicting means
/// photos are being fetched and decoded again while scrolling.
///
/// For a trustworthy reading run `flutter run --profile`: a debug build is
/// several times slower than the real app and flags frames that are fine.
class PerformanceLogger {
  PerformanceLogger._();

  static final instance = PerformanceLogger._();

  /// What the user is looking at; put into every line.
  static String screen = '';

  /// Longest a frame may take to count as smooth, as a 60 Hz frame budget.
  static const budget = Duration(milliseconds: 16);

  bool _started = false;

  void start() {
    if (kReleaseMode || _started) return;
    _started = true;
    if (const bool.fromEnvironment('PERF_REBUILDS')) {
      // Prints every widget that rebuilds; very chatty, so opt-in:
      // flutter run --profile --dart-define=PERF_REBUILDS=true
      debugPrintRebuildDirtyWidgets = true;
    }
    SchedulerBinding.instance.addTimingsCallback(
      (timings) => report(timings, log: debugPrint),
    );
  }

  /// Formats [timings] and passes one line to [log] when any frame was slow.
  @visibleForTesting
  void report(
    List<FrameTiming> timings, {
    required void Function(String line) log,
  }) {
    var slow = 0;
    Duration worstBuild = Duration.zero;
    Duration worstRaster = Duration.zero;
    Duration worstTotal = Duration.zero;
    for (final frame in timings) {
      final build = frame.buildDuration;
      final raster = frame.rasterDuration;
      if (build <= budget && raster <= budget) continue;
      slow++;
      if (build > worstBuild) worstBuild = build;
      if (raster > worstRaster) worstRaster = raster;
      if (frame.totalSpan > worstTotal) worstTotal = frame.totalSpan;
    }
    if (slow == 0) return;

    final side = worstBuild >= worstRaster
        ? 'UI (widgets/layout/paint)'
        : 'RASTER (GPU drawing)';
    final cache = PaintingBinding.instance.imageCache;
    final megabytes = (cache.currentSizeBytes / (1024 * 1024)).toStringAsFixed(
      0,
    );
    log(
      '[PERF] $slow/${timings.length} slow frames, worst: '
      'build ${worstBuild.inMilliseconds}ms, '
      'raster ${worstRaster.inMilliseconds}ms, '
      'total ${worstTotal.inMilliseconds}ms -> $side | '
      'screen: $screen | '
      'images: ${cache.currentSize} cached, ${cache.liveImageCount} live, '
      '$megabytes MB',
    );
  }
}
