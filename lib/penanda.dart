import 'dart:convert';

import 'package:http/http.dart' as http;

import 'api.dart';
import 'config.dart';

/// v1.92.0 (migrasi Modul 1): penanda "ada yang baru?" di Supabase.
/// Sebelum memanggil waRuangCek / waStafRuangCek / waNotifCek ke Apps Script, aplikasi membaca penanda waktu
/// (chat, nv, bc, np, rf) dari Supabase. Bila semua penanda lebih lama dari titik pemeriksaan terakhir, panggilan
/// ke Apps Script dilewati. Penanda tidak berisi data pribadi. Bila Supabase gagal, aplikasi kembali ke cara lama.
class Penanda {
  Penanda._();
  static final Penanda instance = Penanda._();

  Map<String, int> _nilai = const {};
  Map<String, int> get semua => _nilai;

  /// Ambil penanda terbaru; false bila gagal (pemanggil memakai jalur lama).
  Future<bool> segarkan() async {
    if (kSupabaseUrl.isEmpty || kSupabaseKunciPublik.isEmpty) return false;
    try {
      final r = await http
          .post(Uri.parse('$kSupabaseUrl/rest/v1/rpc/penanda_baca'),
              headers: {'apikey': kSupabaseKunciPublik, 'Content-Type': 'application/json'}, body: '{}')
          .timeout(const Duration(seconds: 6));
      if (r.statusCode != 200) return false;
      final j = jsonDecode(r.body);
      if (j is! Map || j['penanda'] is! Map) return false;
      _nilai = {
        for (final e in (j['penanda'] as Map).entries) '${e.key}': (e.value is num) ? (e.value as num).toInt() : 0,
      };
      return true;
    } catch (_) {
      return false;
    }
  }
}

/// v1.92.0 (Modul 2a): snapshot materi per mapel dari Supabase (hasil waGetMateri yang disimpan server).
/// Mengembalikan null bila snapshot belum ada/basi/gagal -> pemanggil memakai Apps Script seperti biasa.
class SnapshotMateri {
  SnapshotMateri._();
  static final SnapshotMateri instance = SnapshotMateri._();

  final Map<String, ({int versi, List<dynamic> data})> _simpan = {};

  Future<List<dynamic>?> ambil(String idMapel) async {
    if (kSupabaseUrl.isEmpty || kSupabaseKunciPublik.isEmpty || idMapel.isEmpty) return null;
    final lama = _simpan[idMapel];
    try {
      final r = await http
          .post(Uri.parse('$kSupabaseUrl/rest/v1/rpc/materi_snapshot_baca'),
              headers: {'apikey': kSupabaseKunciPublik, 'Content-Type': 'application/json'},
              body: jsonEncode({'p_id_mapel': idMapel, 'p_versi_klien': lama?.versi ?? 0}))
          .timeout(const Duration(seconds: 8));
      if (r.statusCode != 200) return null;
      final j = jsonDecode(r.body);
      if (j is! Map || j['sah'] != true) return null;
      if (j['sama'] == true && lama != null) return lama.data;
      final data = j['data'], versi = j['versi'];
      if (data is! List || versi is! num) return null;
      _simpan[idMapel] = (versi: versi.toInt(), data: data);
      return data;
    } catch (_) {
      return null;
    }
  }
}

/// Materi mapel untuk siswa: snapshot Supabase bila sah, selain itu Apps Script (jalur lama).
Future<dynamic> ambilMateriSiswa(String idMapel, Future<dynamic> Function() jalurLama) async =>
    (await SnapshotMateri.instance.ambil(idMapel)) ?? await jalurLama();

/// v1.92.0 (F2): riwayat jawaban siswa dibaca langsung dari Supabase (fungsi riwayat_baca) dengan
/// "tanda belajar" dari respons login. Sesudah siswa sendiri mengirim jawaban/absensi/ujian, jalur lama
/// (Apps Script) dipakai selama 5 menit karena salinan di Supabase baru disinkron dalam hitungan menit.
class RiwayatBelajar {
  RiwayatBelajar._();
  static final RiwayatBelajar instance = RiwayatBelajar._();

  DateTime? _tulisTerakhir;
  void catatTulis() => _tulisTerakhir = DateTime.now();

