import 'package:flutter/material.dart';

import '../api.dart';
import '../berkas.dart';
import '../config.dart';
import '../session.dart';
import '../widgets.dart';
import 'nilai.dart';

String? get _t => Sesi.instance.token;

/// v1.43.0: Berita acara pembagian rapor / kenaikan / kelulusan, Surat Keterangan Lulus (SKL), dan Transkrip Nilai Akhir.
/// Semua dicetak F4 lewat [htmlKePdf] (dokumenA4 sudah F4).

const _bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const _hari = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
String _tgl(DateTime d) => '${d.day} ${_bulan[d.month - 1]} ${d.year}';
String _tglIso(String iso) {
  final p = iso.split('-');
  if (p.length != 3) return iso;
  final b = int.tryParse(p[1]) ?? 0;
  return '${int.tryParse(p[2]) ?? p[2]} ${b >= 1 && b <= 12 ? _bulan[b - 1] : p[1]} ${p[0]}';
}

const _css = '.kop{text-align:center;border-bottom:3px double #333;padding-bottom:6px;margin-bottom:10px}.lb{font-size:15pt;font-weight:bold}'
    'h2{text-align:center;font-size:13pt;margin:10px 0 2px;text-decoration:underline}.no{text-align:center;margin-bottom:12px}'
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:4px 6px;font-size:10pt}th{background:#eee}.c{text-align:center}'
    '.id td{border:none;padding:2px 4px;font-size:10.5pt}.isi{font-size:10.5pt;line-height:1.6;text-align:justify}'
    '.ttd{width:100%;margin-top:22px}.ttd td{border:none;text-align:center;vertical-align:top;font-size:10.5pt}'
    '.foto{width:30mm;height:40mm;border:1px solid #333;text-align:center;vertical-align:middle;font-size:9pt;color:#666}'
    '.kel td{background:#f3f3f3;font-weight:bold}.hal{page-break-after:always}.hal:last-child{page-break-after:auto}.kecil{font-size:8.5pt;color:#444}';

String _kop(Map<String, dynamic> l) => '<div class="kop"><div class="lb">${escHtml(teks(l['nama'], kNamaSekolah).toUpperCase())}</div>'
    '<div>NPSN ${escHtml(teks(l['npsn'], kNpsn))} · ${escHtml(teks(l['alamat'], kAlamatLembaga))}</div></div>';

String _kota(String alamat) {
  final bag = alamat.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
  if (bag.isEmpty) return '';
  return bag.last.replaceFirst(RegExp(r'^(Kab\.?|Kabupaten|Kota)\s*', caseSensitive: false), '');
}

String _ttd(String kota, String tanggal, String kiri, String namaKiri, String kanan, String namaKanan, {String nipKanan = ''}) =>
    '<table class="ttd"><tr><td>${kiri.isEmpty ? '' : '$kiri<br><br><br><br><br><b><u>${escHtml(namaKiri.isEmpty ? '..............................' : namaKiri)}</u></b>'}</td>'
    '<td>${escHtml(kota)}${kota.isEmpty ? '' : ', '}${escHtml(tanggal)}<br>$kanan<br><br><br><br><b><u>${escHtml(namaKanan.isEmpty ? '..............................' : namaKanan)}</u></b>'
    '${nipKanan.isEmpty ? '' : '<br>NIP. ${escHtml(nipKanan)}'}</td></tr></table>';

bool kelasAkhir(String namaRombel) => RegExp(r'^\s*(A\s*6|B\s*9|C\s*12)\b', caseSensitive: false).hasMatch(namaRombel);

String _programPanjang(String p) => switch (p.toUpperCase()) {
      'PKT-A' => 'Program Paket A setara SD/MI',
      'PKT-B' => 'Program Paket B setara SMP/MTs',
      'PKT-C' => 'Program Paket C setara SMA/MA',
      _ => namaProgram(p),
    };

// ───────────────────────── dialog isian dokumen ─────────────────────────
class _Isian {
  _Isian(this.nomor, this.tanggal, this.kepala, this.nip, this.bobotUjian);
  final String nomor;
  final DateTime tanggal;
  final String kepala;
  final String nip;
  final int bobotUjian;
}

Future<_Isian?> _dialogIsian(BuildContext context, {required String judul, required String kepalaAwal, String labelNomor = 'Nomor surat', bool bobot = false}) {
  final nomor = TextEditingController(), kepala = TextEditingController(text: kepalaAwal), nip = TextEditingController();
  var tanggal = DateTime.now();
  var bobotUjian = 0;
  return showDialog<_Isian>(
    context: context,
    builder: (c) => StatefulBuilder(
      builder: (c, atur) => AlertDialog(
        title: Text(judul),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: nomor, decoration: InputDecoration(labelText: labelNomor, hintText: 'mis. 421.9/012/PKBM-TH/VI/2027')),
            TextField(controller: kepala, decoration: const InputDecoration(labelText: 'Kepala satuan pendidikan')),
            TextField(controller: nip, decoration: const InputDecoration(labelText: 'NIP (opsional)')),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () async {
                final d = await showDatePicker(context: c, firstDate: DateTime(2015), lastDate: DateTime(DateTime.now().year + 2), initialDate: tanggal);
                if (d != null) atur(() => tanggal = d);
              },
              icon: const Icon(Icons.event_rounded, size: 18),
              label: Text('Tanggal: ${_tgl(tanggal)}'),
            ),
            if (bobot) ...[
              const SizedBox(height: 8),
              DropdownButtonFormField<int>(
                initialValue: bobotUjian,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Nilai akhir'),
                items: const [
                  DropdownMenuItem(value: 0, child: Text('Rata-rata nilai rapor seluruh semester')),
                  DropdownMenuItem(value: 30, child: Text('70% rata-rata rapor + 30% Ujian Kesetaraan')),
                  DropdownMenuItem(value: 40, child: Text('60% rata-rata rapor + 40% Ujian Kesetaraan')),
                  DropdownMenuItem(value: 50, child: Text('50% rata-rata rapor + 50% Ujian Kesetaraan')),
                ],
                onChanged: (v) => atur(() => bobotUjian = v ?? 0),
              ),
              const Text('Bila nilai Ujian Kesetaraan sebuah mapel belum ada, dipakai rata-rata rapor saja.', style: TextStyle(fontSize: 11.5)),
            ],
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Batal')),
          FilledButton(
            onPressed: () => Navigator.pop(c, _Isian(nomor.text.trim(), tanggal, kepala.text.trim(), nip.text.trim(), bobotUjian)),
            child: const Text('Cetak'),
          ),
        ],
      ),
    ),
  );
}

