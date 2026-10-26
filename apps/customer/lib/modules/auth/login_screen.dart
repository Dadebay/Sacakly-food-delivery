import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:iconly/iconly.dart';

import '../../core/data/customer_store.dart';
import '../../core/l10n/localized_text.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_icons.dart';

class Login extends StatefulWidget {
  const Login(this.store, {super.key});

  final Store store;

  @override
  State<Login> createState() => _LoginState();
}

class _LoginState extends State<Login> {
  final phone = TextEditingController();
  final code = TextEditingController();
  bool sent = false;
  String? _requestedPhone;

  String get _fullPhone => '+993${phone.text.trim()}';

  @override
  void dispose() {
    phone.dispose();
    code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (widget.store.busy || widget.store.offlinePreview) return;
    FocusScope.of(context).unfocus();

    if (!sent) {
      final requestedPhone = _fullPhone;
      await widget.store.requestOtp(requestedPhone);
      if (mounted && widget.store.error == null) {
        code.clear();
        setState(() {
          _requestedPhone = requestedPhone;
          sent = true;
        });
      }
      return;
    }

    await widget.store.verifyOtp(_requestedPhone ?? _fullPhone, code.text.trim());
    if (mounted && widget.store.signedIn) Navigator.pop(context);
  }

  Future<void> _resendCode() async {
    if (widget.store.busy || _requestedPhone == null) return;
    code.clear();
    await widget.store.requestOtp(_requestedPhone!);
  }

