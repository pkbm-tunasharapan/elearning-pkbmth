import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

String _kunci(Map<String, dynamic> x) => '${angka(x['smt'])}-${angka(x['minggu'])}';
String _namaSesi(Map<String, dynamic> x) => angka(x['n']) > 0 ? 'Sesi ${angka(x['n'])}' : 'Minggu ${angka(x['minggu'])}';
bool _kosong(Map<String, dynamic> x) => daftar(peta(x['rpp'])['inti']).isEmpty;
List<String> _ls(dynamic v) => daftar(v).map((e) => '$e').toList();

// ───────────────────────── dokumen (sama dengan rppHtmlSatu_ di web) ─────────────────────────

String _bagian(String t) => '<h3><u>${escHtml(t)}</u></h3>';
String _label(String t) => '<p class="lbl">${escHtml(t)}</p>';
String _isian([int n = 2]) => List.filled(n, '<p class="isian">&nbsp;</p>').join();
String _tabel(List<List<dynamic>> baris) {
  final o = StringBuffer('<table>');
  for (final b in baris) {
    final nilai = '${b[1] ?? ''}'.trim();
    o.write('<tr><td class="k">${escHtml(b[0])}</td><td>${nilai.isNotEmpty ? escHtml(nilai) : '<span class="isian">&nbsp;</span>'}</td></tr>');
  }
  o.write('</table>');
  return o.toString();
}

String _isiAtau(dynamic teksIsi, [int n = 2]) {
  final t = '${teksIsi ?? ''}'.trim();
  if (t.isEmpty) return _isian(n);
  return t.split('\n').where((x) => x.trim().isNotEmpty).map((x) => '<p>${escHtml(x.trim())}</p>').join();
}

String _daftarAtau(List<String> d, [int n = 2]) => d.isNotEmpty ? '<ol>${d.map((x) => '<li>${escHtml(x)}</li>').join()}</ol>' : _isian(n);

