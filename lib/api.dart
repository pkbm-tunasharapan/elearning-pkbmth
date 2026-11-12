import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import 'config.dart';

/// Kode galat (dipakai admin untuk menelusuri di Pemeliharaan Sistem → Log Galat):
/// E101 tidak terhubung · E102 waktu habis · E103 status HTTP · E104 jawaban server tak dikenali · E105 diproses tetapi jawaban terputus
/// E201 sesi habis · E202 perawatan · E203 fungsi belum di-deploy · E210 data/aturan (pesan dari server)
/// E230 kuota Google · E231 proses server terlalu lama · E232 server sibuk (antrean) · E299 galat server lain
/// E300 peringatan aplikasi · E900 galat aplikasi · E901 tampilan gagal dibuat
class ApiException implements Exception {
  ApiException(String pesan, {String? kode, this.detail = '', this.fn = ''})
      : pesan = _bersihUrl(pesan),
        kode = kode ?? _klasifikasi(pesan),
        ref = _buatRef();

  final String pesan;
  final String kode;
  final String detail;
  final String fn;

  /// Kode unik kejadian, mis. "E101-K3Q9ZA": ditampilkan ke pengguna dan dicatat di log.
  final String ref;
  String get kodeLengkap => '$kode-$ref';

  bool get sesiHabis => kode == 'E201' || pesan.contains('SESI_HABIS');
  bool get maintenance => kode == 'E202' || pesan.contains('MAINTENANCE');

  /// Perlu dicatat ke log admin (bukan sekadar pesan aturan/validasi).
  bool get perluDilapor => !const {'E201', 'E202', 'E210', 'E300'}.contains(kode);

  /// Pesan yang ramah untuk ditampilkan ke pengguna (tanpa alamat atau detail teknis).
  String get ramah {
    if (sesiHabis) return 'Sesi berakhir. Silakan masuk kembali.';
    if (maintenance) return 'Aplikasi sedang dalam perawatan. Coba lagi nanti.';
    switch (kode) {
      case 'E101':
        return 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.';
      case 'E102':
        return 'Server belum menjawab. Periksa koneksi internet lalu coba lagi.';
      case 'E105':
        return 'Server sudah memproses permintaan Anda, tetapi jawabannya tidak sampai karena koneksi terputus. '
            'Periksa dulu apakah perubahan sudah tersimpan (muat ulang halaman) sebelum mengulang, agar data tidak ganda.';
      case 'E103':
      case 'E104':
        return 'Server sedang bermasalah atau sedang diperbarui. Tunggu sebentar lalu coba lagi.';
      case 'E203':
        return 'Fitur ini belum aktif di server. Minta admin men-deploy versi terbaru.';
      case 'E230':
        return 'Batas harian layanan Google tercapai. Coba lagi beberapa saat lagi.';
      case 'E231':
        return 'Proses di server terlalu lama. Coba lagi dengan data yang lebih sedikit.';
      case 'E232':
        return 'Server sedang sibuk melayani pengguna lain. Coba lagi sebentar lagi.';
      case 'E299':
      case 'E900':
      case 'E901':
        return 'Terjadi kesalahan yang tidak terduga.';
    }
    return pesan.replaceFirst(RegExp(r'^(Error|Exception|TypeError|ReferenceError):\s*'), '');
  }

  /// Judul singkat untuk modal galat.
  String get judul => switch (kode) {
        'E101' || 'E102' || 'E105' => 'Koneksi bermasalah',
        'E103' || 'E104' || 'E230' || 'E231' || 'E232' => 'Server bermasalah',
        'E201' => 'Sesi berakhir',
        'E202' => 'Sedang perawatan',
        'E203' => 'Fitur belum aktif',
        'E210' || 'E300' => 'Tidak bisa diproses',
        _ => 'Terjadi kesalahan',
      };

  /// Bisa dicoba lagi (masalah sementara).
  bool get bisaDiulang => const {'E101', 'E102', 'E103', 'E104', 'E230', 'E231', 'E232', 'E299'}.contains(kode);

  @override
  String toString() => '$ramah (Kode: $kodeLengkap)';

  static String _bersihUrl(String s) =>
      s.replaceAll(RegExp(r'https?://\S+'), '').replaceAll(RegExp(r'\(\s*\)'), '').replaceAll(RegExp(r'\s{2,}'), ' ').trim();

  static String _klasifikasi(String p) {
    final s = p.toLowerCase();
    if (p.contains('SESI_HABIS')) return 'E201';
    if (p.contains('MAINTENANCE')) return 'E202';
    if (s.contains('fungsi tidak diizinkan') || s.contains('is not defined') || s.contains('is not a function')) return 'E203';
    if (s.contains('too many times') || s.contains('quota') || s.contains('kuota')) return 'E230';
    if (s.contains('exceeded maximum execution') || s.contains('timed out') || s.contains('timeout')) return 'E231';
    if (s.contains('lock') || s.contains('sedang sibuk') || s.contains('try again later')) return 'E232';
    if (RegExp(r'typeerror|referenceerror|cannot read|undefined|null|exception:').hasMatch(s)) return 'E299';
    return 'E210';
  }

