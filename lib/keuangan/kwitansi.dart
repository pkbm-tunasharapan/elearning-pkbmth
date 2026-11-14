import 'dart:convert';
import 'dart:typed_data';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
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
/// Penandatangan TETAP = penerbit pertama (nama + jabatan); cetak ulang oleh orang lain tidak mengganti nama. Stempel basah setelah dicetak.

/// Ambil isi kwitansi dari server (nomor diterbitkan bila belum ada) lalu buka PDF-nya.
Future<void> cetakKwitansi(BuildContext context, List<String> ids, {bool siswa = false}) async {
  if (ids.isEmpty) return;
  final r = await jalankan(context, () async {
    final d = peta(await Api.instance(siswa ? 'waSiswaKwitansi' : 'waStafKwitansi', [siswa ? SesiSiswa.instance.token : Sesi.instance.token, ids], const Duration(minutes: 2)));
    return pdfKwitansi(daftar(d['kwitansi']).map(peta).toList(), peta(d['kop']));
  }, teksProses: 'Menyusun kwitansi...');
  if (!r.ok || !context.mounted) return;
  await bukaPdfBytes(context, r.data!, ids.length == 1 ? 'Kwitansi_${ids.first}.pdf' : 'Kwitansi_${tanggalBerkas()}.pdf');
}

Future<Uint8List> pngQr(String data) async {
  const sisi = 300.0;
  final rec = ui.PictureRecorder();
  final c = Canvas(rec);
  c.drawRect(const Rect.fromLTWH(0, 0, sisi, sisi), Paint()..color = Colors.white);
  QrPainter(data: data, version: QrVersions.auto, gapless: true).paint(c, const Size(sisi, sisi));
  final img = await rec.endRecording().toImage(sisi.round(), sisi.round());
  final b = await img.toByteData(format: ui.ImageByteFormat.png);
  return b!.buffer.asUint8List();
}

/// v1.72.0: kop surat bersama (kwitansi, slip honor): logo kiri, yayasan + lembaga + baris keterangan di tengah, garis ganda.
class KopPdf {
  KopPdf._(this.logo, this.yayasan, this.nama, this.baris, this.kota, [this.samar]);
  final PdfBitmap? logo;
  final PdfBitmap? samar;   // v1.79.5: logo dipudarkan untuk watermark
  final String yayasan, nama, kota;
  final List<String> baris;

  static Future<KopPdf> siapkan(Map<String, dynamic> kop) async {
    Uint8List? b;
    try {
      b = teks(kop['logo']).isNotEmpty ? base64Decode(teks(kop['logo'])) : (await rootBundle.load('assets/logo_kop.png')).buffer.asUint8List();
    } catch (_) {
      b = null;
    }
    final sm = b == null ? null : await pngSamar(b);
    return KopPdf._(b == null ? null : PdfBitmap(b), teks(kop['yayasan']), teks(kop['nama']),
        daftar(kop['baris']).map((e) => teks(e)).where((e) => e.isNotEmpty).toList(), teks(kop['kota']), sm == null ? null : PdfBitmap(sm));
  }

  /// v1.79.5: logo samar di tengah [area] (mis. satu kwitansi / satu slip), digambar sebelum isi.
  void watermark(PdfGraphics g, Rect area, {double porsi = 0.62}) {
    final s = samar;
    if (s == null) return;
    final sisi = math.min(area.width, area.height) * porsi;
    final lw = s.width >= s.height ? sisi : sisi * s.width / s.height, lh = s.width >= s.height ? sisi * s.height / s.width : sisi;
    g.drawImage(s, Rect.fromLTWH(area.left + (area.width - lw) / 2, area.top + (area.height - lh) / 2, lw, lh));
  }