  void _changePhone() {
    if (widget.store.busy) return;
    code.clear();
    widget.store.error = null;
    widget.store.devCode = null;
    setState(() {
      _requestedPhone = null;
      sent = false;
    });
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.store,
    builder: (context, _) {
      final palette = AppPalette.of(context);
      final keyboardOpen = MediaQuery.viewInsetsOf(context).bottom > 0;
      final motionDuration = MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 240);

      return AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
        child: Scaffold(
          backgroundColor: const Color(0xFF130E08),
          body: LayoutBuilder(
            builder: (context, constraints) {
              final heroHeight = keyboardOpen ? 150.0 : (constraints.maxHeight * 0.36).clamp(220.0, 290.0);

              return SingleChildScrollView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                child: Column(
                  children: [
                    AnimatedContainer(
                      duration: motionDuration,
                      curve: Curves.easeOutCubic,
                      height: heroHeight,
                      child: _LoginHero(compact: keyboardOpen, onBack: () => Navigator.maybePop(context)),
                    ),
                    Container(
                      width: double.infinity,
                      constraints: BoxConstraints(minHeight: (constraints.maxHeight - heroHeight).clamp(0.0, double.infinity)),
                      padding: EdgeInsets.fromLTRB(24, 27, 24, 26 + MediaQuery.paddingOf(context).bottom),
                      decoration: BoxDecoration(
                        color: palette.surface,
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
                      ),
                      child: Align(
                        alignment: Alignment.topCenter,
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 440),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Row(
                                children: [
                                  const _StepBar(active: true),
                                  const SizedBox(width: 6),
                                  _StepBar(active: sent),
                                ],
                              ),
                              const SizedBox(height: 22),
                              LText(
                                'Saçakly’ye hoş geldiniz',
                                style: TextStyle(fontFamily: 'Gilroy', fontSize: 28, height: 1.1, fontWeight: FontWeight.w800, color: palette.text),
                              ),
                              const SizedBox(height: 9),
                              LText(
                                sent ? 'Telefonunuza gönderilen SMS kodunu girin' : 'Telefon numaranızla devam edin',
                                style: TextStyle(fontFamily: 'Gilroy', fontSize: 14, height: 1.4, color: palette.muted),
                              ),
                              const SizedBox(height: 28),
                              Row(
                                children: [
                                  LText(
                                    'Telefon',
                                    style: TextStyle(fontFamily: 'Gilroy', fontSize: 13, fontWeight: FontWeight.w700, color: palette.text),
                                  ),
                                  if (sent) ...[const Spacer(), TextButton(onPressed: widget.store.busy ? null : _changePhone, child: const LText('Değiştir'))],
                                ],
                              ),
                              const SizedBox(height: 8),
                              TextField(
                                controller: phone,
                                readOnly: sent,
                                keyboardType: TextInputType.number,
                                textInputAction: sent ? TextInputAction.next : TextInputAction.done,
                                autofillHints: const [AutofillHints.telephoneNumberNational],
                                inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(8)],
                                onSubmitted: (_) {
                                  if (!sent) _submit();
                                },
                                decoration: _fieldDecoration(palette, hint: '65000000', icon: AppIcons.phone, iconSize: 18, phonePrefix: true),
                              ),
                              AnimatedSize(
                                duration: motionDuration,
                                curve: Curves.easeOutCubic,
                                alignment: Alignment.topCenter,
                                child: sent
                                    ? Column(
                                        crossAxisAlignment: CrossAxisAlignment.stretch,
                                        children: [
                                          const SizedBox(height: 18),
                                          LText(
                                            'SMS kodu',
                                            style: TextStyle(fontFamily: 'Gilroy', fontSize: 13, fontWeight: FontWeight.w700, color: palette.text),
                                          ),
                                          const SizedBox(height: 8),
                                          TextField(
                                            controller: code,
                                            keyboardType: TextInputType.number,
                                            textInputAction: TextInputAction.done,
                                            autofillHints: const [AutofillHints.oneTimeCode],
                                            inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                                            onSubmitted: (_) => _submit(),
                                            decoration: _fieldDecoration(palette, hint: tr(context, 'SMS kodu'), icon: AppIcons.lock),
                                          ),
                                          Align(
                                            alignment: Alignment.centerRight,
                                            child: TextButton(onPressed: widget.store.busy ? null : _resendCode, child: const LText('Kodu yeniden gönder')),
                                          ),
                                          if (widget.store.devCode != null) ...[
                                            const SizedBox(height: 12),
                                            _MessageCard(icon: AppIcons.sms, background: palette.warm, foreground: palette.text, child: LText('Yerel test SMS kodu: ${widget.store.devCode}')),
                                          ],
                                        ],
                                      )
                                    : const SizedBox.shrink(),
                              ),
                              if (widget.store.offlinePreview) ...[
                                const SizedBox(height: 14),
                                _MessageCard(
                                  icon: AppIcons.wifiOff,
                                  background: palette.dangerTint,
                                  foreground: errorRed,
                                  child: const LText('Örnek menüde SMS girişi kapalı. Sunucuyu başlatıp yenileyin.'),
                                ),
                              ],
                              if (widget.store.error != null) ...[
                                const SizedBox(height: 14),
                                _MessageCard(icon: AppIcons.alert, background: palette.dangerTint, foreground: errorRed, child: LText(widget.store.error!)),
                              ],
                              const SizedBox(height: 18),
                              SizedBox(
                                width: double.infinity,
                                height: 48,
                                child: FilledButton(
                                  onPressed: widget.store.busy || widget.store.offlinePreview ? null : _submit,
                                  style: FilledButton.styleFrom(
                                    backgroundColor: brand,
                                    foregroundColor: onBrand,
                                    disabledBackgroundColor: palette.raised,
                                    disabledForegroundColor: palette.muted,
                                    padding: const EdgeInsets.symmetric(horizontal: 16),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
                                  ),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Center(
                                        child: Padding(
                                          padding: EdgeInsets.symmetric(horizontal: 8),
                                          child: LText(
                                            widget.store.busy
                                                ? 'Bekleyin…'
                                                : sent
                                                ? 'Kodu doğrula'
                                                : 'Kod gönder',
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(fontFamily: 'Gilroy', fontSize: 14, fontWeight: FontWeight.w800),
                                          ),
                                        ),
                                      ),
                                      Container(
                                        width: 20,
                                        height: 20,
                                        alignment: Alignment.center,
                                        decoration: BoxDecoration(shape: BoxShape.circle, color: widget.store.offlinePreview ? palette.border : onBrand),
                                        child: widget.store.busy
                                            ? const SizedBox(width: 15, height: 15, child: CircularProgressIndicator(strokeWidth: 2, color: brand))
                                            : sent
                                            ? HugeIcon(icon: AppIcons.check, color: widget.store.offlinePreview ? palette.muted : brand, size: 15)
                                            : Icon(IconlyLight.arrow_right_2, color: widget.store.offlinePreview ? palette.muted : brand, size: 12),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      );
    },
  );

  InputDecoration _fieldDecoration(AppPalette palette, {required String hint, required HugeIconData icon, double iconSize = 16, bool phonePrefix = false}) => InputDecoration(
    hintText: hint,
    filled: true,
    fillColor: palette.raised,
    prefixIcon: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 48,
          child: Center(
            child: SizedBox.square(
              dimension: iconSize + 2,
              child: HugeIcon(icon: icon, size: iconSize, color: palette.muted),
            ),
          ),
        ),
        if (phonePrefix)
          Text(
            '+993',
            style: TextStyle(fontFamily: 'Gilroy', fontSize: 16, fontWeight: FontWeight.w600, color: palette.text),
          ),
      ],
    ),
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 17),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(17),
      borderSide: BorderSide(color: palette.border),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(17),
      borderSide: BorderSide(color: palette.border),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(17),
      borderSide: const BorderSide(color: brand, width: 2),
    ),
  );
}

class _LoginHero extends StatelessWidget {
  const _LoginHero({required this.compact, required this.onBack});

