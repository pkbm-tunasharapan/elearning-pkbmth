import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../api.dart';
import '../berkas.dart';
import '../config.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

const _bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

String _tglPanjang(String iso) {
  final p = iso.split('-');
  if (p.length != 3) return iso;
  final b = int.tryParse(p[1]) ?? 0;
  return '${int.tryParse(p[2]) ?? p[2]} ${b >= 1 && b <= 12 ? _bulan[b - 1] : p[1]} ${p[0]}';
}

String _programPanjang(String p) => switch (p.toUpperCase()) {
      'PKT-A' => 'PROGRAM PAKET A SETARA SD/MI',
      'PKT-B' => 'PROGRAM PAKET B SETARA SMP/MTs',
      'PKT-C' => 'PROGRAM PAKET C SETARA SMA/MA',
      _ => p.toUpperCase(),
    };

String _kota(String alamat) {
  final bag = alamat.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
  if (bag.isEmpty) return '';
  return bag.last.replaceFirst(RegExp(r'^(Kab\.?|Kabupaten|Kota)\s*', caseSensitive: false), '');
}

String _isi(String v) => v.trim().isEmpty ? '<span class="titik">&nbsp;</span>' : escHtml(v);

const _css = '.hal{page-break-after:always}.hal:last-child{page-break-after:auto}'
    '.cover{width:100%;height:295mm;border:3px double #5b2a6e;border-collapse:collapse}.cover td{border:none;text-align:center;padding:12mm 12mm 0;vertical-align:top}.cover td.bawah{vertical-align:bottom;padding:0 12mm 12mm}'
    '.ct1{font-size:20pt;font-weight:bold;letter-spacing:1px;color:#3b1d4a;line-height:1.3}'
    '.ct2{font-size:12.5pt;font-weight:bold;margin-top:5mm;color:#1f5f52;line-height:1.4}'
    '.logo{margin:14mm 0 12mm}.logo img{width:62mm}'
    '.lbl{font-size:11pt;margin-top:6mm}.kotak{border:1.5px solid #333;border-radius:3px;margin:2mm auto 0;width:120mm;padding:3mm;font-size:14pt;font-weight:bold;letter-spacing:.5px}'
    '.kaki{font-size:10.5pt;line-height:1.45}.kaki .nm{font-size:15pt;font-weight:bold;color:#3b1d4a;letter-spacing:1px}'
    'h2{text-align:center;font-size:13pt;margin:4mm 0 8mm;letter-spacing:.5px}'
    '.bio{width:100%;border-collapse:collapse}.bio td{border:none;padding:1.6mm 1.5mm;font-size:11pt;vertical-align:top}'
    '.bio .no{width:8mm}.bio .lb{width:62mm}.bio .tt{width:4mm}.bio .sub{padding-left:6mm}'
    '.titik{display:inline-block;width:95%;border-bottom:1px dotted #555}'
    '.ttd{width:100%;margin-top:8mm;border-collapse:collapse}.ttd td{border:none;vertical-align:top;font-size:11pt}'
    '.ttd td.foto,.foto{width:30mm;height:40mm;border:1px solid #333;text-align:center;vertical-align:middle;font-size:9pt;color:#666}';