  /// Gambar kop di (x, y) selebar w; mengembalikan posisi y garis bawah kop (garis ganda sudah digambar).
  double gambar(PdfGraphics g, double x, double y, double w, {String namaCadangan = 'PKBM'}) {
    PdfFont f(double s, {bool b = false}) => PdfStandardFont(PdfFontFamily.helvetica, s, multiStyle: [b ? PdfFontStyle.bold : PdfFontStyle.regular]);
    final hitam = PdfSolidBrush(PdfColor(20, 20, 20));
    final fmt = PdfStringFormat(alignment: PdfTextAlignment.center, lineAlignment: PdfVerticalAlignment.top, wordWrap: PdfWordWrapType.word);
    // v1.79.5: logo tidak lagi di kop (tampil sebagai watermark); teks memakai lebar penuh
    final xT = x + 10, wT = w - 20;
    var yk = y;
    if (yayasan.isNotEmpty) {
      g.drawString(yayasan.toUpperCase(), f(9, b: true), brush: hitam, bounds: Rect.fromLTWH(xT, yk, wT, 11), format: fmt);
      yk += 11;
    }
    g.drawString((nama.isEmpty ? namaCadangan : nama).toUpperCase(), f(14, b: true), brush: hitam, bounds: Rect.fromLTWH(xT, yk, wT, 17), format: fmt);
    yk += 17;
    final fK = f(6.3);
    for (final t in barisPiramida(baris)) {
      final h = fK.measureString(t, layoutArea: Size(wT, 0), format: fmt).height + 0.6;
      g.drawString(t, fK, brush: hitam, bounds: Rect.fromLTWH(xT, yk, wT, h), format: fmt);
      yk += h;
    }
    final yG = yk + 4;
    g.drawLine(PdfPen(PdfColor(20, 20, 20), width: 1.6), Offset(x, yG), Offset(x + w, yG));
    g.drawLine(PdfPen(PdfColor(20, 20, 20), width: 0.5), Offset(x, yG + 2.6), Offset(x + w, yG + 2.6));
    return yG;
  }
}

