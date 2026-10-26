import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/data/customer_store.dart';
import '../../core/l10n/app_language.dart';
import '../../core/l10n/localized_text.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_icons.dart';
import '../../core/theme/theme_controller.dart';
import '../../core/theme/theme_reveal.dart';
import '../auth/login_screen.dart';
import '../checkout/delivery_location_screen.dart';
import 'settings_screen.dart';
import 'widgets/about_app_dialog.dart';
import 'widgets/language_picker_sheet.dart';
import 'widgets/theme_picker.dart';

const _supportPhone = '+99362990344';

/// Elyeter's summary cards and grouped settings, adapted to Saçakly's actions.
class Profile extends StatefulWidget {
  const Profile(
    this.store, {
    required this.openOrders,
    this.showTitle = true,
    super.key,
  });

  final Store store;
  final VoidCallback openOrders;
  final bool showTitle;

  @override
  State<Profile> createState() => _ProfileState();
}

class _ProfileState extends State<Profile> {
  Map<String, dynamic>? _contacts;
  Map<String, dynamic>? _account;
  bool _wasSignedIn = false;
  int _accountRequest = 0;

  @override
  void initState() {
    super.initState();
    _wasSignedIn = widget.store.signedIn;
    widget.store.addListener(_onStoreChanged);
    _loadContacts();
    if (_wasSignedIn) _loadAccount();
  }

