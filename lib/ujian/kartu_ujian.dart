import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../siswa/sesi_siswa.dart';
import '../widgets.dart';
import 'kelayakan.dart';

/// v1.93.4: Kartu Peserta Ujian (format mirip KTPU) untuk ujian serentak (Masa Ujian).
/// Memuat identitas, kode akses siswa (satu per siswa), dan jadwal per hari: jam, mapel, durasi, mode,
/// serta ruang/tempat untuk ujian tulis atau masa di unit. Token tetap dari pengawas saat mulai.

// ───────────────────────── HTML / PDF ─────────────────────────

Future<String> _logoKop(Map<String, dynamic> kop) async {
  if (teks(kop['logo']).isNotEmpty) return 'data:image/png;base64,${teks(kop['logo'])}';
  try {
    return 'data:image/png;base64,${base64Encode((await rootBundle.load('assets/logo_kop.png')).buffer.asUint8List())}';
  } catch (_) {
    return '';
  }
}

const _cssKartu = '.hal{page-break-after:always}.hal:last-child{page-break-after:auto}'
    '.kopt{width:100%;border-collapse:collapse}.kopt td{border:none;vertical-align:middle}.kopisi{text-align:center}'
    '.yy{font-size:10pt;font-weight:bold}.lb{font-size:16pt;font-weight:bold}.kecil{font-size:8pt;color:#333}'
    '.garis{border-top:2px solid #111;border-bottom:.5px solid #111;height:2px;margin:4px 0 8px}'
    'h2{text-align:center;font-size:12.5pt;margin:6px 0 8px}'
    '.id{width:100%;border-collapse:collapse;margin-bottom:8px}.id td{border:none;padding:2px 4px;font-size:10pt;vertical-align:top}.id td.l{color:#555;width:16%}'
    '.kode{border:2px solid #111;border-radius:6px;padding:6px 10px;text-align:center}.kode b{font-size:20pt;letter-spacing:4px}'
    'table.j{width:100%;border-collapse:collapse;margin-top:6px}table.j th,table.j td{border:1px solid #444;padding:3px 5px;font-size:9.5pt}'
    'table.j th{background:#eee}.hari td{background:#f3f3f3;font-weight:bold}.c{text-align:center}'
    '.dis{display:inline-block;margin-top:4px;border:1.5px solid #b45309;color:#b45309;border-radius:4px;padding:1px 8px;font-size:9.5pt;letter-spacing:1px}'
    '.ket{font-size:8.8pt;margin-top:8px}.ket ol{margin:2px 0 0 16px;padding:0}.kaki{margin-top:12px;font-size:8.5pt;color:#444;display:flex;justify-content:space-between}';

String _esc(dynamic s) => escHtml(s);

String _kopHtml(Map<String, dynamic> kop) {
  final b = StringBuffer('<div class="kopisi">');
  if (teks(kop['yayasan']).isNotEmpty) b.write('<div class="yy">${_esc(teks(kop['yayasan']).toUpperCase())}</div>');
  b.write('<div class="lb">${_esc(teks(kop['nama'], 'PKBM').toUpperCase())}</div>');
  for (final x in barisPiramida(daftar(kop['baris']).map((e) => teks(e)))) {
    b.write('<div class="kecil">${_esc(x)}</div>');
  }
  b.write('</div><div class="garis"></div>');
  return b.toString();
}

