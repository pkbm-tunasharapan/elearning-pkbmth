import 'package:flutter/material.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../berkas.dart';
import '../honor/honor.dart' show rp;
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

/// v1.47.0 (Keuangan Tahap D): laporan arus keuangan lembaga untuk periode bebas, dicetak F4 / Excel.
num _n(dynamic v) => v is num ? v : num.tryParse('$v') ?? 0;
const _bln = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

class _Periode {
  const _Periode(this.dari, this.sampai, this.judul);
  final DateTime dari;
  final DateTime sampai;
  final String judul;
}

class LaporanArusScreen extends StatefulWidget {
  const LaporanArusScreen({super.key, required this.konteks});
  final Map<String, dynamic> konteks;

  @override
  State<LaporanArusScreen> createState() => _LaporanArusScreenState();
}

class _LaporanArusScreenState extends State<LaporanArusScreen> {
  static const _jenis = ['Bulan', 'Semester', 'Tahun pelajaran', 'Tahun anggaran', 'Tahap BOSP', 'Kustom'];
  String _j = 'Bulan';
  DateTime _bulan = DateTime.now();
  late int _thAwal;   // tahun pertama tahun pelajaran (2026 untuk 2026/2027)
  int _thAnggaran = DateTime.now().year;
  bool _genap = false, _tahap2 = false, _rinci = false;
  DateTimeRange? _kustom;
  Map<String, dynamic>? _d;
  int _v = 0;

  @override
  void initState() {
    super.initState();
    final tp = RegExp(r'(\d{4})').firstMatch(teks(widget.konteks['tahun']));
    final n = DateTime.now();
    _thAwal = tp != null ? int.parse(tp.group(1)!) : (n.month >= 7 ? n.year : n.year - 1);
    _genap = n.month < 7;
    _tahap2 = n.month >= 7;
  }

  _Periode get _periode {
    switch (_j) {
      case 'Semester':
        return _genap
            ? _Periode(DateTime(_thAwal + 1, 1, 1), DateTime(_thAwal + 1, 6, 30), 'Semester Genap Tahun Pelajaran $_thAwal/${_thAwal + 1}')
            : _Periode(DateTime(_thAwal, 7, 1), DateTime(_thAwal, 12, 31), 'Semester Ganjil Tahun Pelajaran $_thAwal/${_thAwal + 1}');
      case 'Tahun pelajaran':
        return _Periode(DateTime(_thAwal, 7, 1), DateTime(_thAwal + 1, 6, 30), 'Tahun Pelajaran $_thAwal/${_thAwal + 1}');
      case 'Tahun anggaran':
        return _Periode(DateTime(_thAnggaran, 1, 1), DateTime(_thAnggaran, 12, 31), 'Tahun Anggaran $_thAnggaran');
      case 'Tahap BOSP':
        return _tahap2
            ? _Periode(DateTime(_thAnggaran, 7, 1), DateTime(_thAnggaran, 12, 31), 'Tahap II (Juli–Desember) Tahun Anggaran $_thAnggaran')
            : _Periode(DateTime(_thAnggaran, 1, 1), DateTime(_thAnggaran, 6, 30), 'Tahap I (Januari–Juni) Tahun Anggaran $_thAnggaran');
      case 'Kustom':
        final k = _kustom ?? DateTimeRange(start: DateTime(_bulan.year, _bulan.month, 1), end: DateTime.now());
        return _Periode(k.start, k.end, '${tglIndo(tglIso(k.start))} s.d. ${tglIndo(tglIso(k.end))}');
      default:
        return _Periode(DateTime(_bulan.year, _bulan.month, 1), DateTime(_bulan.year, _bulan.month + 1, 0), 'Bulan ${_bln[_bulan.month - 1]} ${_bulan.year}');
    }
  }

