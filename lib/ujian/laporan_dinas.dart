import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:syncfusion_flutter_pdf/pdf.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';
import 'cetak_masa.dart';

/// v1.96.0: LAPORAN DINAS asesmen (mis. ASAS sesuai SE Disdik). Walau ujian dikerjakan online, lembaga tetap menyiapkan:
/// 1. SK panitia penyelenggara (isian nomor SK & nama-nama, disimpan; tinggal cetak),
/// 2. jadwal ujian (per masa ujian),
/// 3. naskah soal sampel seluruh mapel semua rombel (dua kolom) + 4. lembar jawaban, opsional 5. kunci jawaban.
/// Semua bagian digabung menjadi satu PDF F4 siap cetak.

String? get _t => Sesi.instance.token;
const _hari = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const _bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
String _tgl(String iso, {bool hari = false}) {
  final d = DateTime.tryParse(iso);
  if (d == null) return iso;
  return '${hari ? '${_hari[d.weekday - 1]}, ' : ''}${d.day} ${_bulan[d.month - 1]} ${d.year}';
}

String _e(dynamic s) => escHtml(s);
String _paket(String program) {
  final m = RegExp(r'([ABC])\s*$', caseSensitive: false).firstMatch(program);
  return m == null ? program : 'Paket ${m[1]!.toUpperCase()}';
}

String _kop(Map<String, dynamic> kop) {
  final b = StringBuffer('<div class="kopisi">');
  if (teks(kop['yayasan']).isNotEmpty) b.write('<div class="yy">${_e(teks(kop['yayasan']).toUpperCase())}</div>');
  b.write('<div class="lb">${_e(teks(kop['nama'], 'PKBM').toUpperCase())}</div>');
  for (final x in barisPiramida(daftar(kop['baris']).map((e) => teks(e)))) {
    b.write('<div class="kecil">${_e(x)}</div>');
  }
  b.write('</div><div class="garis"></div>');
  return b.toString();
}

const _css = '.kopisi{text-align:center}.yy{font-size:10pt;font-weight:bold}.lb{font-size:15pt;font-weight:bold}.kecil{font-size:8pt;color:#333}'
    '.garis{border-top:2px solid #111;border-bottom:.5px solid #111;height:2px;margin:4px 0 8px}'
    '.c{text-align:center}.judul{text-align:center;font-weight:bold;font-size:12pt;margin:6px 0 2px}.p{text-align:justify;margin:3px 0}'
    'table.k{width:100%;border-collapse:collapse}table.k td{vertical-align:top;padding:2px 3px;font-size:10.5pt}'
    'table.g{width:100%;border-collapse:collapse}table.g th,table.g td{border:1px solid #444;padding:3px 5px;font-size:9.5pt;vertical-align:top}table.g th{background:#eee}'
    'table.id{width:100%;border-collapse:collapse;margin:6px 0 8px}table.id td{border:1px solid #777;padding:4px 6px;font-size:9.5pt}'
    'table.sl{width:100%;border-collapse:collapse}table.sl td{width:50%;vertical-align:top;padding:3px 8px 6px 2px;font-size:9.5pt;line-height:1.3}'
    'table.sl tr{page-break-inside:avoid}.no{font-weight:bold}.op{padding-left:14px}'
    'table.lj{border-collapse:collapse;margin:0 auto}table.lj td{padding:2px 3px;font-size:9.5pt;text-align:center}'
    '.bl{display:inline-block;width:15px;height:15px;line-height:15px;border:1px solid #333;border-radius:8px;font-size:8pt;text-align:center;margin:0 1px}'
    '.hal{page-break-before:always}.kaki{font-size:8pt;color:#555;margin-top:8px}.ttd td{font-size:10.5pt}';

String _dok(String isi) => dokumenA4(isi, _css);

