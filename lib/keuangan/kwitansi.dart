import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:syncfusion_flutter_pdf/pdf.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../berkas.dart';
import '../honor/honor.dart' show rp;
import '../session.dart';
import '../siswa/sesi_siswa.dart';
import '../widgets.dart';

/// v1.69.0: kwitansi pemasukan & pengeluaran. 1 lembar F4 portrait = 3 kwitansi; QR untuk verifikasi keaslian.
/// Penandatangan = nama akun yang mencetak + jabatannya; stempel lembaga dibubuhkan basah setelah dicetak.

/// Ambil isi kwitansi dari server (nomor diterbitkan bila belum ada) lalu buka PDF-nya.
Future<void> cetakKwitansi(BuildContext context, List<String> ids, {bool siswa = false}) async {
  if (ids.isEmpty) return;
  final r = await jalankan(context, () async {
    final d = peta(await Api.instance(siswa ? 'waSiswaKwitansi' : 'waStafKwitansi', [siswa ? SesiSiswa.instance.token : Sesi.instance.token, ids], const Duration(minutes: 2)));
    return pdfKwitansi(daftar(d['kwitansi']).map(peta).toList());
  }, teksProses: 'Menyusun kwitansi...');
  if (!r.ok || !context.mounted) return;
  await bukaPdfBytes(context, r.data!, ids.length == 1 ? 'Kwitansi_${ids.first}.pdf' : 'Kwitansi_${tanggalBerkas()}.pdf');
}

Future<Uint8List> _pngQr(String data) async {
  const sisi = 300.0;
  final rec = ui.PictureRecorder();
  final c = Canvas(rec);
  c.drawRect(const Rect.fromLTWH(0, 0, sisi, sisi), Paint()..color = Colors.white);
  QrPainter(data: data, version: QrVersions.auto, gapless: true).paint(c, const Size(sisi, sisi));
  final img = await rec.endRecording().toImage(sisi.round(), sisi.round());
  final b = await img.toByteData(format: ui.ImageByteFormat.png);
  return b!.buffer.asUint8List();
}

