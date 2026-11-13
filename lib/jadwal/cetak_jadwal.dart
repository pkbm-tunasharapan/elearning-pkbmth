import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';
import 'jadwal.dart';

String? get _t => Sesi.instance.token;

/// v1.76.0: cetak jadwal tatap muka mingguan yang mudah dibaca (PDF F4 lanskap berkop / Excel).
/// A. Tabel per hari: baris = sesi, kolom = rombel; isi = mapel, tutor, unit + tanda minggu (1 & 3 / 2 & 4).
/// B. Jadwal per tutor: hari, sesi, rombel, mapel, unit, minggu.
class CetakJadwalScreen extends StatefulWidget {
  const CetakJadwalScreen({super.key});

  @override
  State<CetakJadwalScreen> createState() => _CetakJadwalScreenState();
}

class _CetakJadwalScreenState extends State<CetakJadwalScreen> {
  Map<String, dynamic>? _data;
  String _unit = '';          // '' = semua unit
  bool _perHari = true;
  bool _perTutor = true;
  String _tutor = '';         // '' = semua tutor (bagian per tutor)
  bool _perPaket = true;      // v1.78.2: kolom per paket (Paket A/B/C) atau per rombel

  /// Nama paket sebuah jadwal: dari PAKET (PKT-B) atau nama rombel (B7) -> "Paket B".
  static String _paket(Map<String, dynamic> x) {
    final m = RegExp(r'([ABC])\s*$', caseSensitive: false).firstMatch(teks(x['paket']).trim()) ??
        RegExp(r'(?:^|[^A-Za-z])([ABC])\s*\d', caseSensitive: false).firstMatch(teks(x['namaRombel']));
    return m != null ? 'Paket ${m.group(1)!.toUpperCase()}' : teks(x['paket'], teks(x['namaRombel']));
  }

  String _kolomId(Map<String, dynamic> x) => _perPaket ? _paket(x) : teks(x['idRombel']);
  String _kolomNama(Map<String, dynamic> x) => _perPaket ? _paket(x) : teks(x['namaRombel']);

  /// Jadwal yang sama (mapel, tutor, unit, minggu) di beberapa rombel satu paket cukup ditulis sekali.
  static List<Map<String, dynamic>> _unik(List<Map<String, dynamic>> xs, String Function(Map<String, dynamic>) kunci) {
    final ada = <String>{};
    return xs.where((x) => ada.add(kunci(x))).toList();
  }

  List<Map<String, dynamic>> _jadwal(Map<String, dynamic> d) => daftar(d['pemetaan']).map(peta).where((x) {
        if (_unit.isEmpty) return true;
        final u = teks(x['unit']);
        return u.isEmpty || u.split(',').contains(_unit);   // jadwal tanpa unit = semua siswa rombel
      }).toList();

  static int _urutHari(String h) => hariMinggu.indexOf(h) < 0 ? 9 : hariMinggu.indexOf(h);