/// PDF F4 portrait (21,5 × 33 cm), 3 kwitansi per halaman dengan garis potong.
/// v1.71.0: kop surat (logo + yayasan + lembaga + keterangan) diambil dari server; logo bawaan bila server tidak mengirim logo.
Future<List<int>> pdfKwitansi(List<Map<String, dynamic>> kw, [Map<String, dynamic> kop = const {}]) async {
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
  final kp = await KopPdf.siapkan(kop);
  final kota = kp.kota;
  late PdfGraphics g;
  for (var n = 0; n < kw.length; n++) {
    if (n % 3 == 0) g = doc.pages.add().graphics;
    final k = kw[n];
    final keluar = teks(k['jenis']) == 'Pengeluaran';
    final l = peta(k['lembaga']);
    final ttd = peta(k['ttd']);
    final top = (n % 3) * tinggiSlot;
    final y0 = top + 17;
    if (n % 3 != 2) g.drawLine(garisPotong, Offset(8, top + tinggiSlot), Offset(lebar - 8, top + tinggiSlot));
    g.drawRectangle(pen: garisTipis, bounds: Rect.fromLTWH(tepi - 10, top + 10, w + 20, tinggiSlot - 20));
    kp.watermark(g, Rect.fromLTWH(tepi, top + 10, w, tinggiSlot - 20));   // v1.79.5
    final yGaris = kp.gambar(g, tepi, y0, w, namaCadangan: teks(l['nama'], 'PKBM'));
    // ── judul + nomor (kiri/tengah), QR (kanan) ──
    const qr = 58.0;
    const wIsi = w - qr - 12;
    final yJ = yGaris + 9;
    g.drawImage(PdfBitmap(await pngQr(teks(k['url']))), Rect.fromLTWH(tepi + w - qr, yJ - 2, qr, qr));
    g.drawString('Pindai untuk verifikasi', f(s: 5.5), brush: abu, bounds: Rect.fromLTWH(tepi + w - qr - 6, yJ + qr - 1, qr + 12, 8), format: tengahAtas);
    g.drawString(keluar ? 'KWITANSI PENGELUARAN' : 'KWITANSI', f(s: 14, b: true), brush: hitam, bounds: Rect.fromLTWH(tepi, yJ, 220, 18), format: kiri);
    g.drawString('No. ${teks(k['nomor'])}', f(s: 9, b: true), brush: hitam, bounds: Rect.fromLTWH(tepi + wIsi - 180, yJ, 180, 12), format: kanan);
    g.drawString(tglIndo(teks(k['tanggal'])), f(s: 8), brush: abu, bounds: Rect.fromLTWH(tepi + wIsi - 180, yJ + 12, 180, 11), format: kanan);
    // ── isi ──
    const lbl = 112.0;
    var y = yJ + 26;
    void baris(String label, String isi, {double t = 14, PdfFont? font}) {
      g.drawString(label, f(s: 9), brush: abu, bounds: Rect.fromLTWH(tepi, y, lbl, t), format: kiri);
      g.drawString(':', f(s: 9), brush: abu, bounds: Rect.fromLTWH(tepi + lbl - 8, y, 8, t), format: kiri);
      g.drawString(isi, font ?? f(s: 9.5, b: true), brush: hitam, bounds: Rect.fromLTWH(tepi + lbl, y, wIsi - lbl, t), format: kiri);
      y += t;
    }

    final pihak = teks(k['pihak'], '-') + (teks(k['rombel']).isEmpty ? '' : ' (${teks(k['rombel'])})');
    baris(keluar ? 'Dibayarkan kepada' : 'Telah terima dari', pihak);
    g.drawRectangle(brush: PdfSolidBrush(PdfColor(238, 238, 238)), bounds: Rect.fromLTWH(tepi + lbl - 2, y - 1, wIsi - lbl + 2, 25));
    baris('Uang sejumlah', teks(k['terbilang']), t: 26, font: f(s: 9.5, b: true, i: true));
    baris('Untuk pembayaran', teks(k['uraian']), t: 24, font: f(s: 9.5));
    baris('Kode transaksi / Cara', '${teks(k['kategori'])} · ${teks(k['cara'])}', t: 16, font: f(s: 9));
    // ── bawah: jumlah (kiri) dan tanda tangan (kanan) ──
    final yb = top + tinggiSlot - 24 - 80;
    g.drawRectangle(pen: PdfPen(PdfColor(30, 30, 30), width: 1.3), bounds: Rect.fromLTWH(tepi, yb + 24, 180, 32));
    g.drawString(rp(k['jumlah']), f(s: 15, b: true), brush: hitam, bounds: Rect.fromLTWH(tepi, yb + 24, 180, 32), format: tengah);
    g.drawString('Sah bila bertanda tangan & berstempel lembaga.\nID ${teks(k['id'])} · verifikasi lewat QR.', f(s: 6.3), brush: abu,
        bounds: Rect.fromLTWH(tepi, yb + 59, 240, 18), format: kiri);
    const wt = 190.0;
    final xt = tepi + w - wt;
    final tgl = '${kota.isEmpty ? '' : '$kota, '}${tglIndo(teks(k['tanggal']))}';
    if (ttd['otomatis'] == true || teks(ttd['nama']).isEmpty) {
      g.drawString('$tgl\n\nDicatat otomatis oleh sistem\n(pembayaran online)', f(s: 8.5), brush: hitam,
          bounds: Rect.fromLTWH(xt, yb + 4, wt, 70), format: tengahAtas);
    } else {
      g.drawString(tgl, f(s: 8.5), brush: hitam, bounds: Rect.fromLTWH(xt, yb, wt, 12), format: tengahAtas);
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
        // v1.70.3: tanpa nama akun yang sah hanya boleh mencetak ulang kwitansi yang sudah punya penerbit
        final perluBaru = data.any((x) => _pilih.contains(teks(x['id'])) && teks(x['penerbit']).isEmpty);
        return Column(children: [
          Expanded(
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 16), children: [
              Card(
                color: ttd.isEmpty ? cs.errorContainer : cs.primaryContainer,
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Text(ttd.isEmpty
                      ? '${teks(d['galatTtd'], 'Nama akun belum bisa dipakai sebagai penandatangan.')}\nAnda tetap dapat mencetak ulang kwitansi yang sudah pernah diterbitkan.'
                      : 'Kwitansi baru diterbitkan atas nama ${teks(ttd['nama'])} (${teks(ttd['jabatan'])}). Kwitansi yang sudah pernah diterbitkan '
                          'tetap atas nama penerbit pertamanya.\n1 lembar F4 = 3 kwitansi. Bubuhkan stempel lembaga di atas nama setelah dicetak.'),
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
                      teks(x['nomor']).isEmpty
                          ? 'Belum pernah dicetak'
                          : '${teks(x['nomor'])} · dicetak ${angka(x['dicetak'])}×${teks(x['penerbit']).isEmpty ? '' : ' · penerbit ${teks(x['penerbit'])}'}',
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
                onPressed: (ttd.isEmpty && perluBaru) || _pilih.isEmpty ? null : () => _cetak(maks),
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