/// PDF F4 portrait (21,5 × 33 cm), 3 kwitansi per halaman dengan garis potong.
Future<List<int>> pdfKwitansi(List<Map<String, dynamic>> kw) async {
  final doc = PdfDocument();
  doc.pageSettings.size = const Size(609.45, 935.43);
  doc.pageSettings.margins.all = 0;
  final f = ({double s = 9, bool b = false, bool i = false}) =>
      PdfStandardFont(PdfFontFamily.helvetica, s, multiStyle: [if (b) PdfFontStyle.bold, if (i) PdfFontStyle.italic, if (!b && !i) PdfFontStyle.regular]);
  final kiri = PdfStringFormat(alignment: PdfTextAlignment.left, lineAlignment: PdfVerticalAlignment.top, wordWrap: PdfWordWrapType.word);
  final kanan = PdfStringFormat(alignment: PdfTextAlignment.right, lineAlignment: PdfVerticalAlignment.top);
  final tengah = PdfStringFormat(alignment: PdfTextAlignment.center, lineAlignment: PdfVerticalAlignment.middle, wordWrap: PdfWordWrapType.word);
  final tengahAtas = PdfStringFormat(alignment: PdfTextAlignment.center, lineAlignment: PdfVerticalAlignment.top, wordWrap: PdfWordWrapType.word);
  final hitam = PdfSolidBrush(PdfColor(20, 20, 20));
  final abu = PdfSolidBrush(PdfColor(100, 100, 100));
  final garisTipis = PdfPen(PdfColor(170, 170, 170), width: 0.6);
  final garisPotong = PdfPen(PdfColor(150, 150, 150), width: 0.6)..dashStyle = PdfDashStyle.dash;
  const tinggiSlot = 935.43 / 3, lebar = 609.45, tepi = 26.0;
  const w = lebar - 2 * tepi;
  late PdfGraphics g;
  for (var n = 0; n < kw.length; n++) {
    if (n % 3 == 0) g = doc.pages.add().graphics;
    final k = kw[n];
    final keluar = teks(k['jenis']) == 'Pengeluaran';
    final l = peta(k['lembaga']);
    final ttd = peta(k['ttd']);
    final top = (n % 3) * tinggiSlot;
    final y0 = top + 20;
    if (n % 3 != 2) g.drawLine(garisPotong, Offset(8, top + tinggiSlot), Offset(lebar - 8, top + tinggiSlot));
    g.drawRectangle(pen: garisTipis, bounds: Rect.fromLTWH(tepi - 10, top + 10, w + 20, tinggiSlot - 20));
    // kepala: lembaga (kiri), judul + nomor, QR (kanan)
    const qr = 68.0;
    g.drawImage(PdfBitmap(await _pngQr(teks(k['url']))), Rect.fromLTWH(tepi + w - qr, y0, qr, qr));
    g.drawString('Pindai untuk verifikasi', f(s: 6), brush: abu, bounds: Rect.fromLTWH(tepi + w - qr - 10, y0 + qr + 1, qr + 20, 9), format: tengahAtas);
    g.drawString(teks(l['nama'], 'PKBM'), f(s: 12, b: true), brush: hitam, bounds: Rect.fromLTWH(tepi, y0, w - qr - 190, 30), format: kiri);
    final sub = [teks(l['alamat']), if (teks(l['npsn']).isNotEmpty) 'NPSN ${teks(l['npsn'])}'].where((e) => e.isNotEmpty).join(' · ');
    if (sub.isNotEmpty) g.drawString(sub, f(s: 7.5), brush: abu, bounds: Rect.fromLTWH(tepi, y0 + 30, w - qr - 190, 22), format: kiri);
    g.drawString(keluar ? 'KWITANSI PENGELUARAN' : 'KWITANSI', f(s: keluar ? 13 : 17, b: true), brush: hitam,
        bounds: Rect.fromLTWH(tepi + w - qr - 190, y0 + 2, 180, 22), format: kanan);
    g.drawString('No. ${teks(k['nomor'])}', f(s: 9.5, b: true), brush: hitam, bounds: Rect.fromLTWH(tepi + w - qr - 190, y0 + 25, 180, 14), format: kanan);
    g.drawString(tglIndo(teks(k['tanggal'])), f(s: 8.5), brush: abu, bounds: Rect.fromLTWH(tepi + w - qr - 190, y0 + 39, 180, 12), format: kanan);
    final yGaris = y0 + qr + 14;
    g.drawLine(PdfPen(PdfColor(60, 60, 60), width: 1), Offset(tepi, yGaris), Offset(tepi + w, yGaris));
    // isi
    const lbl = 118.0;
    var y = yGaris + 9;
    void baris(String label, String isi, {double t = 15, PdfFont? font}) {
      g.drawString(label, f(s: 9), brush: abu, bounds: Rect.fromLTWH(tepi, y, lbl, t), format: kiri);
      g.drawString(':', f(s: 9), brush: abu, bounds: Rect.fromLTWH(tepi + lbl - 8, y, 8, t), format: kiri);
      g.drawString(isi, font ?? f(s: 9.5, b: true), brush: hitam, bounds: Rect.fromLTWH(tepi + lbl, y, w - lbl, t), format: kiri);
      y += t;
    }

    final pihak = teks(k['pihak'], '-') + (teks(k['rombel']).isEmpty ? '' : ' (${teks(k['rombel'])})');
    baris(keluar ? 'Dibayarkan kepada' : 'Telah terima dari', pihak);
    g.drawRectangle(brush: PdfSolidBrush(PdfColor(238, 238, 238)), bounds: Rect.fromLTWH(tepi + lbl - 2, y - 1, w - lbl + 2, 26));
    baris('Uang sejumlah', teks(k['terbilang']), t: 27, font: f(s: 9.5, b: true, i: true));
    baris('Untuk pembayaran', teks(k['uraian']), t: 26, font: f(s: 9.5));
    baris('Kode transaksi', teks(k['kategori']), font: f(s: 9));
    baris('Cara pembayaran', teks(k['cara']), font: f(s: 9));
    // bawah: jumlah (kiri) dan tanda tangan (kanan)
    final yb = top + tinggiSlot - 24 - 82;
    g.drawRectangle(pen: PdfPen(PdfColor(30, 30, 30), width: 1.3), bounds: Rect.fromLTWH(tepi, yb + 18, 190, 34));
    g.drawString(rp(k['jumlah']), f(s: 16, b: true), brush: hitam, bounds: Rect.fromLTWH(tepi, yb + 18, 190, 34), format: tengah);
    g.drawString('Sah bila bertanda tangan & berstempel lembaga.\nID ${teks(k['id'])} · verifikasi lewat QR.', f(s: 6.5), brush: abu,
        bounds: Rect.fromLTWH(tepi, yb + 56, 240, 20), format: kiri);
    const wt = 190.0;
    final xt = tepi + w - wt;
    if (ttd['otomatis'] == true || teks(ttd['nama']).isEmpty) {
      g.drawString('${tglIndo(teks(k['tanggal']))}\n\nDicatat otomatis oleh sistem\n(pembayaran online)', f(s: 8.5), brush: hitam,
          bounds: Rect.fromLTWH(xt, yb, wt, 70), format: tengahAtas);
    } else {
      g.drawString(tglIndo(teks(k['tanggal'])), f(s: 8.5), brush: hitam, bounds: Rect.fromLTWH(xt, yb, wt, 12), format: tengahAtas);
      g.drawString(keluar ? 'Yang menyerahkan,' : 'Yang menerima,', f(s: 8.5), brush: hitam, bounds: Rect.fromLTWH(xt, yb + 12, wt, 12), format: tengahAtas);
      g.drawString(teks(ttd['nama']), f(s: 10, b: true), brush: hitam, bounds: Rect.fromLTWH(xt, yb + 60, wt, 13), format: tengahAtas);
      g.drawLine(PdfPen(PdfColor(30, 30, 30), width: 0.7), Offset(xt + 20, yb + 73), Offset(xt + wt - 20, yb + 73));
      g.drawString(teks(ttd['jabatan']), f(s: 8.5), brush: abu, bounds: Rect.fromLTWH(xt, yb + 75, wt, 12), format: tengahAtas);
    }
  }
  final bytes = await doc.save();
  doc.dispose();
  return bytes;
}

