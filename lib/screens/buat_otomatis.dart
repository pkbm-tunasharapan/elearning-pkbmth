import 'package:flutter/material.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

const _konteks = [
  ['semua', 'Materi + Diskusi', 'Materi dan diskusi untuk satu sesi biasa'],
  ['materi', 'Materi', 'Bacaan materi untuk satu sesi'],
  ['diskusi', 'Diskusi', 'Satu topik diskusi untuk forum'],
];
const _namaKonteks = {'materi': 'Materi', 'diskusi': 'Diskusi', 'ujian': 'Ujian'};

/// "Upload PDF & Buat Otomatis" di tab Konten (bukaAi_ di web). Hasilnya masuk sebagai Pending.
class BuatOtomatisScreen extends StatefulWidget {
  const BuatOtomatisScreen({super.key, required this.idMapel, required this.judul, required this.paket});
  final String idMapel;
  final String judul;
  final Map<String, dynamic> paket;

  @override
  State<BuatOtomatisScreen> createState() => _BuatOtomatisScreenState();
}

class _BuatOtomatisScreenState extends State<BuatOtomatisScreen> {
  Map<String, dynamic>? _status;
  BerkasPdf? _f;
  String _pilih = 'semua';
  late String _sesi;
  final _jumlahSoal = TextEditingController(text: '10');
  final _catatan = TextEditingController();
  List<Langkah> _langkah = [];
  bool _jalan = false;
  bool _selesai = false;
  Map<String, dynamic>? _ref;
  final List<Map<String, dynamic>> _hasil = [];

  List<Map<String, dynamic>> get _sesiBiasa => daftar(widget.paket['sesi']).map(peta).where((x) => teks(x['jenis'], 'Biasa') == 'Biasa').toList();

  @override
  void initState() {
    super.initState();
    _sesi = _sesiAwal();
    Api.instance('waStafAiStatus', [_t]).then((r) {
      if (mounted) setState(() => _status = peta(r));
    }).catchError((_) {});
  }

  @override
  void dispose() {
    if (!_selesai) bersihkanRef(_ref);
    super.dispose();
  }

  /// sesiAwalUntuk_('Materi', '') di web: sesi biasa pertama mulai dari sesi berjalan/terdekat.
  String _sesiAwal() {
    final d = _sesiBiasa;
    if (d.isEmpty) return 'Sesi 1';
    final semua = daftar(widget.paket['sesi']).map(peta).toList();
    final kini = teks(widget.paket['sekarang'], teks(widget.paket['terdekat']));
    var idxKini = 0;
    for (var i = 0; i < semua.length; i++) {
      if (teks(semua[i]['nama']) == kini) idxKini = i;
    }
    for (final x in d) {
      final idx = semua.indexWhere((s) => teks(s['nama']) == teks(x['nama']));
      if (idx >= idxKini) return teks(x['nama']);
    }
    return teks(d.last['nama']);
  }

  Future<void> _proses() async {
    if (_f == null) return kabar(context, 'Pilih file PDF dulu.', galat: true);
    final daftarK = _pilih == 'semua' ? ['materi', 'diskusi'] : [_pilih];
    final l = [Langkah('Mengunggah PDF', ket: 'Mulai...'), for (final k in daftarK) Langkah('Menyusun ${_namaKonteks[k]}')];
    for (var i = 1; i < l.length; i++) {
      l[i].run = (x) async {
        final r = peta(await Api.instance('waStafAiProses', [
          _t,
          widget.idMapel,
          _ref,
          {'konteks': daftarK[i - 1], 'sesi': _sesi.trim().isEmpty ? 'Sesi 1' : _sesi, 'jumlahSoal': int.tryParse(_jumlahSoal.text) ?? 10, 'catatan': _catatan.text}
        ], batasAi));
        _hasil.add(r);
        x.ket = '"${teks(r['judul'])}"${angka(r['jumlahSoal']) > 0 ? ' · ${angka(r['jumlahSoal'])} soal${angka(r['jumlahSoal']) < angka(r['diminta']) ? ' (dari ${angka(r['diminta'])} diminta)' : ''}' : ''} · status Pending';
      };
    }
    setState(() {
      _langkah = l;
      _jalan = true;
    });
    final u = l.first;
    try {
      setState(() => u.status = 'jalan');
      final f = _f!;
      _ref = await unggahPdf(f, () => Api.instance('waStafAiMulaiUnggah', [_t, widget.idMapel, f.nama, f.ukuran, 'application/pdf']), onProg: (p) {
        if (mounted) setState(() => u.ket = 'Mengunggah $p%');
      });
      setState(() {
        u.status = 'ok';
        u.ket = f.nama;
      });
    } on ApiException catch (e) {
      setState(() {
        u.status = 'gagal';
        u.ket = e.ramah;
        for (final x in l.skip(1)) {
          x.ket = 'Dibatalkan';
        }
        _jalan = false;
      });
      return;
    }
    await _jalankan(l.skip(1).toList());
  }

