import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api.dart';

/// Sesi siswa (login nama + kata sandi TH-ddmmyyyy). Terpisah dari sesi staf.
class SesiSiswa extends ChangeNotifier {
  SesiSiswa._();
  static final SesiSiswa instance = SesiSiswa._();

  static const _kunci = 'siswaSesi';

  Map<String, dynamic> data = {};
  bool siap = false;

  bool get masuk => teks(data['nama']).isNotEmpty && teks(data['idRombel']).isNotEmpty;
  String get nama => teks(data['nama']);
  String get idRombel => teks(data['idRombel']);
  String get namaRombel => teks(data['namaRombel']);
  String get token => teks(data['sesi']);
  List<Map<String, dynamic>> get mapel => daftar(data['daftarMapel']).map(peta).toList();

  /// Kode akses ujian disimpan di HP agar tidak perlu diketik ulang tiap ujian.
  String kodeAkses = '';

  Future<void> muat() async {
    try {
      final sp = await SharedPreferences.getInstance();
      kodeAkses = sp.getString('siswaKode') ?? '';
      final mentah = sp.getString(_kunci);
      if (mentah != null) {
        final simpan = peta(jsonDecode(mentah));
        data = simpan;
        // Segarkan dari server (daftar mapel terbaru); bila sesi kedaluwarsa tetap pakai data lokal.
        if (teks(simpan['sesi']).isNotEmpty) {
          try {
            final r = peta(await Api.instance('waPulihSesiSiswa', [teks(simpan['sesi'])]));
            if (r['sukses'] == true) {
              data = r;
              await sp.setString(_kunci, jsonEncode(r));
            }
          } catch (_) {}
        }
      }
    } finally {
      siap = true;
      notifyListeners();
    }
  }

  /// Mengembalikan pesan galat, atau null bila berhasil.
  Future<String?> masukSiswa(String nama, String kataSandi) async {
    final r = peta(await Api.instance('waLogin', [nama.trim(), kataSandi.trim().toUpperCase()]));
    if (r['sukses'] != true) return teks(r['pesan'], 'Nama atau kata sandi tidak cocok.');
    data = r;
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_kunci, jsonEncode(r));
    notifyListeners();
    return null;
  }

  Future<void> simpanKode(String k) async {
    kodeAkses = k.trim().toUpperCase();
    final sp = await SharedPreferences.getInstance();
    await sp.setString('siswaKode', kodeAkses);
  }

  Future<void> keluar() async {
    final t = token;
    data = {};
    final sp = await SharedPreferences.getInstance();
    await sp.remove(_kunci);
    notifyListeners();
    if (t.isNotEmpty) {
      try {
        await Api.instance('waKeluarSiswa', [t]);
      } catch (_) {}
    }
  }
}
