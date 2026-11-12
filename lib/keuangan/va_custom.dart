import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../berkas.dart';
import '../honor/honor.dart' show rp;
import '../session.dart';
import '../widgets.dart';
import 'bayar_online.dart';
import 'kwitansi.dart';

String? get _t => Sesi.instance.token;

int _angka(String s) => int.tryParse(s.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;

Color _warna(BuildContext c, String s) => switch (s) {
      'Lunas' => Colors.green,
      'Menunggu' || 'Sebagian' => const Color(0xFFE9A23B),
      'Kedaluwarsa' => Theme.of(c).colorScheme.error,
      _ => Theme.of(c).colorScheme.outline,
    };

/// v1.68.0: VA custom = tagihan sekali bayar dengan nominal bebas dan kode transaksi yang sudah ada.
/// Pembayar siswa: tampil di Tagihan Saya. Pembayar umum: QR halaman bayar di layar / gambar instruksi; link WA hanya cadangan.
class VaCustomScreen extends StatefulWidget {
  const VaCustomScreen({super.key});

  @override
  State<VaCustomScreen> createState() => _VaCustomScreenState();
}

class _VaCustomScreenState extends State<VaCustomScreen> {
  int _v = 0;
  String _tab = 'belum';
  String _cari = '';
  Map<String, dynamic> _d = const {};

  void _segar() => setState(() => _v++);

  Future<void> _buat() async {
    final r = await Navigator.of(context).push<Map<String, dynamic>>(MaterialPageRoute(builder: (_) => FormVaCustom(data: _d)));
    if (r == null || !mounted) return;
    _segar();
    if (r['siswa'] == true) {
      kabar(context, 'VA custom dibuat dan tampil di Tagihan Saya siswa.');
    } else if (_d['online'] == true) {
      await _bayar({'id': r['id'], 'siswa': false, 'pokok': r['pokok'], 'sisa': r['pokok'], 'keterangan': r['keterangan']});
      _segar();
    }
  }

  Future<void> _bayar(Map<String, dynamic> x) async {
    if (_d['online'] != true) {
      kabar(context, 'Pembayaran online DOKU belum diaktifkan Admin.', galat: true);
      return;
    }
    final metode = daftar(_d['metode']).map(peta).toList();
    final pokok = _nilai(x['siswa'] == true ? x['sisa'] : x['pokok']);
    final kode = await pilihMetodeBayar(context, pokok: pokok, metode: metode, judul: 'Metode yang dipilih pembayar');
    if (kode == null || !mounted) return;
    final h = await jalankan(context, () async => peta(await Api.instance('waStafVaCustomBayar', [_t, {'id': teks(x['id']), 'metode': kode}], const Duration(minutes: 2))),
        teksProses: 'Menyiapkan halaman bayar...');
    if (!h.ok || !mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => LayarBayarVa(order: h.data!)));
  }

  Future<void> _batal(Map<String, dynamic> x) async {
    if (!await konfirmasi(context, 'Batalkan VA?', '${teks(x['keterangan'])}\n\n${x['siswa'] == true ? 'Tagihan ini akan hilang dari Tagihan Saya siswa.' : 'Halaman bayar tidak lagi dicatat sebagai VA custom ini.'}',
        ya: 'Batalkan')) {
      return;
    }
    if (!mounted) return;
    final h = await jalankan(context, () => Api.instance('waStafVaCustomBatal', [_t, teks(x['id'])]));
    if (h.ok && mounted) {
      kabar(context, 'VA custom dibatalkan.');
      _segar();
    }
  }

  Future<void> _cek(Map<String, dynamic> x) async {
    final h = await jalankan(context, () async => peta(await Api.instance('waStafVaCustomCek', [_t, teks(x['invoice'])], const Duration(minutes: 1))), teksProses: 'Memeriksa...');
    if (!h.ok || !mounted) return;
    kabar(context, 'Status: ${teks(h.data!['status'], 'Menunggu')}');
    _segar();
  }

  void _detail(Map<String, dynamic> x) {
    final st = teks(x['status']);
    final belum = st == 'Menunggu' || st == 'Sebagian' || st == 'Kedaluwarsa';
    final siswa = x['siswa'] == true;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
          Text(teks(x['keterangan']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 6),
          Align(alignment: Alignment.centerLeft, child: Lencana(st, warna: _warna(context, st))),
          const SizedBox(height: 10),
          _Baris('Kode transaksi', '${teks(x['kategori'])} · ${teks(x['namaKategori'])}'),
          _Baris('Pembayar', '${teks(x['pembayar'])}${siswa ? ' (siswa${teks(x['rombel']).isEmpty ? '' : ', ${teks(x['rombel'])}'})' : ' (umum)'}'),
          if (teks(x['hp']).isNotEmpty) _Baris('No. HP', teks(x['hp'])),
          _Baris('Nominal', '${rp(x['pokok'])} + biaya admin sesuai metode'),
          if (siswa && _nilai(x['dibayar']) > 0) _Baris('Sudah dibayar', rp(x['dibayar'])),
          if (teks(x['invoice']).isNotEmpty) _Baris('Invoice terakhir', '${teks(x['invoice'])}${teks(x['kadaluarsa']).isEmpty ? '' : ' · berlaku s.d. ${teks(x['kadaluarsa'])}'}'),
          if (teks(x['dibayarPada']).isNotEmpty) _Baris('Dibayar', teks(x['dibayarPada'])),
          _Baris('Dibuat', '${teks(x['dibuatPada'])} · ${teks(x['oleh'])}'),
          if (siswa && belum)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('Tagihan ini tampil di menu Tagihan Saya milik siswa dan bisa dibayar dari aplikasinya.',
                  style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant)),
            ),
          const SizedBox(height: 14),
          if (st == 'Lunas' && teks(x['idTransaksi']).isNotEmpty)
            FilledButton.icon(
              onPressed: () {
                Navigator.pop(c);
                cetakKwitansi(context, [teks(x['idTransaksi']).split(',').first]);
              },
              icon: const Icon(Icons.receipt_outlined),
              label: const Text('Cetak kwitansi'),
            ),
          if (belum)
            FilledButton.icon(
              onPressed: () {
                Navigator.pop(c);
                _bayar(x).then((_) { if (mounted) _segar(); });
              },
              icon: const Icon(Icons.qr_code_2_rounded),
              label: Text(siswa ? 'Tampilkan QR bayar di layar' : 'Tampilkan QR bayar'),
            ),
          if (belum && !siswa && teks(x['invoice']).isNotEmpty)
            OutlinedButton.icon(
              onPressed: () {
                Navigator.pop(c);
                _cek(x);
              },
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Cek status pembayaran'),
            ),
          if (belum && _nilai(x['dibayar']) <= 0)
            TextButton.icon(
              onPressed: () {
                Navigator.pop(c);
                _batal(x);
              },
              icon: const Icon(Icons.cancel_outlined),
              label: const Text('Batalkan VA'),
            ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(onPressed: _d.isEmpty ? null : _buat, icon: const Icon(Icons.add_rounded), label: const Text('Buat VA')),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_v),
        muat: () async => peta(await Api.instance('waStafVaCustomDaftar', [_t], const Duration(seconds: 120))),
        bangun: (context, d, segarkan) {
          if (!identical(_d, d)) WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted && !identical(_d, d)) setState(() => _d = d);
            });
          final semua = daftar(d['data']).map(peta).toList();
          final q = _cari.toLowerCase();
          bool cocok(Map<String, dynamic> x) => q.isEmpty || '${teks(x['keterangan'])} ${teks(x['pembayar'])} ${teks(x['kategori'])}'.toLowerCase().contains(q);
          final belum = semua.where((x) => ['Menunggu', 'Sebagian', 'Kedaluwarsa'].contains(teks(x['status']))).toList();
          final lunas = semua.where((x) => teks(x['status']) == 'Lunas').toList();
          final batal = semua.where((x) => teks(x['status']) == 'Dibatalkan').toList();
          final tampil = (_tab == 'lunas' ? lunas : _tab == 'batal' ? batal : belum).where(cocok).toList();
          return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 96), children: [
            Card(
              color: Theme.of(context).colorScheme.primaryContainer,
              child: const Padding(
                padding: EdgeInsets.all(14),
                child: Text('Tagihan sekali bayar dengan nominal bebas. Pilih kode transaksi yang sudah ada; biaya admin metode bayar ditanggung pembayar '
                    'dan lembaga menerima nominal utuh.\n\nSiswa membayar dari Tagihan Saya. Pembayar umum memindai QR di layar atau menerima gambar instruksi bayar.'),
              ),
            ),
            if (d['online'] != true)
              Card(
                color: Theme.of(context).colorScheme.errorContainer,
                child: const Padding(padding: EdgeInsets.all(12), child: Text('Pembayaran online DOKU belum diaktifkan Admin. VA untuk siswa tetap bisa dibayar lewat transfer di Tagihan Saya.')),
              ),
            const SizedBox(height: 8),
            TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari keterangan atau pembayar', isDense: true),
              onChanged: (v) => setState(() => _cari = v.trim()),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: SegmentedButton<String>(
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: 'belum', label: Text('Belum lunas (${belum.length})')),
                  ButtonSegment(value: 'lunas', label: Text('Lunas (${lunas.length})')),
                  ButtonSegment(value: 'batal', label: Text('Batal (${batal.length})')),
                ],
                selected: {_tab},
                onSelectionChanged: (v) => setState(() => _tab = v.first),
              ),
            ),
            if (tampil.isEmpty) const Kosong(pesan: 'Belum ada VA custom di sini.', ikon: Icons.request_quote_outlined),
            for (final x in tampil)
              Card(
                child: ListTile(
                  leading: Icon(x['siswa'] == true ? Icons.school_outlined : Icons.person_outline_rounded),
                  title: Text(teks(x['keterangan']), maxLines: 2, overflow: TextOverflow.ellipsis),
                  subtitle: Text('${x['siswa'] == true ? 'Siswa' : 'Umum'} · ${teks(x['kategori'])} · ${teks(x['dibuatPada']).split(' ').first}'),
                  trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text(rp(x['pokok']), style: const TextStyle(fontWeight: FontWeight.w800)),
                    Text(teks(x['status']), style: TextStyle(fontSize: 12, color: _warna(context, teks(x['status'])), fontWeight: FontWeight.w700)),
                  ]),
                  onTap: () => _detail(x),
                ),
              ),
          ]);
        },
      ),
    );
  }
}

