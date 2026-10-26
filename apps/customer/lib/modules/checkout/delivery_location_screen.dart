import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/l10n/localized_text.dart';
import '../../core/network/api_client.dart';
import '../../core/services/map_service.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_icons.dart';

class DeliveryLocationScreen extends StatefulWidget {
  const DeliveryLocationScreen({super.key, required this.api, this.initial});

  final Api api;
  final DeliveryPoint? initial;

  @override
  State<DeliveryLocationScreen> createState() => _DeliveryLocationScreenState();
}

class _DeliveryLocationScreenState extends State<DeliveryLocationScreen> {
  final _map = MapController();
  final _search = TextEditingController();
  final _address = TextEditingController();
  late final MapService _service = MapService(widget.api);
  late LatLng _point = widget.initial?.position ?? ashgabatCenter;
  List<PlaceResult> _results = [];
  Timer? _reverseDelay;
  int _lookup = 0;
  bool _locating = false;
  bool _searching = false;
  bool _resolving = false;
  bool _dragging = false;

  @override
  void initState() {
    super.initState();
    _address.text = widget.initial?.address ?? '';
    if (widget.initial == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _findMe());
    }
  }

  @override
  void dispose() {
    _reverseDelay?.cancel();
    _search.dispose();
    _address.dispose();
    _map.dispose();
    super.dispose();
  }

  Future<void> _findMe() async {
    if (_locating) return;
    setState(() => _locating = true);
    LocatedPoint? found;
    try {
      found = await _service.currentLocation();
    } catch (_) {
      found = null;
    }
    if (!mounted) return;
    setState(() => _locating = false);
    if (found == null) {
      _notice(
        'Konum bulunamadı. Haritada pini taşıyarak adres seçebilirsiniz.',
      );
      return;
    }
    _map.move(found.position, 16);
    _point = found.position;
    unawaited(_reverse(found.position));
    if (found.approximate) {
      _notice(
        'Konum yaklaşık bulundu. Teslimat noktasını haritada kontrol edin.',
      );
    }
  }

  void _onMoved(MapCamera camera, bool gesture) {
    _point = camera.center;
    if (!gesture) return;
    if (!_dragging) setState(() => _dragging = true);
    _reverseDelay?.cancel();
    final point = camera.center;
    _reverseDelay = Timer(const Duration(milliseconds: 550), () {
      if (!mounted) return;
      setState(() => _dragging = false);
      unawaited(_reverse(point));
    });
  }

  Future<void> _reverse(LatLng point) async {
    final lookup = ++_lookup;
    setState(() {
      _resolving = true;
      _address.clear();
    });
    final line = await _service.reverse(point);
    if (!mounted ||
        lookup != _lookup ||
        (point.latitude - _point.latitude).abs() > 1e-8 ||
        (point.longitude - _point.longitude).abs() > 1e-8) {
      return;
    }
    setState(() {
      _resolving = false;
      if (line != null) _address.text = line;
    });
  }

  Future<void> _runSearch() async {
    final query = _search.text.trim();
    if (query.length < 3) {
      _notice('Aramak için en az 3 karakter yazın.');
      return;
    }
    setState(() => _searching = true);
    try {
      final results = await _service.search(query);
      if (!mounted) return;
      setState(() => _results = results);
      if (results.isEmpty) _notice('Bu adrese uygun yer bulunamadı.');
    } catch (_) {
      if (mounted) _notice('Adres araması şu anda kullanılamıyor.');
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  void _choose(PlaceResult place) {
    ++_lookup;
    _reverseDelay?.cancel();
    _map.move(place.position, 16);
    setState(() {
      _point = place.position;
      _address.text = place.label;
      _results = [];
      _resolving = false;
    });
    FocusScope.of(context).unfocus();
  }

  void _notice(String message) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: LText(message)));

  @override
  Widget build(BuildContext context) {
    final keyboard = MediaQuery.viewInsetsOf(context).bottom > 0;
    return Scaffold(
      resizeToAvoidBottomInset: false,
      body: Stack(
        children: [
          Positioned.fill(
            child: FlutterMap(
              mapController: _map,
              options: MapOptions(
                initialCenter: _point,
                initialZoom: 15,
                minZoom: 5,
                maxZoom: 19,
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                ),
                onPositionChanged: _onMoved,
                onTap: (_, _) => FocusScope.of(context).unfocus(),
              ),
              children: [
                TileLayer(
                  urlTemplate: mapTileUrl,
                  userAgentPackageName: 'tm.sacakly.customer',
                ),
              ],
            ),
          ),
          Center(
            child: IgnorePointer(
              child: AnimatedSlide(
                duration: const Duration(milliseconds: 180),
                offset: _dragging ? const Offset(0, -0.18) : Offset.zero,
                child: const Padding(
                  padding: EdgeInsets.only(bottom: 40),
                  child: HugeIcon(
                    icon: AppIcons.location,
                    size: 32,
                    color: Color(0xFF167B4F),
                  ),
                ),
              ),
            ),
          ),
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Column(
                children: [
                  Row(
                    children: [
                      _RoundControl(
                        icon: AppIcons.back,
                        onTap: () => Navigator.pop(context),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Material(
                          elevation: 5,
                          shadowColor: Colors.black12,
                          borderRadius: BorderRadius.circular(28),
                          child: TextField(
                            controller: _search,
                            textInputAction: TextInputAction.search,
                            onSubmitted: (_) => _runSearch(),
                            decoration: InputDecoration(
                              hintText: tr(context, 'Adres veya yer ara'),
                              prefixIcon: const Center(
                                widthFactor: 1,
                                heightFactor: 1,
                                child: HugeIcon(
                                  key: ValueKey('location-search-icon'),
                                  icon: AppIcons.search,
                                  size: 15,
                                ),
                              ),
                              prefixIconConstraints: const BoxConstraints(
                                minWidth: 42,
                                minHeight: 42,
                              ),
                              suffixIcon: _searching
                                  ? const Padding(
                                      padding: EdgeInsets.all(14),
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    )
                                  : null,
                              filled: true,
                              fillColor: AppPalette.of(context).surface,
                              border: OutlineInputBorder(
                                borderSide: BorderSide.none,
                                borderRadius: BorderRadius.circular(28),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                vertical: 14,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (_results.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(left: 52, top: 8),
                      child: Material(
                        color: AppPalette.of(context).surface,
                        elevation: 6,
                        borderRadius: BorderRadius.circular(18),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxHeight: 245),
                          child: ListView.builder(
                            shrinkWrap: true,
                            itemCount: _results.length,
                            itemBuilder: (_, index) => ListTile(
                              leading: const HugeIcon(
                                icon: AppIcons.location,
                                size: 16,
                              ),
                              title: Text(
                                _results[index].label,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              onTap: () => _choose(_results[index]),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          if (!keyboard)
            Positioned(
              right: 18,
              bottom: 252 + MediaQuery.paddingOf(context).bottom,
              child: _RoundControl(
                icon: AppIcons.gps,
                loading: _locating,
                onTap: _findMe,
              ),
            ),
          Positioned(
            left: 0,
            right: 0,
            bottom: keyboard ? MediaQuery.viewInsetsOf(context).bottom : 0,
            child: Container(
              width: double.infinity,
              padding: EdgeInsets.fromLTRB(
                20,
                17,
                20,
                keyboard ? 8 : 18 + MediaQuery.paddingOf(context).bottom,
              ),
              decoration: BoxDecoration(
                color: AppPalette.of(context).surface,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(28),
                ),
                boxShadow: [
                  BoxShadow(color: Color(0x19000000), blurRadius: 24),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (!keyboard)
                    const LText(
                      'Teslimat konumu',
                      style: TextStyle(
                        fontFamily: 'Gilroy',
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  if (!keyboard) const SizedBox(height: 4),
                  if (!keyboard)
                    LText(
                      'Pini taşıyın veya adres arayın. Gerekirse adresi düzenleyin.',
                      style: TextStyle(
                        color: AppPalette.of(context).muted,
                        fontSize: 12,
                      ),
                    ),
                  if (!keyboard) const SizedBox(height: 12),
                  TextField(
                    controller: _address,
                    maxLength: 500,
                    onChanged: (_) => setState(() {
                      // Manual edits take precedence over a pending reverse lookup.
                      _reverseDelay?.cancel();
                      ++_lookup;
                      _resolving = false;
                      _dragging = false;
                    }),
                    decoration: InputDecoration(
                      labelText: tr(context, 'Açık adres'),
                      prefixIcon: const Center(
                        widthFactor: 1,
                        heightFactor: 1,
                        child: HugeIcon(
                          key: ValueKey('location-address-icon'),
                          icon: AppIcons.location,
                          size: 16,
                        ),
                      ),
                      prefixIconConstraints: const BoxConstraints(
                        minWidth: 42,
                        minHeight: 42,
                      ),
                      suffixIcon: _resolving
                          ? const Padding(
                              padding: EdgeInsets.all(14),
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : null,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed:
                          _address.text.trim().isEmpty ||
                              _resolving ||
                              _dragging
                          ? null
                          : () => Navigator.pop(
                              context,
                              DeliveryPoint(_point, _address.text.trim()),
                            ),
                      style: FilledButton.styleFrom(
                        backgroundColor: brand,
                        foregroundColor: onBrand,
                        padding: const EdgeInsets.symmetric(vertical: 15),
                      ),
                      child: const LText(
                        'Bu konumu kullan',
                        style: TextStyle(
                          fontFamily: 'Gilroy',
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Positioned(
            left: 14,
            bottom: keyboard
                ? MediaQuery.viewInsetsOf(context).bottom + 205
                : 252 + MediaQuery.paddingOf(context).bottom,
            child: Material(
              color: AppPalette.of(context).surface.withValues(alpha: 0.82),
              borderRadius: BorderRadius.circular(5),
              child: InkWell(
                borderRadius: BorderRadius.circular(5),
                onTap: () => launchUrl(
                  Uri.parse('https://www.openstreetmap.org/copyright'),
                  mode: LaunchMode.externalApplication,
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 3,
                  ),
                  child: Text(
                    '© OpenStreetMap',
                    style: TextStyle(
                      fontSize: 10,
                      color: AppPalette.of(context).muted,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RoundControl extends StatelessWidget {
  const _RoundControl({
    required this.icon,
    required this.onTap,
    this.loading = false,
  });
  final HugeIconData icon;
  final VoidCallback onTap;
  final bool loading;
  @override
  Widget build(BuildContext context) => Material(
    color: AppPalette.of(context).surface,
    elevation: 5,
    shadowColor: Colors.black12,
    shape: const CircleBorder(),
    child: InkWell(
      customBorder: const CircleBorder(),
      onTap: loading ? null : onTap,
      child: SizedBox(
        width: 48,
        height: 48,
        child: Center(
          child: loading
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : HugeIcon(
                  icon: icon,
                  color: AppPalette.of(context).text,
                  size: 16,
                ),
        ),
      ),
    ),
  );
}