/// HTML cover + biodata (dua halaman per warga belajar).
/// [program] (v1.39.3): jenjang cover yang dipilih (PKT-A/PKT-B/PKT-C); bawaan = program rombel sekarang.
/// Data pribadi tetap sama; bila jenjang berbeda dari rombel sekarang, isian "Di Rombel" dikosongkan (diisi tangan).
String coverBiodataHtml(Map<String, dynamic> d, List<Map<String, dynamic>> siswa, String logoB64, {String? program}) {
  final l = peta(d['lembaga']);
  final rb = peta(d['rombel']);
  final programKini = teks(rb['program']).toUpperCase();
  final prog = (program == null || program.isEmpty) ? programKini : program.toUpperCase();
  final rombelDiterima = prog == programKini ? teks(rb['nama']) : '';
  final namaLembaga = kNamaSekolah.toUpperCase();
  final kepala = teks(l['kepala']);
  final kota = _kota(kAlamatLembaga);
  final b = StringBuffer();
  for (final s in siswa) {
    // ── cover ──
    b.write('<div class="hal"><table class="cover"><tr><td>'
        '<div class="ct1">LAPORAN<br>HASIL BELAJAR PESERTA DIDIK</div>'
        '<div class="ct2">PENDIDIKAN KESETARAAN<br>${escHtml(_programPanjang(prog))}</div>'
        '<div class="logo"><img src="data:image/jpeg;base64,$logoB64"></div>'
        '<div class="lbl">Nama Peserta Didik</div><div class="kotak">${escHtml(teks(s['nama']).toUpperCase())}</div>'
        '<div class="lbl">NISN</div><div class="kotak">${escHtml(teks(s['nisn'], '-'))}</div>'
        '</td></tr><tr><td class="bawah"><div class="kaki"><div class="nm">$namaLembaga</div>NPSN ${escHtml(kNpsn)}<br>${escHtml(kAlamatLembaga)}<br>e-Mail: ${escHtml(kEmailLembaga)}</div>'
        '</td></tr></table></div>');
    // ── biodata ──
    final jk = switch (teks(s['jk']).toUpperCase()) { 'L' => 'Laki-laki', 'P' => 'Perempuan', _ => teks(s['jk']) };
    final ttl = [teks(s['tempatLahir']), if (teks(s['tglLahir']).isNotEmpty) _tglPanjang(teks(s['tglLahir']))].where((x) => x.isNotEmpty).join(', ');
    String baris(String no, String label, String nilai, {bool sub = false, bool judul = false}) =>
        '<tr><td class="no">$no</td><td class="lb${sub ? ' sub' : ''}">$label</td><td class="tt">${judul ? '' : ':'}</td><td>${judul ? '' : _isi(nilai)}</td></tr>';
    b.write('<div class="hal"><h2>KETERANGAN TENTANG DIRI PESERTA DIDIK</h2><table class="bio">');
    b.write(baris('1.', 'Nama Peserta Didik (Lengkap)', teks(s['nama'])));
    b.write(baris('2.', 'Nomor Induk Siswa Nasional', teks(s['nisn'])));
    b.write(baris('3.', 'Nomor Induk Kependudukan', teks(s['nik'])));
    b.write(baris('4.', 'Tempat, Tanggal Lahir', ttl));
    b.write(baris('5.', 'Jenis Kelamin', jk));
    b.write(baris('6.', 'Agama', teks(s['agama'])));
    b.write(baris('7.', 'Anak ke', teks(s['anakKe'])));
    b.write(baris('8.', 'Alamat Peserta Didik', teks(s['alamat'])));
    b.write(baris('9.', 'Nomor Telepon/HP', teks(s['hp'])));
    b.write(baris('10.', 'Sekolah Asal', teks(s['sekolahAsal'])));
    b.write(baris('11.', 'Diterima di satuan pendidikan ini', '', judul: true));
    b.write(baris('', 'a. Di Rombel', rombelDiterima, sub: true));
    b.write(baris('', 'b. Pada Tanggal', '', sub: true));
    b.write(baris('12.', 'Nama Orang Tua', '', judul: true));
    b.write(baris('', 'a. Ayah', teks(s['ayah']), sub: true));
    b.write(baris('', 'b. Ibu', teks(s['ibu']), sub: true));
    b.write(baris('13.', 'Pekerjaan Orang Tua', '', judul: true));
    b.write(baris('', 'a. Ayah', teks(s['kerjaAyah']), sub: true));
    b.write(baris('', 'b. Ibu', teks(s['kerjaIbu']), sub: true));
    b.write(baris('14.', 'Nama Wali Peserta Didik', teks(s['wali'])));
    b.write(baris('15.', 'Pekerjaan Wali Peserta Didik', teks(s['kerjaWali'])));
    b.write('</table><table class="ttd"><tr><td style="width:45%;padding-left:20mm"><table><tr><td class="foto">Pas foto<br>3 × 4</td></tr></table></td>'
        '<td>${escHtml(kota)}${kota.isEmpty ? '' : ', '}${tanggalIni()}<br>Kepala $namaLembaga<br><br><br><br><br>'
        '<b><u>${kepala.isEmpty ? '..............................' : escHtml(kepala)}</u></b></td></tr></table></div>');
  }
  return dokumenA4(b.toString(), _css);
}