num _nilai(dynamic v) => v is num ? v : num.tryParse('$v') ?? 0;

class _Baris extends StatelessWidget {
  const _Baris(this.label, this.isi);
  final String label;
  final String isi;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 118, child: Text(label, style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant))),
          Expanded(child: Text(isi, style: const TextStyle(fontSize: 13.5))),
        ]),
      );
}

// ───────────────────────── form ─────────────────────────

class FormVaCustom extends StatefulWidget {
  const FormVaCustom({super.key, required this.data});
  final Map<String, dynamic> data;

  @override
  State<FormVaCustom> createState() => _FormVaCustomState();
}

class _FormVaCustomState extends State<FormVaCustom> {
  final _nama = TextEditingController();
  final _hp = TextEditingController();
  final _pokok = TextEditingController();
  final _catatan = TextEditingController();
  String? _kategori;
  bool _siswa = true;
  Map<String, dynamic>? _wb;

  @override
  void dispose() {
    _nama.dispose();
    _hp.dispose();
    _pokok.dispose();
    _catatan.dispose();
    super.dispose();
  }

  String get _namaPembayar => _siswa ? teks(_wb?['nama']) : _nama.text.trim().replaceAll(RegExp(r'\s+'), ' ');

  // Sama dengan vcKeterangan_ di server.
  String get _keterangan {
    final kat = daftar(widget.data['kategori']).map(peta).where((k) => teks(k['kode']) == _kategori).firstOrNull;
    if (kat == null) return '';
    final n = teks(kat['nama']).trim();
    final depan = RegExp(r'^(pembayaran|biaya|iuran|uang|sumbangan|infaq|donasi)\b', caseSensitive: false).hasMatch(n) ? n : 'Pembayaran $n';
    final c = _catatan.text.trim();
    final nm = _namaPembayar;
    return '$depan atas nama ${nm.isEmpty ? '…' : nm}${c.isEmpty ? '' : ' - $c'}';
  }

