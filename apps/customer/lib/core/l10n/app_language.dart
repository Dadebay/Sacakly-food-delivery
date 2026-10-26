import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The customer's explicit language choice. A fresh install opens in Turkmen.
class AppLanguage extends ChangeNotifier {
  AppLanguage(this._prefs) : _code = savedCode(_prefs);

  static const preferenceKey = 'customer.language';
  static const supportedLocales = [Locale('tk'), Locale('ru'), Locale('en')];
  static bool _supported(String? code) =>
      code == 'tk' || code == 'ru' || code == 'en';
  static String savedCode(SharedPreferences prefs) {
    final code = prefs.getString(preferenceKey);
    return _supported(code) ? code! : 'tk';
  }

  final SharedPreferences _prefs;
  String _code;
  String get code => _code;
  Locale get locale => Locale(_code);
  String get nativeName => switch (_code) {
    'ru' => 'Русский',
    'en' => 'English',
    _ => 'Türkmençe',
  };

  Future<void> setCode(String code) async {
    if (!_supported(code) || code == _code) return;
    await _prefs.setString(preferenceKey, code);
    _code = code;
    notifyListeners();
  }
}

class AppLanguageScope extends InheritedNotifier<AppLanguage> {
  const AppLanguageScope({
    required AppLanguage language,
    required super.child,
    super.key,
  }) : super(notifier: language);

  static AppLanguage? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppLanguageScope>()?.notifier;
}