String rppHtmlSatu(Map<String, dynamic> d, Map<String, dynamic> x) {
  final r = peta(x['rpp']);
  final sek = peta(d['sekolah']);
  final o = <String>[];
  final tutor = _ls(d['tutor']).join(', ');
  o.add('<h1>${escHtml(teks(sek['namaSatuan'], '(NAMA SATUAN PENDIDIKAN BELUM DIISI)'))}</h1>');
  final sub = [if (teks(sek['npsn']).isNotEmpty) 'NPSN: ${teks(sek['npsn'])}', if (teks(sek['alamat']).isNotEmpty) teks(sek['alamat'])];
  if (sub.isNotEmpty) o.add('<p class="sub">${escHtml(sub.join(' · '))}</p>');
  o.add('<hr>');
  o.add('<h2>MODUL AJAR / RENCANA PELAKSANAAN PEMBELAJARAN</h2>');
  final jp = teks(r['alokasiJp']).isNotEmpty && teks(r['alokasiJp']) != '0' ? '${teks(r['alokasiJp'])} JP' : '';
  o.add(_bagian('A. Identitas'));
  o.add(_tabel([
    ['Mata Pelajaran', d['namaMapel']],
    ['Kelas / Rombel', d['namaRombel']],
    ['Fase', teks(d['fase'])],
    ['Jenjang', teks(d['jenjang'])],
    ['Kurikulum', teks(d['kurikulum'])],
    [
      'Sesi / Pertemuan',
      'Semester ${angka(x['smt'])} - ${_namaSesi(x)}${angka(x['n']) > 0 && angka(x['minggu']) != angka(x['n']) ? ' (minggu ${angka(x['minggu'])} rencana)' : ''}'
    ],
    ['Alokasi Waktu', jp],
    ['Tanggal Pelaksanaan', teks(x['rentang'], '(di luar jangkauan pengaturan sesi)')],
    ['Guru / Tutor Pengampu', tutor],
    ['NIP / NUPTK', ''],
    ['Jumlah Peserta Didik', angka(d['jumlahSiswa']) > 0 ? '${angka(d['jumlahSiswa'])}' : ''],
    ['Bab / Unit', '${teks(x['bab']).isNotEmpty ? 'Bab ${teks(x['bab'])} — ' : ''}${teks(x['judulBab'])}'],
    ['Materi Pokok', teks(x['topik'])],
    ['Sumber Belajar Utama', '${teks(d['bukuAcuan'])}${teks(x['halaman']).isNotEmpty ? ' (hal. ${teks(x['halaman'])})' : ''}'],
  ]));
  o.add(_bagian('B. Capaian dan Tujuan Pembelajaran'));
  o.add(_label('Capaian Pembelajaran'));
  o.add(_isiAtau(peta(d['cp'])['teks'], 3));
  o.add(_label('Tujuan Pembelajaran'));
  o.add(_daftarAtau(_ls(x['tujuan']), 3));
  o.add(_label('Dimensi Profil Lulusan / Pelajar Pancasila'));
  o.add(_isiAtau(_ls(r['dimensi']).join(', '), 1));
  o.add(_bagian('C. Pemahaman Bermakna dan Pertanyaan Pemantik'));
  o.add(_label('Pemahaman Bermakna'));
  o.add(_isiAtau(r['pemahaman'], 2));
  o.add(_label('Pertanyaan Pemantik'));
  o.add(_daftarAtau(_ls(r['pemantik']), 2));
  o.add(_bagian('D. Model, Metode, dan Media'));
  o.add(_tabel([
    ['Model Pembelajaran', teks(r['model'])],
    ['Metode', _ls(r['metode']).join(', ')],
    ['Media / Alat / Bahan', _ls(r['media']).join(', ')],
  ]));
  o.add(_bagian('E. Kegiatan Pembelajaran'));
  o.add(_label('Pendahuluan'));
  o.add(_daftarAtau(_ls(r['pendahuluan']), 3));
  o.add(_label('Kegiatan Inti'));
  o.add(_daftarAtau(_ls(r['inti']), 5));
  o.add(_label('Penutup'));
  o.add(_daftarAtau(_ls(r['penutup']), 3));
  o.add(_bagian('F. Asesmen'));
  o.add(_tabel([
    ['Diagnostik', teks(r['diagnostik'])],
    ['Formatif', teks(r['formatif'])],
    ['Sumatif', teks(r['sumatif'])],
  ]));
  if (teks(x['tanya']).isNotEmpty) {
    o.add(_label('Pertanyaan Diskusi (diberikan kepada peserta didik di Belajar Mandiri)'));
    o.add('<p><i>${escHtml(x['tanya'])}</i></p>');
  }
  if (teks(x['narasi']).isNotEmpty) {
    o.add(_bagian('G. Pengantar Materi untuk Peserta Didik'));
    o.add('<p>${escHtml(x['narasi'])}</p>');
  }
  o.add(_bagian('H. Refleksi'));
  o.add(_label('Refleksi Peserta Didik'));
  o.add(_isian(3));
  o.add(_label('Refleksi Guru'));
  o.add(_isian(3));
  o.add('<p class="tgl">${escHtml('${teks(sek['kotaTtd']).isNotEmpty ? '${teks(sek['kotaTtd'])}, ' : ''}${tanggalIni()}')}</p>');
  o.add('<table class="ttd"><tr><td>Mengetahui,<br>Kepala ${escHtml(teks(sek['namaSatuan'], 'Satuan Pendidikan'))}</td><td>Guru / Tutor Pengampu</td></tr><tr>'
      '<td><br><br><br><b>${escHtml(teks(sek['namaKepala'], '__________________________'))}</b><br>NIP. ${escHtml(teks(sek['nipKepala'], '______________________'))}</td>'
      '<td><br><br><br><b>${escHtml(tutor.isEmpty ? '__________________________' : tutor)}</b><br>NIP. ______________________</td></tr></table>');
  return o.join('\n');
}

const _gaya = 'body{font-family:Arial,sans-serif;font-size:10pt} h1{font-size:14pt;text-align:center;margin:0} h2{font-size:12pt;text-align:center} '
    'h3{font-size:11pt;margin:8pt 0 3pt} p{font-size:10pt;margin:2pt 0} .sub{text-align:center} table{border-collapse:collapse;width:100%} '
    'td,th{border:1px solid #444;padding:3pt 5pt;font-size:10pt;vertical-align:top} td.k{width:32%;font-weight:bold;background:#f2f4f7} '
    'p.isian{height:15pt;margin:0;border-bottom:1px dotted #777} span.isian{border-bottom:1px dotted #777} .lbl{font-weight:bold}';

