import 'package:flutter/material.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';

/// v1.83.0: cetak Jadwal Ujian (untuk siswa / papan pengumuman) dan Jadwal Pengawasan satu masa ujian.
/// PDF F4 berkop; watermark logo ditambahkan otomatis oleh htmlKePdf.

String? get _t => Sesi.instance.token;

const _namaHari = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const _namaBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

String _tglPanjang(String iso) {
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  return '${_namaHari[d.weekday - 1]}, ${d.day} ${_namaBulan[d.month - 1]} ${d.year}';
}

String _kop(Map<String, dynamic> kop) {
  final b = StringBuffer('<div class="kopisi">');
  if (teks(kop['yayasan']).isNotEmpty) b.write('<div class="yy">${escHtml(teks(kop['yayasan']).toUpperCase())}</div>');
  b.write('<div class="lb">${escHtml(teks(kop['nama'], 'PKBM').toUpperCase())}</div>');
  for (final x in barisPiramida(daftar(kop['baris']).map((e) => teks(e)))) {
    b.write('<div class="kecil">${escHtml(x)}</div>');
  }
  b.write('</div><div class="garis"></div>');
  return b.toString();
}

const _css = '.kopisi{text-align:center}.yy{font-size:10pt;font-weight:bold;letter-spacing:.5pt}.lb{font-size:15pt;font-weight:bold}.kecil{font-size:8pt;color:#333}'
    '.garis{border-top:2px solid #111;border-bottom:.5px solid #111;height:2px;margin:4px 0 8px}'
    'h2{text-align:center;font-size:13pt;margin:4px 0 2px}h3{font-size:11pt;margin:12px 0 4px}'
    '.sub{text-align:center;font-size:9.5pt;margin:0 0 8px}.kaki{font-size:8pt;color:#555;margin-top:10px;text-align:right}'
    'table.g{border-collapse:collapse;width:100%}.g th,.g td{border:1px solid #555;padding:4px 5px;font-size:9pt;vertical-align:top}'
    '.g th{background:#e6f2f0}.tgl{background:#f3f8f7;font-weight:bold;vertical-align:middle;white-space:nowrap}.jam{white-space:nowrap}'
    '.mp{font-weight:bold}.kecil2{font-size:8pt;color:#444}.paraf{width:70px}ol{margin:4px 0 0 18px;padding:0}li{font-size:9.5pt;margin:2px 0}'
    '.ttd{width:100%;margin-top:18px}.ttd td{border:none;font-size:10pt;text-align:center;width:50%}';

Future<Map<String, dynamic>?> _data(BuildContext context, String idMasa) async {
  final r = await jalankan(context, () async => peta(await Api.instance('waStafMasaCetak', [_t, idMasa], const Duration(minutes: 2))), teksProses: 'Menyiapkan jadwal...');
  if (!r.ok || r.data == null) return null;
  if (daftar(r.data!['slot']).isEmpty) {
    if (context.mounted) kabar(context, 'Belum ada slot jadwal di masa ujian ini.', galat: true);
    return null;
  }
  return r.data;
}

String _namaBerkas(String awal, Map<String, dynamic> m) => '${awal}_${teks(m['nama']).replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_')}_${tanggalBerkas()}.pdf';

/// Jadwal ujian: per tanggal, jam, mapel, rombel, pelaksanaan + ketentuan peserta.
Future<void> cetakJadwalUjian(BuildContext context, String idMasa) async {
  final d = await _data(context, idMasa);
  if (d == null || !context.mounted) return;
  final m = peta(d['masa']);
  final slot = daftar(d['slot']).map(peta).toList();
  final b = StringBuffer(_kop(peta(d['kop'])));
  b.write('<h2>JADWAL ${escHtml(teks(m['namaJenis']).toUpperCase())}</h2>');
  b.write('<p class="sub">${escHtml(teks(m['nama']))} · ${escHtml(_tglPanjang(teks(m['dari'])))} s.d. ${escHtml(_tglPanjang(teks(m['sampai'])))}<br>Peserta: ${escHtml(teks(m['peserta']))}</p>');
  b.write('<table class="g"><tr><th style="width:120px">Hari, tanggal</th><th style="width:85px">Waktu</th><th>Mata pelajaran</th><th>Rombel</th><th style="width:105px">Pelaksanaan</th></tr>');
  final perTgl = <String, List<Map<String, dynamic>>>{};
  for (final s in slot) {
    perTgl.putIfAbsent(teks(s['tanggal']), () => []).add(s);
  }
  perTgl.forEach((tgl, l) {
    for (var i = 0; i < l.length; i++) {
      final s = l[i];
      final rombel = <String>{for (final r in daftar(s['ruang']).map(peta)) teks(r['rombel']).split(' · ').first}.join(', ');
      b.write('<tr>');
      if (i == 0) b.write('<td class="tgl" rowspan="${l.length}">${escHtml(_tglPanjang(tgl))}</td>');
      b.write('<td class="jam">${escHtml(teks(s['jam']))}–${escHtml(teks(s['selesai']))}<br><span class="kecil2">${s['durasi']} menit</span></td>'
          '<td class="mp">${escHtml(teks(s['mapel']))}</td><td>${escHtml(rombel)}</td><td>${escHtml(teks(s['mode']))}</td></tr>');
    }
  });
  b.write('</table>');
  b.write('<h3>Ketentuan peserta</h3><ol>'
      '<li>Hadir di ruang ujian paling lambat 15 menit sebelum ujian dimulai. Batas masuk ujian adalah 15 menit setelah jam mulai; waktu pengerjaan tetap penuh sejak menekan Mulai.</li>'
      '<li>Ujian online dikerjakan di aplikasi TH.E-Course: masukkan PIN (bila punya) dan TOKEN yang diumumkan pengawas.</li>'
      '<li>Selama ujian dilarang keluar dari aplikasi atau membuka aplikasi lain. Pelanggaran tercatat otomatis dan ujian dapat terkunci.</li>'
      '<li>Satu siswa satu perangkat. Bila perangkat bermasalah, segera lapor pengawas.</li>'
      '<li>Ujian tulis (offline) dikerjakan di kertas di ruang ujian bersama pengawas.</li>'
      '<li>Yang berhalangan hadir mengajukan ujian susulan dari halaman ujian di aplikasi.</li></ol>');
  b.write('<p class="kaki">Dicetak ${escHtml(teks(d['dibuat']))} oleh ${escHtml(teks(d['oleh']))}</p>');
  await htmlKePdf(context, nama: _namaBerkas('Jadwal_Ujian', m), args: [_t, dokumenA4(b.toString(), _css)]);
}