  Widget _pemilih() {
    final cs = Theme.of(context).colorScheme;
    Widget geser(String teksTengah, VoidCallback kiri, VoidCallback kanan) => Row(children: [
          IconButton(onPressed: () => setState(kiri), icon: const Icon(Icons.chevron_left_rounded)),
          Expanded(child: Text(teksTengah, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800))),
          IconButton(onPressed: () => setState(kanan), icon: const Icon(Icons.chevron_right_rounded)),
        ]);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final j in _jenis) ChoiceChip(label: Text(j), selected: _j == j, onSelected: (_) => setState(() => _j = j)),
          ]),
          const SizedBox(height: 6),
          if (_j == 'Bulan') geser('${_bln[_bulan.month - 1]} ${_bulan.year}', () => _bulan = DateTime(_bulan.year, _bulan.month - 1), () => _bulan = DateTime(_bulan.year, _bulan.month + 1)),
          if (_j == 'Semester' || _j == 'Tahun pelajaran') geser('Tahun Pelajaran $_thAwal/${_thAwal + 1}', () => _thAwal--, () => _thAwal++),
          if (_j == 'Semester')
            SegmentedButton<bool>(
              segments: const [ButtonSegment(value: false, label: Text('Ganjil (Jul–Des)')), ButtonSegment(value: true, label: Text('Genap (Jan–Jun)'))],
              selected: {_genap},
              onSelectionChanged: (s) => setState(() => _genap = s.first),
            ),
          if (_j == 'Tahun anggaran' || _j == 'Tahap BOSP') geser('Tahun Anggaran $_thAnggaran', () => _thAnggaran--, () => _thAnggaran++),
          if (_j == 'Tahap BOSP')
            SegmentedButton<bool>(
              segments: const [ButtonSegment(value: false, label: Text('Tahap I (Jan–Jun)')), ButtonSegment(value: true, label: Text('Tahap II (Jul–Des)'))],
              selected: {_tahap2},
              onSelectionChanged: (s) => setState(() => _tahap2 = s.first),
            ),
          if (_j == 'Kustom')
            OutlinedButton.icon(
              onPressed: () async {
                final r = await showDateRangePicker(context: context, firstDate: DateTime(2020), lastDate: DateTime(DateTime.now().year + 1, 12, 31), initialDateRange: _kustom);
                if (r != null) setState(() => _kustom = r);
              },
              icon: const Icon(Icons.date_range_rounded),
              label: Text(_kustom == null ? 'Pilih rentang tanggal' : _periode.judul),
            ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            dense: true,
            value: _rinci,
            onChanged: (v) => setState(() => _rinci = v == true),
            title: const Text('Sertakan rincian semua transaksi (buku kas)'),
          ),
          Text('Periode: ${_periode.judul}', style: TextStyle(color: cs.onSurfaceVariant, fontSize: 12.5)),
        ]),
      ),
    );
  }

  Future<Map<String, dynamic>> _muat() async {
    final p = _periode;
    final d = peta(await Api.instance('waStafKeuArus', [
      _t,
      {'dari': tglIso(p.dari), 'sampai': tglIso(p.sampai), 'rinci': _rinci, 'judul': p.judul}
    ], const Duration(minutes: 3)));
    _d = d;
    return d;
  }

  String get _namaBerkas => 'Arus_Keuangan_${_periode.judul.replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_')}';

  @override
  Widget build(BuildContext context) {
    final p = _periode;
    return Scaffold(
      appBar: AppBar(title: const Text('Laporan Arus Keuangan'), actions: [
        IconButton(tooltip: 'PDF (F4)', icon: const Icon(Icons.picture_as_pdf_outlined), onPressed: () => _d == null ? null : htmlKePdf(context, nama: '$_namaBerkas.pdf', args: [_t, arusKeuanganHtml(_d!)])),
        IconButton(tooltip: 'Excel', icon: const Icon(Icons.grid_on_rounded), onPressed: () => _d == null ? null : bagikanExcel(context, arusKeuanganHtml(_d!, excel: true), '$_namaBerkas.xls')),
      ]),
      body: ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 32), children: [
        _pemilih(),
        Muatan<Map<String, dynamic>>(
          key: ValueKey('$_v|${tglIso(p.dari)}|${tglIso(p.sampai)}|$_rinci'),
          muat: _muat,
          bangun: (context, d, segarkan) => _ringkas(d),
        ),
      ]),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'arusPdf',
        onPressed: () {
          if (_d == null) {
            setState(() => _v++);
          } else {
            htmlKePdf(context, nama: '$_namaBerkas.pdf', args: [_t, arusKeuanganHtml(_d!)]);
          }
        },
        icon: const Icon(Icons.print_rounded),
        label: const Text('Cetak F4'),
      ),
    );
  }

  Widget _baris(String a, dynamic v, {bool tebal = false, Color? warna}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [
          Expanded(child: Text(a, style: TextStyle(fontWeight: tebal ? FontWeight.w800 : FontWeight.w500))),
          Text(rp(v), style: TextStyle(fontWeight: FontWeight.w800, color: warna)),
        ]),
      );

  Widget _ringkas(Map<String, dynamic> d) {
    final cs = Theme.of(context).colorScheme;
    final rincian = daftar(d['rincian']).map(peta).toList();
    final ref = peta(d['referral']);
    final honor = daftar(d['honor']).map(peta).toList();
    final tagihan = daftar(d['tagihan']).map(peta).toList();
    final sisaTagihan = tagihan.fold<num>(0, (s, t) => s + _n(t['sisa']));
    final sisaHonor = honor.fold<num>(0, (s, h) => s + _n(h['sisa']));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(children: [
            _baris('Saldo awal', d['saldoAwal']),
            _baris('Pemasukan', d['masuk'], warna: Colors.green),
            _baris('Pengeluaran', d['keluar'], warna: cs.error),
            const Divider(),
            _baris('Saldo akhir', d['saldoAkhir'], tebal: true),
          ]),
        ),
      ),
      const JudulBagian('Per sumber dana'),
      Card(
        child: Column(children: [
          for (final s in daftar(d['perSumberLengkap']).map(peta))
            ListTile(dense: true, title: Text(teks(s['sumber'])), subtitle: Text('Awal ${rp(s['awal'])} · +${rp(s['masuk'])} −${rp(s['keluar'])}'), trailing: Text(rp(s['akhir']), style: const TextStyle(fontWeight: FontWeight.w800))),
        ]),
      ),
      const JudulBagian('Rincian per kategori'),
      Card(
        child: Column(children: [
          for (final k in rincian)
            ListTile(
              dense: true,
              leading: Icon(teks(k['jenis']) == 'Pengeluaran' ? Icons.call_made_rounded : Icons.call_received_rounded, color: teks(k['jenis']) == 'Pengeluaran' ? cs.error : Colors.green, size: 18),
              title: Text('${teks(k['kode'])} · ${teks(k['nama'])}'),
              subtitle: Text('${_n(k['n'])} transaksi'),
              trailing: Text(rp(k['jumlah']), style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
        ]),
      ),
      const JudulBagian('Kewajiban & piutang'),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(children: [
            _baris('Tunggakan tagihan warga belajar', sisaTagihan),
            _baris('Cashback referral belum dibayar', ref['total']),
            _baris('Honor disetujui belum dibayar', sisaHonor),
            _baris('Titipan pajak belum disetor', peta(d['pajak'])['titipan']),
            _baris('Pengeluaran menunggu persetujuan', daftar(d['menungguDaftar']).fold<num>(0, (s, x) => s + _n(peta(x)['jumlah']))),
          ]),
        ),
      ),
      const SizedBox(height: 70),
    ]);
  }
}