String rppHtmlPdf(Map<String, dynamic> d, List<Map<String, dynamic>> daftarSesi) {
  final isi = daftarSesi.map((x) => '<div class="rp-dok">${rppHtmlSatu(d, x)}</div>').join('<div style="page-break-after:always"></div>');
  return '<!doctype html><html><head><meta charset="utf-8"><style>$_gaya</style></head><body>$isi</body></html>';
}

String rppHtmlWord(Map<String, dynamic> d, List<Map<String, dynamic>> daftarSesi) {
  final isi = daftarSesi.map((x) => '<div class="rp-dok">${rppHtmlSatu(d, x)}</div>').join('<br clear="all" style="page-break-before:always">');
  return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'
      '<head><meta charset="utf-8"><title>RPP</title><style>@page WordSection1{size:21.5cm 33cm;margin:2cm}div.WordSection1{page:WordSection1}$_gaya</style></head>'
      '<body><div class="WordSection1">$isi</div></body></html>';
}

String _namaBerkas(Map<String, dynamic> d) => (teks(d['namaMapel'], 'mapel')).replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_');

// ───────────────────────── TAB RPP ─────────────────────────

class RppTab extends StatefulWidget {
  const RppTab({super.key, required this.idMapel});
  final String idMapel;

  @override
  State<RppTab> createState() => _RppTabState();
}

class _RppTabState extends State<RppTab> with AutomaticKeepAliveClientMixin {
  int _v = 0;
  final Set<String> _pilih = {};
  Map<String, dynamic>? _d;

  @override
  bool get wantKeepAlive => true;

  void _muatUlang() => setState(() => _v++);

  Future<void> _pdf(Map<String, dynamic> x) async {
    final d = _d!;
    await htmlKePdf(context,
        nama: 'RPP_${_namaBerkas(d)}_Sesi${angka(x['n']) > 0 ? angka(x['n']) : angka(x['minggu'])}.pdf',
        fn: 'waStafRppPdf',
        args: [_t, widget.idMapel, rppHtmlPdf(d, [x])]);
  }

  Future<void> _word(List<Map<String, dynamic>> daftarSesi) async {
    final d = _d!;
    final nama = 'RPP_${_namaBerkas(d)}${daftarSesi.length > 1 ? '_${daftarSesi.length}sesi' : ''}.doc';
    await bagikanWord(context, rppHtmlWord(d, daftarSesi), nama);
  }