// ───────────────────────── SK ─────────────────────────
String htmlSk(Map<String, dynamic> d, Map<String, dynamic> sk) {
  final kop = peta(d['kop']);
  final lembaga = teks(kop['nama'], teks(peta(d['lembaga'])['nama'], 'PKBM'));
  final jenis = teks(d['namaJenis']), sem = teks(d['semester']), tahun = teks(d['tahun']);
  final baris = (String k) => teks(sk[k]).split('\n').map((x) => x.trim()).where((x) => x.isNotEmpty).toList();
  final b = StringBuffer(_kop(kop))
    ..write('<div class="judul">KEPUTUSAN KEPALA ${_e(lembaga.toUpperCase())}</div>')
    ..write('<div class="c">NOMOR: ${_e(teks(sk['nomor']))}</div>')
    ..write('<div class="judul" style="margin-top:8px">TENTANG</div>')
    ..write('<div class="c" style="font-weight:bold">PANITIA PENYELENGGARA ${_e(jenis.toUpperCase())}<br>PROGRAM PAKET A, PAKET B, DAN PAKET C<br>'
        'SEMESTER ${_e(sem.toUpperCase())} TAHUN PELAJARAN ${_e(tahun)}</div>')
    ..write('<div class="judul" style="margin:10px 0 6px">KEPALA ${_e(lembaga.toUpperCase())},</div>')
    ..write('<table class="k">'
        '<tr><td style="width:90px">Menimbang</td><td style="width:10px">:</td><td>'
        '<div class="p">a. bahwa untuk mengukur ketercapaian kompetensi peserta didik pada akhir semester ${_e(sem.toLowerCase())} tahun pelajaran ${_e(tahun)} perlu dilaksanakan ${_e(jenis)};</div>'
        '<div class="p">b. bahwa untuk kelancaran penyelenggaraannya perlu dibentuk panitia penyelenggara;</div>'
        '<div class="p">c. bahwa berdasarkan pertimbangan huruf a dan huruf b, perlu menetapkan Keputusan Kepala ${_e(lembaga)} tentang Panitia Penyelenggara ${_e(jenis)}.</div></td></tr>'
        '<tr><td>Mengingat</td><td>:</td><td>'
        '<div class="p">1. Undang-Undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;</div>'
        '<div class="p">2. Peraturan Pemerintah Nomor 57 Tahun 2021 tentang Standar Nasional Pendidikan sebagaimana telah diubah dengan Peraturan Pemerintah Nomor 4 Tahun 2022;</div>'
        '<div class="p">3. Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi Nomor 21 Tahun 2022 tentang Standar Penilaian Pendidikan pada Pendidikan Anak Usia Dini, Jenjang Pendidikan Dasar, dan Jenjang Pendidikan Menengah;</div>'
        '${teks(sk['seNomor']).isEmpty ? '' : '<div class="p">4. Surat Edaran Kepala Dinas Pendidikan Kabupaten Cirebon Nomor ${_e(teks(sk['seNomor']))}${teks(sk['seTanggal']).isEmpty ? '' : ' tanggal ${_e(_tgl(teks(sk['seTanggal'])))}'} perihal pelaksanaan ${_e(jenis)}.</div>'}'
        '</td></tr></table>')
    ..write('<div class="judul" style="margin:10px 0 6px">MEMUTUSKAN:</div>')
    ..write('<table class="k">'
        '<tr><td style="width:90px">Menetapkan</td><td style="width:10px">:</td><td><b>KEPUTUSAN KEPALA ${_e(lembaga.toUpperCase())} TENTANG PANITIA PENYELENGGARA ${_e(jenis.toUpperCase())} SEMESTER ${_e(sem.toUpperCase())} TAHUN PELAJARAN ${_e(tahun)}.</b></td></tr>'
        '<tr><td>KESATU</td><td>:</td><td class="p">Membentuk Panitia Penyelenggara ${_e(jenis)} Program Paket A, Paket B, dan Paket C dengan susunan sebagaimana tercantum dalam Lampiran Keputusan ini.</td></tr>'
        '<tr><td>KEDUA</td><td>:</td><td class="p">Panitia bertugas menyiapkan, melaksanakan, mengawasi, mengolah hasil, dan melaporkan pelaksanaan ${_e(jenis)} yang dilaksanakan pada tanggal ${_e(_tgl(teks(d['dari'])))} sampai dengan ${_e(_tgl(teks(d['sampai'])))} secara daring melalui aplikasi TH.E-Course.</td></tr>'
        '<tr><td>KETIGA</td><td>:</td><td class="p">Segala biaya yang timbul akibat ditetapkannya Keputusan ini dibebankan pada anggaran ${_e(lembaga)}.</td></tr>'
        '<tr><td>KEEMPAT</td><td>:</td><td class="p">Keputusan ini berlaku sejak tanggal ditetapkan, dengan ketentuan apabila di kemudian hari terdapat kekeliruan akan diperbaiki sebagaimana mestinya.</td></tr>'
        '</table>')
    ..write('<table class="ttd" style="width:100%;margin-top:18px"><tr><td style="width:55%"></td><td>Ditetapkan di : ${_e(teks(sk['tempat']))}<br>Pada tanggal : ${_e(_tgl(teks(sk['tanggal'])))}<br>'
        'Kepala ${_e(lembaga)},<br><br><br><br><b><u>${_e(teks(d['kepala']))}</u></b></td></tr></table>');
  // lampiran: susunan panitia
  b.write('<div class="hal">${_kop(kop)}<div class="p" style="font-size:9.5pt">Lampiran Keputusan Kepala ${_e(lembaga)}<br>Nomor: ${_e(teks(sk['nomor']))}<br>'
      'Tanggal: ${_e(_tgl(teks(sk['tanggal'])))}</div><div class="judul">SUSUNAN PANITIA PENYELENGGARA ${_e(jenis.toUpperCase())}<br>SEMESTER ${_e(sem.toUpperCase())} TAHUN PELAJARAN ${_e(tahun)}</div>');
  final rows = <(String, String)>[
    (teks(d['kepala']), 'Penanggung jawab'),
    if (teks(sk['ketua']).trim().isNotEmpty) (teks(sk['ketua']).trim(), 'Ketua'),
    if (teks(sk['wakil']).trim().isNotEmpty) (teks(sk['wakil']).trim(), 'Wakil ketua'),
    if (teks(sk['sekretaris']).trim().isNotEmpty) (teks(sk['sekretaris']).trim(), 'Sekretaris'),
    if (teks(sk['bendahara']).trim().isNotEmpty) (teks(sk['bendahara']).trim(), 'Bendahara'),
    for (final x in baris('anggota')) (x, 'Anggota'),
    for (final x in baris('pengawas')) (x, 'Pengawas ujian'),
  ];
  b.write('<table class="g" style="margin-top:8px"><tr><th style="width:30px">No</th><th>Nama</th><th style="width:170px">Jabatan dalam panitia</th><th style="width:90px">Tanda tangan</th></tr>');
  for (var i = 0; i < rows.length; i++) {
    b.write('<tr><td class="c">${i + 1}</td><td>${_e(rows[i].$1)}</td><td>${_e(rows[i].$2)}</td><td></td></tr>');
  }
  b.write('</table>');
  final penyusun = baris('penyusun');
  if (penyusun.isNotEmpty) {
    b.write('<div class="judul" style="font-size:11pt;margin-top:12px">TIM PENYUSUN SOAL</div><table class="g"><tr><th style="width:30px">No</th><th>Mata pelajaran</th><th>Penyusun</th></tr>');
    for (var i = 0; i < penyusun.length; i++) {
      final p = penyusun[i].split(':');
      b.write('<tr><td class="c">${i + 1}</td><td>${_e(p.first.trim())}</td><td>${_e(p.length > 1 ? p.sublist(1).join(':').trim() : '')}</td></tr>');
    }
    b.write('</table>');
  }
  b.write('<table class="ttd" style="width:100%;margin-top:18px"><tr><td style="width:55%"></td><td>Kepala ${_e(lembaga)},<br><br><br><br><b><u>${_e(teks(d['kepala']))}</u></b></td></tr></table></div>');
  return _dok(b.toString());
}