/// Satu halaman kartu per siswa per masa.
String _halamanKartu(Map<String, dynamic> k, Map<String, dynamic> masa, Map<String, dynamic> kop, String dicetak) {
  final adaRuang = masa['adaRuang'] == true;
  final b = StringBuffer('<div class="hal">')
    ..write(_kopHtml(kop))
    ..write('<h2>KARTU PESERTA UJIAN<br><span style="font-size:10.5pt;font-weight:normal">${_esc(teks(masa['nama']))}</span>'
        '${masa['dispensasi'] == true ? '<br><span class="dis">PESERTA DENGAN DISPENSASI</span>' : ''}</h2>')
    ..write('<table class="id"><tr><td class="l">Nama</td><td>: <b>${_esc(teks(k['nama']))}</b></td><td rowspan="4" style="width:30%">'
        '<div class="kode">KODE AKSES<br><b>${_esc(teks(k['kodeAkses'], '-'))}</b><div class="kecil">pribadi · jangan dibagikan</div></div></td></tr>'
        '<tr><td class="l">NISN</td><td>: ${_esc(teks(k['nisn'], '-'))}</td></tr>'
        '<tr><td class="l">Rombel</td><td>: ${_esc(teks(k['rombel']))}${teks(k['unit']).isEmpty ? '' : ' · ${_esc(teks(k['unit']))}'}</td></tr>'
        '<tr><td class="l">Pelaksanaan</td><td>: ${_esc(teks(masa['tempat'], 'Online lewat aplikasi TH.E-Course'))}</td></tr></table>')
    ..write('<table class="j"><tr><th>Sesi</th><th>Pukul</th><th>Mata Pelajaran</th><th>Durasi</th><th>Mode</th>${adaRuang ? '<th>Tempat / Ruang</th>' : ''}</tr>');
  for (final h in daftar(masa['hari']).map(peta)) {
    b.write('<tr class="hari"><td colspan="${adaRuang ? 6 : 5}">HARI KE-${h['ke']} : ${_esc(teks(h['teks']).toUpperCase())}</td></tr>');
    for (final x in daftar(h['item']).map(peta)) {
      final tempat = [teks(x['tempat']), if (teks(x['ruang']).isNotEmpty) 'Ruang ${teks(x['ruang'])}'].where((e) => e.isNotEmpty).join(' · ');
      b.write('<tr><td class="c">KE-${x['sesi']}</td><td class="c">${_esc(teks(x['jam']))}–${_esc(teks(x['selesai']))} WIB</td><td>${_esc(teks(x['mapel']))}</td>'
          '<td class="c">${x['durasi']} menit</td><td class="c">${_esc(teks(x['mode']))}</td>${adaRuang ? '<td>${_esc(tempat.isEmpty ? '-' : tempat)}</td>' : ''}</tr>');
    }
  }
  b
    ..write('</table>')
    ..write('<div class="ket"><b>Ketentuan:</b><ol>'
        '<li>Bawa HP dengan baterai penuh dan kuota/internet yang cukup; masuk ke aplikasi sebelum ujian dimulai.</li>'
        '<li>Saat memulai ujian, isi <b>kode akses</b> di kartu ini, <b>PIN</b> Anda, dan <b>token</b> yang diumumkan pengawas.</li>'
        '<li>Ujian dapat dimulai paling lambat 15 menit setelah dibuka. Terlambat lebih dari itu, ajukan susulan lewat aplikasi.</li>'
        '<li>Selama ujian jangan keluar dari aplikasi. Berpindah aplikasi dicatat sebagai pelanggaran dan dapat mengunci ujian.</li>'
        '<li>Kode akses bersifat pribadi. Jangan memberikannya kepada siapa pun.</li>'
        '${masa['dispensasi'] == true ? '<li>Anda mengikuti ujian dengan <b>dispensasi</b>: nilai dan hasil ujian ini tidak ditampilkan kepada Anda karena status kelayakan tidak terpenuhi.</li>' : ''}'
        '</ol></div>')
    ..write('<div class="kaki"><span>Tanggal cetak: ${_esc(dicetak)}</span><span>${_esc(teks(k['nisn'], '-'))} / ${_esc(teks(k['nama']))}</span></div>')
    ..write('</div>');
  return b.toString();
}

/// kartu: [{nama, nisn, rombel, unit, kodeAkses, masa:[...]}]
Future<String> htmlKartuUjian(List<Map<String, dynamic>> kartu, Map<String, dynamic> kop, String dicetak) async {
  final b = StringBuffer(await watermarkHtml(await _logoKop(kop)));
  for (final k in kartu) {
    for (final m in daftar(k['masa']).map(peta)) {
      if (m['terkunci'] == true) continue;   // v1.94.0: belum layak -> tidak dicetak
      b.write(_halamanKartu(k, m, kop, dicetak));
    }
  }
  return dokumenA4(b.toString(), _cssKartu);
}

// ───────────────────────── layar siswa ─────────────────────────

class KartuUjianSiswaScreen extends StatelessWidget {
  const KartuUjianSiswaScreen({super.key});