  Future<void> _buka(Widget layar) async {
    final r = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => layar));
    if (r == true && mounted) _muatUlang();
  }

  Future<void> _ubahCp(Map<String, dynamic> d) async {
    final cp = peta(d['cp']);
    final teksC = TextEditingController(text: teks(cp['teks']));
    final sumber = TextEditingController(text: teks(cp['sumber']));
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Capaian Pembelajaran${teks(d['fase']).isNotEmpty ? ' · Fase ${teks(d['fase'])}' : ''}'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('Isi sekali per mata pelajaran dan fase. CP adalah teks resmi pemerintah, jadi salin dari dokumen Capaian Pembelajaran, bukan dari buku.',
                style: TextStyle(fontSize: 12.5)),
            const SizedBox(height: 10),
            TextField(controller: teksC, minLines: 6, maxLines: 14, maxLength: 6000, decoration: const InputDecoration(labelText: 'Teks Capaian Pembelajaran', alignLabelWithHint: true)),
            TextField(controller: sumber, maxLength: 300, decoration: const InputDecoration(labelText: 'Sumber / acuan', hintText: 'mis. Keputusan Kepala BSKAP No. 046/H/KR/2025')),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Simpan')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafRppCp', [_t, widget.idMapel, teksC.text, sumber.text]));
    if (r.ok && mounted) {
      kabar(context, 'Capaian Pembelajaran disimpan.');
      _muatUlang();
    }
  }

  Widget _kartuKerangka(Map<String, dynamic> kf) {
    final cs = Theme.of(context).colorScheme;
    final tp = daftar(kf['tp']).map(peta).toList();
    final untuk = tp.where((x) => x['untukKelas'] == true).length;
    String label(Map<String, dynamic> x) => '${RegExp(r'^\d').hasMatch(teks(x['nomor'])) ? 'TP ' : ''}${teks(x['nomor'])}';
    return Card(
      child: ExpansionTile(
        shape: const Border(),
        title: const Text('Alur Tujuan Pembelajaran (ATP) resmi', style: TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text('$untuk TP berlaku untuk ${teks(kf['kelas']).isNotEmpty ? 'kelas ${teks(kf['kelas'])}' : 'rombel ini'} (dari ${tp.length} TP pada fase ${teks(kf['fase'])}). '
            'CP dan TP diatur admin; pilih TP untuk tiap sesi di tab Kurikulum lewat tombol Ubah.'),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        children: [
          for (final x in tp)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Text(
                '${label(x)}${() {
                  final meta = [teks(x['elemen']), if (teks(x['smt']).isNotEmpty) 'semester ${teks(x['smt'])}', if (teks(x['kelas']).isNotEmpty) 'kelas ${teks(x['kelas'])}']
                      .where((e) => e.isNotEmpty)
                      .join(' · ');
                  return meta.isEmpty ? '' : ' ($meta)';
                }()}: ${teks(x['teks'])}',
                style: TextStyle(fontSize: 13, color: x['untukKelas'] == true ? null : cs.outline),
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async {
        final d = peta(await Api.instance('waStafRppBaca', [_t, widget.idMapel]));
        final ada = daftar(d['rows']).map((x) => _kunci(peta(x))).toSet();
        _pilih.removeWhere((k) => !ada.contains(k));
        _d = d;
        return d;
      },
      bangun: (context, d, _) {
        final cs = Theme.of(context).colorScheme;
        final rows = daftar(d['rows']).map(peta).toList();
        final ubah = d['dapatUbah'] == true;
        final siapAi = d['siapAi'] == true;
        final kosong = rows.where(_kosong).length;
        final cp = peta(d['cp']);
        final sub = [teks(d['namaMapel']), teks(d['namaRombel']), if (teks(d['fase']).isNotEmpty) 'Fase ${teks(d['fase'])}', if (teks(d['jenjang']).isNotEmpty) teks(d['jenjang']),
          '${angka(d['jumlahSiswa'])} peserta didik', if (teks(d['tahunAjaran']).isNotEmpty) 'TA ${teks(d['tahunAjaran'])}'];
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('RPP / Modul Ajar', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                Text(sub.join(' · '), style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
                if (daftar(d['peringatan']).isNotEmpty)
                  Container(
                    margin: const EdgeInsets.only(top: 10),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: const Color(0xFFFFF4DB), borderRadius: BorderRadius.circular(12)),
                    child: Text('Perlu dilengkapi agar dokumen cetak tidak kosong:\n• ${daftar(d['peringatan']).join('\n• ')}', style: const TextStyle(color: Colors.black87)),
                  ),
              ]),
            ),
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const Expanded(child: Text('Capaian Pembelajaran (CP)', style: TextStyle(fontWeight: FontWeight.w800))),
                  if (ubah && d['kerangka'] == null) TextButton(onPressed: () => _ubahCp(d), child: const Text('Ubah CP')),
                ]),
                Text(teks(cp['teks'], 'Belum diisi. CP tercetak sebagai garis isian.'),
                    style: TextStyle(fontSize: 13, color: teks(cp['teks']).isEmpty ? cs.outline : null, fontStyle: teks(cp['teks']).isEmpty ? FontStyle.italic : null)),
              ]),
            ),
          ),
          if (d['kerangka'] != null) _kartuKerangka(peta(d['kerangka'])),
          if (rows.isEmpty)
            const Card(child: Padding(padding: EdgeInsets.all(14), child: Text('Belum ada rencana kurikulum untuk mapel ini. Susun dulu di tab Kurikulum; RPP dibuat per sesi dari rencana itu.')))
          else ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Wrap(spacing: 8, runSpacing: 8, children: [
                  if (ubah)
                    FilledButton.icon(
                      onPressed: siapAi
                          ? () => _buka(RppAiScreen(
                                idMapel: widget.idMapel,
                                d: d,
                                keys: _pilih.isNotEmpty ? rows.map(_kunci).where(_pilih.contains).toList() : rows.where(_kosong).map(_kunci).toList(),
                              ))
                          : null,
                      icon: const Icon(Icons.auto_awesome_rounded, size: 18),
                      label: Text('Susun RPP dengan AI (${_pilih.isNotEmpty ? '${_pilih.length} terpilih' : '$kosong sesi kosong'})'),
                    ),
                  if (bolehUnduh || ubah) OutlinedButton(onPressed: () => setState(() => _pilih.addAll(rows.map(_kunci))), child: const Text('Pilih semua')),
                  if (bolehUnduh || ubah) OutlinedButton(onPressed: () => setState(_pilih.clear), child: const Text('Kosongkan pilihan')),
                  if (bolehUnduh) OutlinedButton.icon(
                    onPressed: () {
                      final p = rows.where((x) => _pilih.contains(_kunci(x))).toList();
                      if (p.isEmpty) return kabar(context, 'Centang dulu sesi yang akan dicetak.');
                      _word(p);
                    },
                    icon: const Icon(Icons.download_rounded, size: 18),
                    label: Text('Unduh Word terpilih${_pilih.isNotEmpty ? ' (${_pilih.length})' : ''}'),
                  ),
                  if (ubah && !siapAi)
                    Text('Penyusunan otomatis belum aktif. RPP tetap dapat diisi manual lewat tombol Ubah.', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                ]),
              ),
            ),
            for (final smt in [1, 2])
              if (rows.any((x) => angka(x['smt']) == smt)) ...[
                JudulBagian('Semester $smt'),
                for (final x in rows.where((x) => angka(x['smt']) == smt))
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(4, 6, 10, 8),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Checkbox(
                            value: _pilih.contains(_kunci(x)),
                            onChanged: (v) => setState(() => v == true ? _pilih.add(_kunci(x)) : _pilih.remove(_kunci(x))),
                          ),
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(top: 10),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text('${_namaSesi(x)} · ${teks(x['topik'], '(tanpa judul)')}', style: const TextStyle(fontWeight: FontWeight.w700)),
                                const SizedBox(height: 4),
                                Lencana(x['ada'] == true ? 'RPP ${angka(x['skor'])}/6' : 'RPP kosong',
                                    warna: angka(x['skor']) >= 6 ? Colors.green : (angka(x['skor']) >= 3 ? const Color(0xFFE9A23B) : cs.outline)),
                                const SizedBox(height: 4),
                                Text([teks(x['rentang']), teks(x['judulBab']), if (teks(x['halaman']).isNotEmpty) 'hal. ${teks(x['halaman'])}'].where((e) => e.isNotEmpty).join(' · '),
                                    style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                              ]),
                            ),
                          ),
                        ]),
                        Padding(
                          padding: const EdgeInsets.only(left: 8),
                          child: Wrap(spacing: 6, runSpacing: 6, children: [
                            if (bolehUnduh) OutlinedButton.icon(onPressed: () => _pdf(x), icon: const Icon(Icons.picture_as_pdf_rounded, size: 18), label: const Text('Lihat PDF')),
                            if (ubah) OutlinedButton(onPressed: () => _buka(UbahRppScreen(idMapel: widget.idMapel, x: x)), child: const Text('Ubah')),
                            if (bolehUnduh) OutlinedButton.icon(onPressed: () => _word([x]), icon: const Icon(Icons.description_rounded, size: 18), label: const Text('Unduh Word')),
                            if (ubah && siapAi)
                              IconButton.outlined(
                                tooltip: 'Susun ulang dengan AI',
                                onPressed: () => _buka(RppAiScreen(idMapel: widget.idMapel, d: d, keys: [_kunci(x)], timpaPasti: true)),
                                icon: const Icon(Icons.auto_awesome_rounded, size: 18),
                              ),
                          ]),
                        ),
                      ]),
                    ),
                  ),
              ],
          ],
        ]);
      },
    );
  }
}

