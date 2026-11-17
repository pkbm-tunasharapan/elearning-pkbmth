// Tes logika aplikasi (dijalankan `flutter test` di GitHub Actions sebelum build).
import 'package:elearning_staf/nilai/opsi_rapor.dart';
import 'package:elearning_staf/pemeliharaan/sistem.dart';
import 'package:elearning_staf/penanda.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('takAdaBaru (penanda Supabase, v1.92.0)', () {
    test('semua penanda lebih lama dari titik sejak -> lewati server', () {
      expect(takAdaBaru({'chat': 100, 'nv': 50, 'rf': 90}, {'chat': 200, 'nv': 60, 'rf': 200}), isTrue);
    });
    test('ada penanda sama/lebih baru -> tetap tanya server', () {
      expect(takAdaBaru({'chat': 200, 'nv': 50}, {'chat': 200, 'nv': 60}), isFalse);
      expect(takAdaBaru({'chat': 100, 'nv': 70}, {'chat': 200, 'nv': 60}), isFalse);
    });
    test('penanda atau titik sejak belum dikenal -> tetap tanya server', () {
      expect(takAdaBaru({'chat': 0, 'nv': 50}, {'chat': 200, 'nv': 60}), isFalse);
      expect(takAdaBaru({'nv': 50}, {'chat': 200, 'nv': 60}), isFalse);
      expect(takAdaBaru({'chat': 100, 'nv': 50}, {'chat': 0, 'nv': 60}), isFalse);
      expect(takAdaBaru({'chat': 100}, {}), isFalse);
    });
  });

  group('bandingVersi', () {
    test('versi lebih baru', () {
      expect(bandingVersi('1.38.5', '1.38.4') > 0, isTrue);
      expect(bandingVersi('1.10.0', '1.9.0') > 0, isTrue);
    });
    test('versi sama dan lebih lama', () {
      expect(bandingVersi('1.38.4', '1.38.4'), 0);
      expect(bandingVersi('1.37.9', '1.38.0') < 0, isTrue);
    });
  });

  group('semesterRapor', () {
    test('dari Ganjil: berjalan + tiga tahun ke belakang', () {
      final s = semesterRapor({'tahun': '2026/2027', 'semester': 'Ganjil'});
      expect(s.length, 7);
      expect(s.first, {'tahun': '2026/2027', 'semester': 'Ganjil'});
      expect(s[1], {'tahun': '2025/2026', 'semester': 'Genap'});
      expect(s.last, {'tahun': '2023/2024', 'semester': 'Ganjil'});
    });
    test('dari Genap', () {
      final s = semesterRapor({'tahun': '2026/2027', 'semester': 'Genap'});
      expect(s.length, 8);
      expect(s.first, {'tahun': '2026/2027', 'semester': 'Genap'});
      expect(s[1], {'tahun': '2026/2027', 'semester': 'Ganjil'});
    });
  });
}