  @override
  void didUpdateWidget(covariant Profile oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.store == widget.store) return;
    oldWidget.store.removeListener(_onStoreChanged);
    widget.store.addListener(_onStoreChanged);
    _wasSignedIn = widget.store.signedIn;
    _account = null;
    ++_accountRequest;
    _loadContacts();
    if (_wasSignedIn) _loadAccount();
  }

  @override
  void dispose() {
    widget.store.removeListener(_onStoreChanged);
    super.dispose();
  }

  void _onStoreChanged() {
    final signedIn = widget.store.signedIn;
    if (signedIn == _wasSignedIn) return;
    _wasSignedIn = signedIn;
    _account = null;
    ++_accountRequest;
    if (signedIn) _loadAccount();
  }

  Future<void> _loadAccount() async {
    final request = ++_accountRequest;
    try {
      final account = asMap(
        await widget.store.api.request('GET', 'users/me', auth: true),
      );
      if (mounted && widget.store.signedIn && request == _accountRequest) {
        setState(() => _account = account);
      }
    } catch (_) {
      // The rest of the profile stays available while the API is offline.
    }
  }

  Future<void> _loadContacts() async {
    try {
      final contacts = asMap(await widget.store.api.request('GET', 'contacts'));
      if (mounted) setState(() => _contacts = contacts);
    } catch (_) {
      // Only links supplied by the server are shown.
    }
  }

  void _login() => Navigator.push(
    context,
    MaterialPageRoute(builder: (_) => Login(widget.store)),
  );

  Future<void> _openLink(String value) async {
    final uri = Uri.tryParse(value);
    if (uri == null) return;
    var opened = false;
    try {
      opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      opened = false;
    }
    if (!opened && mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: LText('Bağlantı açılamadı.')));
    }
  }

  void _openLocation() => Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => DeliveryLocationScreen(api: widget.store.api),
    ),
  );

  void _openSettings() => Navigator.push(
    context,
    MaterialPageRoute(builder: (_) => const SettingsScreen()),
  );

  void _showAbout() => showDialog<void>(
    context: context,
    builder: (_) => const AboutAppDialog(),
  );

  Future<void> _setLanguage(AppLanguage language, String code) async {
    final changed = language.code != code;
    await language.setCode(code);
    if (changed && widget.store.signedIn && widget.store.push != null) {
      unawaited(widget.store.push!.register());
    }
  }

  void _changeTheme(ThemeMode next) {
    final controller = ThemeScope.maybeOf(context);
    if (controller == null) return;
    void change() => controller.setMode(next);
    final reveal = ThemeReveal.maybeOf(context);
    if (reveal == null) {
      change();
    } else {
      unawaited(reveal.run(change));
    }
  }

  void _chooseLanguage() {
    final language = AppLanguageScope.maybeOf(context);
    if (language == null) return;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppPalette.of(context).surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      clipBehavior: Clip.antiAlias,
      builder: (_) => LanguagePickerSheet(
        language: language,
        onSelect: (code) => _setLanguage(language, code),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = widget.store.signedIn;
    final language = AppLanguageScope.maybeOf(context);
    final languageFlag = switch (language?.code) {
      'ru' => 'ru',
      'en' => 'gb',
      _ => 'tm',
    };
    final phone = _account?['phone']?.toString().trim() ?? '';
    final name = [
      _account?['firstName']?.toString().trim() ?? '',
      _account?['lastName']?.toString().trim() ?? '',
    ].where((part) => part.isNotEmpty).join(' ');
    final displayName = name.isNotEmpty
        ? name
        : phone.isNotEmpty
        ? phone
        : 'Hesabım';
    final privacy = _contacts?['privacyLink']?.toString().trim() ?? '';
    final agreement = _contacts?['userAgreementLink']?.toString().trim() ?? '';

    return ColoredBox(
      color: AppPalette.of(context).canvas,
      child: ListView(
        padding: EdgeInsets.fromLTRB(
          16,
          20,
          16,
          128 + MediaQuery.paddingOf(context).bottom,
        ),
        children: [
          if (widget.showTitle) ...[
            LText(
              'Profilim',
              style: TextStyle(
                fontFamily: 'Gilroy',
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: AppPalette.of(context).text,
                height: 1.1,
              ),
            ),
            const SizedBox(height: 24),
          ],
          if (signedIn)
            Row(
              children: [
                Expanded(
                  child: _SummaryCard(
                    icon: AppIcons.user,
                    iconBackground: const Color(0xFFFFD7AE),
                    avatarText: name.isEmpty
                        ? null
                        : name
                              .split(RegExp(r'\s+'))
                              .take(2)
                              .map((part) => part[0].toUpperCase())
                              .join(),
                    title: displayName,
                    subtitle: name.isNotEmpty ? phone : 'Hesap bilgileri',
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _SummaryCard(
                    icon: AppIcons.orders,
                    iconBackground: brand,
                    title: 'Siparişlerim',
                    subtitle: 'Tüm siparişler',
                    onTap: widget.openOrders,
                  ),
                ),
              ],
            )
          else
            _GuestCard(onSignIn: _login),
          if (widget.store.offlinePreview) ...[
            const SizedBox(height: 12),
            _OfflineNote(
              onRetry: widget.store.busy ? null : widget.store.loadCafes,
            ),
          ],
          _SettingsSection(
            title: 'Tercihler',
            children: [
              if (language != null)
                _PreferenceBlock(
                  icon: AppIcons.language,
                  label: 'Dil',
                  child: LanguageSelector(
                    language: language,
                    onSelect: (code) => _setLanguage(language, code),
                  ),
                ),
              _PreferenceBlock(
                icon: AppIcons.settings,
                label: 'Tema',
                child: ThemePicker(
                  mode:
                      ThemeScope.maybeOf(context)?.mode ??
                      (Theme.of(context).brightness == Brightness.dark
                          ? ThemeMode.dark
                          : ThemeMode.light),
                  onChanged: _changeTheme,
                ),
              ),
            ],
          ),
          _SettingsSection(
            title: 'Genel',
            children: [
              _SettingsRow(
                icon: AppIcons.orders,
                label: 'Siparişlerim',
                onTap: widget.openOrders,
              ),
              _SettingsRow(
                icon: AppIcons.location,
                label: 'Haritada konum ara',
                onTap: _openLocation,
              ),
              _SettingsRow(
                icon: AppIcons.language,
                label: 'Dil',
                flagCode: languageFlag,
                flagLabel: language?.nativeName ?? 'Türkmençe',
                onTap: _chooseLanguage,
              ),
              _SettingsRow(
                icon: AppIcons.settings,
                label: 'Ayarlar',
                onTap: _openSettings,
              ),
            ],
          ),
          _SettingsSection(
            title: 'Diğer',
            children: [
              _SettingsRow(
                icon: AppIcons.info,
                label: 'Uygulama hakkında',
                onTap: _showAbout,
              ),
              if (agreement.isNotEmpty)
                _SettingsRow(
                  icon: AppIcons.listView,
                  label: 'Kullanım koşulları',
                  onTap: () => _openLink(agreement),
                ),
              if (privacy.isNotEmpty)
                _SettingsRow(
                  icon: AppIcons.checkCircle,
                  label: 'Gizlilik politikası',
                  onTap: () => _openLink(privacy),
                ),
            ],
          ),
          const SizedBox(height: 24),
          _SupportCard(
            phone: _supportPhone,
            onCall: () => _openLink('tel:$_supportPhone'),
          ),
          if (signedIn)
            _SettingsSection(
              title: 'Hesap',
              children: [
                _SettingsRow(
                  icon: AppIcons.signOut,
                  label: 'Çıkış yap',
                  onTap: widget.store.logout,
                ),
              ],
            ),
          const SizedBox(height: 26),
          Center(
            child: LText(
              'Sürüm 1.0.0',
              style: TextStyle(
                fontFamily: 'Gilroy',
                fontSize: 12,
                color: AppPalette.of(context).muted,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.icon,
    required this.iconBackground,
    required this.title,
    required this.subtitle,
    this.avatarText,
    this.onTap,
  });
  final HugeIconData icon;
  final Color iconBackground;
  final String title;
  final String subtitle;
  final String? avatarText;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: AppPalette.of(context).raised,
    borderRadius: BorderRadius.circular(22),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: SizedBox(
        height: 130,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: iconBackground,
                  borderRadius: BorderRadius.circular(
                    avatarText == null ? 14 : 22,
                  ),
                ),
                child: avatarText == null
                    ? HugeIcon(icon: icon, color: onBrand, size: 23)
                    : Text(
                        avatarText!,
                        style: const TextStyle(
                          fontFamily: 'Gilroy',
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: onBrand,
                        ),
                      ),
              ),
              const Spacer(),
              LText(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: 'Gilroy',
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: AppPalette.of(context).text,
                ),
              ),
              const SizedBox(height: 3),
              LText(
                subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontFamily: 'Gilroy',
                  fontSize: 12,
                  color: AppPalette.of(context).muted,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _GuestCard extends StatelessWidget {
  const _GuestCard({required this.onSignIn});
  final VoidCallback onSignIn;

  @override
  Widget build(BuildContext context) => Material(
    key: const ValueKey('guest-profile-card'),
    color: brand,
    borderRadius: BorderRadius.circular(22),
    clipBehavior: Clip.antiAlias,
    child: Stack(
      children: [
        Positioned(
          top: -48,
          right: -34,
          child: Container(
            width: 112,
            height: 112,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: onBrand.withValues(alpha: 0.10),
                width: 18,
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: onBrand,
                  borderRadius: BorderRadius.circular(13),
                ),
                child: const HugeIcon(
                  icon: AppIcons.user,
                  color: brand,
                  size: 21,
                ),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    LText(
                      'Misafir hesap',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontFamily: 'Gilroy',
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: onBrand,
                      ),
                    ),
                    SizedBox(height: 2),
                    LText(
                      'Siparişlerini takip et.',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontFamily: 'Gilroy',
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                        height: 1.25,
                        color: onBrand,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: onSignIn,
                style: FilledButton.styleFrom(
                  backgroundColor: onBrand,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(0, 40),
                  padding: const EdgeInsets.symmetric(horizontal: 9),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    LText(
                      'Giriş yap',
                      maxLines: 1,
                      style: TextStyle(
                        fontFamily: 'Gilroy',
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                    SizedBox(width: 3),
                    HugeIcon(icon: AppIcons.forward, color: brand, size: 14),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

class _SettingsSection extends StatelessWidget {
  const _SettingsSection({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(4, 26, 4, 9),
        child: LText(
          title,
          style: TextStyle(
            fontFamily: 'Gilroy',
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: AppPalette.of(context).muted,
          ),
        ),
      ),
      Material(
        color: AppPalette.of(context).raised,
        borderRadius: BorderRadius.circular(22),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0)
                Divider(
                  height: 2,
                  thickness: 2,
                  color: AppPalette.of(context).canvas,
                ),
              children[i],
            ],
          ],
        ),
      ),
    ],
  );
}

/// A labelled control that lives inside a settings section (language tiles,
/// theme switch) instead of opening another screen.
class _PreferenceBlock extends StatelessWidget {
  const _PreferenceBlock({
    required this.icon,
    required this.label,
    required this.child,
  });
  final HugeIconData icon;
  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(14, 14, 14, 16),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: brand,
                borderRadius: BorderRadius.circular(11),
              ),
              child: Center(
                child: HugeIcon(icon: icon, color: onBrand, size: 19),
              ),
            ),
            const SizedBox(width: 10),
            LText(
              label,
              style: TextStyle(
                fontFamily: 'Gilroy',
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: AppPalette.of(context).text,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        child,
      ],
    ),
  );
}

class _SettingsRow extends StatelessWidget {
  const _SettingsRow({
    required this.icon,
    required this.label,
    required this.onTap,
    this.flagCode,
    this.flagLabel,
  });
  final HugeIconData icon;
  final String label;
  final String? flagCode;
  final String? flagLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    child: Padding(
      padding: EdgeInsets.symmetric(
        horizontal: 17,
        vertical: flagCode == null ? 15 : 8.5,
      ),
      child: Row(
        children: [
          HugeIcon(icon: icon, color: AppPalette.of(context).muted, size: 21),
          const SizedBox(width: 14),
          Expanded(
            child: LText(
              label,
              style: TextStyle(
                fontFamily: 'Gilroy',
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppPalette.of(context).text,
              ),
            ),
          ),
          if (flagCode != null) ...[
            Container(
              key: const ValueKey('selected-language-flag-frame'),
              width: 34,
              height: 34,
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: AppPalette.of(context).border),
              ),
              child: ClipOval(
                child: SvgPicture.asset(
                  'assets/images/flags/$flagCode.svg',
                  key: const ValueKey('selected-language-flag'),
                  fit: BoxFit.cover,
                  semanticsLabel: flagLabel,
                ),
              ),
            ),
          ],
          if (flagCode == null)
            HugeIcon(
              icon: AppIcons.chevronRight,
              color: AppPalette.of(context).muted,
              size: 18,
            ),
        ],
      ),
    ),
  );
}

class _SupportCard extends StatelessWidget {
  const _SupportCard({required this.phone, required this.onCall});
  final String phone;
  final VoidCallback onCall;

  @override
  Widget build(BuildContext context) => Material(
    color: brand,
    borderRadius: BorderRadius.circular(22),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onCall,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const HugeIcon(
                icon: AppIcons.call,
                color: onBrand,
                size: 21,
              ),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const LText(
                    'Bir sorunuz mu var?',
                    style: TextStyle(
                      fontFamily: 'Gilroy',
                      fontSize: 12,
                      color: onBrand,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    phone,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontFamily: 'Gilroy',
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: onBrand,
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

class _OfflineNote extends StatelessWidget {
  const _OfflineNote({required this.onRetry});

  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(15),
    decoration: BoxDecoration(
      color: AppPalette.of(context).warm,
      borderRadius: BorderRadius.circular(16),
    ),
    child: Row(
      children: [
        Icon(
          Icons.wifi_off_rounded,
          color: AppPalette.of(context).text,
          size: 21,
        ),
        const SizedBox(width: 11),
        Expanded(
          child: LText(
            'Örnek menü açık. Hesap işlemleri için sunucuya bağlanın.',
            style: TextStyle(
              fontFamily: 'Gilroy',
              fontSize: 12,
              height: 1.35,
              color: AppPalette.of(context).text,
            ),
          ),
        ),
        TextButton(onPressed: onRetry, child: const LText('Yenile')),
      ],
    ),
  );
}