  Future<Map<String, dynamic>?> ambil(String idMapel, String tanda) async {
    if (kSupabaseUrl.isEmpty || kSupabaseKunciPublik.isEmpty || idMapel.isEmpty || tanda.isEmpty) return null;
    final t = _tulisTerakhir;
    if (t != null && DateTime.now().difference(t) < const Duration(minutes: 5)) return null;
    try {
      final r = await http
          .post(Uri.parse('$kSupabaseUrl/rest/v1/rpc/riwayat_baca'),
              headers: {'apikey': kSupabaseKunciPublik, 'Content-Type': 'application/json'},
              body: jsonEncode({'p_id_mapel': idMapel, 'p_tanda': tanda}))
          .timeout(const Duration(seconds: 8));
      if (r.statusCode != 200) return null;
      final j = jsonDecode(r.body);
      if (j is! Map || j['sah'] != true || j['data'] is! Map) return null;
      return Map<String, dynamic>.from(j['data'] as Map);
    } catch (_) {
      return null;
    }
  }
}

/// v1.92.6 (B2): tulis siswa di domain belajar (kirim diskusi, absensi, draf) langsung ke Supabase. Supabase menjawab
/// `{lama: true}` untuk kasus yang masih ditangani Apps Script (mis. ujian, masa ujian), dan bila Supabase tidak
/// terjangkau `jalurLama` dipakai. Sesudah tulis lewat Supabase, cache baca aplikasi dikosongkan (sama dengan jalur lama).
Future<dynamic> tulisBelajar(String fn, Map<String, dynamic> args, Future<dynamic> Function() jalurLama) async {
  final r = await rpcBelajar(fn, args);
  if (r != null && r['lama'] != true) {
    Api.instance.bersihkanCache();
    return r;
  }
  RiwayatBelajar.instance.catatTulis();   // jalur lama: salinan di Supabase menyusul lewat sinkron
  return jalurLama();
}

/// v1.92.7 (B3): tanda staf untuk penilaian diskusi di Supabase, diambil sekali per token sesi staf.
class TandaStaf {
  static String _token = '', _tanda = '';
  static Future<String> ambil(String token) async {
    if (token.isEmpty) return '';
    if (token == _token && _tanda.isNotEmpty) return _tanda;
    try {
      final r = peta(await Api.instance('waStafTandaBelajar', [token]));
      _token = token;
      _tanda = teks(r['tanda']);
    } catch (_) {
      _tanda = '';
    }
    return _tanda;
  }
}

/// Baca dari Supabase (mis. draf); null bila gagal atau `{lama: true}`.
Future<Map<String, dynamic>?> rpcBelajar(String fn, Map<String, dynamic> args) async {
  if (kSupabaseUrl.isEmpty || kSupabaseKunciPublik.isEmpty || teks(args['p_tanda']).isEmpty) return null;
  try {
    final r = await http
        .post(Uri.parse('$kSupabaseUrl/rest/v1/rpc/$fn'),
            headers: {'apikey': kSupabaseKunciPublik, 'Content-Type': 'application/json'}, body: jsonEncode(args))
        .timeout(const Duration(seconds: 15));
    if (r.statusCode != 200) return null;
    final j = jsonDecode(r.body);
    if (j is! Map || j['lama'] == true) return null;
    return Map<String, dynamic>.from(j);
  } catch (_) {
    return null;
  }
}

/// Riwayat jawaban siswa satu mapel: Supabase bila sah, selain itu Apps Script (jalur lama).
Future<dynamic> ambilRiwayatSiswa(String idMapel, String tanda, Future<dynamic> Function() jalurLama) async =>
    (await RiwayatBelajar.instance.ambil(idMapel, tanda)) ?? await jalurLama();

/// True bila PASTI tidak ada yang baru: setiap penanda dikenal (> 0), titik sejak dikenal (> 0),
/// dan penanda lebih lama dari titik sejaknya (sama dengan jalur cepat server kcpTakAdaBaru_).
bool takAdaBaru(Map<String, int> penanda, Map<String, int> syarat) {
  if (syarat.isEmpty) return false;
  for (final e in syarat.entries) {
    final p = penanda[e.key] ?? 0;
    if (p <= 0 || e.value <= 0 || p >= e.value) return false;
  }
  return true;
}
