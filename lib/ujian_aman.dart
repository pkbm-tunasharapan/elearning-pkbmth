import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// v1.54.0: pengamanan ujian di APK Android.
/// - [aman]: FLAG_SECURE (layar ujian tidak bisa di-screenshot, direkam, atau dilihat di daftar aplikasi terbaru).
/// - [perangkat]: "ID perangkat|merek model"; satu siswa hanya boleh memakai satu perangkat per ujian.
/// - [layarTerbagi]: true bila aplikasi berjalan di layar terbagi / jendela mengambang.
class UjianAman {
  UjianAman._();
  static const _kanal = MethodChannel('the_course/ujian');
  static String? _id;

  static Future<void> aman(bool aktif) async {
    if (kIsWeb) return;
    try {
      await _kanal.invokeMethod<bool>('aman', {'aktif': aktif});
    } catch (_) {}
  }

  static Future<String> perangkat() async {
    if (_id != null) return _id!;
    var hasil = '';
    if (!kIsWeb) {
      try {
        hasil = await _kanal.invokeMethod<String>('perangkat') ?? '';
      } catch (_) {}
    }
    if (hasil.isEmpty || hasil.startsWith('|')) {
      // cadangan: ID acak yang disimpan aplikasi (hilang bila data aplikasi dihapus)
      try {
        final sp = await SharedPreferences.getInstance();
        var acak = sp.getString('uj_perangkat') ?? '';
        if (acak.isEmpty) {
          final r = Random.secure();
          acak = 'app-${List.generate(16, (_) => r.nextInt(16).toRadixString(16)).join()}';
          await sp.setString('uj_perangkat', acak);
        }
        hasil = '$acak|${hasil.startsWith('|') ? hasil.substring(1) : 'perangkat'}';
      } catch (_) {}
    }
    return _id = hasil;
  }

  static Future<bool> layarTerbagi() async {
    if (kIsWeb) return false;
    try {
      return await _kanal.invokeMethod<bool>('layarTerbagi') ?? false;
    } catch (_) {
      return false;
    }
  }
}