  Future<void> _unduh(BuildContext context, Map<String, dynamic> d) async {
    final html = await htmlKartuUjian([d], peta(d['kop']), teks(d['dicetak']));
    if (!context.mounted) return;
    await htmlKePdf(context, nama: 'Kartu_Ujian_${teks(d['nama']).replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_')}.pdf', fn: 'waSiswaHtmlPdf', args: [SesiSiswa.instance.token, html], watermark: false);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Kartu Ujian')),
      body: Muatan<Map<String, dynamic>>(
        muat: () async => peta(await Api.instance('waSiswaKartuUjian', [SesiSiswa.instance.token], const Duration(minutes: 2))),
        bangun: (context, d, segarkan) {
          final masa = daftar(d['masa']).map(peta).toList();
          final bisaCetak = masa.any((m) => m['terkunci'] != true);
          return RefreshIndicator(
            onRefresh: segarkan,
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(teks(d['nama']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                        Text('NISN ${teks(d['nisn'], '-')} · ${teks(d['rombel'])}${teks(d['unit']).isEmpty ? '' : ' · ${teks(d['unit'])}'}',
                            style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
                      ]),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(color: cs.primaryContainer, borderRadius: BorderRadius.circular(12)),
                      child: Column(children: [
                        const Text('KODE AKSES', style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700)),
                        Text(teks(d['kodeAkses'], '-'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 3)),
                      ]),
                    ),
                    IconButton(
                      tooltip: 'Salin kode akses',
                      onPressed: teks(d['kodeAkses']).isEmpty || d['kodeTerkunci'] == true
                          ? null
                          : () async {
                              await Clipboard.setData(ClipboardData(text: teks(d['kodeAkses'])));
                              if (context.mounted) kabar(context, 'Kode akses disalin.');
                            },
                      icon: const Icon(Icons.copy_rounded),
                    ),
                  ]),
                ),
              ),
              Text(d['kodeTerkunci'] == true
                  ? 'Kode akses tampil setelah Anda layak mengikuti ujian (atau dispensasi disetujui).'
                  : 'Saat mulai ujian, isi kode akses ini, PIN Anda, dan token dari pengawas.', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
              const SizedBox(height: 8),
              if (masa.isEmpty) const Kosong(pesan: 'Belum ada ujian serentak yang dijadwalkan untuk Anda.', ikon: Icons.event_available_outlined),
              for (final m in masa) ...[
                JudulBagian(teks(m['nama']), sub: teks(m['tempat'])),
                if (m['terkunci'] == true || m['dispensasi'] == true) _StatusKelayakan(m: m),
                for (final h in daftar(m['hari']).map(peta))
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('Hari ke-${h['ke']} · ${teks(h['teks'])}', style: const TextStyle(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 4),
                        for (final x in daftar(h['item']).map(peta))
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              SizedBox(width: 92, child: Text('${teks(x['jam'])}–${teks(x['selesai'])}', style: const TextStyle(fontWeight: FontWeight.w700))),
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(teks(x['mapel']), style: const TextStyle(fontWeight: FontWeight.w600)),
                                  Text([
                                    '${x['durasi']} menit',
                                    teks(x['mode']),
                                    if (teks(x['tempat']).isNotEmpty) teks(x['tempat']),
                                    if (teks(x['ruang']).isNotEmpty) 'Ruang ${teks(x['ruang'])}',
                                  ].join(' · '), style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                                ]),
                              ),
                            ]),
                          ),
                      ]),
                    ),
                  ),
              ],
              const SizedBox(height: 12),
              if (bisaCetak)
                FilledButton.icon(onPressed: () => _unduh(context, d), icon: const Icon(Icons.picture_as_pdf_outlined), label: const Text('Unduh kartu ujian (PDF)')),
            ]),
          );
        },
      ),
    );
  }
}

// ───────────────────────── petugas: cetak per masa ─────────────────────────