  final bool compact;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) => SizedBox.expand(
    child: Stack(
      children: [
        Positioned.fill(
          child: Image.asset('assets/onboard_dark.png', fit: BoxFit.cover, alignment: Alignment.topCenter),
        ),
        const Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.transparent, Color(0xB8000000)], stops: [0.35, 1]),
            ),
          ),
        ),
        Positioned(
          top: MediaQuery.paddingOf(context).top + 10,
          left: 17,
          child: IconButton.filled(
            tooltip: tr(context, 'Geri'),
            style: IconButton.styleFrom(backgroundColor: Colors.white.withValues(alpha: 0.94), foregroundColor: onBrand, minimumSize: const Size(44, 44)),
            onPressed: onBack,
            icon: const HugeIcon(icon: AppIcons.back, size: 24),
          ),
        ),
        if (!compact)
          Positioned(
            left: 24,
            right: 24,
            bottom: 20,
            child: Row(
              children: [
                Container(
                  width: 49,
                  height: 49,
                  padding: const EdgeInsets.all(5),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(15)),
                  child: Image.asset('assets/logo_icon.png'),
                ),
                const SizedBox(width: 11),
                const Text(
                  'Saçakly',
                  style: TextStyle(fontFamily: 'Gilroy', color: Colors.white, fontSize: 23, fontWeight: FontWeight.w800),
                ),
              ],
            ),
          ),
      ],
    ),
  );
}

class _StepBar extends StatelessWidget {
  const _StepBar({required this.active});

  final bool active;

  @override
  Widget build(BuildContext context) => Expanded(
    child: AnimatedContainer(
      duration: MediaQuery.disableAnimationsOf(context) ? Duration.zero : const Duration(milliseconds: 240),
      height: 4,
      decoration: BoxDecoration(color: active ? brand : AppPalette.of(context).border, borderRadius: BorderRadius.circular(4)),
    ),
  );
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({required this.icon, required this.background, required this.foreground, required this.child});

  final HugeIconData icon;
  final Color background;
  final Color foreground;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(13),
    decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(14)),
    child: Row(
      children: [
        HugeIcon(icon: icon, size: 19, color: foreground),
        const SizedBox(width: 10),
        Expanded(
          child: DefaultTextStyle.merge(
            style: TextStyle(fontFamily: 'Gilroy', fontSize: 12, height: 1.35, color: foreground),
            child: child,
          ),
        ),
      ],
    ),
  );
}