// ───────────────────────── UBAH RPP SATU SESI ─────────────────────────

class UbahRppScreen extends StatefulWidget {
  const UbahRppScreen({super.key, required this.idMapel, required this.x});
  final String idMapel;
  final Map<String, dynamic> x;

  @override
  State<UbahRppScreen> createState() => _UbahRppScreenState();
}

class _UbahRppScreenState extends State<UbahRppScreen> {
  late final Map<String, dynamic> r = peta(widget.x['rpp']);
  late final Map<String, TextEditingController> f = {
    'alokasiJp': TextEditingController(text: teks(r['alokasiJp'])),
    'model': TextEditingController(text: teks(r['model'])),
    'metode': TextEditingController(text: _ls(r['metode']).join('\n')),
    'dimensi': TextEditingController(text: _ls(r['dimensi']).join('\n')),
    'pemahaman': TextEditingController(text: teks(r['pemahaman'])),
    'pemantik': TextEditingController(text: _ls(r['pemantik']).join('\n')),
    'pendahuluan': TextEditingController(text: _ls(r['pendahuluan']).join('\n')),
    'inti': TextEditingController(text: _ls(r['inti']).join('\n')),
    'penutup': TextEditingController(text: _ls(r['penutup']).join('\n')),
    'diagnostik': TextEditingController(text: teks(r['diagnostik'])),
    'formatif': TextEditingController(text: teks(r['formatif'])),
    'sumatif': TextEditingController(text: teks(r['sumatif'])),
    'media': TextEditingController(text: _ls(r['media']).join('\n')),
  };

