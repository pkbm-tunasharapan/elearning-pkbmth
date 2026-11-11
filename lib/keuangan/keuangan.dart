import 'package:flutter/material.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../berkas.dart';
import '../honor/honor.dart' show rp;
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

int _angka(String s) => int.tryParse(s.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;

Color warnaTrx(BuildContext c, String s) => switch (s) {
      'Disetujui' || 'Lunas' => Colors.green,
      'Menunggu' || 'Sebagian' => const Color(0xFFE9A23B),
      'Ditolak' || 'Belum bayar' => Theme.of(c).colorScheme.error,
      _ => Theme.of(c).colorScheme.outline,
    };

String _awalBulan(DateTime d) => tglIso(DateTime(d.year, d.month, 1));
String _akhirBulan(DateTime d) => tglIso(DateTime(d.year, d.month + 1, 0));
const _bln = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
String _namaBulan(DateTime d) => '${_bln[d.month - 1]} ${d.year}';

// ───────────────────────── beranda keuangan ─────────────────────────

class KeuanganScreen extends StatefulWidget {
  const KeuanganScreen({super.key});

  @override
  State<KeuanganScreen> createState() => _KeuanganScreenState();
}

class _KeuanganScreenState extends State<KeuanganScreen> {
  int _v = 0;

  Future<void> _buka(Widget w) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => w));
    if (mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waStafKeuKonteks', [_t])),
      bangun: (context, d, segarkan) {
        final peran = peta(d['peran']);
        final saldo = peta(d['saldo']);
        final per = peta(saldo['per']);
        final menunggu = angka(d['menunggu']);
        return RefreshIndicator(
          onRefresh: segarkan,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Card(
              color: Gaya.ungu,
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Saldo kas', style: TextStyle(color: Colors.white70)),
                  Text(rp(saldo['total']), style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, runSpacing: 6, children: [
                    for (final e in per.entries)
                      if ((e.value as num? ?? 0) != 0)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(99)),
                          child: Text('${e.key}: ${rp(e.value)}', style: const TextStyle(color: Colors.white, fontSize: 12)),
                        ),
                  ]),
                  if (daftar(d['akun']).isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Wrap(spacing: 8, runSpacing: 6, children: [
                      for (final a in daftar(d['akun']).map(peta))
                        if (nilaiNum(a['saldo']) != 0)
                          Row(mainAxisSize: MainAxisSize.min, children: [
                            Icon(ikonAkun(teks(a['jenis'])), size: 14, color: Colors.white70),
                            const SizedBox(width: 4),
                            Text('${teks(a['nama'])}: ${rp(a['saldo'])}', style: const TextStyle(color: Colors.white, fontSize: 12)),
                          ]),
                    ]),
                    const SizedBox(height: 4),
                  ],
                  Text('Tahun pelajaran ${teks(d['tahun'])}', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                ]),
              ),
            ),
            if (menunggu > 0)
              Card(
                color: const Color(0xFFFFF4DB),
                child: ListTile(
                  leading: const Icon(Icons.hourglass_top_rounded, color: Color(0xFFB7791F)),
                  title: Text('$menunggu pengeluaran menunggu persetujuan'),
                  subtitle: Text(peran['putus'] == true ? 'Ketuk untuk meninjau' : 'Menunggu Ketua Yayasan'),
                  onTap: () => _buka(TransaksiScreen(konteks: d, hanyaMenunggu: true)),
                ),
              ),
            const SizedBox(height: 4),
            _Ubin(ikon: Icons.receipt_long_rounded, judul: 'Transaksi', sub: 'Pemasukan & pengeluaran', onTap: () => _buka(TransaksiScreen(konteks: d))),
            _Ubin(ikon: Icons.request_quote_rounded, judul: 'Tagihan Warga Belajar', sub: 'Iuran, biaya ujian, tunggakan', onTap: () => _buka(TagihanScreen(konteks: d))),
            _Ubin(ikon: Icons.account_balance_wallet_rounded, judul: 'Akun Kas & Mutasi', sub: 'Tunai, bank, payment gateway; pemindahan antar akun', onTap: () => _buka(AkunKasScreen(konteks: d))),
            _Ubin(ikon: Icons.menu_book_rounded, judul: 'Laporan Kas', sub: 'Buku kas per periode, sumber dana & akun', onTap: () => _buka(LaporanKasScreen(konteks: d))),
            if (peran['catat'] == true) _Ubin(ikon: Icons.category_rounded, judul: 'Kategori Keuangan', sub: 'Kode & nama kategori', onTap: () => _buka(KategoriKeuScreen(konteks: d))),
          ]),
        );
      },
    );
  }
}

class _Ubin extends StatelessWidget {
  const _Ubin({required this.ikon, required this.judul, required this.sub, required this.onTap});
  final IconData ikon;
  final String judul;
  final String sub;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
        child: ListTile(
          leading: CircleAvatar(backgroundColor: Gaya.ungu.withValues(alpha: 0.12), child: Icon(ikon, color: Gaya.ungu)),
          title: Text(judul, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text(sub),
          trailing: const Icon(Icons.chevron_right_rounded),
          onTap: onTap,
        ),
      );
}

// ───────────────────────── transaksi ─────────────────────────

class TransaksiScreen extends StatefulWidget {
  const TransaksiScreen({super.key, required this.konteks, this.hanyaMenunggu = false});
  final Map<String, dynamic> konteks;
  final bool hanyaMenunggu;

  @override
  State<TransaksiScreen> createState() => _TransaksiScreenState();
}

class _TransaksiScreenState extends State<TransaksiScreen> {
  DateTime _bulan = DateTime.now();
  String _jenis = '';
  late bool _menunggu = widget.hanyaMenunggu;
  int _v = 0;

  Map<String, dynamic> get _peran => peta(widget.konteks['peran']);

