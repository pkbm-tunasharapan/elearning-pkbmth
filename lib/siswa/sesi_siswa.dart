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

  /// v1.39.0: status PIN dari server {ada, perlu, wajib, reset, tenggat, sisaHari}.
  Map<String, dynamic> get pin => peta(data['pin']);
  bool get punyaPin => pin['ada'] == true;
  bool get wajibPin => pin['wajib'] == true;

  /// Membuat / mengganti PIN. Mengembalikan pesan galat, atau null bila berhasil.
  Future<String?> buatPin(String pinBaru, String pinLama) async {
    final r = peta(await Api.instance('waSiswaPinBuat', [token, pinBaru, pinLama]));
    if (r['sukses'] != true) return teks(r['pesan'], 'PIN belum tersimpan. Coba lagi.');
    data = {...data, 'pin': peta(r['pin'])};
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_kunci, jsonEncode(data));
    notifyListeners();
    return null;
  }

  /// Kode akses ujian disimpan di HP agar tidak perlu diketik ulang tiap ujian.
  String kodeAkses = '';

  Future<void> muat() async {
    try {
      final sp = await SharedPreferences.getInstance();
      kodeAkses = sp.getString('siswaKode') ?? '';
      final mentah = sp.getString(_kunci);
      if (mentah != null) {
        data = peta(jsonDecode(mentah));
        await segarkan(paksa: true);
      }
    } finally {
      siap = true;
      notifyListeners();
    }
  }

  DateTime? _terakhirSegar;

  /// v1.38.7: perbarui sesi & daftar mapel dari server. Dipanggil saat aplikasi dibuka dan setiap kembali ke depan
  /// (maks. sekali per 10 menit kecuali [paksa]). Bila token sesi 6 jam sudah habis, kunci perangkat jangka panjang
  /// (bc_kunci, dari pendaftaran notifikasi) dipakai untuk menerbitkan token baru tanpa login ulang.
  Future<void> segarkan({bool paksa = false}) async {
    if (!masuk) return;
    final kini = DateTime.now();
    if (!paksa && _terakhirSegar != null && kini.difference(_terakhirSegar!) < const Duration(minutes: 10)) return;
    _terakhirSegar = kini;
    try {
      final sp = await SharedPreferences.getInstance();
      final kunci = sp.getString('bc_kunci') ?? '';
      final r = peta(await Api.instance('waPulihSesiSiswa', [token, kunci]));
      if (r['sukses'] == true && teks(r['nama']).isNotEmpty) {
        data = r;
        await sp.setString(_kunci, jsonEncode(r));
        notifyListeners();
      }
    } catch (_) {}
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