Future<Map<String, Map<String, dynamic>>> _biodata(String idRombelKini) async {
  final d = peta(await Api.instance('waStafBiodataRombel', [_t, idRombelKini], const Duration(minutes: 2)));
  return {for (final s in daftar(d['siswa']).map(peta)) teks(s['idWb']): s};
}

// ───────────────────────── BERITA ACARA ─────────────────────────
/// Berita acara satu rombel untuk semester leger [d]: Ganjil = pembagian rapor; Genap = kenaikan kelas & pembagian
/// rapor; Genap kelas akhir = kelulusan & pembagian rapor (jumlah peserta didik, per jenis kelamin, lulus/tidak lulus,
/// rata-rata nilai per mapel dan kelas).
Future<void> cetakBeritaAcara(BuildContext context, Map<String, dynamic> d, String idRombelKini) async {
  final l = peta(d['lembaga']);
  final per = peta(d['periode']);
  final rb = peta(d['rombel']);
  final genap = teks(per['semester']) == 'Genap';
  final akhir = genap && (peta(peta(d['kenaikan'])['info'])['akhir'] == true || kelasAkhir(teks(rb['nama'])));
  final judul = !genap
      ? 'BERITA ACARA PEMBAGIAN LAPORAN HASIL BELAJAR'
      : akhir
          ? 'BERITA ACARA KELULUSAN DAN PEMBAGIAN LAPORAN HASIL BELAJAR'
          : 'BERITA ACARA KENAIKAN KELAS DAN PEMBAGIAN LAPORAN HASIL BELAJAR';
  final isi = await _dialogIsian(context, judul: 'Berita acara', kepalaAwal: teks(l['kepala']));
  if (isi == null || !context.mounted) return;
  final r = await jalankan(context, () => _biodata(idRombelKini), teksProses: 'Menyiapkan berita acara...');
  if (!r.ok || r.data == null || !context.mounted) return;
  final bio = r.data!;
  final wb = daftar(d['wb']).map(peta).toList();
  final mapel = daftar(d['mapel']).map(peta).toList();
  final kep = peta(peta(d['kenaikan'])['keputusan']);
  var lk = 0, pr = 0, tak = 0;
  for (final w in wb) {
    final jk = teks(peta(bio[teks(w['idWb'])])['jk']).toUpperCase();
    if (jk == 'L') {
      lk++;
    } else if (jk == 'P') {
      pr++;
    } else {
      tak++;
    }
  }
  int hitung(String k) => wb.where((w) => teks(kep[teks(w['idWb'])]) == k).length;
  final rataKelas = wb.map((w) => nilN(w['rata'])).whereType<double>().toList();
  String rata(List<double> x) => x.isEmpty ? '–' : nilT(x.reduce((a, b) => a + b) / x.length);
  final kota = _kota(teks(l['alamat'], kAlamatLembaga));
  final b = StringBuffer('<div class="hal">${_kop(l)}<h2>$judul</h2>'
      '<div class="no">Nomor: ${escHtml(isi.nomor.isEmpty ? '..............................' : isi.nomor)}</div>');
  b.write('<p class="isi">Pada hari ini <b>${_hari[isi.tanggal.weekday - 1]}</b>, tanggal <b>${_tgl(isi.tanggal)}</b>, bertempat di '
      '${escHtml(teks(l['nama'], kNamaSekolah))}, telah dilaksanakan ${!genap ? 'pembagian Laporan Hasil Belajar (rapor)' : akhir ? 'penetapan kelulusan dan pembagian Laporan Hasil Belajar (rapor)' : 'penetapan kenaikan kelas dan pembagian Laporan Hasil Belajar (rapor)'} '
      'Semester ${escHtml(teks(per['semester']))} Tahun Pelajaran ${escHtml(teks(per['tahun']))} kepada peserta didik rombongan belajar '
      '<b>${escHtml(teks(rb['nama']))}</b> ${escHtml(_programPanjang(teks(rb['program'])))}, dengan rincian sebagai berikut:</p>');
  b.write('<table class="id">'
      '<tr><td style="width:55%">1. Jumlah peserta didik seluruhnya</td><td>: <b>${wb.length}</b> orang</td></tr>'
      '<tr><td>&nbsp;&nbsp;&nbsp;&nbsp;a. Laki-laki</td><td>: $lk orang</td></tr>'
      '<tr><td>&nbsp;&nbsp;&nbsp;&nbsp;b. Perempuan</td><td>: $pr orang${tak > 0 ? ' (jenis kelamin belum tercatat: $tak)' : ''}</td></tr>');
  if (genap && akhir) {
    b.write('<tr><td>2. Dinyatakan LULUS</td><td>: <b>${hitung('Lulus')}</b> orang</td></tr>'
        '<tr><td>3. Dinyatakan TIDAK LULUS</td><td>: ${hitung('Tidak Lulus')} orang</td></tr>');
  } else if (genap) {
    b.write('<tr><td>2. Naik kelas</td><td>: <b>${hitung('Naik')}</b> orang</td></tr>'
        '<tr><td>3. Tinggal kelas</td><td>: ${hitung('Tinggal')} orang</td></tr>');
  } else {
    b.write('<tr><td>2. Rapor yang dibagikan</td><td>: ${wb.length} eksemplar</td></tr>');
  }
  final belum = genap ? wb.length - hitung(akhir ? 'Lulus' : 'Naik') - hitung(akhir ? 'Tidak Lulus' : 'Tinggal') : 0;
  if (belum > 0) b.write('<tr><td>&nbsp;&nbsp;&nbsp;&nbsp;Keputusan belum ditetapkan</td><td>: $belum orang</td></tr>');
  b.write('<tr><td>${genap ? '4' : '3'}. Rata-rata nilai kelas</td><td>: <b>${rata(rataKelas)}</b> (KKM ${nilT(peta(d['aturan'])['kkm'])})</td></tr></table><br>');
  b.write('<table><tr><th>No</th><th>Mata Pelajaran</th><th>Rata-rata</th><th>Tertinggi</th><th>Terendah</th></tr>');
  var i = 0;
  for (final m in mapel) {
    final v = wb.map((w) => nilN(peta(w['nilai'])[teks(m['kode'])])).whereType<double>().toList();
    i++;
    b.write('<tr><td class="c">$i</td><td>${escHtml(teks(m['nama']))}</td><td class="c">${rata(v)}</td>'
        '<td class="c">${v.isEmpty ? '–' : nilT(v.reduce((a, c) => a > c ? a : c))}</td><td class="c">${v.isEmpty ? '–' : nilT(v.reduce((a, c) => a < c ? a : c))}</td></tr>');
  }
  b.write('</table>');
  b.write('<p class="isi">Demikian berita acara ini dibuat dengan sebenarnya untuk dapat dipergunakan sebagaimana mestinya.</p>');
  b.write(_ttd(kota, _tgl(isi.tanggal), 'Wali Kelas', teks(peta(d['wali'])['nama']), 'Kepala ${escHtml(teks(l['nama'], kNamaSekolah))}', isi.kepala, nipKanan: isi.nip));
  b.write('</div>');
  // lampiran daftar keputusan (Genap)
  if (genap) {
    b.write('<div class="hal">${_kop(l)}<h2>LAMPIRAN: DAFTAR ${akhir ? 'KELULUSAN' : 'KENAIKAN KELAS'}</h2><div class="no">${escHtml(teks(rb['nama']))} · Tahun Pelajaran ${escHtml(teks(per['tahun']))}</div>'
        '<table><tr><th>No</th><th>NISN</th><th>Nama</th><th>L/P</th><th>Rata-rata</th><th>Keputusan</th></tr>');
    var j = 0;
    for (final w in wb) {
      j++;
      b.write('<tr><td class="c">$j</td><td>${escHtml(teks(w['nisn']))}</td><td>${escHtml(teks(w['nama']))}</td>'
          '<td class="c">${escHtml(teks(peta(bio[teks(w['idWb'])])['jk']))}</td><td class="c">${nilT(w['rata'])}</td>'
          '<td class="c">${escHtml(teks(kep[teks(w['idWb'])], 'belum ditetapkan'))}</td></tr>');
    }
    b.write('</table>${_ttd(kota, _tgl(isi.tanggal), '', '', 'Kepala ${escHtml(teks(l['nama'], kNamaSekolah))}', isi.kepala, nipKanan: isi.nip)}</div>');
  }
  if (!context.mounted) return;
  await htmlKePdf(context,
      nama: 'Berita_Acara_${teks(rb['nama'])}_${teks(per['semester'])}_${teks(per['tahun']).replaceAll('/', '-')}.pdf', args: [_t, dokumenA4(b.toString(), _css)]);
}