  Future<void> _form([Map<String, dynamic>? x]) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => FormTransaksi(konteks: widget.konteks, x: x)));
    if (ok == true && mounted) setState(() => _v++);
  }

  Future<void> _detail(Map<String, dynamic> x) async {
    final st = teks(x['status']);
    final bolehUbah = _peran['catat'] == true && teks(x['kategori']) != 'HON' && teks(x['idTagihan']).isEmpty && (st == 'Menunggu' || (teks(x['jenis']) == 'Pemasukan' && st == 'Disetujui'));
    final bolehBatal = _peran['catat'] == true && teks(x['kategori']) != 'HON' && (st == 'Menunggu' || st == 'Disetujui');
    final bolehPutus = _peran['putus'] == true && st == 'Menunggu';
    final bolehAkun = _peran['catat'] == true && st != 'Ditolak' && st != 'Dibatalkan';
    final mutasi = teks(x['jenis']) == 'Mutasi';
    final aksi = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(rp(x['jumlah']), style: Theme.of(c).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, color: teks(x['jenis']) == 'Pengeluaran' ? Theme.of(c).colorScheme.error : Colors.green))),
              Lencana(st, warna: warnaTrx(c, st)),
            ]),
            Text(teks(x['uraian']), style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(mutasi ? 'Mutasi · ${teks(x['namaAkun'])} → ${teks(x['namaAkunTujuan'])}' : '${teks(x['jenis'])} · ${teks(x['namaKategori'])} · ${teks(x['sumber'])}'),
            if (!mutasi) Text('Akun kas: ${teks(x['namaAkun'])}'),
            Text('${tglIndo(teks(x['tanggal']))}${teks(x['pihak']).isEmpty ? '' : ' · ${teks(x['pihak'])}'}'),
            Text('No. ${teks(x['id'])} · dicatat ${teks(x['dicatatOleh'])}', style: const TextStyle(fontSize: 12)),
            if (teks(x['diputusOleh']).isNotEmpty || teks(x['catatanPutus']).isNotEmpty)
              Text('Keputusan: ${teks(x['diputusOleh'])} ${teks(x['catatanPutus'])}', style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 6, children: [
              if (x['adaBukti'] == true) OutlinedButton.icon(onPressed: () => Navigator.pop(c, 'bukti'), icon: const Icon(Icons.image_outlined), label: const Text('Lihat bukti')),
              if (bolehPutus) FilledButton.icon(onPressed: () => Navigator.pop(c, 'setuju'), icon: const Icon(Icons.check_rounded), label: const Text('Setujui')),
              if (bolehPutus) OutlinedButton.icon(onPressed: () => Navigator.pop(c, 'tolak'), icon: const Icon(Icons.close_rounded), label: const Text('Tolak')),
              if (bolehUbah) OutlinedButton.icon(onPressed: () => Navigator.pop(c, 'ubah'), icon: const Icon(Icons.edit_outlined), label: const Text('Ubah')),
              if (bolehAkun) OutlinedButton.icon(onPressed: () => Navigator.pop(c, 'akun'), icon: const Icon(Icons.account_balance_wallet_outlined), label: const Text('Atur akun kas')),
              if (bolehBatal) TextButton.icon(onPressed: () => Navigator.pop(c, 'batal'), icon: const Icon(Icons.block_rounded), label: const Text('Batalkan')),
            ]),
          ]),
        ),
      ),
    );
    if (!mounted || aksi == null) return;
    if (aksi == 'bukti') {
      await lihatFoto(context, () async => peta(await Api.instance('waStafKeuBukti', [_t, teks(x['id'])])));
    } else if (aksi == 'ubah') {
      await _form(x);
    } else if (aksi == 'akun') {
      final akun = daftar(widget.konteks['akun']).map(peta).toList();
      final a = await pilihAkunKas(context, akun, judul: mutasi ? 'Akun asal' : 'Akun kas transaksi ini', awal: teks(x['akun']));
      if (a == null || !mounted) return;
      String? b;
      if (mutasi) {
        b = await pilihAkunKas(context, akun, judul: 'Akun tujuan', awal: teks(x['akunTujuan']));
        if (b == null || !mounted) return;
      }
      final r = await jalankan(context, () => Api.instance('waStafKeuAturAkun', [_t, teks(x['id']), a, b]), teksProses: 'Menyimpan...');
      if (r.ok && mounted) setState(() => _v++);
    } else if (aksi == 'batal') {
      final a = await mintaTeks(context, 'Batalkan transaksi?', label: 'Alasan pembatalan');
      if (a == null || !mounted) return;
      final r = await jalankan(context, () => Api.instance('waStafKeuBatal', [_t, teks(x['id']), a]), teksProses: 'Membatalkan...');
      if (r.ok && mounted) setState(() => _v++);
    } else {
      final setuju = aksi == 'setuju';
      final cat = await mintaTeks(context, setuju ? 'Setujui pengeluaran?' : 'Tolak pengeluaran?', label: 'Catatan (opsional)');
      if (cat == null || !mounted) return;
      final r = await jalankanSaldo(context, (paksa) => Api.instance('waStafKeuPutus', [_t, teks(x['id']), setuju, cat, paksa]), teksProses: 'Menyimpan keputusan...');
      if (r.ok && mounted) setState(() => _v++);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(_menunggu ? 'Menunggu persetujuan' : 'Transaksi')),
      floatingActionButton: _peran['catat'] == true && !_menunggu
          ? FloatingActionButton.extended(heroTag: 'trxBaru', onPressed: () => _form(), icon: const Icon(Icons.add_rounded), label: const Text('Catat'))
          : null,
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey('$_v|$_bulan|$_jenis|$_menunggu'),
        muat: () async => peta(await Api.instance('waStafKeuDaftar', [
              _t,
              _menunggu ? {'status': 'Menunggu'} : {'dari': _awalBulan(_bulan), 'sampai': _akhirBulan(_bulan), if (_jenis.isNotEmpty) 'jenis': _jenis}
            ])),
        bangun: (context, d, segarkan) {
          final trx = daftar(d['transaksi']).map(peta).toList();
          return RefreshIndicator(
            onRefresh: segarkan,
            child: ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 100), children: [
              if (!_menunggu) ...[
                Row(children: [
                  IconButton(onPressed: () => setState(() => _bulan = DateTime(_bulan.year, _bulan.month - 1)), icon: const Icon(Icons.chevron_left_rounded)),
                  Expanded(child: Text(_namaBulan(_bulan), textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
                  IconButton(onPressed: () => setState(() => _bulan = DateTime(_bulan.year, _bulan.month + 1)), icon: const Icon(Icons.chevron_right_rounded)),
                ]),
                Wrap(spacing: 6, children: [
                  for (final j in ['', 'Pemasukan', 'Pengeluaran', 'Mutasi'])
                    ChoiceChip(label: Text(j.isEmpty ? 'Semua' : j), selected: _jenis == j, onSelected: (_) => setState(() => _jenis = j)),
                  ActionChip(avatar: const Icon(Icons.hourglass_top_rounded, size: 16), label: const Text('Menunggu'), onPressed: () => setState(() => _menunggu = true)),
                ]),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Text('Masuk ${rp(d['masuk'])} · Keluar ${rp(d['keluar'])} (yang disetujui)', style: const TextStyle(fontWeight: FontWeight.w600)),
                ),
              ] else
                Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: () => setState(() => _menunggu = false), icon: const Icon(Icons.arrow_back_rounded), label: const Text('Semua transaksi'))),
              if (trx.isEmpty) Kosong(pesan: _menunggu ? 'Tidak ada pengeluaran yang menunggu persetujuan.' : 'Belum ada transaksi pada bulan ini.', ikon: Icons.receipt_long_outlined),
              if (trx.isNotEmpty)
                Card(
                  child: Column(children: [
                    for (final x in trx)
                      ListTile(
                        onTap: () => _detail(x),
                        leading: teks(x['jenis']) == 'Mutasi'
                            ? Icon(Icons.swap_horiz_rounded, color: cs.primary)
                            : Icon(teks(x['jenis']) == 'Pengeluaran' ? Icons.call_made_rounded : Icons.call_received_rounded, color: teks(x['jenis']) == 'Pengeluaran' ? cs.error : Colors.green),
                        title: Text(teks(x['uraian']), maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text('${tglIndo(teks(x['tanggal']))} · ${teks(x['namaKategori'])} · ${teks(x['jenis']) == 'Mutasi' ? '${teks(x['namaAkun'])} → ${teks(x['namaAkunTujuan'])}' : teks(x['namaAkun'])}'),
                        trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                          Text(rp(x['jumlah']), style: TextStyle(fontWeight: FontWeight.w800, decoration: ['Ditolak', 'Dibatalkan'].contains(teks(x['status'])) ? TextDecoration.lineThrough : null)),
                          if (teks(x['status']) != 'Disetujui') Text(teks(x['status']), style: TextStyle(fontSize: 11, color: warnaTrx(context, teks(x['status'])))),
                        ]),
                      ),
                  ]),
                ),
            ]),
          );
        },
      ),
    );
  }
}

class FormTransaksi extends StatefulWidget {
  const FormTransaksi({super.key, required this.konteks, this.x});
  final Map<String, dynamic> konteks;
  final Map<String, dynamic>? x;

  @override
  State<FormTransaksi> createState() => _FormTransaksiState();
}

class _FormTransaksiState extends State<FormTransaksi> {
  String _jenis = 'Pengeluaran';
  String? _kategori;
  String? _sumber;
  String? _akun;
  late String _tgl;
  final _jumlah = TextEditingController();
  final _uraian = TextEditingController();
  final _pihak = TextEditingController();
  String? _bukti;

  @override
  void initState() {
    super.initState();
    _tgl = tglIso(DateTime.now());
    final x = widget.x;
    if (x != null) {
      _jenis = teks(x['jenis'], _jenis);
      _kategori = teks(x['kategori']);
      _sumber = teks(x['sumber']);
      _akun = teks(x['akun']).isEmpty ? null : teks(x['akun']);
      _tgl = teks(x['tanggal'], _tgl);
      _jumlah.text = '${angka(x['jumlah'])}';
      _uraian.text = teks(x['uraian']);
      _pihak.text = teks(x['pihak']);
    }
  }