/// Jadwal pengawasan: per slot x ruang + rekap tugas per pengawas + tanda tangan.
Future<void> cetakJadwalPengawas(BuildContext context, String idMasa) async {
  final d = await _data(context, idMasa);
  if (d == null || !context.mounted) return;
  final m = peta(d['masa']);
  final kop = peta(d['kop']);
  final slot = daftar(d['slot']).map(peta).toList();
  final b = StringBuffer(_kop(kop));
  b.write('<h2>JADWAL PENGAWAS ${escHtml(teks(m['namaJenis']).toUpperCase())}</h2>');
  b.write('<p class="sub">${escHtml(teks(m['nama']))} · ${escHtml(_tglPanjang(teks(m['dari'])))} s.d. ${escHtml(_tglPanjang(teks(m['sampai'])))} · Peserta: ${escHtml(teks(m['peserta']))}</p>');
  b.write('<table class="g"><tr><th style="width:120px">Hari, tanggal</th><th style="width:80px">Waktu</th><th>Mata pelajaran</th><th>Rombel</th><th>Ruang</th><th>Pengawas</th><th class="paraf">Paraf</th></tr>');
  final perTgl = <String, List<List<dynamic>>>{};
  final rekap = <String, List<String>>{};
  var kosong = 0;
  for (final s in slot) {
    final ruang = daftar(s['ruang']).map(peta).toList();
    for (final r in ruang.isEmpty ? [<String, dynamic>{}] : ruang) {
      perTgl.putIfAbsent(teks(s['tanggal']), () => []).add([s, r]);
      final pw = teks(r['pengawas']);
      if (pw.isEmpty) {
        kosong++;
      } else {
        rekap.putIfAbsent(pw, () => []).add('${_tglPanjang(teks(s['tanggal']))} ${teks(s['jam'])} · ${teks(s['mapel'])} · ${teks(r['rombel'])}${teks(r['ruang']).isEmpty ? '' : ' (${teks(r['ruang'])})'}');
      }
    }
  }
  perTgl.forEach((tgl, l) {
    for (var i = 0; i < l.length; i++) {
      final s = l[i][0] as Map<String, dynamic>, r = l[i][1] as Map<String, dynamic>;
      b.write('<tr>');
      if (i == 0) b.write('<td class="tgl" rowspan="${l.length}">${escHtml(_tglPanjang(tgl))}</td>');
      b.write('<td class="jam">${escHtml(teks(s['jam']))}–${escHtml(teks(s['selesai']))}</td><td class="mp">${escHtml(teks(s['mapel']))}<br><span class="kecil2">${escHtml(teks(s['mode']))}</span></td>'
          '<td>${escHtml(teks(r['rombel'], '-'))}</td><td>${escHtml(teks(r['ruang'], '-'))}</td><td>${escHtml(teks(r['pengawas'], 'belum ditentukan'))}</td><td></td></tr>');
    }
  });
  b.write('</table>');
  if (kosong > 0) b.write('<p class="kecil2">Catatan: $kosong ruang belum memiliki pengawas.</p>');
  if (rekap.isNotEmpty) {
    b.write('<h3>Rekap tugas per pengawas</h3><table class="g"><tr><th style="width:170px">Pengawas</th><th style="width:55px">Jumlah</th><th>Rincian</th></tr>');
    for (final e in (rekap.entries.toList()..sort((a, c) => a.key.compareTo(c.key)))) {
      b.write('<tr><td class="mp">${escHtml(e.key)}</td><td style="text-align:center">${e.value.length}</td><td>${e.value.map(escHtml).join('<br>')}</td></tr>');
    }
    b.write('</table>');
  }
  b.write('<table class="ttd"><tr><td></td><td>${escHtml(teks(kop['kota']))}${teks(kop['kota']).isEmpty ? '' : ', '}......................<br>Kepala ${escHtml(teks(kop['nama'], 'PKBM'))}'
      '<br><br><br><br>(.....................................)</td></tr></table>');
  b.write('<p class="kaki">Dicetak ${escHtml(teks(d['dibuat']))} oleh ${escHtml(teks(d['oleh']))}</p>');
  await htmlKePdf(context, nama: _namaBerkas('Jadwal_Pengawas', m), args: [_t, dokumenA4(b.toString(), _css, lanskap: true)]);
}