// ───────────────────────── layar pilih & cetak ─────────────────────────

class KwitansiScreen extends StatefulWidget {
  const KwitansiScreen({super.key});

  @override
  State<KwitansiScreen> createState() => _KwitansiScreenState();
}

class _KwitansiScreenState extends State<KwitansiScreen> {
  DateTime _bulan = DateTime(DateTime.now().year, DateTime.now().month);
  String _jenis = '';
  String _cari = '';
  final Set<String> _pilih = {};
  int _v = 0;

  static const _nmBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  void _geser(int n) => setState(() {
        _bulan = DateTime(_bulan.year, _bulan.month + n);
        _pilih.clear();
        _v++;
      });

  Future<void> _cetak(int maks) async {
    if (_pilih.length > maks) {
      kabar(context, 'Maksimal $maks kwitansi sekali cetak.', galat: true);
      return;
    }
    await cetakKwitansi(context, _pilih.toList());
    if (mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    final dari = tglIso(_bulan), sampai = tglIso(DateTime(_bulan.year, _bulan.month + 1, 0));
    return Muatan<Map<String, dynamic>>(
      key: ValueKey('$_v|$dari'),
      muat: () async => peta(await Api.instance('waStafKwitansiDaftar', [Sesi.instance.token, {'dari': dari, 'sampai': sampai}], const Duration(seconds: 120))),
      bangun: (context, d, segarkan) {
        final cs = Theme.of(context).colorScheme;
        final ttd = peta(d['ttd']);
        final maks = angka(d['maks'], 60);
        final q = _cari.toLowerCase();
        final data = daftar(d['data']).map(peta).where((x) => (_jenis.isEmpty || teks(x['jenis']) == _jenis) &&
            (q.isEmpty || '${teks(x['pihak'])} ${teks(x['uraian'])} ${teks(x['nomor'])} ${teks(x['id'])}'.toLowerCase().contains(q))).toList();
        final lembar = (_pilih.length / 3).ceil();
        return Column(children: [
          Expanded(
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 16), children: [
              Card(
                color: ttd.isEmpty ? cs.errorContainer : cs.primaryContainer,
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Text(ttd.isEmpty
                      ? teks(d['galatTtd'], 'Nama akun belum bisa dipakai sebagai penandatangan.')
                      : 'Penandatangan: ${teks(ttd['nama'])} (${teks(ttd['jabatan'])}).\n1 lembar F4 = 3 kwitansi. Bubuhkan stempel lembaga di atas nama setelah dicetak.'),
                ),
              ),
              Row(children: [
                IconButton(onPressed: () => _geser(-1), icon: const Icon(Icons.chevron_left_rounded)),
                Expanded(child: Text('${_nmBulan[_bulan.month - 1]} ${_bulan.year}', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
                IconButton(onPressed: () => _geser(1), icon: const Icon(Icons.chevron_right_rounded)),
              ]),
              SegmentedButton<String>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: '', label: Text('Semua')),
                  ButtonSegment(value: 'Pemasukan', label: Text('Pemasukan')),
                  ButtonSegment(value: 'Pengeluaran', label: Text('Pengeluaran')),
                ],
                selected: {_jenis},
                onSelectionChanged: (v) => setState(() => _jenis = v.first),
              ),
              const SizedBox(height: 8),
              TextField(
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari nama, keterangan, atau nomor', isDense: true),
                onChanged: (v) => setState(() => _cari = v.trim()),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: Wrap(spacing: 4, children: [
                  TextButton(onPressed: data.isEmpty ? null : () => setState(() => _pilih.addAll(data.map((x) => teks(x['id'])))), child: const Text('Pilih semua')),
                  TextButton(
                    onPressed: data.isEmpty ? null : () => setState(() => _pilih.addAll(data.where((x) => teks(x['nomor']).isEmpty).map((x) => teks(x['id'])))),
                    child: const Text('Pilih yang belum dicetak'),
                  ),
                  if (_pilih.isNotEmpty) TextButton(onPressed: () => setState(_pilih.clear), child: const Text('Kosongkan')),
                ]),
              ),
              if (data.isEmpty) const Kosong(pesan: 'Tidak ada transaksi sah di bulan ini.', ikon: Icons.receipt_long_outlined),
              for (final x in data)
                Card(
                  child: CheckboxListTile(
                    value: _pilih.contains(teks(x['id'])),
                    onChanged: (v) => setState(() => v == true ? _pilih.add(teks(x['id'])) : _pilih.remove(teks(x['id']))),
                    title: Text(teks(x['uraian']), maxLines: 2, overflow: TextOverflow.ellipsis),
                    subtitle: Text([
                      tglIndo(teks(x['tanggal'])),
                      if (teks(x['pihak']).isNotEmpty) teks(x['pihak']),
                      teks(x['nomor']).isEmpty ? 'Belum pernah dicetak' : '${teks(x['nomor'])} · dicetak ${angka(x['dicetak'])}×',
                    ].join(' · ')),
                    secondary: Text(rp(x['jumlah']),
                        style: TextStyle(fontWeight: FontWeight.w800, color: teks(x['jenis']) == 'Pengeluaran' ? cs.error : Colors.green)),
                  ),
                ),
            ]),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                onPressed: ttd.isEmpty || _pilih.isEmpty ? null : () => _cetak(maks),
                icon: const Icon(Icons.print_rounded),
                label: Text(_pilih.isEmpty ? 'Pilih transaksi' : 'Cetak ${_pilih.length} kwitansi · $lembar lembar F4'),
              ),
            ),
          ),
        ]);
      },
    );
  }
}