  // Contoh total dengan metode VA pertama (biaya admin ditanggung pembayar).
  String _contoh() {
    final pokok = _angka(_pokok.text);
    if (pokok <= 0) return 'Keterangan otomatis';
    final metode = daftar(widget.data['metode']).map(peta).toList();
    final va = metode.where((m) => teks(m['grup']) == 'Virtual Account').firstOrNull ?? metode.firstOrNull;
    if (va == null) return rp(pokok);
    final h = hitungTotalBayar(pokok, va);
    return '${rp(pokok)} · contoh ${teks(va['nama'])}: + biaya admin ${rp(h.biaya)} = ${rp(h.total)}';
  }

  Future<void> _pilihSiswa() async {
    final wb = daftar(widget.data['wb']).map(peta).toList();
    var cari = '';
    final hasil = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, atur) {
          final tampil = wb.where((w) => cari.isEmpty || '${teks(w['nama'])} ${teks(w['rombel'])}'.toLowerCase().contains(cari)).take(200).toList();
          return AlertDialog(
            title: const Text('Pilih siswa'),
            content: SizedBox(
              width: 420,
              height: 460,
              child: Column(children: [
                TextField(
                  autofocus: true,
                  decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari nama atau rombel', isDense: true),
                  onChanged: (v) => atur(() => cari = v.trim().toLowerCase()),
                ),
                Expanded(
                  child: ListView(children: [
                    for (final w in tampil) ListTile(dense: true, title: Text(teks(w['nama'])), subtitle: Text(teks(w['rombel'])), onTap: () => Navigator.pop(c, w)),
                  ]),
                ),
              ]),
            ),
            actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Batal'))],
          );
        },
      ),
    );
    if (hasil != null && mounted) setState(() => _wb = hasil);
  }

  Future<void> _simpan() async {
    if (_kategori == null) {
      kabar(context, 'Pilih kode transaksi.', galat: true);
      return;
    }
    if (_siswa && _wb == null) {
      kabar(context, 'Pilih siswa pembayar.', galat: true);
      return;
    }
    if (!_siswa && _namaPembayar.length < 3) {
      kabar(context, 'Isi nama pembayar.', galat: true);
      return;
    }
    final pokok = _angka(_pokok.text);
    if (pokok < 1000) {
      kabar(context, 'Nominal minimal Rp1.000.', galat: true);
      return;
    }
    if (!await konfirmasi(context, 'Buat VA ${rp(pokok)}?',
        '$_keterangan\n\n${_siswa ? 'Tagihan akan tampil di Tagihan Saya siswa dan siswa menerima notifikasi.' : 'Setelah dibuat, pilih metode yang diinginkan pembayar lalu tunjukkan QR bayar.'}\nBiaya admin metode bayar ditanggung pembayar.',
        ya: 'Buat')) {
      return;
    }
    if (!mounted) return;
    final h = await jalankan(context, () async => peta(await Api.instance('waStafVaCustomBuat', [
          _t,
          {'kategori': _kategori, if (_siswa) 'idWb': teks(_wb!['id']) else ...{'nama': _namaPembayar, 'hp': _hp.text.trim()}, 'pokok': pokok, 'catatan': _catatan.text.trim()}
        ])), teksProses: 'Membuat VA...');
    if (h.ok && mounted) Navigator.pop(context, {...h.data!, 'pokok': pokok});
  }

  @override
  Widget build(BuildContext context) {
    final kat = daftar(widget.data['kategori']).map(peta).toList();
    return Scaffold(
      appBar: AppBar(title: const Text('Buat VA custom')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: _kategori,
          decoration: const InputDecoration(labelText: 'Kode transaksi', helperText: 'Dari kategori pemasukan yang sudah ada'),
          items: [for (final k in kat) DropdownMenuItem(value: teks(k['kode']), child: Text('${teks(k['kode'])} · ${teks(k['nama'])}', overflow: TextOverflow.ellipsis))],
          onChanged: (v) => setState(() => _kategori = v),
        ),
        const SizedBox(height: 14),
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: true, label: Text('Siswa'), icon: Icon(Icons.school_outlined)),
            ButtonSegment(value: false, label: Text('Umum'), icon: Icon(Icons.person_outline_rounded)),
          ],
          selected: {_siswa},
          onSelectionChanged: (v) => setState(() => _siswa = v.first),
        ),
        const SizedBox(height: 12),
        if (_siswa)
          OutlinedButton.icon(
            onPressed: _pilihSiswa,
            icon: const Icon(Icons.person_search_rounded),
            label: Text(_wb == null ? 'Pilih siswa' : '${teks(_wb!['nama'])} · ${teks(_wb!['rombel'])}'),
          )
        else ...[
          TextField(controller: _nama, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nama pembayar', hintText: 'mis. orang tua / calon siswa'), onChanged: (_) => setState(() {})),
          const SizedBox(height: 12),
          TextField(controller: _hp, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'No. HP / WA (opsional, untuk cadangan)')),
        ],
        const SizedBox(height: 12),
        TextField(
          controller: _pokok,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Nominal', prefixText: 'Rp ', helperText: 'Biaya admin ditambahkan sesuai metode yang dipilih pembayar'),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        TextField(controller: _catatan, maxLength: 80, decoration: const InputDecoration(labelText: 'Catatan tambahan (opsional)', hintText: 'mis. gelombang 2'), onChanged: (_) => setState(() {})),
        if (_kategori != null) ...[
          const SizedBox(height: 4),
          Card(
            child: ListTile(
              leading: const Icon(Icons.description_outlined),
              title: Text(_keterangan),
              subtitle: Text(_contoh()),
            ),
          ),
        ],
        const SizedBox(height: 16),
        FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: _simpan, child: const Text('Buat VA')),
      ]),
    );
  }
}

