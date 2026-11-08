import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api.dart';
import '../session.dart';

/// Satu pindaian QR yang dicatat di HP sebelum dikirim ke server.
class PindaianAntre {
  PindaianAntre({required this.uid, required this.kode, required this.waktuMs, this.nama = '', this.status = 'menunggu', this.pesan = ''});

  final String uid;
  final String kode;
  final int waktuMs;
  String nama;

  /// menunggu · ok · gagal · perluKode
  String status;
  String pesan;

  bool get selesai => status == 'ok' || status == 'gagal';

  Map<String, dynamic> keJson() => {'uid': uid, 'kode': kode, 'waktuMs': waktuMs, 'nama': nama, 'status': status, 'pesan': pesan};

  static PindaianAntre dariJson(Map<String, dynamic> m) => PindaianAntre(
        uid: teks(m['uid']),
        kode: teks(m['kode']),
        waktuMs: angka(m['waktuMs']),
        nama: teks(m['nama']),
        status: teks(m['status'], 'menunggu'),
        pesan: teks(m['pesan']),
      );
}

/// Antrean pindaian absensi harian (aplikasi 1.35).
/// Pindaian langsung tercatat di HP (tanpa menunggu server), lalu dikirim bertahap di latar belakang.
/// Jam yang dicatat server = jam server dikurangi umur pindaian, jadi jam HP yang salah tidak berpengaruh.
/// Antrean disimpan di HP sehingga tidak hilang bila aplikasi ditutup atau sinyal putus.
class AntreanPindai extends ChangeNotifier {
  AntreanPindai._(this.jenis);

  static final harian = AntreanPindai._('harian');

  final String jenis;
  final List<PindaianAntre> _daftar = [];
  bool _dimuat = false;
  bool _mengirim = false;
  String kodeBuka = '';
  String galatJaringan = '';
  Timer? _ulang;
  int _jeda = 2;

  String get _kunci => 'antreanPindai_$jenis';

  List<PindaianAntre> get daftar => List.unmodifiable(_daftar);
  int get menunggu => _daftar.where((p) => p.status == 'menunggu').length;
  int get perluKode => _daftar.where((p) => p.status == 'perluKode').length;
  int get gagal => _daftar.where((p) => p.status == 'gagal').length;
  int get terkirim => _daftar.where((p) => p.status == 'ok').length;
  bool get mengirim => _mengirim;

  /// Pindaian terbaru lebih dulu.
  List<PindaianAntre> terbaru([int n = 6]) => _daftar.reversed.take(n).toList();

  Future<void> muat() async {
    if (_dimuat) return;
    _dimuat = true;
    try {
      final sp = await SharedPreferences.getInstance();
      final s = sp.getString(_kunci);
      if (s != null && s.isNotEmpty) {
        final hariIni = _hari(DateTime.now());
        for (final m in daftarDari(jsonDecode(s))) {
          final p = PindaianAntre.dariJson(peta(m));
          // pindaian hari sebelumnya yang belum terkirim tidak bisa dikirim lagi
          if (_hari(DateTime.fromMillisecondsSinceEpoch(p.waktuMs)) != hariIni) {
            if (!p.selesai) {
              p.status = 'gagal';
              p.pesan = 'Pindaian kemarin tidak terkirim. Catat manual dari daftar.';
            } else {
              continue;
            }
          }
          _daftar.add(p);
        }
      }
    } catch (_) {}
    notifyListeners();
    kirim();
  }

  static List<dynamic> daftarDari(dynamic v) => v is List ? v : const [];

  static String _hari(DateTime d) => '${d.year}-${d.month}-${d.day}';

  Future<void> _simpan() async {
    try {
      // simpan maksimal 300 catatan terakhir
      while (_daftar.length > 300) {
        final i = _daftar.indexWhere((p) => p.selesai);
        if (i < 0) break;
        _daftar.removeAt(i);
      }
      final sp = await SharedPreferences.getInstance();
      await sp.setString(_kunci, jsonEncode(_daftar.map((p) => p.keJson()).toList()));
    } catch (_) {}
  }

  /// Mencatat pindaian baru di HP lalu memicu pengiriman. Mengembalikan catatan pindaian.
  PindaianAntre tambah(String kode, {String nama = ''}) {
    final now = DateTime.now().millisecondsSinceEpoch;
    final uid = '${now.toRadixString(36)}${math.Random().nextInt(1 << 30).toRadixString(36)}';
    final p = PindaianAntre(uid: uid, kode: kode, waktuMs: now, nama: nama);
    _daftar.add(p);
    _simpan();
    notifyListeners();
    kirim();
    return p;
  }

  /// Mengulang pindaian yang menunggu Kode Buka setelah kode dimasukkan.
  void pakaiKodeBuka(String kode) {
    kodeBuka = kode;
    for (final p in _daftar) {
      if (p.status == 'perluKode') {
        p.status = 'menunggu';
        p.pesan = '';
      }
    }
    notifyListeners();
    kirim();
  }

  void hapusSelesai() {
    _daftar.removeWhere((p) => p.selesai);
    _simpan();
    notifyListeners();
  }

  /// Mengirim antrean ke server, 20 pindaian per kiriman, sampai habis. Aman dipanggil berkali-kali.
  Future<void> kirim() async {
    if (_mengirim) return;
    final token = Sesi.instance.token;
    if (token == null) return;
    _mengirim = true;
    _ulang?.cancel();
    notifyListeners();
    try {
      while (true) {
        final kiriman = _daftar.where((p) => p.status == 'menunggu').take(20).toList();
        if (kiriman.isEmpty) break;
        final now = DateTime.now().millisecondsSinceEpoch;
        final items = [
          for (final p in kiriman) {'uid': p.uid, 'kode': p.kode, 'umur': math.max(0, (now - p.waktuMs) ~/ 1000)},
        ];
        final d = peta(await Api.instance('waStafAbsenHarianPindaiBanyak', [token, {'items': items, 'kodeBuka': kodeBuka}], const Duration(seconds: 90)));
        final hasil = {for (final h in daftarDari(d['hasil']).map(peta)) teks(h['uid']): h};
        for (final p in kiriman) {
          final h = hasil[p.uid];
          if (h == null) continue;
          if (h['ok'] == true) {
            p.status = 'ok';
            if (teks(h['nama']).isNotEmpty) p.nama = teks(h['nama']);
          } else {
            p.status = h['ulang'] == true ? 'perluKode' : 'gagal';
          }
          p.pesan = teks(h['pesan']);
        }
        galatJaringan = '';
        _jeda = 2;
        await _simpan();
        notifyListeners();
      }
    } on ApiException catch (e) {
      if (e.sesiHabis) {
        galatJaringan = e.ramah;
      } else {
        // sinyal putus / server sibuk: coba lagi otomatis dengan jeda bertambah (maks. 60 detik)
        galatJaringan = e.bisaDiulang ? 'Menunggu sinyal / server. Dikirim ulang otomatis.' : e.ramah;
        if (e.bisaDiulang) {
          _ulang = Timer(Duration(seconds: _jeda), kirim);
          _jeda = math.min(60, _jeda * 2);
        }
      }
    } catch (e) {
      galatJaringan = '$e';
      _ulang = Timer(Duration(seconds: _jeda), kirim);
      _jeda = math.min(60, _jeda * 2);
    } finally {
      _mengirim = false;
      notifyListeners();
    }
  }
}