  @override
  void dispose() {
    _jumlah.dispose();
    _uraian.dispose();
    _pihak.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final kat = daftar(widget.konteks['kategori']).map(peta).where((k) => teks(k['jenis']) == _jenis && teks(k['kode']) != 'HON').toList();
    final sumber = daftar(widget.konteks['sumber']).map((e) => teks(e)).toList();
    final sumberKat = peta(widget.konteks['sumberKat']);
    return Scaffold(
      appBar: AppBar(title: Text(widget.x == null ? 'Catat transaksi' : 'Ubah transaksi')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        SegmentedButton<String>(
          segments: const [ButtonSegment(value: 'Pemasukan', label: Text('Pemasukan'), icon: Icon(Icons.call_received_rounded)), ButtonSegment(value: 'Pengeluaran', label: Text('Pengeluaran'), icon: Icon(Icons.call_made_rounded))],
          selected: {_jenis},
          onSelectionChanged: (s) => setState(() {
            _jenis = s.first;
            _kategori = null;
          }),
        ),
        if (_jenis == 'Pengeluaran') const Padding(padding: EdgeInsets.only(top: 6), child: Text('Pengeluaran perlu disetujui Ketua Yayasan sebelum masuk saldo.', style: TextStyle(fontSize: 12))),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () async {
            final n = DateTime.now();
            final p = await showDatePicker(context: context, firstDate: DateTime(n.year - 2), lastDate: n, initialDate: DateTime.tryParse(_tgl) ?? n);
            if (p != null) setState(() => _tgl = tglIso(p));
          },
          icon: const Icon(Icons.event_rounded),
          label: Text(tglIndo(_tgl)),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          key: ValueKey('kat$_jenis'),
          isExpanded: true,
          initialValue: kat.any((k) => teks(k['kode']) == _kategori) ? _kategori : null,
          decoration: const InputDecoration(labelText: 'Kategori'),
          items: [for (final k in kat) DropdownMenuItem(value: teks(k['kode']), child: Text('${teks(k['kode'])} · ${teks(k['nama'])}', overflow: TextOverflow.ellipsis))],
          onChanged: (v) => setState(() {
            _kategori = v;
            if (_jenis == 'Pemasukan' && sumberKat[v] != null) _sumber = teks(sumberKat[v]);
          }),
        ),
        const SizedBox(height: 12),
        TextField(controller: _jumlah, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Jumlah (Rp)', prefixText: 'Rp ')),
        const SizedBox(height: 12),
        TextField(controller: _uraian, decoration: const InputDecoration(labelText: 'Uraian'), maxLines: 2),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          key: ValueKey('sum$_sumber'),
          initialValue: sumber.contains(_sumber) ? _sumber : null,
          decoration: const InputDecoration(labelText: 'Sumber dana'),
          items: [for (final s in sumber) DropdownMenuItem(value: s, child: Text(s))],
          onChanged: (v) => setState(() => _sumber = v),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: _akun,
          decoration: InputDecoration(labelText: _jenis == 'Pemasukan' ? 'Diterima di akun' : 'Dibayar dari akun'),
          items: [
            for (final a in daftar(widget.konteks['akun']).map(peta).where((a) => a['aktif'] != false && teks(a['kode']).isNotEmpty))
              DropdownMenuItem(value: teks(a['kode']), child: Row(children: [Icon(ikonAkun(teks(a['jenis'])), size: 18), const SizedBox(width: 8), Expanded(child: Text(teks(a['nama']), overflow: TextOverflow.ellipsis))])),
          ],
          onChanged: (v) => setState(() => _akun = v),
        ),
        const SizedBox(height: 12),
        TextField(controller: _pihak, decoration: InputDecoration(labelText: _jenis == 'Pemasukan' ? 'Dari (pihak terkait)' : 'Dibayarkan kepada')),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () async {
            final f = await ambilFoto(bolehGaleri: true, context: context);
            if (f != null) setState(() => _bukti = f);
          },
          icon: Icon(_bukti == null ? Icons.add_a_photo_outlined : Icons.check_circle_rounded),
          label: Text(_bukti == null ? 'Foto bukti / nota (opsional)' : 'Bukti terlampir — ganti'),
        ),
        const SizedBox(height: 20),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          onPressed: () async {
            if (_kategori == null) return kabar(context, 'Pilih kategori.', galat: true);
            if (_akun == null) return kabar(context, 'Pilih akun kas (tunai / bank / gateway).', galat: true);
            final r = await jalankan(context, () => Api.instance('waStafKeuSimpan', [
                  _t,
                  {
                    if (widget.x != null) 'id': teks(widget.x!['id']),
                    'tanggal': _tgl, 'jenis': _jenis, 'kategori': _kategori, 'jumlah': _angka(_jumlah.text), 'uraian': _uraian.text,
                    'sumber': _sumber ?? '', 'pihak': _pihak.text, 'akun': _akun, if (_bukti != null) 'bukti': _bukti
                  }
                ], const Duration(minutes: 2)), teksProses: 'Menyimpan...');
            if (r.ok && context.mounted) {
              kabar(context, teks(peta(r.data)['status']) == 'Menunggu' ? 'Tersimpan, menunggu persetujuan Ketua Yayasan.' : 'Transaksi tersimpan.');
              Navigator.pop(context, true);
            }
          },
          child: const Text('Simpan'),
        ),
      ]),
    );
  }
}

// ───────────────────────── tagihan ─────────────────────────

class TagihanScreen extends StatefulWidget {
  const TagihanScreen({super.key, required this.konteks});
  final Map<String, dynamic> konteks;

  @override
  State<TagihanScreen> createState() => _TagihanScreenState();
}

class _TagihanScreenState extends State<TagihanScreen> {
  int _v = 0;

  Future<void> _form(Map<String, dynamic> d, [Map<String, dynamic>? x]) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => FormTagihan(data: d, x: x)));
    if (ok == true && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tagihan Warga Belajar'), actions: [
        IconButton(
          tooltip: 'Cek tunggakan (pindai kartu)',
          icon: const Icon(Icons.qr_code_scanner_rounded),
          onPressed: () async {
            final k = await pindaiSekali(context, judul: 'Cek tunggakan warga belajar');
            if (k != null && context.mounted) await tampilTunggakan(context, k);
          },
        ),
      ]),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_v),
        muat: () async => peta(await Api.instance('waStafTagihanDaftar', [_t])),
        bangun: (context, d, segarkan) {
          final tg = daftar(d['tagihan']).map(peta).toList();
          final catat = d['catat'] == true;
          return Stack(children: [
            RefreshIndicator(
              onRefresh: segarkan,
              child: ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 100), children: [
                if (tg.isEmpty) Kosong(pesan: catat ? 'Belum ada tagihan. Ketuk "Tagihan baru".' : 'Belum ada tagihan.', ikon: Icons.request_quote_outlined),
                for (final x in tg)
                  Card(
                    child: ListTile(
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => TagihanRinciScreen(id: teks(x['id'])))).then((_) {
                        if (mounted) setState(() => _v++);
                      }),
                      title: Text(teks(x['nama']), style: TextStyle(fontWeight: FontWeight.w700, color: x['aktif'] == true ? null : Theme.of(context).colorScheme.outline)),
                      subtitle: Text('${rp(x['jumlah'])} · ${teks(x['namaSasaran'])}${teks(x['jatuhTempo']).isEmpty ? '' : ' · tempo ${tglIndo(teks(x['jatuhTempo']))}'}\n'
                          'Lunas ${angka(peta(x['ringkas'])['lunas'])}/${angka(peta(x['ringkas'])['peserta'])} · terkumpul ${rp(peta(x['ringkas'])['dibayar'])} · sisa ${rp(peta(x['ringkas'])['sisa'])}'),
                      isThreeLine: true,
                      trailing: catat
                          ? PopupMenuButton<String>(
                              onSelected: (v) async {
                                if (v == 'ubah') return _form(d, x);
                                final r = await jalankan(context, () => Api.instance('waStafTagihanAktif', [_t, teks(x['id']), x['aktif'] != true]), teksProses: 'Menyimpan...');
                                if (r.ok && mounted) setState(() => _v++);
                              },
                              itemBuilder: (_) => [
                                const PopupMenuItem(value: 'ubah', child: Text('Ubah')),
                                PopupMenuItem(value: 'aktif', child: Text(x['aktif'] == true ? 'Tutup tagihan' : 'Aktifkan lagi')),
                              ],
                            )
                          : null,
                    ),
                  ),
              ]),
            ),
            if (catat)
              Positioned(right: 16, bottom: 16, child: FloatingActionButton.extended(heroTag: 'tagBaru', onPressed: () => _form(d), icon: const Icon(Icons.add_rounded), label: const Text('Tagihan baru'))),
          ]);
        },
      ),
    );
  }
}