// ───────────────────────── layar QR bayar ─────────────────────────

/// QR halaman bayar DOKU untuk dipindai pembayar, gambar instruksi bayar, dan link WA sebagai cadangan.
class LayarBayarVa extends StatefulWidget {
  const LayarBayarVa({super.key, required this.order});
  final Map<String, dynamic> order;

  @override
  State<LayarBayarVa> createState() => _LayarBayarVaState();
}

class _LayarBayarVaState extends State<LayarBayarVa> {
  Timer? _timer;
  String _status = 'Menunggu';
  bool _sibuk = false;

  Map<String, dynamic> get o => widget.order;
  String get _url => teks(o['url']);

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 8), (_) => _cek(diam: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<String> _status0() async => teks(peta(await Api.instance('waStafVaCustomCek', [_t, teks(o['invoice'])], const Duration(minutes: 1)))['status'], 'Menunggu');

  Future<void> _cek({bool diam = false}) async {
    if (_sibuk || _status == 'Lunas') return;
    _sibuk = true;
    try {
      final st = await _status0();
      if (!mounted) return;
      setState(() => _status = st);
      if (st == 'Lunas') {
        _timer?.cancel();
        kabar(context, 'Pembayaran diterima dan sudah tercatat di Arus Keuangan.');
      } else if (!diam) {
        kabar(context, 'Status: $st');
      }
    } catch (_) {
      if (!diam && mounted) kabar(context, 'Belum bisa memeriksa status. Coba lagi.', galat: true);
    } finally {
      _sibuk = false;
    }
  }

  String get _pesanWa => 'Yth. ${teks(o['nama'])}, berikut pembayaran ${teks(o['tagihan'])} di ${teks(o['lembaga'], 'PKBM')}:\n'
      '${teks(o['metode'])}: ${rp(o['pokok'])} + biaya admin ${rp(o['biaya'])} = ${rp(o['jumlah'])}\n$_url\n'
      '${teks(o['kadaluarsa']).isEmpty ? '' : 'Berlaku sampai ${teks(o['kadaluarsa'])}. '}Terima kasih.';

  Future<Uint8List> _pngInstruksi() async {
    const lebar = 720.0, pad = 36.0, sisi = 440.0;
    TextPainter tp(String s, double ukuran, {FontWeight w = FontWeight.w500, Color warna = Colors.black87}) => TextPainter(
          text: TextSpan(text: s, style: TextStyle(color: warna, fontSize: ukuran, fontWeight: w, height: 1.3)),
          textAlign: TextAlign.center,
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: lebar - 2 * pad);
    final atas = [
      tp(teks(o['lembaga'], 'PKBM'), 26, w: FontWeight.w800),
      tp(teks(o['tagihan']), 24, w: FontWeight.w700),
    ];
    final bawah = [
      tp('${teks(o['metode'])}\n${rp(o['pokok'])} + biaya admin ${rp(o['biaya'])}', 22),
      tp('Total ${rp(o['jumlah'])}', 34, w: FontWeight.w800, warna: const Color(0xFF1B5E20)),
      tp('Pindai QR dengan kamera HP untuk membuka halaman pembayaran.${teks(o['kadaluarsa']).isEmpty ? '' : '\nBerlaku sampai ${teks(o['kadaluarsa'])}.'}\nInvoice ${teks(o['invoice'])}', 18, warna: Colors.black54),
    ];
    var tinggi = pad;
    for (final t in atas) {
      tinggi += t.height + 8;
    }
    tinggi += 12 + sisi + 20;
    for (final t in bawah) {
      tinggi += t.height + 10;
    }
    tinggi += pad;
    final rec = ui.PictureRecorder();
    final c = Canvas(rec);
    c.drawRect(Rect.fromLTWH(0, 0, lebar, tinggi), Paint()..color = Colors.white);
    var y = pad;
    for (final t in atas) {
      t.paint(c, Offset((lebar - t.width) / 2, y));
      y += t.height + 8;
    }
    y += 12;
    c.save();
    c.translate((lebar - sisi) / 2, y);
    QrPainter(data: _url, version: QrVersions.auto, gapless: true).paint(c, const Size(sisi, sisi));
    c.restore();
    y += sisi + 20;
    for (final t in bawah) {
      t.paint(c, Offset((lebar - t.width) / 2, y));
      y += t.height + 10;
    }
    final img = await rec.endRecording().toImage(lebar.round(), tinggi.round());
    final b = await img.toByteData(format: ui.ImageByteFormat.png);
    return b!.buffer.asUint8List();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    var hp = teks(o['hp']).replaceAll(RegExp(r'[^0-9]'), '');
    if (hp.startsWith('0')) hp = '62${hp.substring(1)}';
    final lunas = _status == 'Lunas';
    return Scaffold(
      appBar: AppBar(title: const Text('QR bayar'), actions: [
        if (!lunas) TextButton.icon(onPressed: () => _cek(), icon: const Icon(Icons.refresh_rounded), label: const Text('Cek status')),
      ]),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
        Card(
          color: Colors.white,
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(children: [
              Text(teks(o['tagihan']), textAlign: TextAlign.center, style: const TextStyle(color: Colors.black87, fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 12),
              if (lunas)
                const SizedBox(
                  width: 240,
                  height: 240,
                  child: Center(
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.check_circle_rounded, size: 84, color: Colors.green),
                      SizedBox(height: 8),
                      Text('LUNAS', style: TextStyle(color: Colors.green, fontWeight: FontWeight.w800, fontSize: 22)),
                    ]),
                  ),
                )
              else
                QrImageView(data: _url, version: QrVersions.auto, size: 240, backgroundColor: Colors.white),
              const SizedBox(height: 12),
              Text('${teks(o['metode'])}: ${rp(o['pokok'])} + biaya admin ${rp(o['biaya'])}', style: const TextStyle(color: Colors.black87)),
              Text('Total ${rp(o['jumlah'])}', style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w800, fontSize: 22)),
              const SizedBox(height: 6),
              Text(
                lunas
                    ? 'Pembayaran sudah tercatat di Arus Keuangan.'
                    : 'Minta pembayar memindai QR ini dengan kamera HP-nya, lalu menyelesaikan pembayaran di halaman yang terbuka.'
                        '${teks(o['kadaluarsa']).isEmpty ? '' : '\nBerlaku sampai ${teks(o['kadaluarsa'])}.'}',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.black54, fontSize: 12.5),
              ),
              Text('Invoice ${teks(o['invoice'])}', style: const TextStyle(color: Colors.black45, fontSize: 11.5)),
            ]),
          ),
        ),
        if (!lunas) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(children: [
              const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
              const SizedBox(width: 10),
              Expanded(child: Text('Menunggu pembayaran · status diperbarui otomatis', style: TextStyle(color: cs.onSurfaceVariant, fontSize: 12.5))),
            ]),
          ),
          FilledButton.icon(
            onPressed: () async {
              final png = await _pngInstruksi();
              if (!context.mounted) return;
              await bagikanPng(context, [(bytes: png, nama: 'Bayar_${teks(o['invoice'])}.png')], judul: 'Instruksi bayar');
            },
            icon: const Icon(Icons.image_outlined),
            label: const Text('Simpan / bagikan gambar instruksi bayar'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () async {
              final ok = await bukaPembayaranDoku(context, url: _url, judul: teks(o['tagihan']), keterangan: keteranganBayar(o), cekStatus: _status0);
              if (ok && mounted) setState(() => _status = 'Lunas');
            },
            icon: const Icon(Icons.open_in_new_rounded),
            label: const Text('Buka halaman bayar di perangkat ini'),
          ),
          const SizedBox(height: 18),
          Text('Cadangan (bila pembayar tidak di tempat)', style: TextStyle(fontWeight: FontWeight.w700, color: cs.onSurfaceVariant)),
          const SizedBox(height: 4),
          Wrap(spacing: 8, runSpacing: 4, children: [
            TextButton.icon(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: _pesanWa));
                kabar(context, 'Pesan pembayaran disalin.');
              },
              icon: const Icon(Icons.copy_rounded, size: 18),
              label: const Text('Salin pesan + link'),
            ),
            if (hp.length >= 9)
              TextButton.icon(
                onPressed: () => launchUrl(Uri.parse('https://wa.me/$hp?text=${Uri.encodeComponent(_pesanWa)}'), mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.chat_outlined, size: 18),
                label: const Text('Kirim WA'),
              ),
          ]),
        ],
      ]),
    );
  }
}
