import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Alarm pelanggaran ujian (khusus APK Android). Diputar lewat jalur suara ALARM dengan volume maksimum,
/// sehingga tetap berbunyi walau ponsel dalam mode senyap/getar. Di web tidak melakukan apa pun.
class AlarmUjian {
  AlarmUjian._();
  static const _kanal = MethodChannel('the_course/alarm');
  static bool _bunyi = false;
  static DateTime? _mulaiPada;

  /// Lama minimal alarm berbunyi agar pengawas sempat mendengar, walau siswa segera kembali.
  static const minimal = Duration(seconds: 6);

  static Future<void> mulai() async {
    if (kIsWeb || _bunyi) return;
    _bunyi = true;
    _mulaiPada = DateTime.now();
    try {
      await _kanal.invokeMethod<bool>('mulai');
    } catch (_) {}
  }

  /// Hentikan alarm; bila belum berbunyi selama [minimal], tunggu dulu sisanya.
  static Future<void> henti({bool segera = false}) async {
    if (kIsWeb || !_bunyi) return;
    if (!segera && _mulaiPada != null) {
      final sisa = minimal - DateTime.now().difference(_mulaiPada!);
      if (sisa > Duration.zero) await Future<void>.delayed(sisa);
    }
    _bunyi = false;
    _mulaiPada = null;
    try {
      await _kanal.invokeMethod<bool>('henti');
    } catch (_) {}
  }
}
