import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'siswa/sesi_siswa.dart';

/// Menyimpan token sesi staf dan profil (nama, peran, daftar mapel).
class Sesi extends ChangeNotifier {
  Sesi._();
  static final Sesi instance = Sesi._();

  static const _kunciToken = 'stafToken';

  String? token;
  Map<String, dynamic> profil = {};
  bool siap = false;
  String? pesanKeluar;

  String get nama => teks(profil['nama'], '-');
  String get peran => teks(profil['peran'], '-');
  bool get isAdmin => peran == 'Admin';

  /// Kepala Sekolah / Koordinator Kurikulum: melihat semua mapel tanpa mengubah.
  bool get hanyaLihat => peran == 'Kepala Sekolah' || peran == 'Koordinator Kurikulum' || peran == 'Superadmin' || isDinas;
  bool get isDinas => peran == 'Dinas Pendidikan';
  bool get isPimpinan => peran == 'Kepala Sekolah' || peran == 'Koordinator Kurikulum';
  bool get isTutor => peran == 'Tutor';
  List<Map<String, dynamic>> get mapel => daftar(profil['mapel']).map(peta).toList();

  /// Jumlah mapel berdasarkan NAMA (mapel bernama sama di beberapa rombel dihitung satu).
  int get jumlahMapel => mapel.map((m) => teks(m['namaMapel']).trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ')).where((n) => n.isNotEmpty).toSet().length;

  /// Jumlah rombel yang dicakup oleh mapel-mapel di atas.
  int get jumlahRombel => mapel.map((m) => teks(m['idRombel'], teks(m['namaRombel']))).where((n) => n.isNotEmpty).toSet().length;
  bool get masuk => token != null && profil.isNotEmpty;

  Future<void> muat() async {
    Api.instance.onSesiHabis = () {
      // v1.38.7: siswa -> perbarui sesi diam-diam (kunci perangkat); staf -> masuk kembali seperti biasa
      if (SesiSiswa.instance.masuk && token == null) {
        SesiSiswa.instance.segarkan(paksa: true);
        return;
      }
      keluar(lokal: true, pesan: 'Sesi berakhir. Silakan masuk kembali.');
    };
    try {
      final sp = await SharedPreferences.getInstance();
      token = sp.getString(_kunciToken);
      if (token != null) {
        try {
          profil = peta(await Api.instance('waStafProfil', [token]));
        } catch (_) {
          token = null;
          profil = {};
          await sp.remove(_kunciToken);
        }
      }
    } finally {
      siap = true;
      notifyListeners();
    }
  }

  /// Masuk dengan nama + kode akses. Mengembalikan pesan galat, atau null bila berhasil.
  Future<String?> masukKode(String nama, String kode) async {
    final r = peta(await Api.instance('waStafLogin', [nama.trim(), kode.trim()]));
    if (r['sukses'] != true || teks(r['token']).isEmpty) {
      return teks(r['pesan'], 'Nama atau kode akses tidak cocok.');
    }
    token = teks(r['token']);
    profil = peta(await Api.instance('waStafProfil', [token]));
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_kunciToken, token!);
    pesanKeluar = null;
    notifyListeners();
    return null;
  }

  /// Masuk dengan tiket SSO Google (dari halaman web, diteruskan ke aplikasi lewat bmstaf://sso?tiket=...).
  Future<String?> masukSso(String tiket) async {
    final r = peta(await Api.instance('waStafMasukSso', [tiket]));
    if (r['sukses'] != true || teks(r['token']).isEmpty) {
      return teks(r['pesan'], 'Login Google gagal. Coba lagi.');
    }
    token = teks(r['token']);
    profil = peta(await Api.instance('waStafProfil', [token]));
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_kunciToken, token!);
    pesanKeluar = null;
    notifyListeners();
    return null;
  }

  /// Masuk dengan ID token Google yang didapat langsung di aplikasi (tanpa halaman web).
  Future<String?> masukGoogle(String idToken) async {
    final r = peta(await Api.instance('waStafMasukGoogle', [idToken]));
    if (r['sukses'] != true || teks(r['token']).isEmpty) {
      return teks(r['pesan'], 'Login Google gagal. Coba lagi.');
    }
    token = teks(r['token']);
    profil = peta(await Api.instance('waStafProfil', [token]));
    final sp = await SharedPreferences.getInstance();
    await sp.setString(_kunciToken, token!);
    pesanKeluar = null;
    notifyListeners();
    return null;
  }

  Future<void> segarkanProfil() async {
    if (token == null) return;
    profil = peta(await Api.instance('waStafProfil', [token]));
    notifyListeners();
  }

  Future<void> keluar({bool lokal = false, String? pesan}) async {
    final t = token;
    token = null;
    profil = {};
    pesanKeluar = pesan;
    final sp = await SharedPreferences.getInstance();
    await sp.remove(_kunciToken);
    notifyListeners();
    if (!lokal && t != null) {
      try {
        await Api.instance('waStafKeluar', [t]);
      } catch (_) {}
    }
  }
}