Future<void> tampilTunggakan(BuildContext context, String kode) async {
  final r = await jalankan(context, () async => peta(await Api.instance('waStafTunggakanWb', [_t, kode])), teksProses: 'Memeriksa tunggakan...');
  if (!r.ok || !context.mounted) return;
  final d = r.data!;
  final w = peta(d['wb']);
  final tg = daftar(d['tagihan']).map(peta).toList();
  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (c) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(teks(w['nama']), style: Theme.of(c).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          Text('${teks(w['namaRombel'])} · NISN ${teks(w['nisn'], '-')}'),
          const SizedBox(height: 8),
          Text('Total tunggakan: ${rp(d['totalSisa'])}', style: TextStyle(fontWeight: FontWeight.w800, color: angka(d['totalSisa']) > 0 ? Theme.of(c).colorScheme.error : Colors.green)),
          const SizedBox(height: 6),
          if (tg.isEmpty) const Text('Tidak ada tagihan aktif.'),
          for (final x in tg)
            ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text(teks(x['namaTagihan'])), subtitle: Text('Dibayar ${rp(x['dibayar'])}${angka(x['keringanan']) > 0 ? ' · keringanan ${rp(x['keringanan'])}' : ''}'),
                trailing: Lencana(teks(x['status']) == 'Lunas' ? 'Lunas' : 'Sisa ${rp(x['sisa'])}', warna: warnaTrx(c, teks(x['status'])))),
        ]),
      ),
    ),
  );
}

class FormTagihan extends StatefulWidget {
  const FormTagihan({super.key, required this.data, this.x});
  final Map<String, dynamic> data;
  final Map<String, dynamic>? x;

  @override
  State<FormTagihan> createState() => _FormTagihanState();
}

class _FormTagihanState extends State<FormTagihan> {
  final _nama = TextEditingController();
  final _jumlah = TextEditingController();
  final _ket = TextEditingController();
  String? _kategori;
  String _sasaran = 'Semua';
  String? _nilai;
  String _tempo = '';

  @override
  void initState() {
    super.initState();
    final x = widget.x;
    if (x != null) {
      _nama.text = teks(x['nama']);
      _jumlah.text = '${angka(x['jumlah'])}';
      _ket.text = teks(x['keterangan']);
      _kategori = teks(x['kategori']);
      _sasaran = teks(x['sasaran'], 'Semua');
      _nilai = teks(x['nilaiSasaran']);
      _tempo = teks(x['jatuhTempo']);
    }
  }

  @override
  void dispose() {
    _nama.dispose();
    _jumlah.dispose();
    _ket.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final kat = daftar(widget.data['kategori']).map(peta).toList();
    final rombel = daftar(widget.data['rombel']).map(peta).toList();
    final program = daftar(widget.data['program']).map((e) => teks(e)).toList();
    final pilihan = _sasaran == 'Rombel' ? {for (final r in rombel) teks(r['id']): teks(r['nama'])} : {for (final p in program) p: p};
    return Scaffold(
      appBar: AppBar(title: Text(widget.x == null ? 'Tagihan baru' : 'Ubah tagihan')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        TextField(controller: _nama, decoration: const InputDecoration(labelText: 'Nama tagihan', hintText: 'mis. Iuran November 2026')),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: kat.any((k) => teks(k['kode']) == _kategori) ? _kategori : null,
          decoration: const InputDecoration(labelText: 'Kategori pemasukan'),
          items: [for (final k in kat) DropdownMenuItem(value: teks(k['kode']), child: Text('${teks(k['kode'])} · ${teks(k['nama'])}', overflow: TextOverflow.ellipsis))],
          onChanged: (v) => setState(() => _kategori = v),
        ),
        const SizedBox(height: 12),
        TextField(controller: _jumlah, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Jumlah per warga belajar', prefixText: 'Rp ')),
        const SizedBox(height: 12),
        SegmentedButton<String>(
          segments: const [ButtonSegment(value: 'Semua', label: Text('Semua')), ButtonSegment(value: 'Program', label: Text('Program')), ButtonSegment(value: 'Rombel', label: Text('Rombel'))],
          selected: {_sasaran},
          onSelectionChanged: (s) => setState(() {
            _sasaran = s.first;
            _nilai = null;
          }),
        ),
        if (_sasaran != 'Semua') ...[
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            key: ValueKey('sas$_sasaran'),
            isExpanded: true,
            initialValue: pilihan.containsKey(_nilai) ? _nilai : null,
            decoration: InputDecoration(labelText: _sasaran == 'Rombel' ? 'Rombel' : 'Program'),
            items: [for (final e in pilihan.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
            onChanged: (v) => setState(() => _nilai = v),
          ),
        ],
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () async {
            final n = DateTime.now();
            final p = await showDatePicker(context: context, firstDate: DateTime(n.year - 1), lastDate: DateTime(n.year + 2), initialDate: DateTime.tryParse(_tempo) ?? n);
            if (p != null) setState(() => _tempo = tglIso(p));
          },
          icon: const Icon(Icons.event_rounded),
          label: Text(_tempo.isEmpty ? 'Jatuh tempo (opsional)' : 'Jatuh tempo ${tglIndo(_tempo)}'),
        ),
        const SizedBox(height: 12),
        TextField(controller: _ket, decoration: const InputDecoration(labelText: 'Keterangan (opsional)')),
        const SizedBox(height: 20),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          onPressed: () async {
            final r = await jalankan(context, () => Api.instance('waStafTagihanSimpan', [
                  _t,
                  {
                    if (widget.x != null) 'id': teks(widget.x!['id']),
                    'nama': _nama.text, 'kategori': _kategori ?? '', 'jumlah': _angka(_jumlah.text), 'sasaran': _sasaran, 'nilaiSasaran': _nilai ?? '', 'jatuhTempo': _tempo, 'keterangan': _ket.text
                  }
                ]), teksProses: 'Menyimpan...');
            if (r.ok && context.mounted) Navigator.pop(context, true);
          },
          child: const Text('Simpan'),
        ),
      ]),
    );
  }
}

class TagihanRinciScreen extends StatefulWidget {
  const TagihanRinciScreen({super.key, required this.id});
  final String id;

  @override
  State<TagihanRinciScreen> createState() => _TagihanRinciScreenState();
}

class _TagihanRinciScreenState extends State<TagihanRinciScreen> {
  int _v = 0;
  String _filter = 'Belum lunas';
  String _cari = '';