  Future<void> _simpan() async {
    final x = widget.x;
    final isi = {for (final e in f.entries) e.key: e.value.text};
    final h = await jalankan(context, () => Api.instance('waStafRppSimpan', [_t, widget.idMapel, x['smt'], x['minggu'], isi]), teksProses: 'Menyimpan...');
    if (h.ok && mounted) {
      kabar(context, 'RPP disimpan.');
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final x = widget.x;
    final cs = Theme.of(context).colorScheme;
    Widget isian(String k, String label, {int baris = 1, int? maks, bool angkaSaja = false}) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: TextField(
            controller: f[k],
            minLines: baris,
            maxLines: baris == 1 ? 1 : baris + 5,
            maxLength: maks,
            keyboardType: angkaSaja ? TextInputType.number : null,
            decoration: InputDecoration(labelText: label, alignLabelWithHint: true),
          ),
        );
    return Scaffold(
      appBar: AppBar(title: Text('Ubah RPP · ${_namaSesi(x)} (Smt ${angka(x['smt'])})')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        Text(teks(x['topik']), style: const TextStyle(fontWeight: FontWeight.w700)),
        if (_ls(x['tujuan']).isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('Tujuan pembelajaran (diubah di tab Kurikulum): ${_ls(x['tujuan']).join(' | ')}', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
          ),
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Text('Tulis satu butir per baris pada kolom berdaftar.', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
        ),
        isian('alokasiJp', 'Alokasi waktu (JP)', angkaSaja: true),
        isian('model', 'Model pembelajaran', maks: 200),
        isian('metode', 'Metode (satu per baris)', baris: 2),
        isian('dimensi', 'Dimensi profil lulusan (satu per baris)', baris: 2),
        isian('pemahaman', 'Pemahaman bermakna', baris: 2, maks: 900),
        isian('pemantik', 'Pertanyaan pemantik (satu per baris)', baris: 3),
        isian('pendahuluan', 'Kegiatan pendahuluan (satu per baris)', baris: 3),
        isian('inti', 'Kegiatan inti (satu per baris)', baris: 5),
        isian('penutup', 'Kegiatan penutup (satu per baris)', baris: 3),
        isian('diagnostik', 'Asesmen diagnostik', baris: 2, maks: 900),
        isian('formatif', 'Asesmen formatif', baris: 2, maks: 900),
        isian('sumatif', 'Asesmen sumatif', baris: 2, maks: 900),
        isian('media', 'Media / alat / bahan (satu per baris)', baris: 2),
        FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: _simpan, child: const Text('Simpan')),
      ]),
    );
  }
}

// ───────────────────────── SUSUN RPP DENGAN AI ─────────────────────────

class RppAiScreen extends StatefulWidget {
  const RppAiScreen({super.key, required this.idMapel, required this.d, required this.keys, this.timpaPasti = false});
  final String idMapel;
  final Map<String, dynamic> d;
  final List<String> keys;
  final bool timpaPasti;

  @override
  State<RppAiScreen> createState() => _RppAiScreenState();
}

class _RppAiScreenState extends State<RppAiScreen> {
  late final List<Langkah> _langkah;
  late final List<List<String>> _kelompok;
  bool _timpa = false;
  bool _jalan = false;
  String? _ringkas;

  @override
  void initState() {
    super.initState();
    final perAi = angka(widget.d['perAi'], 3);
    final rows = daftar(widget.d['rows']).map(peta).toList();
    _kelompok = [for (var i = 0; i < widget.keys.length; i += perAi) widget.keys.sublist(i, math.min(i + perAi, widget.keys.length))];
    _langkah = [
      for (final g in _kelompok)
        Langkah(g.map((k) {
          final x = rows.where((r) => _kunci(r) == k).firstOrNull;
          return x == null ? k : 'S${angka(x['smt'])} ${_namaSesi(x)}';
        }).join(', '))
    ];
  }

