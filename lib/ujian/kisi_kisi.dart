import 'package:flutter/material.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../siswa/sesi_siswa.dart';
import '../widgets.dart';

/// v1.85.0: Kisi-kisi ujian sesuai konteks masa (UTS / UAS / UPK / lainnya, per semester).
/// Cakupan materi = cakupan bank soal ujian itu; perkiraan jumlah soal per bab mengikuti cara pengundian soal.
/// Tidak memuat soal atau kunci jawaban.

const _hari = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const _bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

String _tgl(String iso) {
  final d = DateTime.tryParse(iso);
  return d == null ? iso : '${_hari[d.weekday - 1]}, ${d.day} ${_bulan[d.month - 1]} ${d.year}';
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

const _css = '.kopisi{text-align:center}.yy{font-size:10pt;font-weight:bold}.lb{font-size:15pt;font-weight:bold}.kecil{font-size:8pt;color:#333}'
    '.garis{border-top:2px solid #111;border-bottom:.5px solid #111;height:2px;margin:4px 0 8px}'
    'h2{text-align:center;font-size:13pt;margin:4px 0 2px}h3{font-size:11pt;margin:12px 0 3px}.sub{text-align:center;font-size:9.5pt;margin:0 0 8px}'
    '.info{font-size:9pt;margin:0 0 4px}table.g{border-collapse:collapse;width:100%;page-break-inside:auto}tr{page-break-inside:avoid}'
    '.g th,.g td{border:1px solid #555;padding:3px 5px;font-size:8.8pt;vertical-align:top}.g th{font-weight:bold}.c{text-align:center}'
    '.tp{margin:0;padding-left:14px}.tp li{margin:0}.kosong{font-style:italic;color:#555;font-size:9pt}.kaki{font-size:8pt;color:#555;margin-top:10px;text-align:right}'
    '.hal{page-break-after:always}.hal:last-child{page-break-after:auto}.cat{font-size:8.5pt;color:#333;margin-top:6px}';

/// Bagian HTML kisi-kisi satu mapel.
String htmlKisiMapel(Map<String, dynamic> x) {
  final komp = peta(x['komposisi']);
  final b = StringBuffer('<h3>${escHtml(teks(x['mapel']))}</h3>');
  b.write('<p class="info">Jadwal: ${escHtml(_tgl(teks(x['tanggal'])))}, ${escHtml(teks(x['jam']))} · ${x['durasi']} menit · ${escHtml(teks(x['mode']))} · '
      '${x['jumlah']} soal pilihan ganda (mudah ${komp['mudah'] ?? 0}, sedang ${komp['sedang'] ?? 0}, sulit ${komp['sulit'] ?? 0}) · KKM ${x['kkm']}</p>');
  final baris = daftar(x['baris']).map(peta).toList();
  if (x['ada'] != true || baris.isEmpty) {
    b.write('<p class="kosong">Kisi-kisi belum tersedia: kurikulum mapel ini belum disusun. Tanyakan materi ujian kepada tutor.</p>');
    return b.toString();
  }
  b.write('<table class="g"><tr><th style="width:24px">No</th><th style="width:150px">Bab / materi</th><th>Tujuan pembelajaran</th>'
      '<th style="width:44px">Mudah</th><th style="width:44px">Sedang</th><th style="width:40px">Sulit</th><th style="width:52px">Perkiraan soal</th></tr>');
  for (final r in baris) {
    final bab = [if (teks(r['bab']).isNotEmpty) 'Bab ${teks(r['bab'])}', teks(r['judulBab'])].where((e) => e.isNotEmpty).join(' · ');
    final tp = daftar(r['tp']).map((e) => '<li>${escHtml(e)}</li>').join();
    b.write('<tr><td class="c">${r['no']}</td><td><b>${escHtml(bab)}</b>${teks(r['topik']).isEmpty ? '' : '<br>${escHtml(teks(r['topik']))}'}</td>'
        '<td>${tp.isEmpty ? '-' : '<ul class="tp">$tp</ul>'}</td><td class="c">${r['mudah']}</td><td class="c">${r['sedang']}</td><td class="c">${r['sulit']}</td>'
        '<td class="c"><b>${r['jumlah']}</b></td></tr>');
  }
  b.write('</table>');
  if (x['bankAda'] != true) b.write('<p class="kosong">Bank soal mapel ini belum lengkap; perkiraan jumlah soal belum dapat dihitung.</p>');
  return b.toString();
}

const _catatan = '<p class="cat">Perkiraan jumlah soal per bab dapat berbeda sedikit untuk tiap siswa karena soal diacak dari bank soal. '
    'Pelajari semua materi pada daftar di atas.</p>';

// ───────────────────────── siswa ─────────────────────────

class KisiSiswaScreen extends StatefulWidget {
  const KisiSiswaScreen({super.key});

  @override
  State<KisiSiswaScreen> createState() => _KisiSiswaScreenState();
}

class _KisiSiswaScreenState extends State<KisiSiswaScreen> {
  String? _ujian;   // konteks terpilih (judul ujian)

  Future<void> _pdf(Map<String, dynamic> d, String judul, List<Map<String, dynamic>> l) async {
    final b = StringBuffer(_kop(peta(d['kop'])));
    b.write('<h2>KISI-KISI ${escHtml(judul.toUpperCase())}</h2><p class="sub">${escHtml(teks(d['nama']))} · ${escHtml(teks(d['rombel']))}</p>');
    for (final x in l) {
      b.write(htmlKisiMapel(x));
    }
    b.write(_catatan);
    await htmlKePdf(context, nama: 'Kisi_kisi_${judul.replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_')}.pdf', fn: 'waSiswaHtmlPdf',
        args: [SesiSiswa.instance.token, dokumenA4(b.toString(), _css)]);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Kisi-kisi Ujian')),
      body: Muatan<Map<String, dynamic>>(
        muat: () async => peta(await Api.instance('waSiswaKisi', [SesiSiswa.instance.token], const Duration(minutes: 2))),
        bangun: (context, d, segarkan) {
          final semua = daftar(d['kisi']).map(peta).toList();
          if (semua.isEmpty) {
            return const Kosong(pesan: 'Belum ada ujian terjadwal. Kisi-kisi muncul setelah jadwal ujian ditetapkan sekolah.', ikon: Icons.event_note_outlined);
          }
          final konteks = <String>[];
          for (final x in semua) {
            if (!konteks.contains(teks(x['judul']))) konteks.add(teks(x['judul']));
          }
          final pilih = konteks.contains(_ujian) ? _ujian! : konteks.first;
          final l = semua.where((x) => teks(x['judul']) == pilih).toList();
          final cs = Theme.of(context).colorScheme;
          return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
            Wrap(spacing: 8, runSpacing: 6, children: [
              for (final k in konteks) ChoiceChip(label: Text(k), selected: k == pilih, onSelected: (_) => setState(() => _ujian = k)),
            ]),
            const SizedBox(height: 8),
            Text('Materi yang diujikan pada ${pilih.toLowerCase().startsWith('ujian') ? pilih : 'ujian $pilih'}, per mata pelajaran. '
                'Perkiraan jumlah soal per bab bisa sedikit berbeda karena soal diacak.', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(onPressed: () => _pdf(d, pilih, l), icon: const Icon(Icons.picture_as_pdf_outlined), label: const Text('Unduh PDF')),
            ),
            for (final x in l) _KartuKisi(x: x),
          ]);
        },
      ),
    );
  }
}

