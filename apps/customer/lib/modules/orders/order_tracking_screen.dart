import 'dart:async';

import 'package:flutter/material.dart';
import '../../core/l10n/localized_text.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:hugeicons/hugeicons.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/network/api_client.dart';
import '../../core/services/map_service.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_icons.dart';

class OrderTrackingScreen extends StatefulWidget {
  const OrderTrackingScreen({
    super.key,
    required this.api,
    required this.order,
  });
  final Api api;
  final Map<String, dynamic> order;

  @override
  State<OrderTrackingScreen> createState() => _OrderTrackingScreenState();
}

class _OrderTrackingScreenState extends State<OrderTrackingScreen> {
  final _map = MapController();
  late Map<String, dynamic> _order = widget.order;
  LatLng? _courier;
  List<LatLng> _route = [];
  int? _minutes;
  Timer? _poll;
  bool _loading = false;
  bool _mapReady = false;
  bool _fitted = false;
  String? _error;

  LatLng? get _destination => _point(_order, 'latitude', 'longitude');
  LatLng? get _branch => _point(_order, 'branchLatitude', 'branchLongitude');
  String get _status => '${_order['status'] ?? ''}';
  bool get _active => !{
    'DELIVERED',
    'CASH_RETURNED',
    'RECONCILED',
    'CANCELLED',
  }.contains(_status);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
    _poll = Timer.periodic(const Duration(seconds: 15), (_) {
      if (_active) _refresh();
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _map.dispose();
    super.dispose();
  }

  static LatLng? _point(
    Map<String, dynamic> data,
    String latKey,
    String lonKey,
  ) {
    final lat = data[latKey];
    final lon = data[lonKey];
    if (lat is! num ||
        lon is! num ||
        !lat.toDouble().isFinite ||
        !lon.toDouble().isFinite ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180) {
      return null;
    }
    return LatLng(lat.toDouble(), lon.toDouble());
  }

  Future<void> _refresh() async {
    if (_loading) return;
    setState(() => _loading = true);
    try {
      final id = '${widget.order['id']}';
      final order = asMap(
        await widget.api.request('GET', 'orders/$id', auth: true),
      );
      LatLng? courier;
      var route = <LatLng>[];
      int? minutes;
      if (order['status'] == 'OUT_FOR_DELIVERY') {
        // Customer order ownership is enforced independently by both endpoints.
        try {
          final location = asMap(
            await widget.api.request(
              'GET',
              'tracking/orders/$id/courier-location',
              auth: true,
            ),
          );
          if (location['location'] is Map) {
            final value = asMap(location['location']);
            final recorded = DateTime.tryParse('${value['recordedAt']}');
            if (recorded != null &&
                DateTime.now().difference(recorded).inSeconds <= 90) {
              courier = _point(value, 'latitude', 'longitude');
            }
          }
        } catch (_) {
          // Order status still updates when live tracking is temporarily down.
        }
        if (courier != null) {
          try {
            final result = asMap(
              await widget.api.request(
                'GET',
                'tracking/orders/$id/route',
                auth: true,
              ),
            );
            if (result['routingStatus'] == 'READY' &&
                result['geometry'] is Map) {
              final geometry = asMap(result['geometry']);
              final coordinates = geometry['coordinates'];
              if (coordinates is List) {
                route = coordinates
                    .whereType<List>()
                    .where(
                      (pair) =>
                          pair.length >= 2 && pair[0] is num && pair[1] is num,
                    )
                    .map(
                      (pair) => LatLng(
                        (pair[1] as num).toDouble(),
                        (pair[0] as num).toDouble(),
                      ),
                    )
                    .toList();
              }
              if (result['durationSeconds'] is num) {
                minutes = ((result['durationSeconds'] as num) / 60).ceil();
              }
            }
          } catch (_) {
            // The location remains useful when the road router is offline.
          }
        }
      }
      if (!mounted) return;
      final newCourier = _courier == null && courier != null;
      final newRoute = _route.isEmpty && route.isNotEmpty;
      setState(() {
        _order = order;
        _courier = courier;
        _route = route;
        _minutes = minutes;
        _error = null;
      });
      if (!_fitted || newCourier || newRoute) {
        WidgetsBinding.instance.addPostFrameCallback((_) => _fit());
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Takip bilgileri yenilenemedi';
          _courier = null;
          _route = [];
          _minutes = null;
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _fit() {
    if (!mounted || !_mapReady) return;
    final points = [
      ..._route,
      ?_courier,
      ?_destination,
      if (_branch != null && _courier == null) _branch!,
    ];
    if (points.length >= 2) {
      _map.fitCamera(
        CameraFit.bounds(
          bounds: LatLngBounds.fromPoints(points),
          padding: const EdgeInsets.fromLTRB(42, 135, 42, 335),
        ),
      );
    } else if (points.length == 1) {
      _map.move(points.first, 15);
    }
    _fitted = true;
  }

  Future<void> _callCourier() async {
    final courier = _order['courier'];
    if (courier is! Map || courier['phone'] is! String) return;
    final phone = (courier['phone'] as String).trim();
    if (phone.isEmpty) return;
    final uri = Uri(scheme: 'tel', path: phone);
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  @override
  Widget build(BuildContext context) {
    final courier = _order['courier'];
    final courierData = courier is Map ? asMap(courier) : <String, dynamic>{};
    final name = [
      courierData['firstName'],
      courierData['lastName'],
    ].whereType<String>().where((part) => part.trim().isNotEmpty).join(' ');
    final eta = _minutes != null && _minutes! > 0
        ? 'Yaklaşık $_minutes dk'
        : _status == 'OUT_FOR_DELIVERY'
        ? 'Teslimat süresi hesaplanıyor'
        : _status == 'DELIVERED'
        ? 'Sipariş teslim edildi'
        : 'Siparişiniz hazırlanıyor';
    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(
            child: FlutterMap(
              mapController: _map,
              options: MapOptions(
                initialCenter: _destination ?? ashgabatCenter,
                initialZoom: 14,
                minZoom: 5,
                maxZoom: 19,
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                ),
                onMapReady: () {
                  _mapReady = true;
                  _fit();
                },
              ),
              children: [
                TileLayer(
                  urlTemplate: mapTileUrl,
                  userAgentPackageName: 'tm.sacakly.customer',
                ),
                if (_route.length >= 2)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: _route,
                        strokeWidth: 9,
                        color: AppPalette.of(context).surface,
                        strokeCap: StrokeCap.round,
                        strokeJoin: StrokeJoin.round,
                      ),
                      Polyline(
                        points: _route,
                        strokeWidth: 5,
                        color: const Color(0xFF158B4B),
                        strokeCap: StrokeCap.round,
                        strokeJoin: StrokeJoin.round,
                      ),
                    ],
                  ),
                MarkerLayer(
                  markers: [
                    if (_branch != null)
                      Marker(
                        point: _branch!,
                        width: 42,
                        height: 42,
                        child: const _MapMarker(
                          AppIcons.restaurant,
                          Color(0xFFF8C444),
                        ),
                      ),
                    if (_destination != null)
                      Marker(
                        point: _destination!,
                        width: 46,
                        height: 46,
                        child: const _MapMarker(
                          AppIcons.home,
                          Color(0xFF18884C),
                        ),
                      ),
                    if (_courier != null)
                      Marker(
                        point: _courier!,
                        width: 46,
                        height: 46,
                        child: const _MapMarker(
                          AppIcons.courier,
                          Color(0xFF20201F),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Row(
                children: [
                  _MapCircle(
                    icon: AppIcons.back,
                    onTap: () => Navigator.pop(context),
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Container(
                      height: 48,
                      padding: const EdgeInsets.symmetric(horizontal: 15),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(26),
                        boxShadow: const [
                          BoxShadow(color: Color(0x16000000), blurRadius: 15),
                        ],
                      ),
                      child: Row(
                        children: [
                          HugeIcon(
                            icon: AppIcons.location,
                            size: 19,
                            color: AppPalette.of(context).muted,
                          ),
                          const SizedBox(width: 9),
                          Expanded(
                            child: LText(
                              '${_order['address'] ?? 'Teslimat adresi'}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 13,
                                color: AppPalette.of(context).text,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          Positioned(
            right: 18,
            bottom: 267 + MediaQuery.paddingOf(context).bottom,
            child: _MapCircle(icon: AppIcons.centerFocus, onTap: _fit),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              width: double.infinity,
              padding: EdgeInsets.fromLTRB(
                22,
                18,
                22,
                18 + MediaQuery.paddingOf(context).bottom,
              ),
              decoration: BoxDecoration(
                color: AppPalette.of(context).surface,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(30),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Color(0x17000000),
                    blurRadius: 25,
                    offset: Offset(0, -5),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  LText(
                    eta,
                    style: const TextStyle(
                      fontFamily: 'Gilroy',
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 5),
                  LText(
                    _error ??
                        (_status == 'OUT_FOR_DELIVERY'
                            ? _courier == null
                                  ? 'Kurye konumu bekleniyor'
                                  : _route.isEmpty
                                  ? 'Kurye yolda · yol rotası bekleniyor'
                                  : 'Siparişiniz size doğru yola çıktı'
                            : 'Sipariş #${_order['number'] ?? ''} · ${_statusText(_status)}'),
                    style: TextStyle(
                      color: AppPalette.of(context).muted,
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 17),
                  Divider(height: 1, color: AppPalette.of(context).border),
                  const SizedBox(height: 15),
                  _ProgressRow(status: _status),
                  const SizedBox(height: 15),
                  Divider(height: 1, color: AppPalette.of(context).border),
                  const SizedBox(height: 15),
                  Row(
                    children: [
                      Container(
                        width: 43,
                        height: 43,
                        decoration: const BoxDecoration(
                          color: Color(0xFFE7F3EA),
                          shape: BoxShape.circle,
                        ),
                        child: const HugeIcon(
                          icon: AppIcons.courier,
                          size: 23,
                          color: Color(0xFF18884C),
                        ),
                      ),
                      const SizedBox(width: 11),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            LText(
                              name.isEmpty ? 'Kurye atanmayı bekliyor' : name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontFamily: 'Gilroy',
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 3),
                            LText(
                              'Sipariş #${_order['number'] ?? ''}',
                              style: TextStyle(
                                color: AppPalette.of(context).muted,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (courierData['phone'] is String &&
                          (courierData['phone'] as String).isNotEmpty)
                        _MapCircle(icon: AppIcons.call, onTap: _callCourier),
                      if (_loading)
                        const Padding(
                          padding: EdgeInsets.only(left: 8),
                          child: SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 9),
                  LText(
                    '© OpenStreetMap contributors',
                    style: TextStyle(
                      color: AppPalette.of(context).muted,
                      fontSize: 10,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _statusText(String status) => switch (status) {
    'COOKING' => 'Hazırlanıyor',
    'READY' => 'Hazır',
    'ASSIGNED_TO_COURIER' => 'Kurye atandı',
    'DELIVERED' || 'CASH_RETURNED' || 'RECONCILED' => 'Teslim edildi',
    'CANCELLED' => 'İptal edildi',
    _ => 'Sipariş alındı',
  };
}

class _ProgressRow extends StatelessWidget {
  const _ProgressRow({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final stage = switch (status) {
      'DELIVERED' || 'CASH_RETURNED' || 'RECONCILED' => 3,
      'OUT_FOR_DELIVERY' => 2,
      'ASSIGNED_TO_COURIER' || 'READY' => 1,
      _ => 0,
    };
    return Row(
      children: [
        _stage(context, AppIcons.orders, stage >= 0),
        _line(context, stage >= 1),
        _stage(context, AppIcons.restaurant, stage >= 1),
        _line(context, stage >= 2),
        _stage(context, AppIcons.courier, stage >= 2),
        _line(context, stage >= 3),
        _stage(context, AppIcons.checkCircle, stage >= 3),
      ],
    );
  }

  Widget _stage(
    BuildContext context,
    HugeIconData icon,
    bool active,
  ) => Container(
    width: 34,
    height: 34,
    decoration: BoxDecoration(
      color: active ? const Color(0xFFE8F5EB) : AppPalette.of(context).raised,
      shape: BoxShape.circle,
    ),
    child: HugeIcon(
      icon: icon,
      size: 18,
      color: active ? const Color(0xFF18884C) : AppPalette.of(context).muted,
    ),
  );

  Widget _line(BuildContext context, bool active) => Expanded(
    child: Container(
      height: 2,
      margin: const EdgeInsets.symmetric(horizontal: 5),
      color: active ? const Color(0xFF18884C) : AppPalette.of(context).border,
    ),
  );
}

class _MapCircle extends StatelessWidget {
  const _MapCircle({required this.icon, required this.onTap});
  final HugeIconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
    color: AppPalette.of(context).surface,
    elevation: 4,
    shadowColor: Colors.black12,
    shape: const CircleBorder(),
    child: InkWell(
      customBorder: const CircleBorder(),
      onTap: onTap,
      child: SizedBox(
        width: 46,
        height: 46,
        child: HugeIcon(
          icon: icon,
          size: 20,
          color: AppPalette.of(context).text,
        ),
      ),
    ),
  );
}

class _MapMarker extends StatelessWidget {
  const _MapMarker(this.icon, this.color);
  final HugeIconData icon;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: color,
      shape: BoxShape.circle,
      border: Border.all(color: Colors.white, width: 3),
      boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 9)],
    ),
    child: HugeIcon(icon: icon, size: 22, color: Colors.white),
  );
}