// ───────────────────────── naskah soal (2 kolom) + lembar jawaban ─────────────────────────
String _identitas(Map<String, dynamic> u, String rombel, String program, Map<String, dynamic> d, {bool lj = false}) =>
    '<table class="id"><tr><td>Mata pelajaran: <b>${_e(teks(u['mapel']))}</b></td><td>Rombel/kelas: <b>${_e(rombel)}</b> (${_e(_paket(program))})</td></tr>'
    '<tr><td>Hari, tanggal: ${_e(_tgl(teks(u['tanggal']), hari: true))}</td><td>Waktu: ${_e(teks(u['jam']))} · ${_e(teks(u['durasi']))} menit · ${daftar(u['soal']).length} soal</td></tr>'
    '${lj ? '<tr><td>Nama peserta: ........................................................</td><td>Nomor peserta / NISN: ..................................</td></tr>' : ''}'
    '</table>';

String htmlNaskahRombel(Map<String, dynamic> d, Map<String, dynamic> r, List<Map<String, dynamic>> ujian, {required bool soal, required bool lj, required bool kunci}) {
  final kop = peta(d['kop']);
  final jenis = teks(d['namaJenis']).toUpperCase();
  final rombel = teks(r['nama']), program = teks(r['program']);
  final b = StringBuffer();
  var pertama = true;
  void halaman(String isi) {
    b.write('<div${pertama ? '' : ' class="hal"'}>$isi</div>');
    pertama = false;
  }

  final judulBawah = 'SEMESTER ${_e(teks(d['semester']).toUpperCase())} TAHUN PELAJARAN ${_e(teks(d['tahun']))}';
  for (final u in ujian) {
    final s = daftar(u['soal']).map(peta).toList();
    final huruf = angka(u['maksOpsi'], 5) >= 5 ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
    if (soal) {
      final x = StringBuffer(_kop(kop))
        ..write('<div class="judul">NASKAH SOAL ${_e(jenis)}<br>$judulBawah</div>')
        ..write(_identitas(u, rombel, program, d))
        ..write('<div style="font-size:9pt;margin-bottom:4px"><b>Petunjuk:</b> pilih satu jawaban yang paling tepat. Ujian dikerjakan daring di aplikasi TH.E-Course; '
            'naskah ini adalah contoh soal untuk dokumentasi lembaga.</div>');
      if (s.isEmpty) {
        x.write('<p><i>${_e(teks(u['galat'], 'Bank soal belum tersedia.'))}</i></p>');
      } else {
        x.write('<table class="sl">');
        for (var i = 0; i < s.length; i += 2) {
          String sel(int k) {
            if (k >= s.length) return '<td></td>';
            final q = s[k], o = peta(q['o']);
            return '<td><span class="no">${k + 1}.</span> ${_e(teks(q['t']))}'
                '${[for (final h in huruf) if (o[h] != null && teks(o[h]).isNotEmpty) '<div class="op">$h. ${_e(teks(o[h]))}</div>'].join()}</td>';
          }
          x.write('<tr>${sel(i)}${sel(i + 1)}</tr>');
        }
        x.write('</table>');
      }
      x.write('<div class="kaki">© ${_e(teks(kop['nama'], 'PKBM'))} · naskah milik lembaga, tidak untuk disebarluaskan.</div>');
      halaman(x.toString());
    }
    if (lj) {
      final n = s.isEmpty ? angka(u['jumlah'], 50) : s.length;
      final x = StringBuffer(_kop(kop))
        ..write('<div class="judul">LEMBAR JAWABAN ${_e(jenis)}<br>$judulBawah</div>')
        ..write(_identitas(u, rombel, program, d, lj: true))
        ..write('<div style="font-size:9pt;margin:2px 0 6px"><b>Petunjuk:</b> hitamkan atau beri tanda silang (X) pada huruf jawaban yang dipilih. Bila ingin mengganti jawaban, coret dua garis lalu pilih huruf lain.</div>');
      const kolom = 4;
      final perKolom = (n / kolom).ceil();
      x.write('<table style="width:100%;border-collapse:collapse"><tr>');
      for (var c = 0; c < kolom; c++) {
        x.write('<td style="vertical-align:top;width:25%"><table class="lj">');
        for (var i = c * perKolom; i < (c + 1) * perKolom && i < n; i++) {
          x.write('<tr><td style="text-align:right;font-weight:bold;width:24px">${i + 1}.</td><td>${huruf.map((h) => '<span class="bl">$h</span>').join()}</td></tr>');
        }
        x.write('</table></td>');
      }
      x.write('</tr></table>');
      x.write('<table class="g" style="margin-top:14px"><tr><th>Jumlah benar</th><th>Nilai</th><th>Paraf pengawas</th><th>Paraf korektor</th><th>Tanda tangan peserta</th></tr>'
          '<tr><td style="height:40px"></td><td></td><td></td><td></td><td></td></tr></table>');
      halaman(x.toString());
    }
    if (kunci && s.isNotEmpty) {
      final x = StringBuffer(_kop(kop))
        ..write('<div class="judul">KUNCI JAWABAN ${_e(jenis)} (RAHASIA)<br>$judulBawah</div>')
        ..write(_identitas(u, rombel, program, d))
        ..write('<table class="g">');
      for (var i = 0; i < s.length; i += 10) {
        x.write('<tr>${[for (var k = i; k < i + 10 && k < s.length; k++) '<td>${k + 1}. <b>${_e(teks(s[k]['k']))}</b></td>'].join()}</tr>');
      }
      x.write('</table><div class="kaki">Skor per soal ${(100 / s.length).toStringAsFixed(2)} (total 100). KKM ${_e(teks(u['kkm']))}.</div>');
      halaman(x.toString());
    }
  }
  return _dok(b.toString());
}

