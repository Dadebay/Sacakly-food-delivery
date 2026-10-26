import 'dart:async';

import 'package:flutter/material.dart';
import 'package:hugeicons/hugeicons.dart';
import '../../core/l10n/localized_text.dart';

import '../../core/data/customer_store.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_icons.dart';
import '../cart/cart_screen.dart';
import '../catalog/menu_screen.dart';
import '../home/home_screen.dart';
import '../orders/orders_screen.dart';
import '../profile/profile_screen.dart';
import '../../core/utils/performance_logger.dart';
import 'widgets/cafe_tabs.dart';
import 'widgets/customer_dock.dart';

class Home extends StatefulWidget {
  const Home(this.store, {super.key});
  final Store store;
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> with SingleTickerProviderStateMixin {
  int tab = 0;
  int _ordersReturnTab = 0;
  bool _menuGridView = true;

  /// 1 while a cafe is shown; dips to 0 and back when the cafe is switched.
  late final AnimationController _cafeSwitch = AnimationController(
    vsync: this,
    value: 1,
  );

  bool get _reducedMotion => MediaQuery.disableAnimationsOf(context);

  Future<void> _fadeOutCafe() => _reducedMotion
      ? Future<void>.value()
      : _cafeSwitch.animateTo(
          0,
          duration: const Duration(milliseconds: 160),
          curve: Curves.easeIn,
        );

  void _fadeInCafe() {
    if (_reducedMotion) {
      _cafeSwitch.value = 1;
      return;
    }
    _cafeSwitch.animateTo(
      1,
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  void initState() {
    super.initState();
    widget.store.loadCafes();
    final push = widget.store.push;
    if (push != null) {
      push.pendingTab.addListener(_onNotificationOpened);
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => unawaited(push.start()),
      );
    }
  }

  void _onNotificationOpened() {
    final destination = widget.store.push?.pendingTab.value;
    if (destination != null && mounted) {
      setState(() {
        if (destination == 3 && tab != 3) _ordersReturnTab = tab;
        tab = destination;
      });
    }
  }

  void _openOrders() => setState(() {
    if (tab != 3) _ordersReturnTab = tab;
    tab = 3;
  });

  @override
  void dispose() {
    widget.store.push?.pendingTab.removeListener(_onNotificationOpened);
    _cafeSwitch.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.store,
    builder: (context, _) {
      final s = widget.store;
      // With something in the cart, the cart tab swaps the dock for a yellow
      // checkout bar (its own header has a back button).
      final checkout = tab == 2 && s.cart.isNotEmpty;
      PerformanceLogger.screen =
          '${const ['home', 'menu', 'cart', 'orders', 'profile'][tab]} '
          '(${s.cafe?['name']}, ${s.categories.length} categories)';
      return Scaffold(
        // Lets the lists scroll behind the transparent dock.
        extendBody: true,
        backgroundColor: tab == 2 ? AppPalette.of(context).canvas : null,
        appBar: tab == 2
            ? null
            : AppBar(
                centerTitle: tab == 3,
                // The cafe tab runs down into the page, so the bar must not tint
                // when the page scrolls under it.
                scrolledUnderElevation: 0,
                leading: tab == 3
                    ? IconButton(
                        tooltip: tr(context, 'Geri'),
                        onPressed: () => setState(() => tab = _ordersReturnTab),
                        icon: const HugeIcon(
                          icon: AppIcons.back,
                          color: onBrand,
                          size: 22,
                        ),
                      )
                    : null,
                // Home and menu have no title: the cafe tabs take the whole bar.
                titleSpacing: tab <= 1 ? 0 : null,
                title: tab <= 1
                    ? (s.cafes.isEmpty
                          ? const SizedBox.shrink()
                          : CafeTabs(
                              store: s,
                              beforeSwitch: _fadeOutCafe,
                              afterSwitch: _fadeInCafe,
                            ))
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (tab != 3) ...[
                            Image.asset(
                              'assets/logo_icon.png',
                              width: 34,
                              height: 34,
                            ),
                            const SizedBox(width: 8),
                          ],
                          Flexible(
                            child: LText(
                              tab == 3 ? 'Siparişlerim' : 'Profilim',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ),
                actions: [
                  if (tab == 1 && s.categories.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(right: 12),
                      child: IconButton(
                        tooltip: tr(
                          context,
                          _menuGridView ? 'Liste görünümü' : 'Izgara görünümü',
                        ),
                        onPressed: () =>
                            setState(() => _menuGridView = !_menuGridView),
                        icon: Icon(
                          _menuGridView
                              ? AppIcons.listViewOutline
                              : AppIcons.gridViewOutline,
                          size: 22,
                        ),
                      ),
                    ),
                ],
              ),
        body: _CafeSwitchFade(
          animation: _cafeSwitch,
          child: switch (tab) {
            0 => Cafes(s, () => setState(() => tab = 1)),
            1 => Menu(
              s,
              gridView: _menuGridView,
              openCafes: () => setState(() => tab = 0),
            ),
            2 => _FadeIn(
              child: Cart(s, openMenu: () => setState(() => tab = 1)),
            ),
            3 => Orders(s),
            _ => Profile(s, openOrders: _openOrders, showTitle: false),
          },
        ),
        bottomNavigationBar: _BottomSlot(
          showCheckout: checkout,
          dock: CustomerDock(
            key: const ValueKey('dock'),
            selectedIndex: tab,
            cartCount: s.cartCount,
            onTabSelected: (n) => setState(() => tab = n),
            onProfile: () => setState(() => tab = 4),
          ),
          checkout: CartCheckoutBar(s, key: const ValueKey('checkout')),
        ),
      );
    },
  );
}

/// Fades the page out and back in, with a small rise and settle, while the
/// customer switches cafe. Drives from [animation], which is 1 at rest.
class _CafeSwitchFade extends StatelessWidget {
  const _CafeSwitchFade({required this.animation, required this.child});

  final Animation<double> animation;
  final Widget child;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: animation,
    child: child,
    builder: (context, child) {
      final t = animation.value;
      return Opacity(
        key: const ValueKey('cafe-switch-fade'),
        opacity: t,
        child: Transform.translate(
          // Exactly the identity at rest, so the page is painted untransformed.
          offset: t >= 1 ? Offset.zero : Offset(0, (1 - t) * 16),
          child: Transform.scale(
            scale: t >= 1 ? 1.0 : 0.98 + 0.02 * t,
            child: child,
          ),
        ),
      );
    },
  );
}

/// Fades its child in the first time it is built (the cart tab opens with a
/// fade). The animation state lives as long as the tab stays selected.
class _FadeIn extends StatelessWidget {
  const _FadeIn({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context)) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 650),
      curve: Curves.easeOut,
      builder: (context, opacity, child) =>
          Opacity(opacity: opacity, child: child),
      child: child,
    );
  }
}

