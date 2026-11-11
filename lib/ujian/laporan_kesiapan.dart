import 'package:flutter/material.dart';

import '../api.dart';
import '../berkas.dart';
import '../config.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

const _namaJenis = {'UTS': 'UTS', 'UAS': 'UAS', 'LAIN': 'Ujian Lainnya', 'TRYOUT': 'Tryout'};

String _persen(num a, num b) => b <= 0 ? '-' : '${(a / b * 100).round()}%';
String _dtk(dynamic ms) => '${((num.tryParse('$ms') ?? 0) / 1000).toStringAsFixed(1)} dtk';

Color _warnaStatus(String s) => switch (s) {
      'Siap' => Colors.green.shade700,
      'Siap dengan catatan' => Colors.orange.shade800,
      _ => Colors.red.shade700,
    };

/// v1.58.0: Laporan Kesiapan Sistem satu Masa Ujian (terutama Tryout): alur peserta, kelancaran, galat, waktu respons,
/// pelanggaran & anti-kecurangan, bank soal, dan kesimpulan kesiapan.
class LaporanKesiapanScreen extends StatelessWidget {
  const LaporanKesiapanScreen({super.key, required this.idMasa});
  final String idMasa;

  Future<void> _cetak(BuildContext context, Map<String, dynamic> d) async {
    final ms = peta(d['masa']);
    await htmlKePdf(context, nama: 'Laporan_Kesiapan_${teks(ms['nama']).replaceAll(' ', '_')}.pdf', args: [_t, dokumenA4(htmlLaporanKesiapan(d), _css)]);
  }

