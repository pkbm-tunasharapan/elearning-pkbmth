import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;

import 'config.dart';

/// Kesalahan yang dikembalikan backend Apps Script.
class ApiException implements Exception {
  ApiException(this.pesan);
  final String pesan;

  bool get sesiHabis => pesan.contains('SESI_HABIS');
  bool get maintenance => pesan.contains('MAINTENANCE');

  /// Pesan yang ramah untuk ditampilkan ke pengguna.
  String get ramah {
    if (sesiHabis) return 'Sesi berakhir. Silakan masuk kembali.';
    if (maintenance) return 'Aplikasi sedang dalam perawatan. Coba lagi nanti.';
    return pesan.replaceFirst(RegExp(r'^(Error|Exception):\s*'), '');
  }

  @override
  String toString() => ramah;
}

/// Pemanggil fungsi backend. Semua fungsi `wa...` di Apps Script dipanggil lewat
/// satu pintu `doPost` (file ApiFlutter.gs) dengan body JSON {fn, args}.
class Api {
  Api._();
  static final Api instance = Api._();

  /// Dipanggil setiap kali backend menyatakan sesi habis.
  void Function()? onSesiHabis;

  Future<dynamic> call(String fn, [List<dynamic> args = const [], Duration batas = const Duration(seconds: 120)]) async {
    final body = jsonEncode({'fn': fn, 'args': args});
    final uri = Uri.parse(kApiUrl);
    http.Response res;
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
            res = await client.get(Uri.parse(lokasi)).timeout(batas);
            lompat++;
          }
        } finally {
          client.close();
        }
      }
    } on TimeoutException {
      throw ApiException('Server belum menjawab. Periksa koneksi internet lalu coba lagi.');
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException('Tidak dapat terhubung ke server. Periksa koneksi internet. ($e)');
    }

    if (res.statusCode != 200) {
      throw ApiException('Server mengembalikan kode ${res.statusCode}.');
    }
    dynamic data;
    try {
      data = jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {
      throw ApiException('Jawaban server tidak dikenali. Pastikan backend sudah di-deploy ulang (ApiFlutter.gs).');
    }
    if (data is Map && data['ok'] == true) return data['data'];
    final err = ApiException(data is Map ? '${data['error'] ?? 'Terjadi kesalahan.'}' : 'Terjadi kesalahan.');
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