  static String _lencana(String m) => m.isEmpty
      ? ''
      : '<span class="${m == '2,4' ? 'm24' : 'm13'}">${m == '2,4' ? 'Mg 2 &amp; 4' : (m == '1,3' ? 'Mg 1 &amp; 3' : 'Mg ${escHtml(m.replaceAll(',', ' &amp; '))}')}</span>';

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
    final js = _jadwal(d);
    final b = StringBuffer();
    if (!excel) {
      final logo = await _logo(kop);
      b.write('<table class="kopt"><tr><td style="width:22mm">${logo.isEmpty ? '' : '<img src="$logo" style="width:18mm">'}</td><td class="kopisi">');
      if (teks(kop['yayasan']).isNotEmpty) b.write('<div class="yy">${escHtml(teks(kop['yayasan']).toUpperCase())}</div>');
      b.write('<div class="lb">${escHtml(teks(kop['nama'], 'PKBM').toUpperCase())}</div>');
      for (final x in daftar(kop['baris'])) {
        b.write('<div class="kecil">${escHtml(teks(x))}</div>');
      }
      b.write('</td><td style="width:22mm"></td></tr></table><div class="garis"></div>');
    }
    final namaUnit = _unit.isEmpty ? 'Semua unit' : teks(daftar(d['unit']).map(peta).where((u) => teks(u['id']) == _unit).firstOrNull?['nama'], _unit);
    b.write('<h2>JADWAL TATAP MUKA MINGGUAN</h2>');
    b.write('<p class="sub">Unit: <b>${escHtml(namaUnit)}</b> · dicetak ${escHtml(teks(d['dibuat']))} oleh ${escHtml(teks(d['oleh']))}</p>');
    b.write('<p class="leg">Keterangan: tanpa tanda = setiap minggu · ${_lencana('1,3')} = minggu ke-1 &amp; 3 (tgl 1–7, 15–21, dan 29–31) · '
        '${_lencana('2,4')} = minggu ke-2 &amp; 4 (tgl 8–14 dan 22–28). Minggu ke-n = urutan hari itu dalam bulan.</p>');
    if (js.isEmpty) {
      b.write('<p>Belum ada jadwal tatap muka.</p>');
      return excel ? b.toString() : dokumenA4(b.toString(), _css, lanskap: true);
    }
    final hariAda = {for (final x in js) teks(x['hari'])}.toList()..sort((a, c) => _urutHari(a).compareTo(_urutHari(c)));

    if (_perHari) {
      b.write('<h3>A. Jadwal per hari</h3>');
      for (final h in hariAda) {
        final jh = js.where((x) => teks(x['hari']) == h).toList();
        // kolom = rombel (urut paket lalu nama), baris = jam sesi
        final rombel = <String, (String, String)>{};
        for (final x in jh) {
          rombel[_kolomId(x)] = (_perPaket ? _paket(x) : teks(x['paket']), _kolomNama(x));
        }
        final kolom = rombel.keys.toList()
          ..sort((a, c) => '${rombel[a]!.$1}|${rombel[a]!.$2}'.compareTo('${rombel[c]!.$1}|${rombel[c]!.$2}'));
        final jam = {for (final x in jh) '${teks(x['mulai'])}|${teks(x['selesai'])}'}.toList()..sort();
        b.write('<table class="grid hari"><tr><th class="hr" colspan="${kolom.length + 1}">${escHtml(h.toUpperCase())}</th></tr>');
        b.write('<tr><th style="width:24mm">Sesi</th>');
        for (final r in kolom) {
          b.write('<th>${escHtml(rombel[r]!.$2)}</th>');
        }
        b.write('</tr>');
        for (final j in jam) {
          final isi = jh.where((x) => '${teks(x['mulai'])}|${teks(x['selesai'])}' == j).toList();
          final namaSesi = isi.map((x) => teks(x['slot'])).firstWhere((s) => s.isNotEmpty, orElse: () => '');
          final p = j.split('|');
          b.write('<tr><td class="sesi"><b>${escHtml(namaSesi)}</b><br>${escHtml(p[0])}–${escHtml(p[1])}</td>');
          for (final r in kolom) {
            final sel = _unik(isi.where((x) => _kolomId(x) == r).toList(),
                (x) => '${teks(x['namaMapel'])}|${teks(x['namaTutor'])}|${teks(x['namaUnit'])}|${teks(x['minggu'])}')
              ..sort((a, c) => teks(a['minggu']).compareTo(teks(c['minggu'])));
            b.write('<td>');
            for (var i = 0; i < sel.length; i++) {
              final x = sel[i];
              if (i > 0) b.write('<div class="pisah"></div>');
              b.write('<div class="mp">${escHtml(teks(x['namaMapel']))} ${_lencana(teks(x['minggu']))}</div>'
                  '<div class="tt">${escHtml(teks(x['namaTutor']))}</div>'
                  '${teks(x['namaUnit']).isEmpty ? '' : '<div class="un">${escHtml(teks(x['namaUnit']))}</div>'}');
            }
            if (sel.isEmpty) b.write('<span class="kosong">–</span>');
            b.write('</td>');
          }
          b.write('</tr>');
        }
        b.write('</table>');
      }
    }

