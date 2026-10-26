import 'package:flutter/material.dart';
import '../../core/l10n/localized_text.dart';
import 'package:flutter/services.dart';
import 'package:hugeicons/hugeicons.dart';

import '../../core/data/customer_store.dart';
import '../../core/models/cart_line.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_icons.dart';
import '../auth/login_screen.dart';
import '../checkout/checkout_screen.dart';
import '../home/widgets/food_visual.dart';

const _danger = Color(0xFFE0483E);

/// Starts the order: sample menus can't be ordered, guests sign in first, then
/// the checkout screen opens. Shared by the cart screen and the checkout bar
/// that replaces the dock while the cart tab is open.
Future<void> startCheckout(BuildContext context, Store store) async {
  if (store.offlinePreview) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: LText(
          'Örnek menüde sipariş verilemez. Önce sunucuya bağlanın.',
        ),
      ),
    );
    return;
  }
  if (!store.signedIn) {
    await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => Login(store)),
    );
  }
  if (!context.mounted || !store.signedIn) return;
  await Navigator.push(
    context,
    MaterialPageRoute(builder: (_) => Checkout(store)),
  );
}

class Cart extends StatelessWidget {
  const Cart(this.store, {required this.openMenu, super.key});
  final Store store;
  final VoidCallback openMenu;

