import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

/// v1.74.0: Laporan Pemetaan Siswa. Rekap siswa aktif per unit belajar × rombel × layanan (Reguler / Flexi / belum diisi)
/// dan daftar siswa per unit. Pimpinan: semua unit; Koordinator Unit: unit yang dipegangnya. Unduh PDF (F4, berkop) / Excel.
class LaporanPemetaanScreen extends StatefulWidget {
  const LaporanPemetaanScreen({super.key});

  @override
  State<LaporanPemetaanScreen> createState() => _LaporanPemetaanScreenState();
}

class _LaporanPemetaanScreenState extends State<LaporanPemetaanScreen> {
  Map<String, dynamic>? _data;
  String _unit = '';   // '' = semua unit (untuk tampilan & cetak)

  List<Map<String, dynamic>> _unitTerpilih(Map<String, dynamic> d) =>
      daftar(d['unit']).map(peta).where((u) => _unit.isEmpty || teks(u['id'], '-') == _unit).toList();

  Future<String> _logo(Map<String, dynamic> kop) async {
    if (teks(kop['logo']).isNotEmpty) return 'data:image/png;base64,${teks(kop['logo'])}';
    try {
      return 'data:image/png;base64,${base64Encode((await rootBundle.load('assets/logo_kop.png')).buffer.asUint8List())}';
    } catch (_) {
      return '';
    }
  }

  Future<String> _html({required bool excel}) async {
    final d = _data!;
    final kop = peta(d['kop']);
    final units = _unitTerpilih(d);
    final b = StringBuffer();
    if (!excel) {
      final logo = await _logo(kop);
      b.write(await watermarkHtml(logo));   // v1.79.5
      // v1.79.5: kop tanpa logo (logo jadi watermark), keterangan piramida terbalik
      b.write('<div class="kopisi">');
      if (teks(kop['yayasan']).isNotEmpty) b.write('<div class="yy">${escHtml(teks(kop['yayasan']).toUpperCase())}</div>');
      b.write('<div class="lb">${escHtml(teks(kop['nama'], 'PKBM').toUpperCase())}</div>');
      for (final x in barisPiramida(daftar(kop['baris']).map((e) => teks(e)))) {
        b.write('<div class="kecil">${escHtml(x)}</div>');
      }
      b.write('</div><div class="garis"></div>');
    }
    b.write('<h2>LAPORAN PEMETAAN SISWA PER UNIT BELAJAR</h2>');
    b.write('<p class="kecil">Dicetak ${escHtml(teks(d['dibuat']))} oleh ${escHtml(teks(d['oleh']))}. Siswa aktif; siswa tanpa label unit dihitung ke unit utama (tanda *).</p>');
    // rekap
    b.write('<h3>A. Rekap</h3><table><tr><th>No</th><th>Unit</th><th>Koordinator</th><th>Rombel</th><th>Reguler</th><th>Flexi</th><th>Belum diisi</th><th>Jumlah</th></tr>');
    var no = 0;
    final tot = [0, 0, 0, 0];
    for (final u in units) {
      final rb = daftar(u['rombel']).map(peta).toList();
      for (var i = 0; i < rb.length; i++) {
        final r = rb[i];
        b.write('<tr>');
        if (i == 0) {
          b.write('<td class="c" rowspan="${rb.length + 1}">${++no}</td><td rowspan="${rb.length + 1}"><b>${escHtml(teks(u['nama']))}</b></td>'
              '<td rowspan="${rb.length + 1}">${escHtml(daftar(u['koordinator']).join(', '))}</td>');
        }
        b.write('<td>${escHtml(teks(r['nama']))}</td><td class="c">${angka(r['reguler'])}</td><td class="c">${angka(r['flexi'])}</td>'
            '<td class="c">${angka(r['tanpaLayanan'])}</td><td class="c">${angka(r['total'])}</td></tr>');
      }
      if (rb.isEmpty) {
        b.write('<tr><td class="c">${++no}</td><td><b>${escHtml(teks(u['nama']))}</b></td><td>${escHtml(daftar(u['koordinator']).join(', '))}</td><td colspan="5" class="c">Belum ada siswa</td></tr>');
      } else {
        b.write('<tr class="sub"><td>Subtotal</td><td class="c">${angka(u['reguler'])}</td><td class="c">${angka(u['flexi'])}</td>'
            '<td class="c">${angka(u['tanpaLayanan'])}</td><td class="c">${angka(u['total'])}</td></tr>');
      }
      tot[0] += angka(u['reguler']);
      tot[1] += angka(u['flexi']);
      tot[2] += angka(u['tanpaLayanan']);
      tot[3] += angka(u['total']);
    }
    b.write('<tr class="sub"><td colspan="4">TOTAL</td><td class="c">${tot[0]}</td><td class="c">${tot[1]}</td><td class="c">${tot[2]}</td><td class="c">${tot[3]}</td></tr></table>');
    // rincian
    b.write('<h3>B. Daftar siswa per unit</h3>');
    for (final u in units) {
      b.write('<h4>Unit ${escHtml(teks(u['nama']))} · ${angka(u['total'])} siswa (Reguler ${angka(u['reguler'])}, Flexi ${angka(u['flexi'])}, belum diisi ${angka(u['tanpaLayanan'])})</h4>');
      b.write('<table><tr><th>No</th><th>NISN</th><th>Nama</th><th>Rombel</th><th>Layanan</th></tr>');
      var n = 0;
      for (final r in daftar(u['rombel']).map(peta)) {
        for (final s in daftar(r['siswa']).map(peta)) {
          b.write('<tr><td class="c">${++n}</td><td>${escHtml(teks(s['nisn'], '-'))}</td><td>${escHtml(teks(s['nama']))}${s['ikutUtama'] == true ? ' *' : ''}</td>'
              '<td>${escHtml(teks(r['nama']))}</td><td class="c">${escHtml(teks(s['layanan'], 'Belum diisi'))}</td></tr>');
        }
      }
      if (n == 0) b.write('<tr><td colspan="5" class="c">Belum ada siswa</td></tr>');
      b.write('</table>');
    }
    if (excel) return b.toString();
    return dokumenA4(b.toString(), _css);
  }

