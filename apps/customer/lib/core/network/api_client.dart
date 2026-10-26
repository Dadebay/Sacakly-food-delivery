import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Local API URL can be overridden for a physical device with --dart-define.
const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://127.0.0.1:4000/api/v1/',
);

class Api {
  Api(this.prefs)
    : dio = Dio(
        BaseOptions(
          baseUrl: apiBaseUrl.endsWith('/') ? apiBaseUrl : '$apiBaseUrl/',
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 20),
        ),
      );

  final SharedPreferences prefs;
  final Dio dio;
  String? get accessToken => prefs.getString('access_token');
  String? get refreshToken => prefs.getString('refresh_token');

  Future<dynamic> request(
    String method,
    String path, {
    Object? data,
    Map<String, dynamic>? query,
    bool auth = false,
    bool canRefresh = true,
  }) async {
    final started = DateTime.now();
    final logPath = path.startsWith('notifications/devices/')
        ? 'notifications/devices/:token'
        : path;
    try {
      final response = await dio.request<dynamic>(
        path,
        data: data,
        queryParameters: query,
        options: Options(
          method: method,
          headers: {
            if (auth && accessToken != null)
              'Authorization': 'Bearer $accessToken',
          },
        ),
      );
      if (kDebugMode) {
        debugPrint(
          '🟢 API $method $logPath → ${response.statusCode} '
          '${DateTime.now().difference(started).inMilliseconds}ms',
        );
      }
      return response.data;
    } on DioException catch (error) {
      if (kDebugMode) {
        debugPrint(
          '🔴 API $method $logPath → ${error.response?.statusCode ?? 'network'} '
          '${DateTime.now().difference(started).inMilliseconds}ms',
        );
      }
      if (auth &&
          canRefresh &&
          error.response?.statusCode == 401 &&
          refreshToken != null) {
        try {
          final response = await dio.post<Map<String, dynamic>>(
            'auth/refresh',
            data: {'refreshToken': refreshToken},
          );
          await saveSession(response.data!);
          return request(
            method,
            path,
            data: data,
            query: query,
            auth: auth,
            canRefresh: false,
          );
        } on DioException {
          await clearSession();
        }
      }
      final body = error.response?.data;
      final message = body is Map ? body['message'] : null;
      throw ApiError(
        error.response?.statusCode,
        error.response == null
            ? 'Sunucuya bağlanılamadı. API adresini ve sunucuyu kontrol edin.'
            : message is List
            ? message.join('; ')
            : (message?.toString() ?? 'İstek başarısız oldu'),
      );
    }
  }

  Future<void> saveSession(Map<String, dynamic> session) async {
    await prefs.setString('access_token', session['accessToken'] as String);
    await prefs.setString('refresh_token', session['refreshToken'] as String);
  }

  Future<void> clearSession() async {
    final token = refreshToken;
    if (token != null) {
      try {
        await dio.post<dynamic>(
          'auth/logout',
          data: {'refreshToken': token},
          options: Options(
            headers: {
              if (accessToken != null) 'Authorization': 'Bearer $accessToken',
            },
          ),
        );
      } catch (_) {
        // Local credentials must still be cleared if the server is offline.
      }
    }
    await prefs.remove('access_token');
    await prefs.remove('refresh_token');
  }
}

class ApiError implements Exception {
  const ApiError(this.status, this.message);
  final int? status;
  final String message;
  @override
  String toString() => message;
}

Map<String, dynamic> asMap(dynamic value) =>
    Map<String, dynamic>.from(value as Map);
List<Map<String, dynamic>> asList(dynamic value) =>
    (value as List).map(asMap).toList();

String? mediaUrl(dynamic path) {
  if (path is! String || path.isEmpty) return null;
  if (path.startsWith('asset://')) return path;
  if (path.startsWith('http')) return path;
  final origin = Uri.parse(apiBaseUrl).origin;
  return '$origin${path.startsWith('/') ? '' : '/'}$path';
}