  Future<void> _aksi(Map<String, dynamic> tag, Map<String, dynamic> w, bool catat, List<Map<String, dynamic>> akun) async {
    if (!catat) return;
    final a = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(title: Text(teks(w['nama']), style: const TextStyle(fontWeight: FontWeight.w800)), subtitle: Text('Sisa ${rp(w['sisa'])} dari ${rp(w['tagihan'])}')),
          if (angka(w['sisa']) > 0) ListTile(leading: const Icon(Icons.payments_rounded), title: const Text('Catat pembayaran'), onTap: () => Navigator.pop(c, 'bayar')),
          if (angka(w['sisa']) > 0) ListTile(leading: const Icon(Icons.volunteer_activism_outlined), title: const Text('Beri keringanan'), onTap: () => Navigator.pop(c, 'ringan')),
        ]),
      ),
    );
    if (a == null || !mounted) return;
    if (a == 'bayar') {
      final s = await mintaTeks(context, 'Pembayaran ${teks(w['nama'])}', label: 'Jumlah (Rp)', awal: '${angka(w['sisa'])}');
      if (s == null || !mounted) return;
      String? ak;
      if (akun.isNotEmpty) {
        ak = await pilihAkunKas(context, akun, judul: 'Diterima di akun');
        if (ak == null || !mounted) return;
      }
      final r = await jalankan(context, () async => peta(await Api.instance('waStafTagihanBayar', [_t, {'idTagihan': widget.id, 'idWb': teks(w['idWb']), 'jumlah': _angka(s), 'akun': ak}])), teksProses: 'Mencatat pembayaran...');
      if (!r.ok || !mounted) return;
      setState(() => _v++);
      final k = r.data!;
      final cetak = await konfirmasi(context, 'Pembayaran tercatat', '${rp(k['jumlah'])} dari ${teks(k['nama'])}. Sisa ${rp(k['sisa'])}. Cetak kwitansi?', ya: 'Cetak kwitansi');
      if (cetak && mounted) await htmlKePdf(context, nama: 'Kwitansi_${teks(k['id'])}.pdf', args: [_t, kwitansiHtml(k)]);
    } else {
      final j = await mintaTeks(context, 'Keringanan ${teks(w['nama'])}', label: 'Jumlah keringanan (Rp)', awal: '${angka(w['sisa'])}');
      if (j == null || !mounted) return;
      final alasan = await mintaTeks(context, 'Alasan keringanan', label: 'mis. yatim, tidak mampu');
      if (alasan == null || !mounted) return;
      final r = await jalankan(context, () => Api.instance('waStafTagihanKeringanan', [_t, {'idTagihan': widget.id, 'idWb': teks(w['idWb']), 'jumlah': _angka(j), 'alasan': alasan}]), teksProses: 'Menyimpan...');
      if (r.ok && mounted) setState(() => _v++);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Rincian tagihan')),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_v),
        muat: () async => peta(await Api.instance('waStafTagihanRinci', [_t, widget.id])),
        bangun: (context, d, segarkan) {
          final tag = peta(d['tagihan']);
          final semua = daftar(d['wb']).map(peta).toList();
          final wb = semua.where((w) {
            if (_filter == 'Belum lunas' && teks(w['status']) == 'Lunas') return false;
            if (_filter == 'Lunas' && teks(w['status']) != 'Lunas') return false;
            return _cari.isEmpty || teks(w['nama']).toLowerCase().contains(_cari);
          }).toList();
          final sisa = semua.fold<num>(0, (s, w) => s + (nilaiNum(w['sisa'])));
          return RefreshIndicator(
            onRefresh: segarkan,
            child: ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 32), children: [
              Text(teks(tag['nama']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
              Text('${rp(tag['jumlah'])} per warga belajar · ${semua.where((w) => teks(w['status']) == 'Lunas').length}/${semua.length} lunas · total sisa ${rp(sisa)}'),
              const SizedBox(height: 8),
              Wrap(spacing: 6, children: [
                for (final f in ['Belum lunas', 'Lunas', 'Semua']) ChoiceChip(label: Text(f), selected: _filter == f, onSelected: (_) => setState(() => _filter = f)),
                OutlinedButton.icon(
                  onPressed: () => htmlKePdf(context, nama: 'Tagihan_${teks(tag['id'])}.pdf', args: [_t, rekapTagihanHtml(tag, semua)]),
                  icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
                  label: const Text('PDF'),
                ),
              ]),
              const SizedBox(height: 6),
              TextField(decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari nama', isDense: true), onChanged: (v) => setState(() => _cari = v.trim().toLowerCase())),
              const SizedBox(height: 6),
              if (wb.isEmpty) const Kosong(pesan: 'Tidak ada data.'),
              if (wb.isNotEmpty)
                Card(
                  child: Column(children: [
                    for (final w in wb)
                      ListTile(
                        dense: true,
                        onTap: () => _aksi(tag, w, d['catat'] == true, daftar(d['akun']).map(peta).toList()),
                        title: Text(teks(w['nama'])),
                        subtitle: Text('${teks(w['namaRombel'])} · dibayar ${rp(w['dibayar'])}${angka(w['keringanan']) > 0 ? ' · keringanan ${rp(w['keringanan'])}' : ''}'),
                        trailing: Lencana(teks(w['status']) == 'Lunas' ? 'Lunas' : rp(w['sisa']), warna: warnaTrx(context, teks(w['status']))),
                      ),
                  ]),
                ),
            ]),
          );
        },
      ),
    );
  }
}

num nilaiNum(dynamic v) => v is num ? v : num.tryParse('$v') ?? 0;

const _cssKeu = 'h2{text-align:center;font-size:13pt;margin:4px 0 8px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:4px 5px;font-size:9.5pt}'
    'th{background:#eee}.r{text-align:right}.c{text-align:center}.kop{text-align:center;border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:8px}.lb{font-size:14pt;font-weight:bold}'
    '.ttd{width:100%;margin-top:22px}.ttd td{border:none;text-align:center;vertical-align:top}.ring td{border:none;padding:2px 4px}';

String _kopKeu(Map<String, dynamic> l) =>
    '<div class="kop"><div class="lb">${escHtml(teks(l['nama'], 'PKBM'))}</div><div>NPSN ${escHtml(teks(l['npsn']))} · ${escHtml(teks(l['alamat']))}</div></div>';

String kwitansiHtml(Map<String, dynamic> k) {
  final l = peta(k['lembaga']);
  final b = '${_kopKeu(l)}<h2>KWITANSI PEMBAYARAN</h2>'
      '<table class="ring"><tr><td>No.</td><td>: ${escHtml(teks(k['id']))}</td></tr><tr><td>Tanggal</td><td>: ${escHtml(tglIndo(teks(k['tanggal'])))}</td></tr>'
      '<tr><td>Diterima dari</td><td>: <b>${escHtml(teks(k['nama']))}</b> (${escHtml(teks(k['rombel']))}, NISN ${escHtml(teks(k['nisn'], '-'))})</td></tr>'
      '<tr><td>Untuk pembayaran</td><td>: ${escHtml(teks(k['tagihan']))}</td></tr><tr><td>Jumlah</td><td>: <b style="font-size:13pt">${escHtml(rp(k['jumlah']))}</b></td></tr>'
      '<tr><td>Sisa tagihan</td><td>: ${escHtml(rp(k['sisa']))}</td></tr></table>'
      '<table class="ttd"><tr><td></td><td>${tanggalIni()}<br>Penerima<br><br><br><br><b><u>${escHtml(teks(k['petugas']))}</u></b></td></tr></table>';
  return dokumenA4(b, _cssKeu);
}

String rekapTagihanHtml(Map<String, dynamic> tag, List<Map<String, dynamic>> wb) {
  final b = StringBuffer('<h2>REKAP TAGIHAN: ${escHtml(teks(tag['nama']).toUpperCase())}</h2><p>${escHtml(rp(tag['jumlah']))} per warga belajar · dicetak ${tanggalIni()}</p>');
  b.write('<table><tr><th>No</th><th>Nama</th><th>Rombel</th><th>Tagihan</th><th>Dibayar</th><th>Keringanan</th><th>Sisa</th><th>Status</th></tr>');
  var i = 0;
  num tb = 0, ts = 0;
  for (final w in wb) {
    i++;
    tb += nilaiNum(w['dibayar']);
    ts += nilaiNum(w['sisa']);
    b.write('<tr><td class="c">$i</td><td>${escHtml(teks(w['nama']))}</td><td>${escHtml(teks(w['namaRombel']))}</td><td class="r">${rp(w['tagihan'])}</td><td class="r">${rp(w['dibayar'])}</td>'
        '<td class="r">${rp(w['keringanan'])}</td><td class="r">${rp(w['sisa'])}</td><td>${escHtml(teks(w['status']))}</td></tr>');
  }
  b.write('<tr><th colspan="4">Jumlah</th><th class="r">${rp(tb)}</th><th></th><th class="r">${rp(ts)}</th><th></th></tr></table>');
  return dokumenA4(b.toString(), _cssKeu);
}

// ───────────────────────── laporan kas ─────────────────────────

class LaporanKasScreen extends StatefulWidget {
  const LaporanKasScreen({super.key, required this.konteks});
  final Map<String, dynamic> konteks;

  @override
  State<LaporanKasScreen> createState() => _LaporanKasScreenState();
}