  static const _css = '.kopt{width:100%;border-collapse:collapse}.kopt td{border:none;vertical-align:middle}.kopisi{text-align:center}'
      '.yy{font-size:10pt;font-weight:bold;letter-spacing:.5pt}.lb{font-size:15pt;font-weight:bold}.garis{border-top:2px solid #111;border-bottom:.5px solid #111;height:2px;margin:4px 0 8px}'
      'h2{text-align:center;font-size:12pt;margin:6px 0 4px}h3{font-size:11pt;margin:12px 0 4px}h4{font-size:10pt;margin:10px 0 4px}'
      'table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:3px 5px;font-size:9pt}th{background:#eee}.c{text-align:center}'
      '.sub td{font-weight:bold;background:#f5f5f5}.kecil{font-size:8pt;color:#333}';

  Future<void> _unduh(bool excel) async {
    if (_data == null) return kabar(context, 'Tunggu data selesai dimuat.');
    final nm = 'Laporan_Pemetaan_Siswa_${tanggalBerkas()}';
    final html = await _html(excel: excel);
    if (!mounted) return;
    if (excel) {
      await bagikanExcel(context, html, '$nm.xls');
    } else {
      await htmlKePdf(context, nama: '$nm.pdf', args: [_t, html]);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Laporan Pemetaan Siswa'), actions: [
        IconButton(tooltip: 'PDF', icon: const Icon(Icons.picture_as_pdf_outlined), onPressed: () => _unduh(false)),
        IconButton(tooltip: 'Excel', icon: const Icon(Icons.grid_on_rounded), onPressed: () => _unduh(true)),
      ]),
      body: Muatan<Map<String, dynamic>>(
        muat: () async => peta(await Api.instance('waStafLaporanPemetaanSiswa', [_t], const Duration(minutes: 2))),
        bangun: (context, d, segarkan) {
          _data = d;
          final cs = Theme.of(context).colorScheme;
          final semua = daftar(d['unit']).map(peta).toList();
          final units = _unitTerpilih(d);
          final tot = peta(d['total']);
          Widget angkaKotak(String label, Object nilai, Color warna) => Expanded(
                child: Column(children: [
                  Text('$nilai', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: warna)),
                  Text(label, style: const TextStyle(fontSize: 11.5)),
                ]),
              );
          return RefreshIndicator(
            onRefresh: segarkan,
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(children: [
                    angkaKotak('Siswa aktif', angka(tot['total']), cs.primary),
                    angkaKotak('Reguler', angka(tot['reguler']), Colors.teal),
                    angkaKotak('Flexi', angka(tot['flexi']), Colors.indigo),
                    angkaKotak('Belum diisi', angka(tot['tanpaLayanan']), cs.error),
                  ]),
                ),
              ),
              if (semua.length > 1)
                Wrap(spacing: 6, children: [
                  ChoiceChip(label: const Text('Semua unit'), selected: _unit.isEmpty, onSelected: (_) => setState(() => _unit = '')),
                  for (final u in semua)
                    ChoiceChip(label: Text(teks(u['nama'])), selected: _unit == teks(u['id'], '-'), onSelected: (_) => setState(() => _unit = teks(u['id'], '-'))),
                ]),
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Siswa tanpa label unit dihitung ke unit utama. PDF/Excel mengikuti pilihan unit di atas.', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
              ),
              for (final u in units)
                Card(
                  margin: const EdgeInsets.only(top: 10),
                  child: ExpansionTile(
                    initiallyExpanded: units.length == 1,
                    title: Text(teks(u['nama']), style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text('${angka(u['total'])} siswa · Reguler ${angka(u['reguler'])} · Flexi ${angka(u['flexi'])} · belum diisi ${angka(u['tanpaLayanan'])}'
                        '${angka(u['ikutUtama']) > 0 ? ' · ${angka(u['ikutUtama'])} tanpa label' : ''}'
                        '${daftar(u['koordinator']).isEmpty ? '' : '\nKoordinator: ${daftar(u['koordinator']).join(', ')}'}'),
                    children: [
                      for (final r in daftar(u['rombel']).map(peta))
                        ExpansionTile(
                          title: Text(teks(r['nama'])),
                          subtitle: Text('Reguler ${angka(r['reguler'])} · Flexi ${angka(r['flexi'])} · belum diisi ${angka(r['tanpaLayanan'])}'),
                          trailing: Text('${angka(r['total'])}', style: const TextStyle(fontWeight: FontWeight.w800)),
                          children: [
                            for (final s in daftar(r['siswa']).map(peta))
                              ListTile(
                                dense: true,
                                title: Text('${teks(s['nama'])}${s['ikutUtama'] == true ? ' *' : ''}'),
                                subtitle: Text('NISN ${teks(s['nisn'], '-')}'),
                                trailing: Lencana(teks(s['layanan'], 'Belum diisi'),
                                    warna: teks(s['layanan']) == 'Reguler' ? Colors.teal : (teks(s['layanan']) == 'Flexi' ? Colors.indigo : cs.error)),
                              ),
                          ],
                        ),
                      if (daftar(u['rombel']).isEmpty) const ListTile(dense: true, title: Text('Belum ada siswa')),
                    ],
                  ),
                ),
            ]),
          );
        },
      ),
    );
  }
}