/// The bottom edge of the shell: the dock, or the checkout sheet. Switching
/// slides the outgoing one down off the screen while the other rises from
/// below, so the sheet appears to take the dock's place.
///
/// The dock sinks in one long ease-in-out; the sheet waits a beat, then rises,
/// so the two never cross awkwardly.
class _BottomSlot extends StatelessWidget {
  const _BottomSlot({
    required this.showCheckout,
    required this.dock,
    required this.checkout,
  });

  final bool showCheckout;
  final Widget dock;
  final Widget checkout;

  @override
  Widget build(BuildContext context) {
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    return AnimatedSwitcher(
      duration: reducedMotion
          ? Duration.zero
          : const Duration(milliseconds: 760),
      reverseDuration: reducedMotion
          ? Duration.zero
          : const Duration(milliseconds: 820),
      // The curves are applied per child below. The animation handed to the
      // builder must stay within 0 to 1, so nothing here overshoots.
      switchInCurve: Curves.linear,
      switchOutCurve: Curves.linear,
      layoutBuilder: (current, previous) => Stack(
        alignment: Alignment.bottomCenter,
        children: [...previous, ?current],
      ),
      transitionBuilder: (child, animation) {
        final sheet = child.key == const ValueKey('checkout');
        final slide = animation.drive(
          CurveTween(
            curve: sheet
                ? const Interval(0.3, 1, curve: Curves.easeOutCubic)
                : Curves.easeInOutCubic,
          ),
        );
        final fade = animation.drive(
          CurveTween(
            curve: sheet
                ? const Interval(0.3, 0.8, curve: Curves.easeOut)
                : const Interval(0.25, 1, curve: Curves.easeIn),
          ),
        );
        return SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 1.1),
            end: Offset.zero,
          ).animate(slide),
          child: FadeTransition(opacity: fade, child: child),
        );
      },
      child: showCheckout ? checkout : dock,
    );
  }
}
