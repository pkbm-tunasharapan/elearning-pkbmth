import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api.dart';
import '../penanda.dart';
import '../pengguna/lihat_sebagai.dart';

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
    if (!masuk || ModeLihat.instance.aktif) return;   // v1.81.0: sesi mode lihat tidak diperbarui/disimpan
    final kini = DateTime.now();
    if (!paksa && _terakhirSegar != null && kini.difference(_terakhirSegar!) < const Duration(minutes: 10)) return;
    _terakhirSegar = kini;
    try {
      final sp = await SharedPreferences.getInstance();
      final kunci = sp.getString('bc_kunci') ?? '';
      if (token.isEmpty) await _ambilTokenAps();   // login lewat Supabase: token Apps Script belum ada
      // v1.92.8: data sesi dari Supabase; token Apps Script tetap diperpanjang lewat waPulihSesiSiswa tiap 4 jam
      final kiniMs = kini.millisecondsSinceEpoch, apsMs = sp.getInt('siswaPulihAps') ?? 0;
      if (!paksa && kiniMs - apsMs < 4 * 3600000) {
        final sb = await rpcBelajar('br_sesi_pulih', {'p_tanda': teks(data['tandaBelajar']), 'p_nama': nama});
        if (sb != null && sb['sukses'] == true) {
          data = {...data, ...sb};
          await sp.setString(_kunci, jsonEncode(data));
          notifyListeners();
          return;
        }
      }
      final r = peta(await Api.instance('waPulihSesiSiswa', [token, kunci]));
      if (r['sukses'] == true && teks(r['nama']).isNotEmpty) {
        data = r;
        await sp.setString(_kunci, jsonEncode(r));
        await sp.setInt('siswaPulihAps', kiniMs);
        notifyListeners();
      }
    } catch (_) {}
  }

  bool _ambilToken = false;

  /// Tukar tanda belajar dengan token sesi Apps Script (dipakai menu yang masih di Apps Script).
  Future<void> _ambilTokenAps() async {
    if (_ambilToken || !masuk || token.isNotEmpty || teks(data['tandaBelajar']).isEmpty) return;
    _ambilToken = true;
    try {
      final r = peta(await Api.instance('waSesiDariTanda', [teks(data['tandaBelajar'])]));
      if (r['sukses'] == true && teks(r['sesi']).isNotEmpty && masuk) {
        data = {...data, 'sesi': teks(r['sesi'])};
        final sp = await SharedPreferences.getInstance();
        await sp.setString(_kunci, jsonEncode(data));
      }
    } catch (_) {
    } finally {
      _ambilToken = false;
    }
  }

  /// v1.40.2: saran nama dari server bila nama salah ketik tetapi tanggal lahir cocok ("Maksud Anda: ...?").
  String saranNama = '';

  /// Mengembalikan pesan galat, atau null bila berhasil.
  Future<String?> masukSiswa(String nama, String kataSandi) async {
    saranNama = '';
    // Login di Supabase (cepat untuk ratusan siswa serentak). Hanya jalur berhasil; selain itu waLogin seperti biasa.
    final sb = await rpcTanpaTanda('siswa_masuk', {'p_nama': nama.trim(), 'p_sandi': kataSandi.trim().toUpperCase()});
    if (sb != null && sb['sukses'] == true && teks(sb['tandaBelajar']).isNotEmpty) {
      data = sb;
      final sp = await SharedPreferences.getInstance();
      await sp.setString(_kunci, jsonEncode(sb));
      await sp.setInt('siswaPulihAps', DateTime.now().millisecondsSinceEpoch);
      notifyListeners();
      // token Apps Script (menu yang belum pindah) diambil di latar belakang, tersebar 0-60 detik agar login
      // serentak tidak menumpuk di Apps Script
      unawaited(Future<void>.delayed(Duration(milliseconds: Random().nextInt(60000)), _ambilTokenAps));
      return null;
    }
    final r = peta(await Api.instance('waLogin', [nama.trim(), kataSandi.trim().toUpperCase()]));
    if (r['sukses'] != true) {
      saranNama = teks(r['saran']);
      return teks(r['pesan'], 'Nama atau kata sandi tidak cocok.');
    }
    data = r;
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_kunci, jsonEncode(r));
    await sp.setInt('siswaPulihAps', DateTime.now().millisecondsSinceEpoch);   // token baru: perpanjangan berikutnya 4 jam lagi
    notifyListeners();
    return null;
  }

  Future<void> simpanKode(String k) async {
    kodeAkses = k.trim().toUpperCase();
    final sp = await SharedPreferences.getInstance();
    await sp.setString('siswaKode', kodeAkses);
  }

  /// v1.81.0: ganti sesi siswa di memori saja (mode Lihat sebagai), tanpa menyimpan ke HP.
  void gantiSementara(Map<String, dynamic> d) {
    data = d;
    notifyListeners();
  }

  Future<void> keluar() async {
    if (ModeLihat.instance.aktif) {   // v1.81.0: "Keluar" saat mode lihat = kembali ke akun Admin
      await ModeLihat.instance.akhiri();
      return;
    }
    final t = token;
    Api.instance.bersihkanCache();   // v1.65.0
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