Future<void> cetakKartuMasa(BuildContext context, String idMasa) async {
  final r = await jalankan(context, () async => peta(await Api.instance('waStafMasaKartu', [Sesi.instance.token, idMasa, ''], const Duration(minutes: 5))),
      teksProses: 'Menyusun kartu peserta...');
  if (!r.ok || !context.mounted) return;
  final d = r.data!;
  final rombel = daftar(d['rombel']).map(peta).toList();
  final semua = daftar(d['kartu']).map(peta).toList();
  final belum = daftar(d['belumLayak']).map(peta).toList();
  if (semua.isEmpty) {
    return kabar(context, belum.isEmpty ? 'Belum ada peserta yang punya jadwal di masa ujian ini.' : 'Semua ${belum.length} peserta belum layak; kartu tidak dicetak.', galat: true);
  }
  final pilih = await showDialog<String>(
    context: context,
    builder: (c) => SimpleDialog(
      title: const Text('Cetak kartu peserta'),
      children: [
        if (belum.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
            child: Text('${belum.length} siswa belum layak tidak dicetak (kecuali dispensasinya disetujui): '
                '${belum.take(8).map((x) => teks(x['nama'])).join(', ')}${belum.length > 8 ? ', …' : ''}.',
                style: TextStyle(fontSize: 12.5, color: Theme.of(c).colorScheme.error)),
          ),
        SimpleDialogOption(onPressed: () => Navigator.pop(c, '*'), child: Text('Semua peserta (${semua.length} siswa)')),
        for (final rb in rombel)
          SimpleDialogOption(
            onPressed: () => Navigator.pop(c, teks(rb['nama'])),
            child: Text('${teks(rb['nama'])} (${semua.where((k) => teks(k['rombel']) == teks(rb['nama'])).length} siswa)'),
          ),
      ],
    ),
  );
  if (pilih == null || !context.mounted) return;
  final kartu = pilih == '*' ? semua : semua.where((k) => teks(k['rombel']) == pilih).toList();
  if (kartu.isEmpty) return kabar(context, 'Tidak ada peserta di rombel ini.', galat: true);
  final html = await htmlKartuUjian(kartu, peta(d['kop']), teks(d['dicetak']));
  if (!context.mounted) return;
  await htmlKePdf(context, nama: 'Kartu_Peserta_${teks(peta(d['masa'])['nama']).replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_')}.pdf', args: [Sesi.instance.token, html], watermark: false);
}

/// v1.94.0: status kelayakan satu masa di kartu siswa (terkunci / dispensasi).
class _StatusKelayakan extends StatelessWidget {
  const _StatusKelayakan({required this.m});
  final Map<String, dynamic> m;

  @override
  Widget build(BuildContext context) {
    final k = peta(m['kelayakan']);
    final kunci = m['terkunci'] == true;
    final warna = kunci ? Theme.of(context).colorScheme.error : Colors.orange.shade800;
    return Card(
      color: warna.withValues(alpha: 0.08),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(kunci ? Icons.lock_rounded : Icons.verified_user_outlined, color: warna, size: 20),
            const SizedBox(width: 8),
            Expanded(child: Text(kunci ? 'Kartu terkunci: belum layak ${teks(k['ujian'])}' : 'Peserta dengan dispensasi', style: TextStyle(fontWeight: FontWeight.w800, color: warna))),
          ]),
          const SizedBox(height: 4),
          if (kunci && teks(k['alasan']).isNotEmpty) Text('Belum memenuhi: ${teks(k['alasan'])}.', style: const TextStyle(fontSize: 12.5)),
          if (kunci && teks(k['proses']).isNotEmpty) Text('Permohonan dispensasi Anda: ${teks(k['proses'])}.', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
          if (!kunci)
            const Text('Anda boleh mengikuti ujian ini, tetapi nilai dan hasilnya tidak ditampilkan kepada Anda karena status kelayakan tidak terpenuhi.',
                style: TextStyle(fontSize: 12.5)),
          if (kunci)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                style: TextButton.styleFrom(padding: EdgeInsets.zero),
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const KelayakanSiswaScreen())),
                icon: const Icon(Icons.send_rounded, size: 18),
                label: Text(k['bolehAju'] == true ? 'Ajukan dispensasi' : 'Lihat kelayakan'),
              ),
            ),
        ]),
      ),
    );
  }
}

/// v1.94.0: buat kode akses untuk semua siswa yang belum punya (kode lama tidak diubah).
Future<void> generateKodeAksesMassal(BuildContext context) async {
  final ok = await konfirmasi(context, 'Buat kode akses semua siswa?',
      'Kode akses dibuat untuk SEMUA siswa yang belum punya, tanpa membuka mapel satu per satu. Kode yang sudah ada tidak diubah, jadi kartu ujian yang sudah dicetak tetap berlaku.',
      ya: 'Buat kode');
  if (!ok || !context.mounted) return;
  final r = await jalankan(context, () async => peta(await Api.instance('waStafMasaKodeAkses', [Sesi.instance.token], const Duration(minutes: 3))),
      teksProses: 'Membuat kode akses...');
  if (!r.ok || !context.mounted) return;
  final d = r.data!;
  kabar(context, angka(d['dibuat']) > 0
      ? '${angka(d['dibuat'])} kode akses baru dibuat (${angka(d['sudahAda'])} siswa sudah punya).'
      : 'Semua ${angka(d['total'])} siswa sudah punya kode akses.');
}