class _LaporanKasScreenState extends State<LaporanKasScreen> {
  DateTime _bulan = DateTime.now();
  String _sumber = '';
  String _akun = '';   // '' = buku kas umum; kode = buku pembantu akun; '-' = belum ditentukan
  Map<String, dynamic>? _d;

  @override
  Widget build(BuildContext context) {
    final sumber = daftar(widget.konteks['sumber']).map((e) => teks(e)).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Laporan Kas'), actions: [
        IconButton(tooltip: 'PDF', icon: const Icon(Icons.picture_as_pdf_outlined), onPressed: () => _d == null ? null : htmlKePdf(context, nama: 'Buku_Kas_${_awalBulan(_bulan).substring(0, 7)}.pdf', args: [_t, bukuKasHtml(_d!)])),
        IconButton(tooltip: 'Excel', icon: const Icon(Icons.grid_on_rounded), onPressed: () => _d == null ? null : bagikanExcel(context, bukuKasHtml(_d!, excel: true), 'Buku_Kas_${_awalBulan(_bulan).substring(0, 7)}.xls')),
      ]),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey('$_bulan|$_sumber|$_akun'),
        muat: () async {
          final d = peta(await Api.instance('waStafKeuLaporan', [_t, {'dari': _awalBulan(_bulan), 'sampai': _akhirBulan(_bulan), if (_sumber.isNotEmpty) 'sumber': _sumber, if (_akun.isNotEmpty) 'akun': _akun}]));
          _d = d;
          return d;
        },
        bangun: (context, d, segarkan) {
          final baris = daftar(d['baris']).map(peta).toList();
          final kat = daftar(d['perKategori']).map(peta).toList();
          return ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 32), children: [
            Row(children: [
              IconButton(onPressed: () => setState(() => _bulan = DateTime(_bulan.year, _bulan.month - 1)), icon: const Icon(Icons.chevron_left_rounded)),
              Expanded(child: Text(_namaBulan(_bulan), textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
              IconButton(onPressed: () => setState(() => _bulan = DateTime(_bulan.year, _bulan.month + 1)), icon: const Icon(Icons.chevron_right_rounded)),
            ]),
            Wrap(spacing: 6, children: [
              for (final s in ['', ...sumber]) ChoiceChip(label: Text(s.isEmpty ? 'Semua dana' : s), selected: _sumber == s, onSelected: (_) => setState(() => _sumber = s)),
            ]),
            const SizedBox(height: 6),
            Wrap(spacing: 6, runSpacing: 4, children: [
              ChoiceChip(label: const Text('Buku kas umum'), selected: _akun.isEmpty, onSelected: (_) => setState(() => _akun = '')),
              for (final a in daftar(widget.konteks['akun']).map(peta))
                ChoiceChip(
                  avatar: Icon(ikonAkun(teks(a['jenis'])), size: 16),
                  label: Text(teks(a['nama'])),
                  selected: _akun == (teks(a['kode']).isEmpty ? '-' : teks(a['kode'])),
                  onSelected: (_) => setState(() => _akun = teks(a['kode']).isEmpty ? '-' : teks(a['kode'])),
                ),
            ]),
            const SizedBox(height: 8),
            if (teks(d['namaAkun']).isNotEmpty) Text('Buku pembantu: ${teks(d['namaAkun'])} (termasuk mutasi masuk/keluar)', style: const TextStyle(fontWeight: FontWeight.w700)),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(children: [
                  _barisRingkas('Saldo awal', d['saldoAwal']),
                  _barisRingkas('Pemasukan', d['masuk'], warna: Colors.green),
                  _barisRingkas('Pengeluaran', d['keluar'], warna: Theme.of(context).colorScheme.error),
                  const Divider(),
                  _barisRingkas('Saldo akhir', d['saldoAkhir'], tebal: true),
                  if (angka(d['menunggu']) > 0) Text('${angka(d['menunggu'])} pengeluaran masih menunggu persetujuan (belum dihitung).', style: const TextStyle(fontSize: 12)),
                ]),
              ),
            ),
            if (teks(d['namaAkun']).isEmpty && daftar(d['perAkun']).isNotEmpty) ...[
              const JudulBagian('Posisi kas per akun'),
              Card(
                child: Column(children: [
                  for (final a in daftar(d['perAkun']).map(peta))
                    ListTile(
                      dense: true,
                      title: Text(teks(a['nama'])),
                      subtitle: Text('Awal ${rp(a['awal'])} · +${rp(a['masuk'])} −${rp(a['keluar'])}'
                          '${nilaiNum(a['mutasiMasuk']) + nilaiNum(a['mutasiKeluar']) != 0 ? ' · mutasi +${rp(a['mutasiMasuk'])} −${rp(a['mutasiKeluar'])}' : ''}'),
                      trailing: Text(rp(a['akhir']), style: const TextStyle(fontWeight: FontWeight.w800)),
                    ),
                ]),
              ),
            ],
            if (daftar(d['mutasi']).isNotEmpty) ...[
              const JudulBagian('Mutasi antar akun'),
              Card(
                child: Column(children: [
                  for (final m in daftar(d['mutasi']).map(peta))
                    ListTile(
                      dense: true,
                      leading: const Icon(Icons.swap_horiz_rounded),
                      title: Text('${teks(m['dari'])} → ${teks(m['ke'])}'),
                      subtitle: Text('${tglIndo(teks(m['tanggal']))} · ${teks(m['uraian'])}'),
                      trailing: Text(rp(m['jumlah']), style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                ]),
              ),
            ],
            if (kat.isNotEmpty) ...[
              const JudulBagian('Per kategori'),
              Card(child: Column(children: [for (final k in kat) ListTile(dense: true, title: Text(teks(k['nama'])), subtitle: Text(teks(k['jenis'])), trailing: Text(rp(k['jumlah']), style: const TextStyle(fontWeight: FontWeight.w700)))])),
            ],
            const JudulBagian('Buku kas'),
            if (baris.isEmpty) const Kosong(pesan: 'Tidak ada transaksi disetujui pada periode ini.'),
            if (baris.isNotEmpty)
              Card(
                child: Column(children: [
                  for (final b in baris)
                    ListTile(
                      dense: true,
                      title: Text(teks(b['uraian']), maxLines: 2, overflow: TextOverflow.ellipsis),
                      subtitle: Text('${tglIndo(teks(b['tanggal']))} · ${teks(b['kategori'])}${teks(b['sumber']).isEmpty ? '' : ' · ${teks(b['sumber'])}'}${teks(b['akun']).isEmpty ? '' : ' · ${teks(b['akun'])}'}'),
                      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text(nilaiNum(b['masuk']) > 0 ? '+${rp(b['masuk'])}' : '-${rp(b['keluar'])}', style: TextStyle(fontWeight: FontWeight.w700, color: nilaiNum(b['masuk']) > 0 ? Colors.green : Theme.of(context).colorScheme.error)),
                        Text(rp(b['saldo']), style: const TextStyle(fontSize: 11)),
                      ]),
                    ),
                ]),
              ),
          ]);
        },
      ),
    );
  }

  Widget _barisRingkas(String a, dynamic v, {Color? warna, bool tebal = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [
          Expanded(child: Text(a, style: TextStyle(fontWeight: tebal ? FontWeight.w800 : FontWeight.w500))),
          Text(rp(v), style: TextStyle(fontWeight: FontWeight.w800, color: warna, fontSize: tebal ? 17 : 14)),
        ]),
      );
}