/// Ambil biodata rombel lalu cetak cover + biodata (semua siswa, atau satu bila [idWb] diisi).
Future<void> cetakCoverBiodata(BuildContext context, {required String idRombel, required String namaRombel, String? idWb, String? namaWb, String? nisn}) async {
  final r = await jalankan(context, () async {
    final d = peta(await Api.instance('waStafBiodataRombel', [_t, idRombel], const Duration(minutes: 2)));
    final logo = base64Encode((await rootBundle.load('assets/logo_rapor.jpg')).buffer.asUint8List());
    var siswa = daftar(d['siswa']).map(peta).toList();
    if (idWb != null || nisn != null || namaWb != null) {
      bool cocok(Map<String, dynamic> s) =>
          (idWb != null && idWb.isNotEmpty && teks(s['idWb']) == idWb) ||
          (nisn != null && nisn.isNotEmpty && teks(s['nisn']) == nisn) ||
          (namaWb != null && namaWb.isNotEmpty && teks(s['nama']).toLowerCase() == namaWb.trim().toLowerCase());
      siswa = siswa.where(cocok).take(1).toList();
    }
    if (siswa.isEmpty) throw ApiException('Warga belajar tidak ditemukan di rombel ini.');
    return (d: d, siswa: siswa, logo: logo, kurang: siswa.where((s) => s['adaBiodata'] != true).length);
  }, teksProses: 'Menyiapkan cover & biodata...');
  if (!r.ok || !context.mounted) return;
  // v1.39.3: pilih jenjang cover (Paket A / B / C); bawaan = program rombel sekarang
  final prog = await pilihJenjangCover(context, teks(peta(r.data!.d['rombel'])['program']));
  if (prog == null || !context.mounted) return;
  final html = coverBiodataHtml(r.data!.d, r.data!.siswa, r.data!.logo, program: prog);
  if (r.data!.kurang > 0) {
    kabar(context, '${r.data!.kurang} siswa belum punya biodata lengkap (agama, alamat, orang tua). Jalankan Impor Dapodik untuk melengkapinya; kolom kosong dicetak bergaris titik.');
  }
  // v1.79.7: cover rapor tetap dengan logonya sendiri, tanpa watermark
  await htmlKePdf(context, watermark: false, nama: 'Cover_Biodata_${prog.replaceAll('PKT-', 'Paket_')}_${(namaWb ?? namaRombel).replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_')}.pdf', args: [_t, html]);
}

/// v1.39.3: pilihan jenjang cover rapor. Mengembalikan 'PKT-A' | 'PKT-B' | 'PKT-C', atau null bila batal.
Future<String?> pilihJenjangCover(BuildContext context, String programKini) {
  final kini = programKini.toUpperCase();
  var pilih = const ['PKT-A', 'PKT-B', 'PKT-C'].contains(kini) ? kini : 'PKT-C';
  return showDialog<String>(
    context: context,
    builder: (c) => StatefulBuilder(
      builder: (c, atur) => AlertDialog(
        title: const Text('Jenjang cover rapor'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Data pribadi warga belajar tetap sama. Pilih jenjang yang dicetak di cover.', style: TextStyle(fontSize: 13)),
          const SizedBox(height: 8),
          for (final p in const [('PKT-A', 'Paket A', 'setara SD/MI'), ('PKT-B', 'Paket B', 'setara SMP/MTs'), ('PKT-C', 'Paket C', 'setara SMA/MA')])
            ListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              onTap: () => atur(() => pilih = p.$1),
              leading: Icon(pilih == p.$1 ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded,
                  color: pilih == p.$1 ? Theme.of(c).colorScheme.primary : null),
              title: Text(p.$2 + (p.$1 == kini ? ' (jenjang sekarang)' : '')),
              subtitle: Text(p.$3),
            ),
          if (pilih != kini)
            const Text('Isian "Diterima di rombel" dikosongkan agar diisi sesuai jenjang tersebut.', style: TextStyle(fontSize: 12)),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, pilih), child: const Text('Cetak')),
        ],
      ),
    ),
  );
}
