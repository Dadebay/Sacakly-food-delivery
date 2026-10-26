import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Flutter does not ship tk Material/Cupertino strings. Supply the labels used
/// by this app; unoverridden framework labels retain Flutter's English text.
class TurkmenMaterialLocalizations extends DefaultMaterialLocalizations {
  const TurkmenMaterialLocalizations();

  static const LocalizationsDelegate<MaterialLocalizations> delegate =
      _TurkmenMaterialDelegate();

  @override
  String get backButtonTooltip => 'Yza';
  @override
  String get closeButtonTooltip => 'Ýap';
  @override
  String get clearButtonTooltip => 'Arassala';
  @override
  String get moreButtonTooltip => 'Has köp';
  @override
  String get searchFieldLabel => 'Gözleg';
  @override
  String get cancelButtonLabel => 'Ýatyr';
  @override
  String get closeButtonLabel => 'Ýap';
  @override
  String get continueButtonLabel => 'Dowam et';
  @override
  String get copyButtonLabel => 'Göçür';
  @override
  String get cutButtonLabel => 'Kes';
  @override
  String get pasteButtonLabel => 'Goý';
  @override
  String get selectAllButtonLabel => 'Hemmesini saýla';
  @override
  String get shareButtonLabel => 'Paýlaş';
  @override
  String get saveButtonLabel => 'Ýatda sakla';
  @override
  String get viewLicensesButtonLabel => 'Ygtyýarnamalary gör';
  @override
  String get licensesPageTitle => 'Ygtyýarnamalar';
}

class _TurkmenMaterialDelegate
    extends LocalizationsDelegate<MaterialLocalizations> {
  const _TurkmenMaterialDelegate();
  @override
  bool isSupported(Locale locale) => locale.languageCode == 'tk';
  @override
  Future<MaterialLocalizations> load(Locale locale) =>
      SynchronousFuture<MaterialLocalizations>(
        const TurkmenMaterialLocalizations(),
      );
  @override
  bool shouldReload(_TurkmenMaterialDelegate old) => false;
}

class TurkmenCupertinoLocalizations extends DefaultCupertinoLocalizations {
  const TurkmenCupertinoLocalizations();

  static const LocalizationsDelegate<CupertinoLocalizations> delegate =
      _TurkmenCupertinoDelegate();

  @override
  String get alertDialogLabel => 'Duýduryş';
  @override
  String get cutButtonLabel => 'Kes';
  @override
  String get copyButtonLabel => 'Göçür';
  @override
  String get pasteButtonLabel => 'Goý';
  @override
  String get clearButtonLabel => 'Arassala';
  @override
  String get selectAllButtonLabel => 'Hemmesini saýla';
  @override
  String get shareButtonLabel => 'Paýlaş';
  @override
  String get searchTextFieldPlaceholderLabel => 'Gözleg';
  @override
  String get modalBarrierDismissLabel => 'Ýap';
}

class _TurkmenCupertinoDelegate
    extends LocalizationsDelegate<CupertinoLocalizations> {
  const _TurkmenCupertinoDelegate();
  @override
  bool isSupported(Locale locale) => locale.languageCode == 'tk';
  @override
  Future<CupertinoLocalizations> load(Locale locale) =>
      SynchronousFuture<CupertinoLocalizations>(
        const TurkmenCupertinoLocalizations(),
      );
  @override
  bool shouldReload(_TurkmenCupertinoDelegate old) => false;
}