    if (_perTutor) {
      final tutor = <String, String>{};
      for (final x in js) {
        tutor[teks(x['idTutor'])] = teks(x['namaTutor']);
      }
      final ids = tutor.keys.where((k) => _tutor.isEmpty || k == _tutor).toList()..sort((a, c) => tutor[a]!.compareTo(tutor[c]!));
      b.write('<h3 class="${_perHari && !excel ? 'baru' : ''}">${_perHari ? 'B' : 'A'}. Jadwal per tutor</h3>');
      for (final id in ids) {
        final jt = _unik(js.where((x) => teks(x['idTutor']) == id).toList(),
            (x) => '${teks(x['hari'])}|${teks(x['mulai'])}|${_kolomId(x)}|${teks(x['namaMapel'])}|${teks(x['namaUnit'])}|${teks(x['minggu'])}')
          ..sort((a, c) => _urutHari(teks(a['hari'])).compareTo(_urutHari(teks(c['hari']))) != 0
              ? _urutHari(teks(a['hari'])).compareTo(_urutHari(teks(c['hari'])))
              : '${teks(a['mulai'])}${teks(a['minggu'])}'.compareTo('${teks(c['mulai'])}${teks(c['minggu'])}'));
        b.write('<table class="grid tutor"><tr><th class="hr" colspan="6">${escHtml(tutor[id]!)} · ${jt.length} jadwal</th></tr>'
            '<tr><th style="width:20mm">Hari</th><th style="width:30mm">Sesi</th><th>${_perPaket ? 'Paket' : 'Rombel'}</th><th>Mapel</th><th>Unit</th><th style="width:32mm">Minggu</th></tr>');
        for (final x in jt) {
          b.write('<tr><td>${escHtml(teks(x['hari']))}</td><td>${escHtml(teks(x['slot']))} ${escHtml(teks(x['mulai']))}–${escHtml(teks(x['selesai']))}</td>'
              '<td>${escHtml(_kolomNama(x))}</td><td>${escHtml(teks(x['namaMapel']))}</td><td>${escHtml(teks(x['namaUnit'], 'Semua siswa'))}</td>'
              '<td>${teks(x['minggu']).isEmpty ? 'Setiap minggu' : _lencana(teks(x['minggu']))}</td></tr>');
        }
        b.write('</table>');
      }
    }
    if (excel) return b.toString();
    return dokumenA4(b.toString(), _css, lanskap: true);
  }

  static const _css = '.kopt{width:100%;border-collapse:collapse}.kopt td{border:none;vertical-align:middle}.kopisi{text-align:center}'
      '.yy{font-size:10pt;font-weight:bold;letter-spacing:.5pt}.lb{font-size:15pt;font-weight:bold}.kecil{font-size:8pt;color:#333}'
      '.garis{border-top:2px solid #111;border-bottom:.5px solid #111;height:2px;margin:4px 0 8px}'
      'h2{text-align:center;font-size:13pt;margin:4px 0 2px}h3{font-size:11pt;margin:10px 0 4px}h3.baru{page-break-before:always}'
      '.sub{text-align:center;font-size:9pt;margin:0 0 4px}.leg{font-size:8.5pt;margin:0 0 8px;color:#333}'
      'table.grid{border-collapse:collapse;width:100%;margin-bottom:8px;page-break-inside:avoid}'
      '.grid th,.grid td{border:1px solid #555;padding:3px 4px;font-size:8.5pt;vertical-align:top}.grid th{background:#ececec}'
      '.grid th.hr{background:#5B21B6;color:#fff;text-align:left;font-size:10pt;letter-spacing:.5pt}'
      '.sesi{background:#f6f3ff;white-space:nowrap}.mp{font-weight:bold}.tt{color:#222}.un{font-size:7.5pt;color:#555}'
      '.pisah{border-top:1px dashed #999;margin:3px 0}.kosong{color:#aaa}'
      '.m13,.m24{display:inline-block;font-size:7pt;font-weight:bold;padding:0 3px;border-radius:3px;color:#fff}'
      '.m13{background:#1d4ed8}.m24{background:#c2410c}';

  Future<void> _unduh(bool excel) async {
    if (_data == null) return kabar(context, 'Tunggu data selesai dimuat.');
    if (!_perHari && !_perTutor) return kabar(context, 'Pilih minimal satu bagian untuk dicetak.', galat: true);
    final nm = 'Jadwal_Tatap_Muka_${tanggalBerkas()}';
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
      appBar: AppBar(title: const Text('Cetak Jadwal')),
      body: Muatan<Map<String, dynamic>>(
        muat: () async => peta(await Api.instance('waStafJadwalCetak', [_t], const Duration(minutes: 2))),
        bangun: (context, d, segarkan) {
          _data = d;
          final cs = Theme.of(context).colorScheme;
          final unit = daftar(d['unit']).map(peta).toList();
          final js = _jadwal(d);
          final tutor = <String, String>{for (final x in daftar(d['pemetaan']).map(peta)) teks(x['idTutor']): teks(x['namaTutor'])};
          final idsTutor = tutor.keys.toList()..sort((a, c) => tutor[a]!.compareTo(tutor[c]!));
          return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${js.length} jadwal akan dicetak', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(height: 4),
                  Text('PDF F4 lanskap berkop. Jadwal minggu ke-1 & 3 diberi tanda biru, minggu ke-2 & 4 tanda oranye.',
                      style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
                ]),
              ),
            ),
            if (unit.isNotEmpty) ...[
              const JudulBagian('Unit belajar'),
              Wrap(spacing: 6, runSpacing: 6, children: [
                ChoiceChip(label: const Text('Semua unit'), selected: _unit.isEmpty, onSelected: (_) => setState(() => _unit = '')),
                for (final u in unit) ChoiceChip(label: Text(teks(u['nama'])), selected: _unit == teks(u['id']), onSelected: (_) => setState(() => _unit = teks(u['id']))),
              ]),
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('Jadwal tanpa unit (untuk semua siswa rombel) selalu ikut tercetak.', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
              ),
            ],
            const JudulBagian('Tampilan kolom'),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: true, label: Text('Per paket'), icon: Icon(Icons.layers_rounded)),
                ButtonSegment(value: false, label: Text('Per rombel'), icon: Icon(Icons.view_column_rounded)),
              ],
              selected: {_perPaket},
              onSelectionChanged: (v) => setState(() => _perPaket = v.first),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(_perPaket ? 'Kolom: Paket A, Paket B, Paket C. Kelas gabungan (mis. B7, B8, B9) cukup ditulis sekali.' : 'Kolom: setiap rombel (B7, B8, B9, ...).',
                  style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
            ),
            const JudulBagian('Isi cetakan'),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _perHari,
              onChanged: (v) => setState(() => _perHari = v == true),
              title: Text('Jadwal per hari (tabel sesi × ${_perPaket ? 'paket' : 'rombel'})'),
              subtitle: const Text('Untuk ditempel di papan pengumuman / dibagikan ke siswa.'),
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _perTutor,
              onChanged: (v) => setState(() => _perTutor = v == true),
              title: const Text('Jadwal per tutor'),
              subtitle: const Text('Satu tabel untuk tiap tutor: hari, sesi, rombel, mapel, minggu.'),
            ),
            if (_perTutor && idsTutor.length > 1)
              DropdownButtonFormField<String>(
                isExpanded: true,
                initialValue: _tutor,
                decoration: const InputDecoration(labelText: 'Tutor (bagian per tutor)', isDense: true),
                items: [
                  const DropdownMenuItem(value: '', child: Text('Semua tutor')),
                  for (final id in idsTutor) DropdownMenuItem(value: id, child: Text(tutor[id]!)),
                ],
                onChanged: (v) => setState(() => _tutor = v ?? ''),
              ),
            const SizedBox(height: 20),
            FilledButton.icon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: () => _unduh(false),
              icon: const Icon(Icons.picture_as_pdf_outlined),
              label: const Text('Cetak PDF'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
              onPressed: () => _unduh(true),
              icon: const Icon(Icons.grid_on_rounded),
              label: const Text('Unduh Excel'),
            ),
          ]);
        },
      ),
    );
  }
}