// ───────────────────────── SURAT KETERANGAN LULUS ─────────────────────────
/// SKL untuk peserta didik kelas akhir yang dinyatakan LULUS (keputusan kelulusan semester Genap).
Future<void> cetakSkl(BuildContext context, Map<String, dynamic> d, String idRombelKini, {List<Map<String, dynamic>>? hanya}) async {
  final l = peta(d['lembaga']);
  final per = peta(d['periode']);
  final rb = peta(d['rombel']);
  final kep = peta(peta(d['kenaikan'])['keputusan']);
  if (teks(per['semester']) != 'Genap' || kep.isEmpty) {
    kabar(context, 'SKL dicetak dari rapor Semester Genap setelah keputusan kelulusan ditetapkan (tombol Kelulusan).', galat: true);
    return;
  }
  final wbSemua = (hanya ?? daftar(d['wb']).map(peta).toList());
  final lulus = wbSemua.where((w) => teks(kep[teks(w['idWb'])]) == 'Lulus').toList();
  if (lulus.isEmpty) {
    kabar(context, 'Belum ada peserta didik yang ditetapkan LULUS.', galat: true);
    return;
  }
  final isi = await _dialogIsian(context, judul: 'Surat Keterangan Lulus (${lulus.length})', kepalaAwal: teks(l['kepala']), labelNomor: 'Nomor surat (awalan)');
  if (isi == null || !context.mounted) return;
  final r = await jalankan(context, () => _biodata(idRombelKini), teksProses: 'Menyiapkan SKL...');
  if (!r.ok || r.data == null || !context.mounted) return;
  final bio = r.data!;
  final kota = _kota(teks(l['alamat'], kAlamatLembaga));
  final b = StringBuffer();
  var no = 0;
  for (final w in lulus) {
    no++;
    final s = peta(bio[teks(w['idWb'])]);
    final ttl = [teks(s['tempatLahir']), if (teks(s['tglLahir']).isNotEmpty) _tglIso(teks(s['tglLahir']))].where((x) => x.isNotEmpty).join(', ');
    final ortu = teks(s['ayah']).isNotEmpty ? teks(s['ayah']) : teks(s['ibu']);
    final nomor = isi.nomor.isEmpty ? '..............................' : (lulus.length > 1 ? '${isi.nomor}/${no.toString().padLeft(3, '0')}' : isi.nomor);
    b.write('<div class="hal">${_kop(l)}<h2>SURAT KETERANGAN LULUS</h2><div class="no">Nomor: ${escHtml(nomor)}</div>');
    b.write('<p class="isi">Yang bertanda tangan di bawah ini, Kepala ${escHtml(teks(l['nama'], kNamaSekolah))} '
        '(NPSN ${escHtml(teks(l['npsn'], kNpsn))}), menerangkan bahwa:</p>');
    String brs(String a, String v) => '<tr><td style="width:38%">$a</td><td>: ${v.trim().isEmpty ? '..............................' : escHtml(v)}</td></tr>';
    b.write('<table class="id">${brs('Nama', teks(w['nama']).toUpperCase())}${brs('Tempat, tanggal lahir', ttl)}${brs('Nomor Induk Siswa Nasional (NISN)', teks(w['nisn']))}'
        '${brs('Nama orang tua/wali', ortu)}${brs('Program', _programPanjang(teks(rb['program'])))}${brs('Rombongan belajar', teks(rb['nama']))}</table>');
    b.write('<p class="isi">berdasarkan kriteria kelulusan satuan pendidikan dan hasil rapat dewan pendidik, peserta didik tersebut dinyatakan:</p>'
        '<p style="text-align:center;font-size:16pt;font-weight:bold;letter-spacing:3px">LULUS</p>'
        '<p class="isi">dari ${escHtml(_programPanjang(teks(rb['program'])))} pada ${escHtml(teks(l['nama'], kNamaSekolah))} Tahun Pelajaran ${escHtml(teks(per['tahun']))}. '
        'Surat keterangan ini berlaku sementara sampai diterbitkannya ijazah.</p>');
    b.write('<table class="ttd"><tr><td style="width:45%"><table style="width:auto;margin:auto"><tr><td class="foto">Pas foto<br>3 × 4</td></tr></table></td>'
        '<td>${escHtml(kota)}${kota.isEmpty ? '' : ', '}${_tgl(isi.tanggal)}<br>Kepala ${escHtml(teks(l['nama'], kNamaSekolah))}<br><br><br><br><b><u>'
        '${escHtml(isi.kepala.isEmpty ? '..............................' : isi.kepala)}</u></b>${isi.nip.isEmpty ? '' : '<br>NIP. ${escHtml(isi.nip)}'}</td></tr></table></div>');
  }
  await htmlKePdf(context,
      nama: lulus.length == 1 ? 'SKL_${teks(lulus.first['nama']).replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_')}.pdf' : 'SKL_${teks(rb['nama'])}_${teks(per['tahun']).replaceAll('/', '-')}.pdf',
      args: [_t, dokumenA4(b.toString(), _css)]);
}

