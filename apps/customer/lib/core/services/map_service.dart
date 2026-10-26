import 'dart:async';
import 'dart:convert';

import 'package:latlong2/latlong.dart';
import 'package:location/location.dart' as loc;

import '../network/api_client.dart';

const mapTileUrl = String.fromEnvironment(
  'MAP_TILE_URL',
  defaultValue: 'https://a7-tagam.com.tm/tile/{z}/{x}/{y}.png',
);
const ashgabatCenter = LatLng(37.9601, 58.3261);

class DeliveryPoint {
  const DeliveryPoint(this.position, this.address);
  final LatLng position;
  final String address;
}

class PlaceResult {
  const PlaceResult(this.position, this.label);
  final LatLng position;
  final String label;
}

class LocatedPoint {
  const LocatedPoint(this.position, {required this.approximate});
  final LatLng position;
  final bool approximate;
}

class MapService {
  MapService(this.api, {loc.Location? location})
    : _location = location ?? loc.Location();

  final Api api;
  final loc.Location _location;
  static const _fixKey = 'delivery.last_location_fix';

  LocatedPoint? _recentFix() {
    try {
      final raw = api.prefs.getString(_fixKey);
      if (raw == null) return null;
      final value = jsonDecode(raw) as Map<String, dynamic>;
      final recorded = DateTime.parse(value['recordedAt'] as String);
      if (DateTime.now().difference(recorded) > const Duration(minutes: 10)) {
        return null;
      }
      final lat = value['latitude'] as num;
      final lon = value['longitude'] as num;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
      return LocatedPoint(
        LatLng(lat.toDouble(), lon.toDouble()),
        approximate: true,
      );
    } catch (_) {
      return null;
    }
  }

  Future<LocatedPoint?> currentLocation() async {
    if (!await _location.serviceEnabled() &&
        !await _location.requestService()) {
      return null;
    }
    var permission = await _location.hasPermission();
    if (permission == loc.PermissionStatus.denied) {
      permission = await _location.requestPermission();
    }
    if (permission != loc.PermissionStatus.granted &&
        permission != loc.PermissionStatus.grantedLimited) {
      return null;
    }

    // Indoor GPS may not answer. Use the first valid stream/one-shot reading,
    // then switch to network positioning before the entire budget expires.
    final fix = Completer<loc.LocationData>();
    void offer(loc.LocationData data) {
      final lat = data.latitude;
      final lon = data.longitude;
      if (lat != null &&
          lon != null &&
          lat.isFinite &&
          lon.isFinite &&
          lat >= -90 &&
          lat <= 90 &&
          lon >= -180 &&
          lon <= 180 &&
          !fix.isCompleted) {
        final timestamp = data.time;
        if (timestamp != null &&
            DateTime.now()
                    .difference(
                      DateTime.fromMillisecondsSinceEpoch(timestamp.toInt()),
                    )
                    .abs() >
                const Duration(minutes: 2)) {
          return;
        }
        fix.complete(data);
      }
    }

    final stream = _location.onLocationChanged.listen(offer, onError: (_) {});
    try {
      await _location.changeSettings(accuracy: loc.LocationAccuracy.high);
      unawaited(_location.getLocation().then(offer, onError: (_) {}));
      loc.LocationData data;
      try {
        data = await fix.future.timeout(const Duration(seconds: 6));
      } on TimeoutException {
        await _location.changeSettings(accuracy: loc.LocationAccuracy.balanced);
        unawaited(_location.getLocation().then(offer, onError: (_) {}));
        data = await fix.future.timeout(const Duration(seconds: 8));
      }
      await api.prefs.setString(
        _fixKey,
        jsonEncode({
          'latitude': data.latitude,
          'longitude': data.longitude,
          'recordedAt': DateTime.now().toIso8601String(),
        }),
      );
      return LocatedPoint(
        LatLng(data.latitude!, data.longitude!),
        approximate: data.time == null || (data.accuracy ?? 0) > 100,
      );
    } on TimeoutException {
      return _recentFix();
    } catch (_) {
      return _recentFix();
    } finally {
      await stream.cancel();
    }
  }

  Future<String?> reverse(LatLng point) async {
    try {
      final response = asMap(
        await api.request(
          'GET',
          'geocoding/reverse',
          query: {'lat': point.latitude, 'lon': point.longitude},
        ),
      );
      final line = response['line'];
      return line is String && line.trim().isNotEmpty ? line.trim() : null;
    } catch (_) {
      return null;
    }
  }

  Future<List<PlaceResult>> search(String query) async {
    if (query.trim().length < 3) return [];
    final response = asMap(
      await api.request(
        'GET',
        'geocoding/search',
        auth: true,
        query: {'q': query.trim()},
      ),
    );
    return asList(response['items'])
        .map(
          (item) => PlaceResult(
            LatLng(
              (item['latitude'] as num).toDouble(),
              (item['longitude'] as num).toDouble(),
            ),
            '${item['label'] ?? ''}',
          ),
        )
        .where((item) => item.label.isNotEmpty)
        .toList();
  }
}
