// Tes logika aplikasi (dijalankan `flutter test` di GitHub Actions sebelum build).
import 'package:elearning_staf/nilai/opsi_rapor.dart';
import 'package:elearning_staf/pemeliharaan/sistem.dart';
import 'package:elearning_staf/ujian/ringkas_jadwal.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
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

  group('ringkas jadwal pengawas', () {
    final semua = ['Kelas A4', 'Kelas A5', 'Kelas A6', 'Kelas B7', 'Kelas B8', 'Kelas B9', 'Kelas C10', 'Kelas C11', 'Kelas C12'];
    final p = anggotaPaket(semua);
    test('paket lengkap menjadi "Paket X"', () {
      expect(ringkasRombel(['Kelas B9', 'Kelas B7', 'Kelas B8'], p), 'Paket B');
      expect(ringkasRombel(['Kelas B7', 'Kelas B8', 'Kelas B9', 'Kelas C12'], p), 'Paket B, C12');
      expect(ringkasRombel(semua, p), 'Paket A, Paket B, Paket C');
    });
    test('paket tidak lengkap tetap per rombel, urut angka', () {
      expect(ringkasRombel(['Kelas C12', 'Kelas C10'], p), 'C10, C12');
      expect(ringkasRombel(['Kelas B8'], p), 'B8');
    });
    test('paket dengan satu rombel saja tidak diubah', () {
      expect(ringkasRombel(['Kelas C12'], anggotaPaket(['Kelas C12', 'Kelas B7'])), 'C12');
    });
    test('rombel per unit dikelompokkan per unit', () {
      final q = anggotaPaket(['Kelas B7 · Sampiran', 'Kelas B8 · Sampiran', 'Kelas B9 · Sampiran', 'Kelas B7 · Pusat']);
      expect(ringkasRombel(['Kelas B7 · Sampiran', 'Kelas B8 · Sampiran', 'Kelas B9 · Sampiran'], q), 'Paket B · Sampiran');
      expect(ringkasRombel(['Kelas B7 · Pusat', 'Kelas B8 · Sampiran'], q), 'B7 · Pusat; B8 · Sampiran');
    });
    test('baris bernilai sama digabung, yang berbeda tetap terpisah', () {
      Map<String, String> b(String rombel, String pengawas) =>
          {'tanggal': '2026-12-07', 'jam': '08:00', 'selesai': '09:30', 'mapel': 'Matematika', 'mode': 'Online (aplikasi)', 'rombel': rombel, 'ruang': 'R1', 'pengawas': pengawas};
      final hasil = gabungBarisPengawas([b('Kelas B7', 'Ani'), b('Kelas B8', 'Ani'), b('Kelas B9', 'Ani'), b('Kelas C10', 'Budi')], p);
      expect(hasil.length, 2);
      expect(hasil[0].rombelRingkas, 'Paket B');
      expect(hasil[0].pengawas, 'Ani');
      expect(hasil[1].rombelRingkas, 'C10');
    });
  });
}