  @override
  Widget build(BuildContext context) {
    final empty = store.cart.isEmpty;
    final cafeName = '${store.cafe?['name'] ?? 'Kafe'}';
    // The shell draws the dock (or the checkout bar) over the body.
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return ColoredBox(
      color: AppPalette.of(context).canvas,
      child: SafeArea(
        bottom: false,
        child: empty
            ? LayoutBuilder(
                builder: (context, constraints) {
                  final dockSpace = bottomInset;
                  final spaceBelowHeader =
                      constraints.maxHeight - 10 - 46 - dockSpace;
                  return SingleChildScrollView(
                    padding: EdgeInsets.fromLTRB(20, 10, 20, dockSpace),
                    child: Column(
                      children: [
                        const _CartHeader(onBack: null, onClear: null),
                        ConstrainedBox(
                          constraints: BoxConstraints(
                            minHeight: spaceBelowHeader > 0
                                ? spaceBelowHeader
                                : 0,
                          ),
                          child: const Center(child: _EmptyCart()),
                        ),
                      ],
                    ),
                  );
                },
              )
            : ListView(
                padding: EdgeInsets.fromLTRB(20, 10, 20, 24 + bottomInset),
                children: [
                  _CartHeader(
                    onBack: openMenu,
                    onClear: () => _confirmClear(context, store),
                  ),
                  const SizedBox(height: 18),
                  for (final (index, line) in store.cart.indexed) ...[
                    if (index > 0) const _DashedDivider(),
                    _Appear(
                      key: ObjectKey(line),
                      index: index,
                      child: _CartProduct(
                        line: line,
                        cafeName: cafeName,
                        onChange: (quantity) =>
                            store.changeQuantity(line, quantity),
                      ),
                    ),
                  ],
                  if (store.offlinePreview)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: LText(
                        'Bu sepet yalnızca tasarım önizlemesidir.',
                        style: TextStyle(color: AppPalette.of(context).muted),
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

/// White bottom sheet that takes the dock's place while the cart tab is open:
/// the order summary above a yellow checkout pill. The shell slides it in as
/// the dock slides out.
class CartCheckoutBar extends StatelessWidget {
  const CartCheckoutBar(this.store, {super.key});
  final Store store;

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: AppPalette.of(context).surface,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
      boxShadow: [
        BoxShadow(
          color: Color(0x16000000),
          blurRadius: 26,
          offset: Offset(0, -6),
        ),
      ],
    ),
    child: SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 24, 22, 14),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _SummaryRow(
              label: 'Ürünler toplamı',
              value: _RollingMoney(value: store.estimatedSubtotal, size: 17),
            ),
            const SizedBox(height: 13),
            _SummaryRow(
              label: 'Teslimat',
              value: LText(
                'Ödeme adımında',
                style: TextStyle(
                  fontFamily: 'Gilroy',
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: AppPalette.of(context).muted,
                ),
              ),
            ),
            const SizedBox(height: 16),
            const _DashedDivider(),
            const SizedBox(height: 18),
            Container(
              height: 66,
              padding: const EdgeInsets.fromLTRB(26, 0, 7, 0),
              decoration: BoxDecoration(
                color: brand,
                borderRadius: BorderRadius.circular(33),
              ),
              child: Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: _RollingMoney(
                        value: store.estimatedSubtotal,
                        size: 23,
                        color: onBrand,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  // Loose, so on a narrow phone the label shrinks instead of
                  // squeezing the amount out.
                  Flexible(
                    flex: 2,
                    child: _CheckoutButton(
                      onTap: () => startCheckout(context, store),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// An amount with a small "TMT" after it. The number rolls to its new value
/// whenever it changes.
class _RollingMoney extends StatelessWidget {
  const _RollingMoney({required this.value, required this.size, this.color});
  final double value;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
    tween: Tween(end: value),
    duration: MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : const Duration(milliseconds: 450),
    curve: Curves.easeOutCubic,
    builder: (context, shown, _) =>
        _Money(amount: shown.toStringAsFixed(2), size: size, color: color),
  );
}

/// "12.00 TMT" with the currency set much smaller than the amount.
class _Money extends StatelessWidget {
  const _Money({required this.amount, required this.size, this.color});
  final String amount;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) => Text.rich(
    TextSpan(
      text: amount,
      children: [
        TextSpan(
          text: ' TMT',
          style: TextStyle(fontSize: size * 0.56, fontWeight: FontWeight.w700),
        ),
      ],
    ),
    maxLines: 1,
    style: TextStyle(
      fontFamily: 'Gilroy',
      fontSize: size,
      height: 1.15,
      fontWeight: FontWeight.w800,
      color: color ?? AppPalette.of(context).text,
    ),
  );
}

class _CheckoutButton extends StatefulWidget {
  const _CheckoutButton({required this.onTap});
  final VoidCallback onTap;

  @override
  State<_CheckoutButton> createState() => _CheckoutButtonState();
}

class _CheckoutButtonState extends State<_CheckoutButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    return AnimatedScale(
      scale: _pressed ? 0.94 : 1,
      duration: reducedMotion
          ? Duration.zero
          : Duration(milliseconds: _pressed ? 90 : 340),
      curve: _pressed ? Curves.easeOut : Curves.elasticOut,
      child: Material(
        color: AppPalette.of(context).raised,
        borderRadius: BorderRadius.circular(28),
        child: InkWell(
          borderRadius: BorderRadius.circular(28),
          onTap: () {
            HapticFeedback.lightImpact();
            widget.onTap();
          },
          onHighlightChanged: (value) => setState(() => _pressed = value),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  LText(
                    'Sipariş ver',
                    maxLines: 1,
                    style: TextStyle(
                      fontFamily: 'Gilroy',
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: AppPalette.of(context).text,
                    ),
                  ),
                  const SizedBox(width: 6),
                  // The Material delivery rider reads better here than any
                  // HugeIcons motorbike, so this one stays a Material icon.
                  Icon(
                    Icons.delivery_dining_rounded,
                    size: 22,
                    color: AppPalette.of(context).text,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CartHeader extends StatelessWidget {
  const _CartHeader({required this.onBack, required this.onClear});
  final VoidCallback? onBack;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      if (onBack == null)
        const SizedBox(width: 46, height: 46)
      else
        _RoundButton(icon: AppIcons.back, tooltip: 'Geri', onTap: onBack!),
      const Expanded(
        child: LText(
          'Sepetim',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: 'Gilroy',
            fontSize: 19,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      if (onClear == null)
        const SizedBox(width: 46, height: 46)
      else
        PopupMenuButton<String>(
          tooltip: tr(context, 'Daha fazla'),
          offset: const Offset(0, 54),
          color: AppPalette.of(context).surface,
          surfaceTintColor: Colors.transparent,
          elevation: 12,
          shadowColor: const Color(0x33000000),
          constraints: const BoxConstraints(minWidth: 224),
          padding: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
            side: BorderSide(color: AppPalette.of(context).border),
          ),
          popUpAnimationStyle: AnimationStyle(
            curve: Curves.easeOutCubic,
            reverseCurve: Curves.easeIn,
            duration: const Duration(milliseconds: 260),
            reverseDuration: const Duration(milliseconds: 160),
          ),
          onSelected: (_) => onClear!(),
          itemBuilder: (_) => [
            PopupMenuItem<String>(
              value: 'clear',
              height: 60,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: AppPalette.of(context).dangerTint,
                      shape: BoxShape.circle,
                    ),
                    child: const SizedBox(
                      width: 38,
                      height: 38,
                      child: Center(
                        child: HugeIcon(
                          icon: AppIcons.delete,
                          size: 19,
                          color: _danger,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  LText(
                    'Sepeti temizle',
                    style: TextStyle(
                      fontFamily: 'Gilroy',
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: AppPalette.of(context).text,
                    ),
                  ),
                ],
              ),
            ),
          ],
          child: _RoundShell(
            child: HugeIcon(
              icon: AppIcons.more,
              size: 22,
              color: AppPalette.of(context).text,
            ),
          ),
        ),
    ],
  );
}

class _RoundShell extends StatelessWidget {
  const _RoundShell({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
    width: 46,
    height: 46,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      color: AppPalette.of(context).raised,
      shape: BoxShape.circle,
    ),
    child: child,
  );
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });
  final HugeIconData icon;
  final String tooltip;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tr(context, tooltip),
    child: InkWell(
      customBorder: const CircleBorder(),
      onTap: onTap,
      child: _RoundShell(
        child: HugeIcon(
          icon: icon,
          size: 20,
          color: AppPalette.of(context).text,
        ),
      ),
    ),
  );
}

/// Fades and slides each row in when the cart opens, one after another.
class _Appear extends StatelessWidget {
  const _Appear({required this.index, required this.child, super.key});
  final int index;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context)) return child;
    final step = index.clamp(0, 6) * 70;
    final total = 420 + step;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: total),
      curve: Interval(step / total, 1, curve: Curves.easeOutCubic),
      builder: (context, t, child) => Opacity(
        opacity: t,
        child: Transform.translate(
          offset: Offset(0, (1 - t) * 26),
          child: child,
        ),
      ),
      child: child,
    );
  }
}

class _CartProduct extends StatelessWidget {
  const _CartProduct({
    required this.line,
    required this.cafeName,
    required this.onChange,
  });
  final CartLine line;
  final String cafeName;
  final ValueChanged<int> onChange;

  @override
  Widget build(BuildContext context) {
    final rating = _rating(line.product);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 19),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          FoodPhoto(
            name: line.name,
            imageUrl: line.product['displayImageUrl'],
            width: 98,
            height: 98,
            radius: 24,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        line.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontFamily: 'Gilroy',
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          height: 1.15,
                        ),
                      ),
                    ),
                    if (rating != null) ...[
                      const SizedBox(width: 6),
                      const HugeIcon(
                        icon: AppIcons.star,
                        size: 16,
                        color: Color(0xFFF47E20),
                        strokeWidth: 2,
                      ),
                      const SizedBox(width: 1),
                      Text(
                        rating.toStringAsFixed(1),
                        style: const TextStyle(
                          fontFamily: 'Gilroy',
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  cafeName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12.5,
                    color: AppPalette.of(context).muted,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: _Money(
                          amount: (line.price * line.quantity).toStringAsFixed(
                            2,
                          ),
                          size: 18,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    _QuantityStepper(line: line, onChange: onChange),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// ( − )  2  ( + ): outlined minus, yellow plus; the number flips on change.
class _QuantityStepper extends StatelessWidget {
  const _QuantityStepper({required this.line, required this.onChange});
  final CartLine line;
  final ValueChanged<int> onChange;

  @override
  Widget build(BuildContext context) {
    final reducedMotion = MediaQuery.disableAnimationsOf(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        _CircleAction(
          icon: line.quantity == 1 ? AppIcons.delete : AppIcons.minus,
          tooltip: 'Azalt',
          onTap: () => onChange(line.quantity - 1),
        ),
        SizedBox(
          width: 28,
          child: AnimatedSwitcher(
            duration: reducedMotion
                ? Duration.zero
                : const Duration(milliseconds: 220),
            switchInCurve: Curves.easeOutBack,
            transitionBuilder: (child, animation) => ScaleTransition(
              scale: animation,
              child: FadeTransition(opacity: animation, child: child),
            ),
            child: LText(
              '${line.quantity}',
              key: ValueKey(line.quantity),
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: 'Gilroy',
                fontWeight: FontWeight.w800,
                fontSize: 14,
              ),
            ),
          ),
        ),
        _CircleAction(
          icon: AppIcons.add,
          tooltip: 'Artır',
          filled: true,
          onTap: line.quantity >= 50 ? null : () => onChange(line.quantity + 1),
        ),
      ],
    );
  }
}

class _CircleAction extends StatefulWidget {
  const _CircleAction({
    required this.icon,
    required this.tooltip,
    required this.onTap,
    this.filled = false,
  });
  final HugeIconData icon;
  final String tooltip;
  final VoidCallback? onTap;
  final bool filled;

  @override
  State<_CircleAction> createState() => _CircleActionState();
}

class _CircleActionState extends State<_CircleAction> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onTap != null;
    return Tooltip(
      message: tr(context, widget.tooltip),
      child: AnimatedScale(
        scale: _pressed ? 0.84 : 1,
        duration: MediaQuery.disableAnimationsOf(context)
            ? Duration.zero
            : Duration(milliseconds: _pressed ? 80 : 300),
        curve: _pressed ? Curves.easeOut : Curves.elasticOut,
        child: Material(
          color: widget.filled
              ? (enabled ? brand : AppPalette.of(context).raised)
              : AppPalette.of(context).surface,
          shape: CircleBorder(
            side: widget.filled
                ? BorderSide.none
                : BorderSide(color: AppPalette.of(context).border),
          ),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: widget.onTap == null
                ? null
                : () {
                    HapticFeedback.selectionClick();
                    widget.onTap!();
                  },
            onHighlightChanged: (value) => setState(() => _pressed = value),
            child: SizedBox(
              width: 31,
              height: 31,
              child: Center(
                child: HugeIcon(
                  icon: widget.icon,
                  size: 17,
                  color: widget.filled && enabled
                      ? onBrand
                      : (enabled
                            ? AppPalette.of(context).text
                            : AppPalette.of(context).muted),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DashedDivider extends StatelessWidget {
  const _DashedDivider();

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 1,
    width: double.infinity,
    child: CustomPaint(painter: _DashPainter(AppPalette.of(context).border)),
  );
}

class _DashPainter extends CustomPainter {
  const _DashPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.4
      ..strokeCap = StrokeCap.round;
    for (var x = 0.0; x < size.width; x += 10) {
      canvas.drawLine(Offset(x, 0.7), Offset(x + 5.5, 0.7), paint);
    }
  }

  @override
  bool shouldRepaint(_DashPainter old) => old.color != color;
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, required this.value});
  final String label;
  final Widget value;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: LText(
          label,
          style: const TextStyle(
            fontFamily: 'Gilroy',
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      value,
    ],
  );
}

/// Asks before emptying the cart: it can't be undone from the cart itself.
Future<void> _confirmClear(BuildContext context, Store store) async {
  final reducedMotion = MediaQuery.disableAnimationsOf(context);
  final confirmed = await showGeneralDialog<bool>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Kapat',
    barrierColor: Colors.black.withValues(alpha: 0.5),
    transitionDuration: reducedMotion
        ? Duration.zero
        : const Duration(milliseconds: 360),
    pageBuilder: (context, _, _) => _ClearCartDialog(count: store.cartCount),
    transitionBuilder: (context, animation, _, child) {
      final spring = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutBack,
        reverseCurve: Curves.easeIn,
      );
      return FadeTransition(
        opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut),
        child: ScaleTransition(
          scale: Tween<double>(begin: 0.84, end: 1).animate(spring),
          child: child,
        ),
      );
    },
  );
  if (confirmed == true) store.clearCart();
}

class _ClearCartDialog extends StatelessWidget {
  const _ClearCartDialog({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) => Center(
    child: Material(
      type: MaterialType.transparency,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 28),
        padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
        constraints: const BoxConstraints(maxWidth: 340),
        decoration: BoxDecoration(
          color: AppPalette.of(context).surface,
          borderRadius: BorderRadius.circular(32),
          boxShadow: const [
            BoxShadow(
              color: Color(0x30000000),
              blurRadius: 40,
              offset: Offset(0, 18),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // The icon pops in a beat after the dialog opens.
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0.4, end: 1),
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : const Duration(milliseconds: 700),
              curve: Curves.elasticOut,
              builder: (context, scale, child) =>
                  Transform.scale(scale: scale, child: child),
              child: Container(
                width: 84,
                height: 84,
                decoration: BoxDecoration(
                  color: AppPalette.of(context).dangerTint,
                  shape: BoxShape.circle,
                ),
                child: const Center(
                  child: HugeIcon(
                    icon: AppIcons.delete,
                    size: 36,
                    color: _danger,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 22),
            const LText(
              'Sepeti temizleyelim mi?',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: 'Gilroy',
                fontSize: 21,
                fontWeight: FontWeight.w800,
                height: 1.2,
              ),
            ),
            const SizedBox(height: 10),
            LText(
              '$count ürün sepetinizden kaldırılacak.\nBu işlem geri alınamaz.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14.5,
                height: 1.45,
                color: AppPalette.of(context).muted,
              ),
            ),
            const SizedBox(height: 26),
            Row(
              children: [
                Expanded(
                  child: _DialogButton(
                    label: 'Vazgeç',
                    background: AppPalette.of(context).raised,
                    foreground: AppPalette.of(context).text,
                    onTap: () => Navigator.pop(context, false),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _DialogButton(
                    label: 'Temizle',
                    background: _danger,
                    foreground: Colors.white,
                    onTap: () {
                      HapticFeedback.mediumImpact();
                      Navigator.pop(context, true);
                    },
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

class _DialogButton extends StatefulWidget {
  const _DialogButton({
    required this.label,
    required this.background,
    required this.foreground,
    required this.onTap,
  });
  final String label;
  final Color background;
  final Color foreground;
  final VoidCallback onTap;

  @override
  State<_DialogButton> createState() => _DialogButtonState();
}

class _DialogButtonState extends State<_DialogButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) => AnimatedScale(
    scale: _pressed ? 0.95 : 1,
    duration: MediaQuery.disableAnimationsOf(context)
        ? Duration.zero
        : Duration(milliseconds: _pressed ? 80 : 300),
    curve: _pressed ? Curves.easeOut : Curves.elasticOut,
    child: Material(
      color: widget.background,
      borderRadius: BorderRadius.circular(26),
      child: InkWell(
        borderRadius: BorderRadius.circular(26),
        onTap: widget.onTap,
        onHighlightChanged: (value) => setState(() => _pressed = value),
        child: SizedBox(
          height: 52,
          child: Center(
            child: LText(
              widget.label,
              style: TextStyle(
                fontFamily: 'Gilroy',
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: widget.foreground,
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class _EmptyCart extends StatelessWidget {
  const _EmptyCart();

  @override
  Widget build(BuildContext context) => Column(
    key: const ValueKey('empty-cart-content'),
    mainAxisSize: MainAxisSize.min,
    children: [
      SizedBox(
        width: 234,
        height: 234,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Container(
              width: 216,
              height: 216,
              decoration: BoxDecoration(
                color: AppPalette.of(context).warm,
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFFFE9A6)),
              ),
            ),
            Image.asset(
              'assets/images/empty_cart_basket.png',
              width: 190,
              height: 190,
              fit: BoxFit.contain,
              semanticLabel: tr(context, 'Boş alışveriş sepeti'),
            ),
          ],
        ),
      ),
      const SizedBox(height: 26),
      LText(
        'Sepetiniz henüz boş',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontFamily: 'Gilroy',
          fontSize: 25,
          fontWeight: FontWeight.w800,
          color: AppPalette.of(context).text,
        ),
      ),
      const SizedBox(height: 10),
      LText(
        'İlk lezzeti seçtiğinizde\nsepetiniz burada görünecek.',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontFamily: 'Gilroy',
          fontSize: 15,
          color: AppPalette.of(context).muted,
          height: 1.5,
        ),
      ),
    ],
  );
}

double? _rating(Map<String, dynamic> product) {
  final value = product['rating'] ?? product['averageRating'];
  final rating = value is num ? value.toDouble() : double.tryParse('$value');
  if (rating == null || rating < 0 || rating > 5) return null;
  return rating;
}
