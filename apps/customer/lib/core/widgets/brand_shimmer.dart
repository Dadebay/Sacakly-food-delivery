import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Shares one ticker between every photo that is still loading.
class BrandShimmerScope extends StatefulWidget {
  const BrandShimmerScope({required this.child, super.key});

  final Widget child;

  @override
  State<BrandShimmerScope> createState() => BrandShimmerScopeState();
}

class BrandShimmerScopeState extends State<BrandShimmerScope>
    with SingleTickerProviderStateMixin {
  late final AnimationController progress = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1300),
  );

  int _loadingPhotos = 0;
  bool _reduceMotion = false;

  void _syncTicker() {
    if (_loadingPhotos > 0 && !_reduceMotion) {
      if (!progress.isAnimating) progress.repeat();
    } else if (progress.isAnimating) {
      progress.stop();
    }
  }

  void register() {
    _loadingPhotos++;
    _syncTicker();
  }

  void unregister() {
    if (_loadingPhotos == 0) return;
    _loadingPhotos--;
    _syncTicker();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    _syncTicker();
  }

  @override
  void dispose() {
    progress.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// The brand wordmark appears only while a real photo is loading.
class BrandShimmerBox extends StatefulWidget {
  const BrandShimmerBox({super.key, this.wordmarkSize = 20});

  final double wordmarkSize;

  @override
  State<BrandShimmerBox> createState() => _BrandShimmerBoxState();
}

class _BrandShimmerBoxState extends State<BrandShimmerBox> {
  BrandShimmerScopeState? _scope;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = context.findAncestorStateOfType<BrandShimmerScopeState>();
    if (identical(next, _scope)) return;
    _scope?.unregister();
    _scope = next;
    _scope?.register();
  }

  @override
  void dispose() {
    _scope?.unregister();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final base = palette.muted;
    final wordmark = Text(
      'Saçakly',
      style: TextStyle(
        fontFamily: 'Gilroy',
        fontSize: widget.wordmarkSize,
        fontWeight: FontWeight.w800,
        color: base,
      ),
    );
    final scope = _scope;
    final animate = scope != null && !MediaQuery.disableAnimationsOf(context);
    return DecoratedBox(
      decoration: BoxDecoration(color: palette.raised),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: ExcludeSemantics(
              child: RepaintBoundary(
                child: animate
                    ? AnimatedBuilder(
                        animation: scope.progress,
                        child: wordmark,
                        builder: (context, child) {
                          final shift = scope.progress.value * 4;
                          return ShaderMask(
                            blendMode: BlendMode.srcIn,
                            shaderCallback: (bounds) => LinearGradient(
                              colors: [base, brand, base],
                              stops: const [0.35, 0.5, 0.65],
                              begin: Alignment(-2 + shift, 0),
                              end: Alignment(-1 + shift, 0),
                            ).createShader(bounds),
                            child: child,
                          );
                        },
                      )
                    : wordmark,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