  Widget _angka(BuildContext c, String label, String nilai, {Color? warna}) => Container(
        width: 150,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: (warna ?? Theme.of(c).colorScheme.primary).withValues(alpha: 0.08), borderRadius: BorderRadius.circular(12)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(nilai, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: warna)),
          Text(label, style: const TextStyle(fontSize: 12)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Laporan kesiapan sistem')),
      body: Muatan<Map<String, dynamic>>(
        muat: () async => peta(await Api.instance('waStafMasaLaporan', [_t, idMasa], const Duration(minutes: 5))),
        bangun: (c, d, segar) {
          final ms = peta(d['masa']);
          final rk = peta(d['ringkas']);
          final akt = peta(d['aktivitas']);
          final gal = peta(d['galat']);
          final pel = peta(d['pelanggaran']);
          final bank = peta(d['bank']);
          final kes = peta(d['kesimpulan']);
          final st = teks(kes['status']);
          final mulai = peta(akt['mulai']), kirim = peta(akt['kirim']), masuk = peta(akt['masuk']);
          return RefreshIndicator(
            onRefresh: segar,
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
              Text(teks(ms['nama']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
              Text('${_namaJenis[teks(ms['jenis'])] ?? teks(ms['jenis'])} · ${teks(ms['dari'])} s.d. ${teks(ms['sampai'])} · dibuat ${teks(d['dibuat'])}',
                  style: const TextStyle(fontSize: 12.5)),
              const SizedBox(height: 10),
              Card(
                color: _warnaStatus(st).withValues(alpha: 0.10),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text('Kesimpulan: $st', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: _warnaStatus(st)))),
                      Text('${kes['skor']}/100', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, color: _warnaStatus(st))),
                    ]),
                    const SizedBox(height: 6),
                    for (final x in daftar(kes['catatan']).map(peta))
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Icon(x['baik'] == true ? Icons.check_circle_rounded : Icons.error_rounded, size: 18, color: x['baik'] == true ? Colors.green.shade700 : Colors.red.shade700),
                          const SizedBox(width: 6),
                          Expanded(child: Text(teks(x['teks']), style: const TextStyle(fontSize: 13))),
                        ]),
                      ),
                  ]),
                ),
              ),
              const JudulBagian('Alur peserta'),
              Wrap(spacing: 8, runSpacing: 8, children: [
                _angka(c, 'peserta terdaftar', '${rk['terdaftar']}'),
                _angka(c, 'mulai ujian (${_persen(angka(rk['mulai']), angka(rk['terdaftar']))})', '${rk['mulai']}'),
                _angka(c, 'jawaban terkirim (${_persen(angka(rk['kirim']), angka(rk['mulai']))})', '${rk['kirim']}', warna: Colors.green.shade700),
                _angka(c, 'habis waktu tanpa kirim', '${rk['waktuHabis']}', warna: angka(rk['waktuHabis']) > 0 ? Colors.orange.shade800 : null),
                _angka(c, 'tidak hadir', '${rk['tidakHadir']}'),
                _angka(c, 'masih berlangsung', '${rk['berlangsung']}'),
              ]),
              const JudulBagian('Kelancaran'),
              Card(
                child: Column(children: [
                  ListTile(dense: true, title: const Text('Masuk aplikasi (siswa)'), trailing: Text('${masuk['ok']} berhasil · ${masuk['gagal']} gagal · ${akt['siswaMasuk']} siswa')),
                  ListTile(dense: true, title: const Text('Mulai ujian'), trailing: Text('${mulai['ok']} berhasil · ${mulai['gagal']} gagal')),
                  ListTile(dense: true, title: const Text('Kirim jawaban'), trailing: Text('${kirim['ok']} berhasil · ${kirim['gagal']} gagal')),
                  if (peta(akt['alasanGagal']).isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: Text('Penyebab gagal mulai: ${peta(akt['alasanGagal']).entries.map((e) => '${e.key} ${e.value}').join(' · ')}', style: const TextStyle(fontSize: 12.5)),
                    ),
                ]),
              ),
              const JudulBagian('Waktu respons server'),
              if (daftar(d['respons']).isEmpty) const Kosong(pesan: 'Belum ada data waktu respons (tercatat sejak v1.58.0).'),
              for (final r in daftar(d['respons']).map(peta))
                Card(
                  margin: const EdgeInsets.symmetric(vertical: 3),
                  child: ListTile(
                    dense: true,
                    title: Text(teks(r['nama'])),
                    subtitle: Text('${r['panggilan']} panggilan · terlama ${_dtk(r['terlamaMs'])} · lambat (≥3 dtk) ${r['lambat']} · gagal ${r['gagal']}'),
                    trailing: Text(_dtk(r['rataMs']),
                        style: TextStyle(fontWeight: FontWeight.w800, color: angka(r['rataMs']) >= 3000 ? Colors.red.shade700 : Colors.green.shade700)),
                  ),
                ),
              JudulBagian('Galat', sub: '${gal['jumlah']} galat terkait ujian'),
              for (final g in daftar(gal['teratas']).map(peta))
                ListTile(dense: true, leading: Text('${g['jumlah']}×', style: const TextStyle(fontWeight: FontWeight.w800)), title: Text(teks(g['pesan']))),
              const JudulBagian('Pelanggaran & anti-kecurangan'),
              Wrap(spacing: 8, runSpacing: 8, children: [
                _angka(c, 'siswa melanggar', '${pel['siswa']}', warna: Colors.orange.shade800),
                _angka(c, 'ujian terkunci', '${pel['kunci']}', warna: Colors.red.shade700),
                _angka(c, 'pelanggaran berat', '${pel['berat']}', warna: Colors.red.shade900),
                _angka(c, 'percobaan perangkat lain', '${pel['perangkatLain']}'),
                _angka(c, 'token salah', '${pel['tokenSalah']}'),
                _angka(c, 'koneksi terputus', '${pel['terputus']}'),
              ]),
              const SizedBox(height: 6),
              for (final x in daftar(pel['perJenis']).map(peta)) ListTile(dense: true, title: Text(teks(x['jenis'])), trailing: Text('${x['jumlah']}')),
              if (daftar(pel['tindakan']).isNotEmpty)
                Text('Tindakan pengawas/pimpinan: ${daftar(pel['tindakan']).map(peta).map((x) => '${teks(x['jenis'])} ${x['jumlah']}').join(' · ')}', style: const TextStyle(fontSize: 12.5)),
              JudulBagian('Bank soal', sub: peta(bank['ringkas']).entries.map((e) => '${e.key} ${e.value}').join(' · ')),
              for (final b in daftar(bank['kurang']).map(peta))
                ListTile(dense: true, title: Text('${teks(b['mapel'])} · ${teks(b['rombel'])}'), subtitle: Text('${b['bank']} soal di bank / perlu ${b['perlu']}'), trailing: Lencana(teks(b['status']))),
              const JudulBagian('Per jadwal'),
              for (final j in daftar(d['jadwal']).map(peta))
                Card(
                  margin: const EdgeInsets.symmetric(vertical: 3),
                  child: ListTile(
                    dense: true,
                    title: Text('${teks(j['mapel'])} · ${teks(j['rombel'])}'),
                    subtitle: Text('${teks(j['tanggal'])} ${teks(j['jam'])} · ${j['terdaftar']} terdaftar · ${j['mulai']} mulai · ${j['kirim']} kirim'
                        '${angka(j['waktuHabis']) > 0 ? ' · ${j['waktuHabis']} habis waktu' : ''}${angka(j['terkunci']) > 0 ? ' · ${j['terkunci']} terkunci' : ''}'),
                    trailing: Text(j['rata'] == null ? '-' : 'rata ${j['rata']}'),
                  ),
                ),
              const SizedBox(height: 12),
              FilledButton.icon(onPressed: () => _cetak(context, d), icon: const Icon(Icons.picture_as_pdf_outlined), label: const Text('Cetak laporan (PDF F4)')),
            ]),
          );
        },
      ),
    );
  }
}

