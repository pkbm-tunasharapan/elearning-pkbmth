// v1.95.0: pengurai tabel keterangan kalender akademik (kaldik Jawa Barat 2026/2027).
import 'package:elearning_staf/kaldik_parser.dart';
import 'package:flutter_test/flutter_test.dart';

String _r(HasilTanggal h) => h.rentang.map((x) => '${isoTgl(x.$1)}..${isoTgl(x.$2)}').join(',');

void main() {
  group('uraiTanggal', () {
    test('satu tanggal, rentang, lintas bulan & tahun', () {
      expect(_r(uraiTanggal('15 Juli 2026')!), '2026-07-15..2026-07-15');
      expect(_r(uraiTanggal('2-3 Juli 2026')!), '2026-07-02..2026-07-03');
      expect(_r(uraiTanggal('8–12 Februari 2027')!), '2027-02-08..2027-02-12');
      expect(_r(uraiTanggal('26 Juli-01 Agustus 2026')!), '2026-07-26..2026-08-01');
      expect(_r(uraiTanggal('28 Desember 2026-8 Januari 2027')!), '2026-12-28..2027-01-08');
      expect(_r(uraiTanggal('28 Desember-8 Januari 2027')!), '2026-12-28..2027-01-08');
    });
    test('beberapa rentang, tanda kaki, bulan saja', () {
      expect(_r(uraiTanggal('15-17, 20-21 Juli 2026')!), '2026-07-15..2026-07-17,2026-07-20..2026-07-21');
      expect(_r(uraiTanggal('29 Maret–30 April 2027*)')!), '2027-03-29..2027-04-30');
      final b = uraiTanggal('Maret–April 2027')!;
      expect([_r(b), b.bulanSaja], ['2027-03-01..2027-04-30', true]);
      expect(uraiTanggal('Juni 2027')!.bulanSaja, isTrue);
    });
    test('tidak terbaca', () {
      expect(uraiTanggal('9 November-11 Desember 202'), isNull);
      expect(uraiTanggal('Hari pertama masuk'), isNull);
    });
  });

  group('kategoriKegiatan', () {
    test('kata kunci kaldik Jabar', () {
      expect(kategoriKegiatan('Hari pertama masuk sekolah'), katMulai);
      expect(kategoriKegiatan('Libur hari Proklamasi Kemerdekaan Republik Indonesia'), katLibur);
      expect(kategoriKegiatan('Cuti bersama Hari Natal'), katLibur);
      expect(kategoriKegiatan('Perkiraan hari raya Idul Adha 1448 H'), katLibur);
      expect(kategoriKegiatan('Perkiraan Tahun Baru Islam'), katLibur);
      expect(kategoriKegiatan('Kenaikan Isa Almasih'), katLibur);
      expect(kategoriKegiatan('Asesmen sumatif akhir semester'), katUas);
      expect(kategoriKegiatan('Perkiraan Asesmen sumatif akhir tahun/sumatif akhir fase'), katUas);
      expect(kategoriKegiatan('Pembagian rapor semester 1'), katRapor);
      expect(kategoriKegiatan('Penetapan rapor semester 1'), katKegiatan);
      expect(kategoriKegiatan('Perkiraan Tes Kemampuan Akademik SMP/MTs/SMPLB/Paket B/PKPPS Wustha'), katJenjang);
      expect(kategoriKegiatan('Perkiraan Asesmen Sumatif Akhir Jenjang /ASAJ SMA/SMK/SMALB'), katJenjang);
      expect(kategoriKegiatan('Hari Guru Nasional'), katKegiatan);
      expect(kategoriKegiatan('Hari Pendidikan Nasional'), katKegiatan);
      expect(kategoriKegiatan('Kegiatan hari PRAMUKA Nasional'), katKegiatan);
      expect(kategoriKegiatan('Kegiatan Penumbuhan Budi Pekerti/Pesantren Ramadhan'), katKegiatan);
    });
  });

  group('uraiTempel + ringkasKet', () {
    test('salinan tabel (tab) semester 2', () {
      const teks = 'Tanggal\tKegiatan\n'
          '11 Januari 2027\tHari pertama masuk sekolah\n'
          '8–12 Februari 2027\tPerkiraan Libur Awal Ramadan 1448 H\n'
          '8–19 Maret 2027\tPerkiraan libur hari raya Idul Fitri 1448 H\n'
          '10 Maret 2027\tPerkiraan Hari Raya Idul Fitri 1448 H\n'
          'Juni 2027\tPelaksanaan LKS Tk. Provinsi\n'
          '7–18 Juni 2027\tPerkiraan Asesmen sumatif akhir tahun/sumatif akhir fase\n'
          '25 Juni 2027\tPembagian rapor semester 2\n'
          '28 Juni–9 Juli 2027\tLibur Akhir Tahun Ajaran 2026/2027';
      final b = uraiTempel(teks);
      expect(b.length, 8);
      expect(b[4].kategori, katKegiatan, reason: 'bulan saja = kegiatan');
      final r = ringkasKet(b);
      expect([isoTgl(r.mulai!), isoTgl(r.rapor!), isoTgl(r.uasDari!), isoTgl(r.uasSampai!)], ['2027-01-11', '2027-06-25', '2027-06-07', '2027-06-18']);
      expect(r.libur.map((x) => '${x['dari']}..${x['sampai']}').toList(),
          ['2027-02-08..2027-02-12', '2027-03-08..2027-03-19', '2027-03-10..2027-03-10', '2027-06-28..2027-07-09']);
      expect(r.libur.first['nama'], 'Libur Awal Ramadan 1448 H', reason: 'awalan "Perkiraan" dibuang');
    });
    test('baris tanpa tab (tanggal di depan) dan kolom terpisah ala PDF', () {
      final a = uraiTempel('15 Juli 2026 Hari pertama masuk sekolah\n28 Desember 2026-8 Januari 2027 Libur semester 1\n3 Mei 2027**) Perkiraan Penetapan Kelulusan');
      expect(a.map((x) => [x.tanggal, x.kategori]).toList(), [
        ['15 Juli 2026', katMulai],
        ['28 Desember 2026-8 Januari 2027', katLibur],
        ['3 Mei 2027**)', katKegiatan],
      ]);
      final p = uraiTempel('17 Agustus 2026\n25 Agustus 2026\nLibur hari Proklamasi\nLibur Maulid Nabi Muhammad SAW.');
      expect(p.map((x) => '${x.tanggal}|${x.kegiatan}').toList(), ['17 Agustus 2026|Libur hari Proklamasi', '25 Agustus 2026|Libur Maulid Nabi Muhammad SAW.']);
    });
  });
}
