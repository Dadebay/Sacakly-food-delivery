import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/data/customer_store.dart';
import '../../core/l10n/localized_text.dart';
import '../../core/theme/app_colors.dart';
import '../home/widgets/food_visual.dart';
import 'main_nav_screen.dart';
import 'widgets/cafe_tabs.dart';

/// What the app shows when it opens: the cafe list, with no bottom bar, so the
/// customer first says where they are ordering from. [Home] is built underneath
/// from the start (it loads the cafes and registers push handling) and is only
/// revealed once a cafe is chosen. A single cafe skips the choice, and with no
/// cafe to choose the customer can still continue to orders and profile.
class LaunchGate extends StatefulWidget {
  const LaunchGate(this.store, {super.key});

  final Store store;

  @override
  State<LaunchGate> createState() => _LaunchGateState();
}

class _LaunchGateState extends State<LaunchGate> {
  bool _chosen = false;

  void _choose(Map<String, dynamic> cafe) {
    if (_chosen) return;
    HapticFeedback.selectionClick();
    // Home shows its own loading state while the menu of the new cafe arrives.
    changeCafe(context, widget.store, cafe);
    setState(() => _chosen = true);
  }

  void _skip() => setState(() => _chosen = true);

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      Positioned.fill(
        child: Visibility(
          visible: _chosen,
          maintainState: true,
          child: Home(widget.store),
        ),
      ),
      if (!_chosen)
        Positioned.fill(
          child: CafeSelectScreen(
            widget.store,
            onSelected: _choose,
            onSkip: _skip,
          ),
        ),
    ],
  );
}

class CafeSelectScreen extends StatelessWidget {
  const CafeSelectScreen(
    this.store, {
    required this.onSelected,
    required this.onSkip,
    super.key,
  });

  final Store store;
  final ValueChanged<Map<String, dynamic>> onSelected;

  /// Leaves the screen without a cafe, when there is none to choose.
  final VoidCallback onSkip;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: store,
    builder: (context, _) {
      final palette = AppPalette.of(context);
      final cafes = store.cafes;
      if (cafes.length == 1 && !store.busy) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (context.mounted) onSelected(cafes.first);
        });
      }
      return AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.dark.copyWith(
          statusBarColor: Colors.transparent,
        ),
        child: Scaffold(
          backgroundColor: palette.page,
          body: CustomScrollView(
            slivers: [
              const SliverToBoxAdapter(child: _Header()),
              if (cafes.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: store.busy
                        ? const CircularProgressIndicator(color: brand)
                        : Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const LText(
                                'Henüz açık kafe yok',
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 12),
                              FilledButton(
                                onPressed: store.loadCafes,
                                style: FilledButton.styleFrom(
                                  backgroundColor: brand,
                                  foregroundColor: onBrand,
                                ),
                                child: const LText('Yenile'),
                              ),
                              TextButton(
                                onPressed: onSkip,
                                child: const LText('Devam et'),
                              ),
                            ],
                          ),
                  ),
                )
              else
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    16,
                    20,
                    16,
                    24 + MediaQuery.paddingOf(context).bottom,
                  ),
                  sliver: SliverList.separated(
                    itemCount: cafes.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 14),
                    itemBuilder: (context, index) => _CafeCard(
                      cafe: cafes[index],
                      onTap: () => onSelected(cafes[index]),
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
    },
  );
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: EdgeInsets.fromLTRB(
      20,
      MediaQuery.paddingOf(context).top + 14,
      20,
      26,
    ),
    decoration: const BoxDecoration(
      color: brand,
      borderRadius: BorderRadius.vertical(bottom: Radius.circular(34)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Image.asset('assets/logo_icon.png', width: 36, height: 36),
            const SizedBox(width: 10),
            const Text(
              'Saçakly',
              style: TextStyle(
                color: onBrand,
                fontSize: 22,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
        const SizedBox(height: 22),
        const LText(
          'Nereden sipariş vermek istersiniz?',
          style: TextStyle(
            color: onBrand,
            fontSize: 26,
            height: 1.1,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    ),
  );
}

/// The cafe's photo fills the card; a frosted label with its name and
/// description floats over the bottom edge.
class _CafeCard extends StatelessWidget {
  const _CafeCard({required this.cafe, required this.onTap});

  final Map<String, dynamic> cafe;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = AppPalette.of(context);
    final name = '${cafe['name'] ?? ''}';
    final description = '${cafe['description'] ?? ''}'.trim();
    return Semantics(
      button: true,
      label: name,
      child: ExcludeSemantics(
        child: SizedBox(
          height: 190,
          child: Material(
            key: ValueKey('cafe-select-${cafe['id']}'),
            color: palette.warm,
            borderRadius: BorderRadius.circular(32),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              fit: StackFit.expand,
              children: [
                LayoutBuilder(
                  builder: (context, box) => FoodPhoto(
                    name: name,
                    imageUrl: cafe['imageUrl'],
                    width: box.maxWidth,
                    height: box.maxHeight,
                    radius: 0,
                  ),
                ),
                Positioned(
                  left: 10,
                  right: 10,
                  bottom: 10,
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(16, 11, 10, 11),
                    decoration: BoxDecoration(
                      color: palette.surface.withValues(alpha: 0.94),
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: palette.text,
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              if (description.isNotEmpty) ...[
                                const SizedBox(height: 2),
                                Text(
                                  description,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: palette.muted,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          width: 36,
                          height: 36,
                          decoration: const BoxDecoration(
                            color: brand,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.arrow_forward_rounded,
                            size: 19,
                            color: onBrand,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Positioned.fill(child: InkWell(onTap: onTap)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