const _css = '.kop{text-align:center;border-bottom:3px double #333;padding-bottom:6px;margin-bottom:10px}.lb{font-size:15pt;font-weight:bold}'
    'h2{text-align:center;font-size:13pt;margin:10px 0 2px}.sub{text-align:center;margin-bottom:10px}h3{font-size:11pt;margin:12px 0 4px}'
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:3px 5px;font-size:9.5pt;vertical-align:top}th{background:#eee}.c{text-align:center}'
    '.ok{color:#166534}.no{color:#b91c1c}.box{border:1px solid #555;padding:6px 8px;margin:6px 0}';

String htmlLaporanKesiapan(Map<String, dynamic> d) {
  final ms = peta(d['masa']), sk = peta(d['sekolah']), rk = peta(d['ringkas']), akt = peta(d['aktivitas']), gal = peta(d['galat']);
  final pel = peta(d['pelanggaran']), bank = peta(d['bank']), kes = peta(d['kesimpulan']);
  String baris(List<String> sel, {bool kepala = false}) => '<tr>${sel.map((x) => kepala ? '<th>${escHtml(x)}</th>' : '<td>${escHtml(x)}</td>').join()}</tr>';
  final b = StringBuffer()
    ..write('<div class="kop"><div class="lb">${escHtml(teks(sk['nama'], kNamaSekolah).toUpperCase())}</div><div>NPSN ${escHtml(kNpsn)} · ${escHtml(teks(sk['alamat'], kAlamatLembaga))}</div></div>')
    ..write('<h2>LAPORAN KESIAPAN SISTEM UJIAN</h2><div class="sub">${escHtml(teks(ms['nama']))} (${escHtml(_namaJenis[teks(ms['jenis'])] ?? teks(ms['jenis']))}) · '
        '${escHtml(teks(ms['dari']))} s.d. ${escHtml(teks(ms['sampai']))}<br>Dibuat ${escHtml(teks(d['dibuat']))} oleh ${escHtml(teks(d['oleh']))}</div>')
    ..write('<div class="box"><b>Kesimpulan: ${escHtml(teks(kes['status']))} (${kes['skor']}/100)</b><ul>')
    ..write(daftar(kes['catatan']).map(peta).map((x) => '<li class="${x['baik'] == true ? 'ok' : 'no'}">${escHtml(x['teks'])}</li>').join())
    ..write('</ul></div>')
    ..write('<h3>1. Alur peserta</h3><table>${baris(['Terdaftar', 'Mulai', 'Terkirim', 'Habis waktu', 'Tidak hadir', 'Berlangsung'], kepala: true)}'
        '${baris(['${rk['terdaftar']}', '${rk['mulai']}', '${rk['kirim']}', '${rk['waktuHabis']}', '${rk['tidakHadir']}', '${rk['berlangsung']}'])}</table>');
  final masuk = peta(akt['masuk']), mulai = peta(akt['mulai']), kirim = peta(akt['kirim']);
  b.write('<h3>2. Kelancaran</h3><table>${baris(['Proses', 'Berhasil', 'Gagal'], kepala: true)}'
      '${baris(['Masuk aplikasi (${akt['siswaMasuk']} siswa)', '${masuk['ok']}', '${masuk['gagal']}'])}${baris(['Mulai ujian', '${mulai['ok']}', '${mulai['gagal']}'])}'
      '${baris(['Kirim jawaban', '${kirim['ok']}', '${kirim['gagal']}'])}</table>');
  if (peta(akt['alasanGagal']).isNotEmpty) b.write('<p>Penyebab gagal mulai: ${escHtml(peta(akt['alasanGagal']).entries.map((e) => '${e.key} ${e.value}').join('; '))}</p>');
  b.write('<h3>3. Waktu respons server</h3><table>${baris(['Proses', 'Panggilan', 'Rata-rata', 'Terlama', 'Lambat (≥3 dtk)', 'Gagal'], kepala: true)}');
  for (final r in daftar(d['respons']).map(peta)) {
    b.write(baris([teks(r['nama']), '${r['panggilan']}', _dtk(r['rataMs']), _dtk(r['terlamaMs']), '${r['lambat']}', '${r['gagal']}']));
  }
  b.write('</table><h3>4. Galat (${gal['jumlah']})</h3><table>${baris(['Jumlah', 'Pesan'], kepala: true)}');
  for (final g in daftar(gal['teratas']).map(peta)) {
    b.write(baris(['${g['jumlah']}', teks(g['pesan'])]));
  }
  b.write('</table><h3>5. Pelanggaran & anti-kecurangan</h3><table>${baris(['Siswa melanggar', 'Terkunci', 'Pelanggaran berat', 'Perangkat lain', 'Token salah', 'Koneksi terputus'], kepala: true)}'
      '${baris(['${pel['siswa']}', '${pel['kunci']}', '${pel['berat']}', '${pel['perangkatLain']}', '${pel['tokenSalah']}', '${pel['terputus']}'])}</table>');
  if (daftar(pel['perJenis']).isNotEmpty) {
    b.write('<table style="margin-top:4px">${baris(['Jenis kejadian', 'Jumlah'], kepala: true)}');
    for (final x in daftar(pel['perJenis']).map(peta)) {
      b.write(baris([teks(x['jenis']), '${x['jumlah']}']));
    }
    b.write('</table>');
  }
  b.write('<h3>6. Bank soal</h3><p>${escHtml(peta(bank['ringkas']).entries.map((e) => '${e.key} ${e.value}').join(' · '))}</p>');
  if (daftar(bank['kurang']).isNotEmpty) {
    b.write('<table>${baris(['Mapel', 'Rombel', 'Status', 'Bank / perlu'], kepala: true)}');
    for (final x in daftar(bank['kurang']).map(peta)) {
      b.write(baris([teks(x['mapel']), teks(x['rombel']), teks(x['status']), '${x['bank']} / ${x['perlu']}']));
    }
    b.write('</table>');
  }
  b.write('<h3>7. Per jadwal</h3><table>${baris(['Tanggal', 'Mapel', 'Rombel', 'Terdaftar', 'Mulai', 'Kirim', 'Habis waktu', 'Terkunci', 'Rata-rata'], kepala: true)}');
  for (final j in daftar(d['jadwal']).map(peta)) {
    b.write(baris(['${teks(j['tanggal'])} ${teks(j['jam'])}', teks(j['mapel']), teks(j['rombel']), '${j['terdaftar']}', '${j['mulai']}', '${j['kirim']}', '${j['waktuHabis']}',
        '${j['terkunci']}', j['rata'] == null ? '-' : '${j['rata']}']));
  }
  b.write('</table>');
  return b.toString();
}