  static final _acak = math.Random();
  static String _buatRef() {
    const h = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    final t = DateTime.now().millisecondsSinceEpoch;
    final b = StringBuffer();
    var x = t;
    for (var i = 0; i < 4; i++) {
      b.write(h[x % h.length]);
      x ~/= h.length;
    }
    for (var i = 0; i < 2; i++) {
      b.write(h[_acak.nextInt(h.length)]);
    }
    return b.toString();
  }
}

/// Pemanggil fungsi backend. Semua fungsi `wa...` di Apps Script dipanggil lewat
/// satu pintu `doPost` (file ApiFlutter.gs) dengan body JSON {fn, args}.
class Api {
  Api._();
  static final Api instance = Api._();

  /// Dipanggil setiap kali backend menyatakan sesi habis.
  void Function()? onSesiHabis;

  /// Dipanggil untuk galat yang perlu dicatat ke log admin (dipasang di pemeliharaan/sistem.dart).
  void Function(ApiException e)? onGalat;

  // ───────────── v1.65.0: cache jawaban baca (tampil seketika, disegarkan di belakang) ─────────────
  // Hanya dipakai di dalam Muatan (zona mode 'cache'): jawaban fungsi BACA yang pernah diterima langsung dikembalikan,
  // lalu Muatan mengambil ulang dari server di belakang layar. Setiap fungsi TULIS yang berhasil menghapus seluruh cache,
  // jadi setelah menyimpan/mengubah data, layar selalu memuat data terbaru. Cache disimpan juga di HP (Android).
  static const zonaMode = #apiCacheMode;
  static const zonaPakai = #apiCachePakai;
  static final _tulis = RegExp(r'(Simpan|Hapus|Tetapkan|Batal|Catat|Ajukan|Setujui|Tolak|Putus|Sahkan|Impor|Terapkan|Reset|Buka|Tambah|Ubah|Kirim|Atur|Izin|'
      r'Unggah|Upload|Proses|Lapor|Token|Login|Masuk|Keluar|Detak|Minta|Submit|Mulai|Tandai|Bayar|Verifikasi|Buat|Pindah|Selesai|Nonaktif|Aktifkan|'
      r'Kunci|Naskah|Pdf|Ekspor|Templat|Undang|Hangatkan|Ganti|Pulih|Draft|Ucapkan|Akhiri|Putar|Jalankan|Isi$|Samakan|Sinkron|'
      r'Cabut|Lanjut|Tarik|Sekarang|Abaikan|Gabung|Ai$|Ai[A-Z]|Uji$|Bersihkan|Otomatis|Tes$|Resmikan|Set[A-Z]|Keputusan|Disposisi|Perbaiki|Pindai|Beri$|'
      r'Setor|Generate|Rakit|Terbit|Massal|Status$|Input|Verif|Order|Foto|CekData|Hitung|Cari)');
  static final _hidup = RegExp(r'^(waNotif|waRuang|waStatusUjian|waStafPengawasPantau|waStafProfil|waStafRuang|waStafVersiApp|waStafHtmlPdf|waStafKartu|waUjian)');
  final Map<String, String> _cache = {};
  Timer? _tundaSimpan;
  bool _cacheDimuat = false;
  static const _maksCache = 200, _maksIsi = 400000;

  bool bolehCache(String fn) => !_tulis.hasMatch(fn) && !_hidup.hasMatch(fn);

  Future<File?> _berkasCache() async {
    if (kIsWeb) return null;
    try {
      final d = await getApplicationSupportDirectory();
      return File('${d.path}/api_cache_v1.json');
    } catch (_) {
      return null;
    }
  }

  /// Dipanggil sekali saat aplikasi mulai: muat cache dari HP.
  Future<void> muatCache() async {
    if (_cacheDimuat) return;
    _cacheDimuat = true;
    try {
      final f = await _berkasCache();
      if (f == null || !await f.exists()) return;
      final m = jsonDecode(await f.readAsString());
      if (m is Map) {
        m.forEach((k, v) {
          if (v is String && !_cache.containsKey(k)) _cache['$k'] = v;
        });
      }
    } catch (_) {}
  }

  void _simpanNanti() {
    if (kIsWeb) return;
    _tundaSimpan?.cancel();
    _tundaSimpan = Timer(const Duration(seconds: 3), () async {
      try {
        final f = await _berkasCache();
        await f?.writeAsString(jsonEncode(_cache));
      } catch (_) {}
    });
  }

  void _taruhCache(String k, dynamic data) {
    String isi;
    try {
      isi = jsonEncode(data);
    } catch (_) {
      return;
    }
    if (isi.length > _maksIsi) return;
    _cache.remove(k);
    _cache[k] = isi;
    while (_cache.length > _maksCache) {
      _cache.remove(_cache.keys.first);
    }
    _simpanNanti();
  }

  /// Hapus seluruh cache (setelah menyimpan data, keluar akun, atau ganti pengguna).
  void bersihkanCache() {
    if (_cache.isEmpty) return;
    _cache.clear();
    _simpanNanti();
  }

