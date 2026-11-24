import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../api.dart';
import '../berkas.dart';
import '../honor/honor.dart' show rp;
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

String _pct(dynamic v) => v == null ? '–' : '${v is num ? (v == v.roundToDouble() ? v.round() : v) : v}%';

/// v1.93.0: Laporan siswa BELUM LAYAK satu jenis ujian (UTS/UAS Semester 1, UTS/UAS Semester 2, UPK).
/// Tabel rincian penyebab (mapel: ketuntasan & absensi; keuangan: sisa tagihan). Cetak PDF F4 lanskap berkop resmi,
/// global (semua unit) atau per unit; juga Excel.
class LaporanKelayakanScreen extends StatefulWidget {
  const LaporanKelayakanScreen({super.key, this.ujian = ''});
  final String ujian;

  @override
  State<LaporanKelayakanScreen> createState() => _LaporanKelayakanScreenState();
}

class _LaporanKelayakanScreenState extends State<LaporanKelayakanScreen> {
  late String _ujian = widget.ujian;
  String _unit = '*';   // '*' = semua unit (global)
  Map<String, dynamic>? _data;

  List<Map<String, dynamic>> _baris(Map<String, dynamic> d) =>
      daftar(d['siswa']).map(peta).where((s) => _unit == '*' || teks(s['unit']) == _unit).toList();

  String _namaUnit(Map<String, dynamic> d) {
    if (_unit == '*') return 'Semua unit';
    final u = daftar(d['unit']).map(peta).where((x) => teks(x['id']) == _unit).toList();
    return u.isEmpty ? _unit : teks(u.first['nama']);
  }

  String _sebab(Map<String, dynamic> s) => [if (s['akademik'] == true) 'Akademik', if (s['keuangan'] == true) 'Keuangan'].join(' & ');