  Future<void> _mulai() async {
    final timpa = widget.timpaPasti || _timpa;
    setState(() => _jalan = true);
    var terisi = 0, dilewati = 0, gagalN = 0;
    for (var i = 0; i < _langkah.length; i++) {
      final l = _langkah[i];
      setState(() {
        l.status = 'jalan';
        l.ket = 'Menyusun...';
      });
      var coba = 0;
      while (true) {
        try {
          final r = peta(await Api.instance('waStafRppAi', [_t, widget.idMapel, _kelompok[i], {'timpa': timpa}], batasAi));
          terisi += angka(r['terisi']);
          dilewati += angka(r['dilewati']);
          setState(() {
            l.status = 'ok';
            l.ket = '${angka(r['terisi'])} sesi tersimpan${angka(r['dilewati']) > 0 ? ', ${angka(r['dilewati'])} dilewati karena sudah terisi' : ''}';
          });
          break;
        } on ApiException catch (e) {
          final m = e.pesan;
          final bersih = bersihTanda(m);
          coba++;
          final fatal = RegExp(r'\[harian\]').hasMatch(m) || RegExp(r'tidak tersedia|hubungi admin|Terlalu banyak', caseSensitive: false).hasMatch(m);
          final t = RegExp(r'\[tunggu:(\d+)\]').firstMatch(m);
          final sementara = t != null || RegExp(r'sedang sibuk|tidak merespons|tidak berupa JSON|tidak menghasilkan|batas waktu|Exceeded|Timed out|belum menjawab', caseSensitive: false).hasMatch(m);
          if (RegExp(r'\[harian\]').hasMatch(m) || !sementara || coba >= 3) {
            gagalN++;
            setState(() {
              l.status = 'gagal';
              l.ket = bersih;
            });
            if (fatal) i = _langkah.length;
            break;
          }
          final detik = t != null ? math.min(90, math.max(20, int.parse(t[1]!) + 3)) : 8;
          final alasan = '${t != null ? 'Kuota AI gratis sedang penuh' : 'AI belum berhasil'} (percobaan ${coba + 1} dari 3)';
          for (var s = detik; s > 0; s--) {
            if (!mounted) return;
            setState(() => l.ket = '$alasan. Mencoba lagi otomatis dalam $s dtk...');
            await Future.delayed(const Duration(seconds: 1));
          }
        }
      }
    }
    for (final l in _langkah) {
      if (l.status == 'tunggu') l.ket = 'Tidak diproses';
    }
    if (mounted) {
      setState(() {
        _jalan = false;
        _ringkas = '$terisi sesi tersimpan${dilewati > 0 ? ', $dilewati dilewati' : ''}${gagalN > 0 ? ', $gagalN langkah gagal (bisa diulang)' : ''}.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return PopScope(
      canPop: !_jalan,
      child: Scaffold(
        appBar: AppBar(title: const Text('Susun RPP dengan AI')),
        body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
          if (widget.keys.isEmpty) ...[
            const Text('Semua sesi sudah memiliki RPP. Centang sesi tertentu bila ingin menyusun ulang.'),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: () => Navigator.pop(context), child: const Text('Tutup')),
          ] else ...[
            Text(
              'AI menyusun model, metode, kegiatan, dan asesmen dari rencana sesi dan CP. Hasilnya berupa draf; periksa dan ubah bila perlu. '
              '${widget.keys.length} sesi akan diproses dalam ${_langkah.length} langkah.',
              style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
            ),
            if (!widget.timpaPasti)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: _timpa,
                onChanged: _jalan || _ringkas != null ? null : (v) => setState(() => _timpa = v == true),
                title: const Text('Timpa RPP yang sudah ada pada sesi terpilih (bila tidak dicentang, sesi yang sudah terisi dilewati)'),
              ),
            const SizedBox(height: 8),
            Card(child: Padding(padding: const EdgeInsets.all(12), child: DaftarLangkah(langkah: _langkah, tampilBar: false))),
            const SizedBox(height: 12),
            if (_ringkas != null) ...[
              Text(_ringkas!),
              const SizedBox(height: 12),
              FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Selesai')),
            ] else
              Row(children: [
                Expanded(child: FilledButton(onPressed: _jalan ? null : _mulai, child: const Text('Mulai'))),
                const SizedBox(width: 10),
                Expanded(child: OutlinedButton(onPressed: _jalan ? null : () => Navigator.pop(context), child: const Text('Batal'))),
              ]),
          ],
        ]),
      ),
    );
  }
}