  /// Mengambil jawaban dari alamat pengalihan Apps Script (googleusercontent). Langkah ini hanya MEMBACA
  /// hasil yang sudah jadi, jadi aman diulang saat koneksi putus sesaat (maks. 3 kali).
  Future<http.Response> _ambilJawaban(http.Client client, Uri lokasi, Duration batas) async {
    Object? terakhir;
    for (var i = 0; i < 3; i++) {
      try {
        return await client.get(lokasi).timeout(batas);
      } on TimeoutException {
        rethrow;
      } catch (e) {
        terakhir = e;
        await Future<void>.delayed(Duration(milliseconds: 800 * (i + 1)));
      }
    }
    throw terakhir ?? Exception('Jawaban server tidak dapat diambil.');
  }

  ApiException _galat(String pesan, String kode, String fn, [Object? asal]) {
    final e = ApiException(pesan, kode: kode, fn: fn, detail: asal == null ? '' : '$asal');
    if (e.perluDilapor) onGalat?.call(e);
    return e;
  }

  Future<dynamic> call(String fn, [List<dynamic> args = const [], Duration batas = const Duration(seconds: 120)]) async {
    final body = jsonEncode({'fn': fn, 'args': args, 'v': kVersi, 'pf': kIsWeb ? 'web' : 'android'});
    final kunciCache = bolehCache(fn) ? '$fn|${jsonEncode(args)}' : null;
    if (kunciCache != null && Zone.current[zonaMode] == 'cache') {
      final c = _cache[kunciCache];
      if (c != null) {
        final pakai = Zone.current[zonaPakai];
        if (pakai is List) pakai.add(fn);
        return jsonDecode(c);
      }
    }
    final uri = Uri.parse(kApiUrl);
    http.Response res;
    var sudahDiproses = false;
    try {
      if (kIsWeb) {
        // Browser mengikuti redirect Apps Script sendiri. text/plain menghindari preflight CORS.
        res = await http
            .post(uri, headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: body)
            .timeout(batas);
      } else {
        final client = http.Client();
        try {
          final req = http.Request('POST', uri)
            ..followRedirects = false
            ..headers['Content-Type'] = 'text/plain;charset=utf-8'
            ..body = body;
          final streamed = await client.send(req).timeout(batas);
          res = await http.Response.fromStream(streamed);
          var lompat = 0;
          while ((res.statusCode == 301 || res.statusCode == 302 || res.statusCode == 303 || res.statusCode == 307) && lompat < 5) {
            final lokasi = res.headers['location'];
            if (lokasi == null || lokasi.isEmpty) break;
            // Server SUDAH memproses permintaan; alamat ini hanya mengambil jawabannya (aman diulang).
            sudahDiproses = true;
            res = await _ambilJawaban(client, Uri.parse(lokasi), batas);
            lompat++;
          }
        } finally {
          client.close();
        }
      }
    } on TimeoutException catch (e) {
      if (sudahDiproses) throw _galat('Server sudah memproses permintaan, tetapi jawabannya tidak sampai.', 'E105', fn, e);
      throw _galat('Server belum menjawab.', 'E102', fn, e);
    } catch (e) {
      if (e is ApiException) rethrow;
      if (sudahDiproses) throw _galat('Server sudah memproses permintaan, tetapi jawabannya tidak sampai.', 'E105', fn, e);
      throw _galat('Tidak dapat terhubung ke server.', 'E101', fn, e);
    }

    if (res.statusCode != 200) {
      throw _galat('Server mengembalikan status ${res.statusCode}.', 'E103', fn, 'HTTP ${res.statusCode}');
    }
    dynamic data;
    try {
      data = jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {
      final awal = utf8.decode(res.bodyBytes, allowMalformed: true);
      throw _galat('Jawaban server tidak dikenali.', 'E104', fn, awal.length > 300 ? awal.substring(0, 300) : awal);
    }
    if (data is Map && data['ok'] == true) {
      if (kunciCache != null) {
        _taruhCache(kunciCache, data['data']);
      } else if (_tulis.hasMatch(fn)) {
        bersihkanCache();
      }
      return data['data'];
    }
    final asli = data is Map ? '${data['error'] ?? 'Terjadi kesalahan.'}' : 'Terjadi kesalahan.';
    final err = ApiException(asli, fn: fn, detail: asli);
    if (err.perluDilapor) onGalat?.call(err);
    if (err.sesiHabis && onSesiHabis != null) onSesiHabis!();
    throw err;
  }
}

/// Pembacaan aman dari JSON dinamis.
String teks(dynamic v, [String bawaan = '']) {
  if (v == null) return bawaan;
  final s = v.toString();
  return s.isEmpty ? bawaan : s;
}

int angka(dynamic v, [int bawaan = 0]) {
  if (v is int) return v;
  if (v is num) return v.round();
  return int.tryParse('${v ?? ''}') ?? bawaan;
}

List<dynamic> daftar(dynamic v) => v is List ? v : const [];

Map<String, dynamic> peta(dynamic v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