// ───────────────────────── TRANSKRIP NILAI AKHIR ─────────────────────────
/// Transkrip nilai akhir kelas akhir: nilai tiap mapel = rata-rata rapor seluruh semester program (C10–C12, B7–B9,
/// A1–A6), opsional digabung nilai Ujian Kesetaraan. Isi minimal mengikuti Permendikbudristek 58/2024.
Future<void> cetakTranskrip(BuildContext context, String idRombelKini, {String? hanyaIdWb}) async {
  final r = await jalankan(context, () async => peta(await Api.instance('waStafTranskrip', [_t, {'idRombel': idRombelKini}], const Duration(minutes: 5))),
      teksProses: 'Mengumpulkan nilai seluruh semester...');
  if (!r.ok || r.data == null || !context.mounted) return;
  final d = r.data!;
  final l = peta(d['lembaga']);
  final isi = await _dialogIsian(context, judul: 'Transkrip Nilai Akhir', kepalaAwal: teks(l['kepala']), labelNomor: 'Nomor transkrip (awalan)', bobot: true);
  if (isi == null || !context.mounted) return;
  final b2 = await jalankan(context, () => _biodata(idRombelKini), teksProses: 'Menyiapkan transkrip...');
  if (!b2.ok || b2.data == null || !context.mounted) return;
  final bio = b2.data!;
  final rb = peta(d['rombel']);
  final mapel = daftar(d['mapel']).map(peta).toList();
  final periode = daftar(d['periode']).map(teks).toList();
  final wbSemua = daftar(d['wb']).map(peta).where((w) => hanyaIdWb == null || teks(w['idWb']) == hanyaIdWb).toList();
  final kota = _kota(teks(l['alamat'], kAlamatLembaga));
  final kelompok = <String, List<Map<String, dynamic>>>{};
  for (final m in mapel) {
    kelompok.putIfAbsent(teks(m['kelompok'], 'Umum'), () => []).add(m);
  }
  final urutKel = ['Umum', 'Pilihan', 'Pemberdayaan', 'Keterampilan', 'Muatan Lokal', 'Lainnya'];
  final kunciKel = kelompok.keys.toList()..sort((a, b) => (urutKel.indexOf(a) < 0 ? 99 : urutKel.indexOf(a)).compareTo(urutKel.indexOf(b) < 0 ? 99 : urutKel.indexOf(b)));
  final adaUjian = isi.bobotUjian > 0;
  final b = StringBuffer();
  var no = 0;
  for (final w in wbSemua) {
    no++;
    final s = peta(bio[teks(w['idWb'])]);
    final ttl = [teks(s['tempatLahir']), if (teks(s['tglLahir']).isNotEmpty) _tglIso(teks(s['tglLahir']))].where((x) => x.isNotEmpty).join(', ');
    final rata = peta(w['rata']), ujian = peta(w['ujian']);
    final nomor = isi.nomor.isEmpty ? '..............................' : (wbSemua.length > 1 ? '${isi.nomor}/${no.toString().padLeft(3, '0')}' : isi.nomor);
    String brs(String a, String v) => '<tr><td style="width:38%">$a</td><td>: ${v.trim().isEmpty ? '..............................' : escHtml(v)}</td></tr>';
    b.write('<div class="hal">${_kop(l)}<h2>TRANSKRIP NILAI</h2><div class="no">Nomor: ${escHtml(nomor)}</div>');
    b.write('<table class="id">${brs('Satuan pendidikan', teks(l['nama'], kNamaSekolah))}${brs('NPSN', teks(l['npsn'], kNpsn))}'
        '${brs('Program', _programPanjang(teks(rb['program'])))}${brs('Nama', teks(w['nama']).toUpperCase())}${brs('Tempat, tanggal lahir', ttl)}'
        '${brs('NISN', teks(w['nisn']))}${brs('Nomor ijazah', '')}${brs('Tanggal kelulusan', _tgl(isi.tanggal))}</table><br>');
    b.write('<table><tr><th style="width:8%">No</th><th>Mata Pelajaran</th>'
        '${adaUjian ? '<th style="width:14%">Rata-rata Rapor</th><th style="width:14%">Ujian Kesetaraan</th>' : ''}<th style="width:14%">Nilai</th></tr>');
    final semua = <double>[];
    var n = 0;
    for (final k in kunciKel) {
      b.write('<tr class="kel"><td colspan="${adaUjian ? 5 : 3}">Kelompok ${escHtml(k)}</td></tr>');
      for (final m in kelompok[k]!) {
        final kd = teks(m['kode']);
        final r0 = nilN(rata[kd]), u = nilN(ujian[kd]);
        double? akhir = r0;
        if (adaUjian && r0 != null && u != null) akhir = r0 * (100 - isi.bobotUjian) / 100 + u * isi.bobotUjian / 100;
        if (akhir == null && u != null) akhir = u;
        if (akhir == null) continue;   // mapel yang tidak pernah diikuti WB ini tidak dicantumkan
        n++;
        semua.add(akhir);
        b.write('<tr><td class="c">$n</td><td>${escHtml(teks(m['nama']))}</td>'
            '${adaUjian ? '<td class="c">${nilT(r0)}</td><td class="c">${nilT(u)}</td>' : ''}<td class="c"><b>${nilT(akhir)}</b></td></tr>');
      }
    }
    b.write('<tr><td colspan="${adaUjian ? 4 : 2}" class="c"><b>Rata-rata</b></td><td class="c"><b>${semua.isEmpty ? '–' : nilT(semua.reduce((a, c) => a + c) / semua.length)}</b></td></tr></table>');
    b.write('<p class="kecil">Nilai = ${adaUjian ? '${100 - isi.bobotUjian}% rata-rata nilai rapor + ${isi.bobotUjian}% nilai Ujian Kesetaraan' : 'rata-rata nilai rapor'} '
        'dari ${periode.length} semester (${escHtml(periode.isEmpty ? '-' : '${periode.first} s.d. ${periode.last}')}).</p>');
    b.write('<table class="ttd"><tr><td style="width:45%"><table style="width:auto;margin:auto"><tr><td class="foto">Pas foto<br>3 × 4</td></tr></table></td>'
        '<td>${escHtml(kota)}${kota.isEmpty ? '' : ', '}${_tgl(isi.tanggal)}<br>Kepala ${escHtml(teks(l['nama'], kNamaSekolah))}<br><br><br><br><b><u>'
        '${escHtml(isi.kepala.isEmpty ? '..............................' : isi.kepala)}</u></b>${isi.nip.isEmpty ? '' : '<br>NIP. ${escHtml(isi.nip)}'}</td></tr></table></div>');
  }
  if (!context.mounted) return;
  await htmlKePdf(context,
      nama: wbSemua.length == 1
          ? 'Transkrip_${teks(wbSemua.first['nama']).replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_')}.pdf'
          : 'Transkrip_${teks(rb['nama'])}_${teks(peta(d['periodeKini'])['tahun']).replaceAll('/', '-')}.pdf',
      args: [_t, dokumenA4(b.toString(), _css)]);
}