// ───────────────────────── cetak F4 / Excel ─────────────────────────

const _css = '.kop{text-align:center;border-bottom:3px double #333;padding-bottom:6px;margin-bottom:8px}.lb{font-size:14pt;font-weight:bold}'
    'h2{text-align:center;font-size:13pt;margin:6px 0 2px}h3{font-size:11pt;margin:14px 0 4px}.sub{text-align:center;margin-bottom:10px}'
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:3px 5px;font-size:9pt}th{background:#eee}.r{text-align:right}.c{text-align:center}'
    '.tot td,.tot th{font-weight:bold;background:#f5f5f5}.cat{font-size:8.5pt;color:#444}.ttd{width:100%;margin-top:22px}.ttd td{border:none;text-align:center;vertical-align:top;font-size:10pt}'
    '.hal{page-break-before:always}';

String arusKeuanganHtml(Map<String, dynamic> d, {bool excel = false}) {
  final l = peta(d['lembaga']);
  String u(dynamic v) => excel ? '${_n(v)}' : rp(v);
  String uk(dynamic v) => _n(v) == 0 ? (excel ? '0' : '–') : u(v);
  final b = StringBuffer();
  b.write('<div class="kop"><div class="lb">${escHtml(teks(l['nama'], 'PKBM').toUpperCase())}</div><div>NPSN ${escHtml(teks(l['npsn']))} · ${escHtml(teks(l['alamat']))}</div></div>');
  b.write('<h2>LAPORAN ARUS KEUANGAN</h2><div class="sub">${escHtml(teks(d['judulPeriode']))}<br>Periode ${escHtml(tglIndo(teks(d['dari'])))} s.d. ${escHtml(tglIndo(teks(d['sampai'])))}</div>');

  // A. ringkasan
  b.write('<h3>A. Ringkasan</h3><table>'
      '<tr><td>Saldo awal periode</td><td class="r">${u(d['saldoAwal'])}</td></tr>'
      '<tr><td>Jumlah pemasukan</td><td class="r">${u(d['masuk'])}</td></tr>'
      '<tr><td>Jumlah pengeluaran</td><td class="r">${u(d['keluar'])}</td></tr>'
      '<tr class="tot"><td>Saldo akhir periode</td><td class="r">${u(d['saldoAkhir'])}</td></tr></table>');
  if (_n(d['menunggu']) > 0) b.write('<p class="cat">${_n(d['menunggu'])} pengeluaran masih menunggu persetujuan dan belum dihitung (lihat Lampiran 4).</p>');

  // B. per sumber dana
  final ps = daftar(d['perSumberLengkap']).map(peta).toList();
  b.write('<h3>B. Arus per Sumber Dana</h3><table><tr><th>Sumber dana</th><th>Saldo awal</th><th>Pemasukan</th><th>Pengeluaran</th><th>Saldo akhir</th></tr>');
  for (final s in ps) {
    b.write('<tr><td>${escHtml(teks(s['sumber']))}</td><td class="r">${uk(s['awal'])}</td><td class="r">${uk(s['masuk'])}</td><td class="r">${uk(s['keluar'])}</td><td class="r">${u(s['akhir'])}</td></tr>');
  }
  b.write('<tr class="tot"><td>Jumlah</td><td class="r">${u(d['saldoAwal'])}</td><td class="r">${u(d['masuk'])}</td><td class="r">${u(d['keluar'])}</td><td class="r">${u(d['saldoAkhir'])}</td></tr></table>');

  // C. per bulan
  final pb = daftar(d['perBulan']).map(peta).toList();
  if (pb.length > 1) {
    b.write('<h3>C. Arus per Bulan</h3><table><tr><th>Bulan</th><th>Pemasukan</th><th>Pengeluaran</th><th>Selisih</th><th>Saldo</th></tr>');
    for (final m in pb) {
      final p = teks(m['bulan']).split('-');
      final nama = p.length == 2 ? '${_bln[(int.tryParse(p[1]) ?? 1) - 1]} ${p[0]}' : teks(m['bulan']);
      b.write('<tr><td>$nama</td><td class="r">${uk(m['masuk'])}</td><td class="r">${uk(m['keluar'])}</td><td class="r">${u(_n(m['masuk']) - _n(m['keluar']))}</td><td class="r">${u(m['saldo'])}</td></tr>');
    }
    b.write('</table>');
  }

  // D/E. rincian pemasukan & pengeluaran per kategori (dengan kolom sumber dana)
  final rincian = daftar(d['rincian']).map(peta).toList();
  final sumberKol = ps.map((s) => teks(s['sumber'])).toList();
  for (final jenis in ['Pemasukan', 'Pengeluaran']) {
    final r = rincian.where((k) => teks(k['jenis']) == jenis).toList();
    final total = r.fold<num>(0, (s, k) => s + _n(k['jumlah']));
    b.write('<h3>${jenis == 'Pemasukan' ? 'D' : 'E'}. Rincian $jenis per Kategori</h3>');
    if (r.isEmpty) {
      b.write('<p class="cat">Tidak ada $jenis pada periode ini.</p>');
      continue;
    }
    b.write('<table><tr><th>Kode</th><th>Kategori</th><th>Trx</th>${sumberKol.map((s) => '<th>${escHtml(s)}</th>').join()}<th>Jumlah</th><th>%</th></tr>');
    for (final k in r) {
      final per = peta(k['per']);
      b.write('<tr><td>${escHtml(teks(k['kode']))}</td><td>${escHtml(teks(k['nama']))}</td><td class="c">${_n(k['n'])}</td>'
          '${sumberKol.map((s) => '<td class="r">${uk(per[s])}</td>').join()}<td class="r">${u(k['jumlah'])}</td>'
          '<td class="c">${total == 0 ? '-' : (_n(k['jumlah']) * 100 / total).toStringAsFixed(1).replaceAll('.', ',')}</td></tr>');
    }
    b.write('<tr class="tot"><td colspan="${3 + sumberKol.length}">Jumlah $jenis</td><td class="r">${u(total)}</td><td class="c">100</td></tr></table>');
  }

  // F. posisi kas per akun & mutasi
  final pa = daftar(d['perAkun']).map(peta).toList();
  if (pa.isNotEmpty) {
    b.write('<h3>F. Posisi Kas per Akun</h3><table><tr><th>Akun</th><th>Saldo awal</th><th>Masuk</th><th>Keluar</th><th>Mutasi masuk</th><th>Mutasi keluar</th><th>Saldo akhir</th></tr>');
    num tot = 0;
    for (final a in pa) {
      tot += _n(a['akhir']);
      b.write('<tr><td>${escHtml(teks(a['nama']))}</td><td class="r">${uk(a['awal'])}</td><td class="r">${uk(a['masuk'])}</td><td class="r">${uk(a['keluar'])}</td>'
          '<td class="r">${uk(a['mutasiMasuk'])}</td><td class="r">${uk(a['mutasiKeluar'])}</td><td class="r">${u(a['akhir'])}</td></tr>');
    }
    b.write('<tr class="tot"><td colspan="6">Jumlah kas seluruh akun</td><td class="r">${u(tot)}</td></tr></table>');
    final mut = daftar(d['mutasi']).map(peta).toList();
    if (mut.isNotEmpty) {
      b.write('<p class="cat">Mutasi antar akun pada periode ini (tidak dihitung sebagai pemasukan/pengeluaran):</p><table><tr><th>Tanggal</th><th>No. Bukti</th><th>Dari</th><th>Ke</th><th>Uraian</th><th>Jumlah</th></tr>');
      for (final m in mut) {
        b.write('<tr><td>${escHtml(teks(m['tanggal']))}</td><td>${escHtml(teks(m['id']))}</td><td>${escHtml(teks(m['dari']))}</td><td>${escHtml(teks(m['ke']))}</td><td>${escHtml(teks(m['uraian']))}</td><td class="r">${u(m['jumlah'])}</td></tr>');
      }
      b.write('</table>');
    }
  }

  // G. pajak
  final pj = peta(d['pajak']);
  b.write('<h3>G. Pajak</h3><table>'
      '<tr><td>PPh dipungut pada periode</td><td class="r">${uk(pj['dipungut'])}</td></tr>'
      '<tr><td>PPh disetor pada periode</td><td class="r">${uk(pj['disetor'])}</td></tr>'
      '<tr class="tot"><td>Titipan pajak belum disetor (akhir periode)</td><td class="r">${u(pj['titipan'])}</td></tr>'
      '<tr><td>PPN yang dibayar dalam pembelian (informasi)</td><td class="r">${uk(pj['ppnMasukan'])}</td></tr></table>');

  // H. kewajiban & piutang (posisi saat dicetak)
  final tagihan = daftar(d['tagihan']).map(peta).toList();
  final ref = peta(d['referral']);
  final honor = daftar(d['honor']).map(peta).toList();
  final menunggu = daftar(d['menungguDaftar']).map(peta).toList();
  final sisaTag = tagihan.fold<num>(0, (s, t) => s + _n(t['sisa']));
  final sisaHon = honor.fold<num>(0, (s, h) => s + _n(h['sisa']));
  final jmlMenunggu = menunggu.fold<num>(0, (s, x) => s + _n(x['jumlah']));
  b.write('<h3>H. Piutang &amp; Kewajiban (posisi saat dicetak)</h3><table>'
      '<tr><td>Piutang: tunggakan tagihan warga belajar (Lampiran 1)</td><td class="r">${uk(sisaTag)}</td></tr>'
      '<tr><td>Kewajiban: cashback referral belum dibayar (Lampiran 2)</td><td class="r">${uk(ref['total'])}</td></tr>'
      '<tr><td>Kewajiban: honor disetujui belum dibayar (Lampiran 3)</td><td class="r">${uk(sisaHon)}</td></tr>'
      '<tr><td>Kewajiban: titipan pajak belum disetor</td><td class="r">${uk(pj['titipan'])}</td></tr>'
      '<tr><td>Pengeluaran menunggu persetujuan (Lampiran 4)</td><td class="r">${uk(jmlMenunggu)}</td></tr></table>');

  // tanda tangan
  if (!excel) {
    b.write('<table class="ttd"><tr><td>Mengetahui,<br>Ketua Yayasan<br><br><br><br>(..............................)</td>'
        '<td>Kepala ${escHtml(teks(l['nama'], 'PKBM'))}<br><br><br><br><br><b><u>${escHtml(teks(l['kepala'], '..............................'))}</u></b></td>'
        '<td>${tanggalIni()}<br>Bendahara<br><br><br><br>(..............................)</td></tr></table>');
  }

  // lampiran
  b.write('<div class="${excel ? '' : 'hal'}"><h3>Lampiran 1. Tagihan Warga Belajar (aktif)</h3>');
  if (tagihan.isEmpty) {
    b.write('<p class="cat">Tidak ada tagihan aktif.</p>');
  } else {
    b.write('<table><tr><th>Tagihan</th><th>Per WB</th><th>WB</th><th>Lunas</th><th>Total tagihan</th><th>Dibayar</th><th>Keringanan</th><th>Tunggakan</th></tr>');
    for (final t in tagihan) {
      b.write('<tr><td>${escHtml(teks(t['nama']))}</td><td class="r">${u(t['perWb'])}</td><td class="c">${_n(t['wb'])}</td><td class="c">${_n(t['lunas'])}</td>'
          '<td class="r">${u(t['tagihan'])}</td><td class="r">${uk(t['dibayar'])}</td><td class="r">${uk(t['keringanan'])}</td><td class="r">${uk(t['sisa'])}</td></tr>');
    }
    b.write('</table>');
  }
  b.write('<h3>Lampiran 2. Kewajiban Cashback Referral</h3><table>'
      '<tr><td>Saldo cashback ${_n(ref['promotor'])} promotor (belum diajukan)</td><td class="r">${uk(ref['saldoPromotor'])}</td></tr>'
      '<tr><td>Penarikan diajukan, menunggu persetujuan</td><td class="r">${uk(ref['tarikMenunggu'])}</td></tr>'
      '<tr><td>Penarikan disetujui, belum dibayar</td><td class="r">${uk(ref['tarikDisetujui'])}</td></tr>'
      '<tr class="tot"><td>Jumlah kewajiban</td><td class="r">${u(ref['total'])}</td></tr></table>');
  b.write('<h3>Lampiran 3. Honor Disetujui Belum Dibayar</h3>');
  if (honor.isEmpty) {
    b.write('<p class="cat">Tidak ada.</p>');
  } else {
    b.write('<table><tr><th>Bulan</th><th>Tutor</th><th>Total</th><th>Dibayar</th><th>Sisa</th></tr>');
    for (final h in honor) {
      b.write('<tr><td>${escHtml(teks(h['bulan']))}</td><td>${escHtml(teks(h['nama']))}</td><td class="r">${u(h['total'])}</td><td class="r">${uk(h['dibayar'])}</td><td class="r">${u(h['sisa'])}</td></tr>');
    }
    b.write('<tr class="tot"><td colspan="4">Jumlah</td><td class="r">${u(sisaHon)}</td></tr></table>');
  }
  b.write('<h3>Lampiran 4. Pengeluaran Menunggu Persetujuan</h3>');
  if (menunggu.isEmpty) {
    b.write('<p class="cat">Tidak ada.</p>');
  } else {
    b.write('<table><tr><th>Tanggal</th><th>No. Bukti</th><th>Uraian</th><th>Kategori</th><th>Sumber</th><th>Dicatat</th><th>Jumlah</th></tr>');
    for (final x in menunggu) {
      b.write('<tr><td>${escHtml(teks(x['tanggal']))}</td><td>${escHtml(teks(x['id']))}</td><td>${escHtml(teks(x['uraian']))}</td><td>${escHtml(teks(x['kategori']))}</td>'
          '<td>${escHtml(teks(x['sumber']))}</td><td>${escHtml(teks(x['dicatatOleh']))}</td><td class="r">${u(x['jumlah'])}</td></tr>');
    }
    b.write('<tr class="tot"><td colspan="6">Jumlah</td><td class="r">${u(jmlMenunggu)}</td></tr></table>');
  }
  b.write('</div>');

  // lampiran 5: rincian transaksi (opsional)
  final baris = daftar(d['baris']).map(peta).toList();
  if (baris.isNotEmpty) {
    b.write('<div class="${excel ? '' : 'hal'}"><h3>Lampiran 5. Rincian Transaksi (Buku Kas Umum)</h3>'
        '<table><tr><th>No</th><th>Tanggal</th><th>No. Bukti</th><th>Uraian</th><th>Kat.</th><th>Sumber</th><th>Akun</th><th>Masuk</th><th>Keluar</th><th>Saldo</th></tr>'
        '<tr><td></td><td></td><td></td><td><i>Saldo awal</i></td><td></td><td></td><td></td><td></td><td></td><td class="r">${u(d['saldoAwal'])}</td></tr>');
    var i = 0;
    for (final x in baris) {
      i++;
      b.write('<tr><td class="c">$i</td><td>${escHtml(teks(x['tanggal']))}</td><td>${escHtml(teks(x['id']))}</td><td>${escHtml(teks(x['uraian']))}</td><td>${escHtml(teks(x['kategori']))}</td>'
          '<td>${escHtml(teks(x['sumber']))}</td><td>${escHtml(teks(x['akun']))}</td><td class="r">${_n(x['masuk']) == 0 ? '' : u(x['masuk'])}</td>'
          '<td class="r">${_n(x['keluar']) == 0 ? '' : u(x['keluar'])}</td><td class="r">${u(x['saldo'])}</td></tr>');
    }
    b.write('<tr class="tot"><td colspan="7">Jumlah</td><td class="r">${u(d['masuk'])}</td><td class="r">${u(d['keluar'])}</td><td class="r">${u(d['saldoAkhir'])}</td></tr></table></div>');
  }
  b.write('<p class="cat">Dicetak ${escHtml(tanggalIni())} oleh ${escHtml(teks(d['dicetakOleh']))} dari TH.E-Course. Saldo dihitung dari transaksi berstatus Disetujui.</p>');
  if (excel) return '<html><head><meta charset="utf-8"></head><body>$b</body></html>';
  return dokumenA4(b.toString(), _css);
}