class _KartuKisi extends StatelessWidget {
  const _KartuKisi({required this.x});
  final Map<String, dynamic> x;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final baris = daftar(x['baris']).map(peta).toList();
    return Card(
      child: ExpansionTile(
        title: Text(teks(x['mapel']), style: const TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text('${_tgl(teks(x['tanggal']))} · ${teks(x['jam'])} · ${x['durasi']} menit\n${x['jumlah']} soal · ${teks(x['mode'])}',
            style: const TextStyle(fontSize: 12.5)),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        children: [
          if (x['ada'] != true || baris.isEmpty)
            Text('Kisi-kisi belum tersedia: kurikulum mapel ini belum disusun. Tanyakan materi ujian kepada tutor.', style: TextStyle(color: cs.error, fontSize: 13)),
          for (final r in baris)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(width: 24, child: Text('${r['no']}.', style: const TextStyle(fontWeight: FontWeight.w700))),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text([if (teks(r['bab']).isNotEmpty) 'Bab ${teks(r['bab'])}', teks(r['judulBab'])].where((e) => e.isNotEmpty).join(' · '),
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    if (teks(r['topik']).isNotEmpty) Text(teks(r['topik']), style: const TextStyle(fontSize: 13)),
                    for (final t in daftar(r['tp'])) Text('• ${teks(t)}', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
                  ]),
                ),
                const SizedBox(width: 8),
                Column(children: [
                  Text('${r['jumlah']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const Text('soal', style: TextStyle(fontSize: 11)),
                ]),
              ]),
            ),
          if (x['ada'] == true && x['bankAda'] != true)
            Padding(padding: const EdgeInsets.only(top: 8), child: Text('Bank soal belum lengkap; perkiraan jumlah soal belum tersedia.', style: TextStyle(fontSize: 12, color: cs.error))),
        ],
      ),
    );
  }
}

// ───────────────────────── staf: cetak per rombel ─────────────────────────

/// Cetak kisi-kisi satu masa ujian: satu halaman (atau lebih) per rombel, semua mapelnya.
Future<void> cetakKisiMasa(BuildContext context, String idMasa) async {
  final r = await jalankan(context, () async => peta(await Api.instance('waStafMasaKisi', [Sesi.instance.token, idMasa], const Duration(minutes: 3))),
      teksProses: 'Menyusun kisi-kisi...');
  if (!r.ok || r.data == null || !context.mounted) return;
  final d = r.data!;
  final rombel = daftar(d['rombel']).map(peta).toList();
  if (rombel.isEmpty) return kabar(context, 'Belum ada slot jadwal di masa ujian ini.', galat: true);
  final m = peta(d['masa']);
  final kop = _kop(peta(d['kop']));
  final b = StringBuffer();
  for (final rb in rombel) {
    b.write('<div class="hal">$kop<h2>KISI-KISI ${escHtml(teks(m['judul']).toUpperCase())}</h2>'
        '<p class="sub">${escHtml(teks(m['nama']))} · Rombel <b>${escHtml(teks(rb['nama']))}</b></p>');
    for (final x in daftar(rb['mapel']).map(peta)) {
      b.write(htmlKisiMapel(x));
    }
    b.write('$_catatan<p class="kaki">Dicetak ${escHtml(teks(d['dibuat']))} oleh ${escHtml(teks(d['oleh']))}</p></div>');
  }
  if (!context.mounted) return;
  await htmlKePdf(context, nama: 'Kisi_kisi_${teks(m['nama']).replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_')}_${tanggalBerkas()}.pdf',
      args: [Sesi.instance.token, dokumenA4(b.toString(), _css)]);
}