  Future<void> _jalankan(List<Langkah> daftarL) async {
    setState(() => _jalan = true);
    for (final l in daftarL) {
      setState(() {
        l.status = 'jalan';
        l.ket = 'Sedang diproses oleh AI. Biasanya 20 detik sampai beberapa menit; jangan tutup layar ini.';
      });
      try {
        await l.run!(l);
        if (mounted) setState(() => l.status = 'ok');
      } on ApiException catch (e) {
        if (mounted) {
          setState(() {
            l.status = 'gagal';
            l.ket = e.ramah;
          });
        }
      }
    }
    if (!mounted) return;
    final gagal = _langkah.skip(1).any((l) => l.status == 'gagal');
    if (!gagal) {
      bersihkanRef(_ref);
      _ref = null;
      _selesai = true;
    }
    setState(() => _jalan = false);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final st = _status;
    final mulai = _langkah.isNotEmpty;
    final gagalUnggah = mulai && _langkah.first.status == 'gagal';
    final gagalAi = mulai && _langkah.skip(1).any((l) => l.status == 'gagal');
    final semuaSelesai = mulai && !_jalan && _langkah.every((l) => l.status == 'ok');
    final paket = widget.paket;
    return PopScope(
      canPop: !_jalan,
      child: Scaffold(
        appBar: AppBar(title: const Text('Buat Otomatis dari PDF')),
        body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
          Text('${widget.judul}. Hasilnya masuk sebagai Pending: Anda tinjau dan ubah dulu, lalu ketuk Post.', style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
          if (st != null && st['siap'] != true)
            Container(
              margin: const EdgeInsets.only(top: 10),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: cs.primaryContainer, borderRadius: BorderRadius.circular(12)),
              child: Text(Sesi.instance.isAdmin ? 'Fitur AI belum diaktifkan. Isi kunci Gemini di menu "Pengaturan AI".' : 'Fitur buat otomatis belum tersedia. Silakan hubungi admin.'),
            ),
          const SizedBox(height: 14),
          if (!mulai || gagalUnggah) ...[
            const Text('File PDF', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), alignment: Alignment.centerLeft),
              onPressed: () async {
                final f = await pilihPdf();
                if (f.isEmpty) return;
                final maks = angka(st?['maksMB'], 60);
                if (f.first.ukuran > maks * 1048576) {
                  if (context.mounted) kabar(context, 'File melebihi $maks MB.', galat: true);
                  return;
                }
                setState(() => _f = f.first);
              },
              icon: const Icon(Icons.picture_as_pdf_rounded),
              label: Text(_f == null ? 'Pilih PDF' : '${_f!.nama} (${_f!.ukuranMb} MB)', overflow: TextOverflow.ellipsis),
            ),
            Text('Maksimal ${angka(st?['maksMB'], 60)} MB. Satu PDF untuk satu sesi.', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
            const SizedBox(height: 14),
            if (_sesiBiasa.isNotEmpty) ...[
              DropdownButtonFormField<String>(
                initialValue: _sesiBiasa.any((x) => teks(x['nama']) == _sesi) ? _sesi : teks(_sesiBiasa.first['nama']),
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Masukkan ke sesi'),
                items: [
                  for (final x in _sesiBiasa)
                    DropdownMenuItem(
                      value: teks(x['nama']),
                      child: Text('${teks(x['label'], teks(x['nama']))}${teks(x['status']) == 'berjalan' ? ' ← sedang berjalan' : (teks(x['status']) == 'lewat' ? ' (berakhir)' : '')}',
                          overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) => setState(() => _sesi = v ?? _sesi),
              ),
              Text('Materi dan diskusi masuk ke sesi biasa (bukan UTS/UAS${paket['uts'] != null ? ', Sesi ${teks(paket['uts'])} dan ${teks(paket['uas'])}' : ''}).',
                  style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
            ] else
              TextFormField(initialValue: _sesi, maxLength: 60, decoration: const InputDecoration(labelText: 'Masukkan ke sesi', hintText: 'mis. Sesi 3'), onChanged: (v) => _sesi = v),
            const SizedBox(height: 14),
            const Text('Hasilkan apa?', style: TextStyle(fontWeight: FontWeight.w700)),
            RadioGroup<String>(
              groupValue: _pilih,
              onChanged: (v) => setState(() => _pilih = v ?? 'semua'),
              child: Column(children: [
                for (final k in _konteks)
                  RadioListTile<String>(
                    contentPadding: EdgeInsets.zero,
                    value: k[0],
                    title: Text(k[1], style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text(k[2]),
                  ),
              ]),
            ),
            TextField(
              controller: _catatan,
              maxLength: 500,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Catatan untuk AI (opsional)', hintText: 'mis. Fokus pada contoh pertanian; bahasa sederhana.'),
            ),
            const SizedBox(height: 12),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: st == null || st['siap'] != true ? null : _proses,
              child: Text(gagalUnggah ? 'Ubah & coba lagi' : 'Proses'),
            ),
          ],
          if (mulai) ...[
            const SizedBox(height: 12),
            Card(child: Padding(padding: const EdgeInsets.all(12), child: DaftarLangkah(langkah: _langkah, tampilBar: false))),
            if (semuaSelesai) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: Colors.green.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
                child: Text('Selesai. ${_hasil.length} item masuk sebagai Pending. Tinjau, ubah bila perlu, lalu ketuk Post.'),
              ),
              const SizedBox(height: 10),
              FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Tinjau hasil')),
            ],
            if (!_jalan && gagalAi) ...[
              const Text('Sebagian belum berhasil. Anda bisa mencoba lagi bagian yang gagal tanpa mengunggah ulang PDF.'),
              const SizedBox(height: 10),
              FilledButton(
                onPressed: () {
                  final ulang = _langkah.skip(1).where((l) => l.status == 'gagal').toList();
                  for (final l in ulang) {
                    l.status = 'tunggu';
                    l.ket = 'Menunggu';
                  }
                  _jalankan(ulang);
                },
                child: const Text('Coba lagi yang gagal'),
              ),
              TextButton(onPressed: () => Navigator.pop(context, _hasil.isNotEmpty), child: const Text('Tutup')),
            ],
          ],
        ]),
      ),
    );
  }
}