// ───────────────────────── PDF ─────────────────────────
Future<List<int>> _pdf(String html) async {
  final r = peta(await Api.instance('waStafHtmlPdf', [_t, await sisipWatermark(html)], const Duration(minutes: 4)));
  return base64Decode(teks(r['b64']));
}

/// Gabungkan beberapa PDF (urut) menjadi satu.
Future<List<int>> gabungPdf(List<List<int>> bagian) async {
  if (bagian.length == 1) return bagian.first;
  final out = PdfDocument();
  out.pageSettings.margins.all = 0;
  for (final b in bagian) {
    final src = PdfDocument(inputBytes: b);
    for (var i = 0; i < src.pages.count; i++) {
      final pg = src.pages[i];
      final ukuran = pg.size;
      out.pageSettings.size = ukuran;
      final baru = out.pages.add();
      baru.graphics.drawPdfTemplate(pg.createTemplate(), Offset.zero, ukuran);
    }
    src.dispose();
  }
  final hasil = await out.save();
  out.dispose();
  return hasil;
}

// ───────────────────────── layar ─────────────────────────
class LaporanDinasScreen extends StatefulWidget {
  const LaporanDinasScreen({super.key, this.jenis = 'UAS'});
  final String jenis;

  @override
  State<LaporanDinasScreen> createState() => _LaporanDinasScreenState();
}