String bukuKasHtml(Map<String, dynamic> d, {bool excel = false}) {
  final baris = daftar(d['baris']).map(peta).toList();
  final kat = daftar(d['perKategori']).map(peta).toList();
  final l = peta(d['lembaga']);
  final b = StringBuffer();
  if (!excel) b.write(_kopKeu(l));
  final namaAkun = teks(d['namaAkun']);
  b.write('<h2>${namaAkun.isEmpty ? 'BUKU KAS UMUM' : 'BUKU PEMBANTU ${escHtml(namaAkun.toUpperCase())}'}${teks(d['sumber']).isEmpty ? '' : ' · DANA ${escHtml(teks(d['sumber']).toUpperCase())}'}</h2>');
  b.write('<p>Periode ${escHtml(tglIndo(teks(d['dari'])))} s.d. ${escHtml(tglIndo(teks(d['sampai'])))}</p>');
  b.write('<table><tr><th>No</th><th>Tanggal</th><th>No. Bukti</th><th>Uraian</th><th>Kategori</th><th>Sumber</th><th>Akun</th><th>Masuk</th><th>Keluar</th><th>Saldo</th></tr>');
  b.write('<tr><td></td><td></td><td></td><td><i>Saldo awal</i></td><td></td><td></td><td></td><td></td><td></td><td class="r">${excel ? nilaiNum(d['saldoAwal']) : rp(d['saldoAwal'])}</td></tr>');
  var i = 0;
  String uang(dynamic v) => excel ? '${nilaiNum(v)}' : (nilaiNum(v) == 0 ? '' : rp(v));
  for (final x in baris) {
    i++;
    b.write('<tr><td class="c">$i</td><td>${escHtml(teks(x['tanggal']))}</td><td>${escHtml(teks(x['id']))}</td><td>${escHtml(teks(x['uraian']))}</td><td>${escHtml(teks(x['kategori']))}</td>'
        '<td>${escHtml(teks(x['sumber']))}</td><td>${escHtml(teks(x['akun']))}</td><td class="r">${uang(x['masuk'])}</td><td class="r">${uang(x['keluar'])}</td><td class="r">${excel ? nilaiNum(x['saldo']) : rp(x['saldo'])}</td></tr>');
  }
  b.write('<tr><th colspan="7">Jumlah</th><th class="r">${uang(d['masuk'])}</th><th class="r">${uang(d['keluar'])}</th><th class="r">${excel ? nilaiNum(d['saldoAkhir']) : rp(d['saldoAkhir'])}</th></tr></table>');
  final perAkun = daftar(d['perAkun']).map(peta).toList();
  if (namaAkun.isEmpty && perAkun.isNotEmpty) {
    b.write('<h2 style="font-size:11pt;text-align:left;margin-top:14px">Posisi kas per akun</h2><table><tr><th>Akun</th><th>Saldo awal</th><th>Masuk</th><th>Keluar</th><th>Mutasi masuk</th><th>Mutasi keluar</th><th>Saldo akhir</th></tr>');
    for (final a in perAkun) {
      b.write('<tr><td>${escHtml(teks(a['nama']))}</td><td class="r">${uang(a['awal'])}</td><td class="r">${uang(a['masuk'])}</td><td class="r">${uang(a['keluar'])}</td>'
          '<td class="r">${uang(a['mutasiMasuk'])}</td><td class="r">${uang(a['mutasiKeluar'])}</td><td class="r">${excel ? nilaiNum(a['akhir']) : rp(a['akhir'])}</td></tr>');
    }
    b.write('</table>');
  }
  final mutasi = daftar(d['mutasi']).map(peta).toList();
  if (mutasi.isNotEmpty) {
    b.write('<h2 style="font-size:11pt;text-align:left;margin-top:14px">Mutasi antar akun</h2><table><tr><th>Tanggal</th><th>No. Bukti</th><th>Dari</th><th>Ke</th><th>Uraian</th><th>Jumlah</th></tr>');
    for (final m in mutasi) {
      b.write('<tr><td>${escHtml(teks(m['tanggal']))}</td><td>${escHtml(teks(m['id']))}</td><td>${escHtml(teks(m['dari']))}</td><td>${escHtml(teks(m['ke']))}</td><td>${escHtml(teks(m['uraian']))}</td><td class="r">${uang(m['jumlah'])}</td></tr>');
    }
    b.write('</table>');
  }
  if (kat.isNotEmpty) {
    b.write('<h2 style="font-size:11pt;text-align:left;margin-top:14px">Rekap per kategori</h2><table><tr><th>Kode</th><th>Kategori</th><th>Jenis</th><th>Jumlah</th></tr>');
    for (final k in kat) {
      b.write('<tr><td>${escHtml(teks(k['kode']))}</td><td>${escHtml(teks(k['nama']))}</td><td>${escHtml(teks(k['jenis']))}</td><td class="r">${uang(k['jumlah'])}</td></tr>');
    }
    b.write('</table>');
  }
  if (excel) return '<html><head><meta charset="utf-8"></head><body>$b</body></html>';
  b.write('<table class="ttd"><tr><td>Mengetahui,<br>Ketua Yayasan<br><br><br><br>(..............................)</td><td>${tanggalIni()}<br>Bendahara<br><br><br><br>(..............................)</td></tr></table>');
  return dokumenA4(b.toString(), _cssKeu, lanskap: true);
}

// ───────────────────────── kategori ─────────────────────────

class KategoriKeuScreen extends StatefulWidget {
  const KategoriKeuScreen({super.key, required this.konteks});
  final Map<String, dynamic> konteks;

  @override
  State<KategoriKeuScreen> createState() => _KategoriKeuScreenState();
}

class _KategoriKeuScreenState extends State<KategoriKeuScreen> {
  int _v = 0;

  Future<void> _ubah([Map<String, dynamic>? k]) async {
    final kode = TextEditingController(text: teks(k?['kode']));
    final nama = TextEditingController(text: teks(k?['nama']));
    var jenis = teks(k?['jenis'], 'Pengeluaran');
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, setD) => AlertDialog(
          title: Text(k == null ? 'Kategori baru' : 'Ubah kategori'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: kode, enabled: k == null, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Kode (mis. ATK)')),
            TextField(controller: nama, decoration: const InputDecoration(labelText: 'Nama kategori')),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'Pemasukan', label: Text('Masuk')), ButtonSegment(value: 'Pengeluaran', label: Text('Keluar'))],
              selected: {jenis},
              onSelectionChanged: (s) => setD(() => jenis = s.first),
            ),
          ]),
          actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')), FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Simpan'))],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafKeuKategoriSimpan', [_t, {'kode': kode.text, 'nama': nama.text, 'jenis': jenis}]), teksProses: 'Menyimpan...');
    if (r.ok && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Kategori Keuangan')),
      floatingActionButton: FloatingActionButton(heroTag: 'katBaru', onPressed: () => _ubah(), child: const Icon(Icons.add_rounded)),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_v),
        muat: () async => peta(await Api.instance('waStafKeuKonteks', [_t])),
        bangun: (context, d, _) {
          final kat = daftar(d['kategori']).map(peta).toList();
          return ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 90), children: [
            for (final j in ['Pemasukan', 'Pengeluaran']) ...[
              JudulBagian(j),
              Card(
                child: Column(children: [
                  for (final k in kat.where((k) => teks(k['jenis']) == j))
                    ListTile(
                      dense: true,
                      leading: CircleAvatar(radius: 18, child: Text(teks(k['kode']), style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800))),
                      title: Text(teks(k['nama'])),
                      trailing: teks(k['kode']) == 'HON' ? const Text('otomatis', style: TextStyle(fontSize: 11)) : const Icon(Icons.edit_outlined, size: 18),
                      onTap: teks(k['kode']) == 'HON' ? null : () => _ubah(k),
                    ),
                ]),
              ),
            ],
          ]);
        },
      ),
    );
  }
}

// ───────────────────────── akun kas & mutasi (v1.45.0) ─────────────────────────

IconData ikonAkun(String jenis) => switch (jenis) {
      'Tunai' => Icons.payments_rounded,
      'Bank' => Icons.account_balance_rounded,
      'Gateway' => Icons.qr_code_2_rounded,
      _ => Icons.help_outline_rounded,
    };

/// Pilih akun kas (tempat uang) dari daftar akun aktif. null = batal.
Future<String?> pilihAkunKas(BuildContext context, List<Map<String, dynamic>> akun, {String judul = 'Akun kas', String? awal}) {
  final aktif = akun.where((a) => a['aktif'] != false && teks(a['kode']).isNotEmpty).toList();
  return showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (c) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 6), child: Text(judul, style: const TextStyle(fontWeight: FontWeight.w800))),
        for (final a in aktif)
          ListTile(
            leading: Icon(ikonAkun(teks(a['jenis']))),
            title: Text(teks(a['nama'])),
            subtitle: Text([teks(a['jenis']), teks(a['ket'])].where((x) => x.isNotEmpty).join(' · ')),
            trailing: teks(a['kode']) == awal ? const Icon(Icons.check_rounded) : null,
            onTap: () => Navigator.pop(c, teks(a['kode'])),
          ),
        const SizedBox(height: 8),
      ]),
    ),
  );
}

