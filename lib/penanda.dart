import 'dart:convert';

import 'package:http/http.dart' as http;

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