  List<String> _rinciMapel(Map<String, dynamic> s, num syarat) => [
        for (final m in daftar(s['mapel']).map(peta))
          '${teks(m['nama'])}: '
              '${m['okTuntas'] == true ? '' : 'tuntas ${_pct(m['tuntas'])} (${angka(m['done'])}/${angka(m['total'])} item)'}'
              '${m['okTuntas'] != true && m['okAbsen'] != true ? ' · ' : ''}'
              '${m['okAbsen'] == true ? '' : 'absensi ${_pct(m['absen'])}'}',
      ];

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
    final rows = _baris(d);
    final global = _unit == '*';
    final keu = d['keu'] == true;
    final upk = teks(d['ujian']) == 'UPK';
    final syarat = angka(d['syarat'], 80);
    final b = StringBuffer();
    if (!excel) {
      b.write(await watermarkHtml(await _logo(kop), lanskap: true));
      b.write('<div class="kopisi">');
      if (teks(kop['yayasan']).isNotEmpty) b.write('<div class="yy">${escHtml(teks(kop['yayasan']).toUpperCase())}</div>');
      b.write('<div class="lb">${escHtml(teks(kop['nama'], 'PKBM').toUpperCase())}</div>');
      for (final x in barisPiramida(daftar(kop['baris']).map((e) => teks(e)))) {
        b.write('<div class="kecil">${escHtml(x)}</div>');
      }
      b.write('</div><div class="garis"></div>');
    }
    b.write('<h2>LAPORAN SISWA BELUM LAYAK MENGIKUTI ${escHtml(teks(d['ujianLabel']).toUpperCase())}</h2>');
    b.write('<div class="sub">Tahun Pelajaran ${escHtml(teks(d['periode']))} · ${escHtml(_namaUnit(d))}</div>');
    b.write('<p class="kecil">${escHtml(teks(d['rentang']))} '
        '${upk ? '' : 'Syarat akademik per mapel: ketuntasan sesi & absensi minimal ${_pct(syarat)} (absensi = online + ${_pct(d['tambahTm'])} × persen tatap muka). '}'
        '${keu ? 'Syarat keuangan: tagihan yang sudah jatuh tempo lunas. ' : ''}'
        'Hanya siswa berstatus Belum layak. Dicetak ${escHtml(teks(d['dibuat']))} oleh ${escHtml(teks(d['oleh']))}.</p>');
    // ringkasan per unit
    final units = daftar(d['unit']).map(peta).where((u) => global || teks(u['id']) == _unit).toList();
    b.write('<table class="ringkas"><tr><th>Unit</th><th>Siswa dinilai</th><th>Belum layak</th></tr>');
    var tSiswa = 0, tBelum = 0;
    for (final u in units) {
      tSiswa += angka(u['siswa']);
      tBelum += angka(u['belum']);
      b.write('<tr><td>${escHtml(teks(u['nama']))}</td><td class="c">${angka(u['siswa'])}</td><td class="c">${angka(u['belum'])}</td></tr>');
    }
    if (units.length > 1) b.write('<tr class="sub"><td>Jumlah</td><td class="c">$tSiswa</td><td class="c">$tBelum</td></tr>');
    b.write('</table>');
    // tabel rincian
    b.write('<table><tr><th>No</th><th>Nama</th><th>NISN</th><th>Rombel</th>${global ? '<th>Unit</th>' : ''}<th>Belum terpenuhi</th>');
    if (!upk) b.write('<th>Rincian akademik (mapel belum memenuhi)</th>');
    if (keu) b.write('<th>Sisa tagihan</th>');
    if (keu) b.write('<th>Permohonan</th>');
    b.write('</tr>');
    var no = 0;
    for (final s in rows) {
      final mapel = _rinciMapel(s, syarat);
      final tag = daftar(s['tagihan']).map((e) => teks(e)).toList();
      b.write('<tr><td class="c">${++no}</td><td>${escHtml(teks(s['nama']))}</td><td>${escHtml(teks(s['nisn'], '-'))}</td><td>${escHtml(teks(s['rombel']))}</td>'
          '${global ? '<td>${escHtml(teks(s['namaUnit']))}</td>' : ''}<td class="c">${escHtml(_sebab(s))}</td>');
      if (!upk) b.write('<td>${mapel.isEmpty ? '-' : mapel.map(escHtml).join('<br>')}</td>');
      if (keu) {
        b.write('<td>${s['keuangan'] == true ? '<b>${escHtml(rp(s['sisa']))}</b>${tag.isEmpty ? '' : '<br><span class="kecil">${tag.map(escHtml).join('<br>')}</span>'}' : '-'}</td>');
        b.write('<td>${escHtml(teks(s['permohonan'], '-'))}</td>');
      }
      b.write('</tr>');
    }
    if (rows.isEmpty) b.write('<tr><td colspan="${5 + (global ? 1 : 0) + (upk ? 0 : 1) + (keu ? 2 : 0)}" class="c">Tidak ada siswa yang belum layak.</td></tr>');
    b.write('</table>');
    if (excel) return b.toString();
    b.write('<table class="ttd"><tr><td></td><td>${escHtml(teks(kop['kota']))}${teks(kop['kota']).isEmpty ? '' : ', '}${escHtml(tanggalIni())}<br>Kepala Sekolah,<br><br><br><br>'
        '<b><u>${escHtml(teks(kop['kepala'], '..............................'))}</u></b></td></tr></table>');
    return dokumenA4(b.toString(), _css, lanskap: true);
  }

  static const _css = '.kopisi{text-align:center}.yy{font-size:10pt;font-weight:bold;letter-spacing:.5pt}.lb{font-size:15pt;font-weight:bold}'
      '.garis{border-top:2px solid #111;border-bottom:.5px solid #111;height:2px;margin:4px 0 8px}'
      'h2{text-align:center;font-size:12pt;margin:6px 0 2px}.sub{text-align:center;margin-bottom:6px}'
      'table{border-collapse:collapse;width:100%;margin-top:6px}th,td{border:1px solid #555;padding:3px 5px;font-size:8.5pt;vertical-align:top}th{font-weight:bold;background:#eee}'
      '.c{text-align:center}.sub td{font-weight:bold}.kecil{font-size:7.5pt;color:#333}table.ringkas{width:45%}'
      'table.ttd{margin-top:16px}table.ttd td{border:none;width:50%;font-size:10pt;text-align:center}';

  Future<void> _unduh(bool excel) async {
    if (_data == null) return kabar(context, 'Tunggu data selesai dimuat.');
    final unit = _unit == '*' ? 'Semua_Unit' : _namaUnit(_data!).replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_');
    final nm = 'Belum_Layak_${teks(_data!['ujian'])}_${unit}_${tanggalBerkas()}';
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
      appBar: AppBar(title: const Text('Laporan Belum Layak'), actions: [
        IconButton(tooltip: 'Cetak PDF (berkop)', icon: const Icon(Icons.picture_as_pdf_outlined), onPressed: () => _unduh(false)),
        IconButton(tooltip: 'Excel', icon: const Icon(Icons.grid_on_rounded), onPressed: () => _unduh(true)),
      ]),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_ujian),
        muat: () async => peta(await Api.instance('waStafKelayakanLaporan', [_t, {'ujian': _ujian}], const Duration(minutes: 6))),
        bangun: (context, d, segarkan) {
          _data = d;
          final cs = Theme.of(context).colorScheme;
          final keu = d['keu'] == true;
          final pilihan = daftar(d['pilihan']).map(peta).where((o) => keu || teks(o['kode']) != 'UPK').toList();
          final units = daftar(d['unit']).map(peta).toList();
          if (_unit != '*' && !units.any((u) => teks(u['id']) == _unit)) _unit = '*';
          final rows = _baris(d);
          final syarat = angka(d['syarat'], 80);
          return RefreshIndicator(
            onRefresh: segarkan,
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
              DropdownButtonFormField<String>(
                key: ValueKey('uj${teks(d['ujian'])}'),
                isExpanded: true,
                initialValue: pilihan.any((o) => teks(o['kode']) == teks(d['ujian'])) ? teks(d['ujian']) : null,
                decoration: const InputDecoration(labelText: 'Jenis ujian', isDense: true),
                items: [for (final o in pilihan) DropdownMenuItem(value: teks(o['kode']), child: Text(teks(o['label'])))],
                onChanged: (v) => setState(() => _ujian = v ?? ''),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                key: ValueKey('un$_unit${units.length}'),
                isExpanded: true,
                initialValue: _unit,
                decoration: const InputDecoration(labelText: 'Cakupan cetak', isDense: true),
                items: [
                  DropdownMenuItem(value: '*', child: Text('Global (semua unit) · ${daftar(d['siswa']).length} belum layak')),
                  for (final u in units)
                    DropdownMenuItem(value: teks(u['id']), child: Text('${teks(u['nama'])} · ${angka(u['belum'])} dari ${angka(u['siswa'])} siswa')),
                ],
                onChanged: (v) => setState(() => _unit = v ?? '*'),
              ),
              const SizedBox(height: 8),
              Text('${teks(d['periode'])}. ${teks(d['rentang'])} Hanya siswa berstatus Belum layak. PDF/Excel mengikuti pilihan di atas.',
                  style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
              const SizedBox(height: 8),
              if (rows.isEmpty) const Kosong(pesan: 'Tidak ada siswa yang belum layak.', ikon: Icons.verified_outlined),
              for (final s in rows)
                Card(
                  margin: const EdgeInsets.only(top: 8),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Text(teks(s['nama']), style: const TextStyle(fontWeight: FontWeight.w700))),
                        Lencana(_sebab(s), warna: cs.error),
                      ]),
                      Text('${teks(s['rombel'])} · ${teks(s['namaUnit'])}', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
                      for (final m in _rinciMapel(s, syarat)) Text('• $m', style: const TextStyle(fontSize: 12.5)),
                      if (s['keuangan'] == true) Text('• Sisa tagihan ${rp(s['sisa'])}', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                      if (teks(s['permohonan']).isNotEmpty) Text('Permohonan: ${teks(s['permohonan'])}', style: const TextStyle(fontSize: 12)),
                    ]),
                  ),
                ),
            ]),
          );
        },
      ),
    );
  }
}