class AkunKasScreen extends StatefulWidget {
  const AkunKasScreen({super.key, required this.konteks});
  final Map<String, dynamic> konteks;

  @override
  State<AkunKasScreen> createState() => _AkunKasScreenState();
}

class _AkunKasScreenState extends State<AkunKasScreen> {
  int _v = 0;
  bool get _catat => peta(widget.konteks['peran'])['catat'] == true;

  Future<void> _ubah([Map<String, dynamic>? a]) async {
    final kode = TextEditingController(text: teks(a?['kode']));
    final nama = TextEditingController(text: teks(a?['nama']));
    final ket = TextEditingController(text: teks(a?['ket']));
    var jenis = teks(a?['jenis'], 'Bank');
    var aktif = a?['aktif'] != false;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, atur) => AlertDialog(
          title: Text(a == null ? 'Akun kas baru' : 'Ubah akun kas'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: kode, enabled: a == null, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Kode (mis. BJB, BRI, DOKU)')),
              TextField(controller: nama, decoration: const InputDecoration(labelText: 'Nama (mis. Bank BJB a.n. PKBM)')),
              TextField(controller: ket, decoration: const InputDecoration(labelText: 'Keterangan (no. rekening, dsb.)')),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: const [ButtonSegment(value: 'Tunai', label: Text('Tunai')), ButtonSegment(value: 'Bank', label: Text('Bank')), ButtonSegment(value: 'Gateway', label: Text('Gateway'))],
                selected: {jenis},
                onSelectionChanged: (s) => atur(() => jenis = s.first),
              ),
              SwitchListTile(contentPadding: EdgeInsets.zero, value: aktif, onChanged: (v) => atur(() => aktif = v), title: const Text('Aktif')),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Simpan')),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafKeuAkunSimpan', [_t, {'kode': kode.text, 'nama': nama.text, 'jenis': jenis, 'ket': ket.text, 'aktif': aktif}]), teksProses: 'Menyimpan...');
    if (r.ok && mounted) setState(() => _v++);
  }

  Future<void> _mutasi(List<Map<String, dynamic>> akun) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => FormMutasi(akun: akun)));
    if (ok == true && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Akun Kas & Mutasi'), actions: [
        if (_catat) IconButton(tooltip: 'Akun baru', icon: const Icon(Icons.add_card_rounded), onPressed: () => _ubah()),
      ]),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_v),
        muat: () async => peta(await Api.instance('waStafKeuAkun', [_t])),
        bangun: (context, d, segarkan) {
          final akun = daftar(d['akun']).map(peta).toList();
          final total = akun.fold<num>(0, (s, a) => s + nilaiNum(a['saldo']));
          return RefreshIndicator(
            onRefresh: segarkan,
            child: ListView(padding: const EdgeInsets.fromLTRB(12, 8, 12, 32), children: [
              Card(
                child: ListTile(
                  leading: const Icon(Icons.savings_rounded),
                  title: Text('Total kas ${rp(total)}', style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: const Text('Posisi uang per tempat penyimpanan (transaksi disetujui).'),
                ),
              ),
              for (final a in akun)
                Card(
                  child: ListTile(
                    onTap: _catat && teks(a['kode']).isNotEmpty ? () => _ubah(a) : null,
                    leading: Icon(ikonAkun(teks(a['jenis'])), color: a['aktif'] == false ? Colors.grey : null),
                    title: Text('${teks(a['nama'])}${a['aktif'] == false ? ' (nonaktif)' : ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text([teks(a['kode']), teks(a['jenis']), teks(a['ket'])].where((x) => x.isNotEmpty).join(' · ')),
                    trailing: Text(rp(a['saldo']), style: TextStyle(fontWeight: FontWeight.w800, color: nilaiNum(a['saldo']) < 0 ? Theme.of(context).colorScheme.error : null)),
                  ),
                ),
              const SizedBox(height: 8),
              if (_catat)
                FilledButton.icon(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  onPressed: () => _mutasi(akun),
                  icon: const Icon(Icons.swap_horiz_rounded),
                  label: const Text('Catat mutasi antar akun'),
                ),
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text('Mutasi = memindah uang antar tempat (mis. pencairan saldo gateway ke bank, setor tunai ke bank). '
                    'Tidak dihitung sebagai pemasukan/pengeluaran dan tidak mengubah saldo sumber dana.', style: TextStyle(fontSize: 12)),
              ),
            ]),
          );
        },
      ),
    );
  }
}

class FormMutasi extends StatefulWidget {
  const FormMutasi({super.key, required this.akun});
  final List<Map<String, dynamic>> akun;

  @override
  State<FormMutasi> createState() => _FormMutasiState();
}

class _FormMutasiState extends State<FormMutasi> {
  String? _dari, _ke;
  String _tgl = tglIso(DateTime.now());
  final _jumlah = TextEditingController();
  final _uraian = TextEditingController();
  String? _bukti;

  @override
  void dispose() {
    _jumlah.dispose();
    _uraian.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final aktif = widget.akun.where((a) => a['aktif'] != false && teks(a['kode']).isNotEmpty).toList();
    DropdownMenuItem<String> item(Map<String, dynamic> a) =>
        DropdownMenuItem(value: teks(a['kode']), child: Text('${teks(a['nama'])} (${rp(a['saldo'])})', overflow: TextOverflow.ellipsis));
    return Scaffold(
      appBar: AppBar(title: const Text('Mutasi antar akun')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        DropdownButtonFormField<String>(isExpanded: true, initialValue: _dari, decoration: const InputDecoration(labelText: 'Dari akun'), items: [for (final a in aktif) item(a)], onChanged: (v) => setState(() => _dari = v)),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(isExpanded: true, initialValue: _ke, decoration: const InputDecoration(labelText: 'Ke akun'), items: [for (final a in aktif) item(a)], onChanged: (v) => setState(() => _ke = v)),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () async {
            final n = DateTime.now();
            final p = await showDatePicker(context: context, firstDate: DateTime(n.year - 2), lastDate: n, initialDate: DateTime.tryParse(_tgl) ?? n);
            if (p != null) setState(() => _tgl = tglIso(p));
          },
          icon: const Icon(Icons.event_rounded),
          label: Text(tglIndo(_tgl)),
        ),
        const SizedBox(height: 12),
        TextField(controller: _jumlah, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Jumlah (Rp)', prefixText: 'Rp ')),
        const SizedBox(height: 12),
        TextField(controller: _uraian, decoration: const InputDecoration(labelText: 'Uraian (opsional)', hintText: 'mis. Pencairan saldo DOKU ke rekening BJB')),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () async {
            final f = await ambilFoto(bolehGaleri: true, context: context);
            if (f != null) setState(() => _bukti = f);
          },
          icon: Icon(_bukti == null ? Icons.add_a_photo_outlined : Icons.check_circle_rounded),
          label: Text(_bukti == null ? 'Bukti mutasi / slip (opsional)' : 'Bukti terlampir — ganti'),
        ),
        const SizedBox(height: 20),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          onPressed: () async {
            if (_dari == null || _ke == null) return kabar(context, 'Pilih akun asal dan tujuan.', galat: true);
            final r = await jalankanSaldo(context, (paksa) => Api.instance('waStafKeuMutasi', [
                  _t,
                  {'tanggal': _tgl, 'dari': _dari, 'ke': _ke, 'jumlah': _angka(_jumlah.text), 'uraian': _uraian.text, if (_bukti != null) 'bukti': _bukti, 'paksa': paksa}
                ], const Duration(minutes: 2)), teksProses: 'Menyimpan mutasi...');
            if (r.ok && context.mounted) {
              kabar(context, 'Mutasi tercatat.');
              Navigator.pop(context, true);
            }
          },
          child: const Text('Simpan mutasi'),
        ),
      ]),
    );
  }
}