class _LaporanDinasScreenState extends State<LaporanDinasScreen> {
  Map<String, dynamic>? _d;
  String? _galat;
  final _c = {for (final k in ['nomor', 'tanggal', 'tempat', 'seNomor', 'seTanggal', 'ketua', 'wakil', 'sekretaris', 'bendahara', 'anggota', 'pengawas', 'penyusun']) k: TextEditingController()};
  final _pakai = {'sk': true, 'jadwal': true, 'soal': true, 'lj': true, 'kunci': false};
  final _rombel = <String>{};
  final _proses = ValueNotifier<(String, double)>(('', 0));

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat() async {
    setState(() => _galat = null);
    try {
      final d = peta(await Api.instance('waStafMasaLaporanData', [_t, widget.jenis], const Duration(minutes: 2)));
      if (!mounted) return;
      final sk = peta(d['sk']);
      for (final e in _c.entries) {
        e.value.text = teks(sk[e.key]);
      }
      setState(() {
        _d = d;
        _rombel
          ..clear()
          ..addAll(daftar(d['rombel']).map((r) => teks(peta(r)['id'])));
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  Map<String, dynamic> get _sk => {for (final e in _c.entries) e.key: e.value.text.trim()};

  Future<bool> _simpanSk({bool diam = false}) async {
    final r = await jalankan(context, () => Api.instance('waStafMasaLaporanSkSimpan', [_t, widget.jenis, _sk]), teksProses: 'Menyimpan isian SK...');
    if (r.ok && mounted && !diam) kabar(context, 'Isian SK disimpan.');
    return r.ok;
  }

  Future<void> _cetak() async {
    final d = _d;
    if (d == null) return;
    if (_pakai['sk'] == true && !await _simpanSk(diam: true)) return;
    if (!mounted) return;
    final rombel = daftar(d['rombel']).map(peta).where((r) => _rombel.contains(teks(r['id']))).toList();
    final masa = daftar(d['masa']).map(peta).toList();
    final langkah = (_pakai['sk'] == true ? 1 : 0) + (_pakai['jadwal'] == true ? masa.length : 0) +
        ((_pakai['soal'] == true || _pakai['lj'] == true || _pakai['kunci'] == true) ? rombel.length : 0);
    if (langkah == 0) return kabar(context, 'Pilih minimal satu isi laporan.', galat: true);
    if ((_pakai['soal'] == true || _pakai['lj'] == true || _pakai['kunci'] == true) && rombel.isEmpty && _pakai['sk'] != true && _pakai['jadwal'] != true) {
      return kabar(context, 'Pilih minimal satu rombel untuk naskah / lembar jawaban.', galat: true);
    }
    var ke = 0;
    void maju(String t) => _proses.value = (t, ke++ / (langkah + 1));
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (c) => PopScope(
        canPop: false,
        child: AlertDialog(
          title: const Text('Menyusun laporan dinas'),
          content: ValueListenableBuilder<(String, double)>(
            valueListenable: _proses,
            builder: (_, v, __) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              LinearProgressIndicator(value: v.$2),
              const SizedBox(height: 10),
              Text(v.$1, style: const TextStyle(fontSize: 13)),
            ]),
          ),
        ),
      ),
    );
    final bagian = <List<int>>[];
    String? gagal;
    try {
      if (_pakai['sk'] == true) {
        maju('SK panitia penyelenggara...');
        bagian.add(await _pdf(htmlSk(d, _sk)));
      }
      if (_pakai['jadwal'] == true) {
        for (final m in masa) {
          maju('Jadwal: ${teks(m['nama'])}...');
          final j = peta(await Api.instance('waStafMasaCetak', [_t, teks(m['id'])], const Duration(minutes: 2)));
          if (daftar(j['slot']).isNotEmpty) bagian.add(await _pdf(htmlJadwalUjian(j)));
        }
      }
      if (_pakai['soal'] == true || _pakai['lj'] == true || _pakai['kunci'] == true) {
        for (final r in rombel) {
          maju('Naskah & lembar jawaban ${teks(r['nama'])}...');
          final ids = daftar(r['ujian']).map((u) => teks(peta(u)['idUjian'])).toList();
          final ujian = <Map<String, dynamic>>[];
          for (var i = 0; i < ids.length; i += 14) {
            final h = peta(await Api.instance('waStafMasaLaporanSoal', [_t, ids.sublist(i, i + 14 > ids.length ? ids.length : i + 14)], const Duration(minutes: 4)));
            ujian.addAll(daftar(h['ujian']).map(peta));
          }
          // lengkapi jam & jumlah dari data rombel
          final info = {for (final u in daftar(r['ujian']).map(peta)) teks(u['idUjian']): u};
          for (final u in ujian) {
            u['jam'] = teks(u['jam'], teks(peta(info[teks(u['idUjian'])])['jam']));
            u['jumlah'] = peta(info[teks(u['idUjian'])])['jumlah'];
          }
          if (ujian.isEmpty) continue;
          bagian.add(await _pdf(htmlNaskahRombel(d, r, ujian, soal: _pakai['soal'] == true, lj: _pakai['lj'] == true, kunci: _pakai['kunci'] == true)));
        }
      }
      maju('Menggabungkan ${bagian.length} bagian...');
    } on ApiException catch (e) {
      gagal = e.ramah;
    } catch (e) {
      gagal = '$e';
    }
    List<int>? hasil;
    if (gagal == null && bagian.isNotEmpty) {
      try {
        hasil = await gabungPdf(bagian);
      } catch (e) {
        gagal = 'Gagal menggabungkan PDF: $e';
      }
    }
    if (mounted) Navigator.of(context, rootNavigator: true).pop();
    if (!mounted) return;
    if (gagal != null) return kabar(context, gagal, galat: true);
    if (hasil == null) return kabar(context, 'Tidak ada yang dicetak.', galat: true);
    final nama = 'Laporan_Dinas_${widget.jenis}_${teks(d['tahun']).replaceAll('/', '-')}_${teks(d['semester'])}.pdf';
    await bukaPdfBytes(context, hasil, nama);
  }

  Widget _isian(String k, String label, {int baris = 1, String? bantuan}) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: TextField(
          controller: _c[k],
          minLines: baris,
          maxLines: baris > 1 ? 12 : 1,
          decoration: InputDecoration(labelText: label, helperText: bantuan, helperMaxLines: 2),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final d = _d;
    return Scaffold(
      appBar: AppBar(title: Text('Laporan Dinas ${widget.jenis}')),
      body: _galat != null
          ? PesanGalat(pesan: _galat!, ulangi: _muat)
          : d == null
              ? const Center(child: CircularProgressIndicator())
              : ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 100), children: [
                  Card(
                    color: Theme.of(context).colorScheme.primaryContainer,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(
                          '${teks(d['namaJenis'])} · Semester ${teks(d['semester'])} ${teks(d['tahun'])}\n'
                          '${daftar(d['masa']).length} masa ujian ditetapkan (${_tgl(teks(d['dari']))} – ${_tgl(teks(d['sampai']))}) · '
                          '${daftar(d['rombel']).length} rombel · ${daftar(d['rombel']).fold<int>(0, (a, r) => a + daftar(peta(r)['ujian']).length)} mapel ujian.'),
                    ),
                  ),
                  if (daftar(d['masa']).isEmpty)
                    const Kosong(pesan: 'Belum ada masa ujian berstatus Ditetapkan untuk jenis ini di semester berjalan.', ikon: Icons.event_busy),
                  JudulBagian('SK panitia penyelenggara', sub: d['tersimpan'] == true ? 'Isian tersimpan' : 'Belum disimpan · isi lalu simpan'),
                  _isian('nomor', 'Nomor SK', bantuan: 'mis. 421.9/012/PKBM-TH/XI/2026'),
                  Row(children: [
                    Expanded(child: _isian('tanggal', 'Tanggal penetapan (TTTT-BB-HH)')),
                    const SizedBox(width: 8),
                    Expanded(child: _isian('tempat', 'Ditetapkan di')),
                  ]),
                  Row(children: [
                    Expanded(child: _isian('seNomor', 'Nomor SE Dinas (dasar)', bantuan: 'mis. 400.3.3/5073/PNF')),
                    const SizedBox(width: 8),
                    Expanded(child: _isian('seTanggal', 'Tanggal SE (TTTT-BB-HH)')),
                  ]),
                  Text('Penanggung jawab: ${teks(d['kepala'], '-')} (Kepala lembaga)', style: const TextStyle(fontSize: 12.5)),
                  const SizedBox(height: 8),
                  _isian('ketua', 'Ketua panitia'),
                  _isian('wakil', 'Wakil ketua (opsional)'),
                  Row(children: [
                    Expanded(child: _isian('sekretaris', 'Sekretaris')),
                    const SizedBox(width: 8),
                    Expanded(child: _isian('bendahara', 'Bendahara')),
                  ]),
                  _isian('anggota', 'Anggota (satu nama per baris)', baris: 3),
                  _isian('pengawas', 'Pengawas ujian (satu nama per baris)', baris: 3, bantuan: 'Terisi dari penugasan pengawas masa ujian; boleh diubah.'),
                  _isian('penyusun', 'Tim penyusun soal (Mapel: nama, satu baris per mapel)', baris: 4, bantuan: 'Terisi dari tutor pengampu; boleh diubah.'),
                  Align(alignment: Alignment.centerRight, child: OutlinedButton.icon(onPressed: _simpanSk, icon: const Icon(Icons.save_outlined), label: const Text('Simpan isian SK'))),
                  JudulBagian('Isi laporan'),
                  for (final e in {
                    'sk': 'SK panitia + lampiran susunan panitia',
                    'jadwal': 'Jadwal ujian (per masa ujian)',
                    'soal': 'Naskah soal sampel (2 kolom) tiap mapel tiap rombel',
                    'lj': 'Lembar jawaban tiap mapel tiap rombel',
                    'kunci': 'Kunci jawaban (rahasia, jangan dikirim ke peserta)',
                  }.entries)
                    CheckboxListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      value: _pakai[e.key],
                      onChanged: (v) => setState(() => _pakai[e.key] = v == true),
                      title: Text(e.value),
                    ),
                  JudulBagian('Rombel yang dicetak (naskah & lembar jawaban)',
                      sub: '${_rombel.length} dari ${daftar(d['rombel']).length} dipilih',
                      aksi: Row(mainAxisSize: MainAxisSize.min, children: [
                        TextButton(
                            onPressed: () => setState(() => _rombel
                              ..clear()
                              ..addAll(daftar(d['rombel']).map((r) => teks(peta(r)['id'])))),
                            child: const Text('Semua')),
                        TextButton(onPressed: () => setState(_rombel.clear), child: const Text('Kosongkan')),
                      ])),
                  Wrap(spacing: 6, runSpacing: 6, children: [
                    for (final r in daftar(d['rombel']).map(peta))
                      FilterChip(
                        label: Text('${teks(r['nama'])} · ${daftar(r['ujian']).length}'),
                        selected: _rombel.contains(teks(r['id'])),
                        onSelected: (v) => setState(() => v ? _rombel.add(teks(r['id'])) : _rombel.remove(teks(r['id']))),
                      ),
                  ]),
                ]),
      floatingActionButton: d == null || daftar(d['masa']).isEmpty
          ? null
          : FloatingActionButton.extended(onPressed: _cetak, icon: const Icon(Icons.print_outlined), label: const Text('Cetak Laporan Dinas')),
    );
  }
}
