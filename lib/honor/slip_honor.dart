import 'package:flutter/material.dart';
import 'package:syncfusion_flutter_pdf/pdf.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../berkas.dart';
import '../keuangan/kwitansi.dart' show KopPdf, pngQr;
import '../session.dart';
import '../widgets.dart';
import 'honor.dart' show rp, bulanIndo;

/// v1.72.0: slip honor tutor. F4 portrait, 2 slip per lembar, kop lembaga, QR verifikasi.
/// Hanya untuk honor yang sudah dibayar. Penandatangan "Yang membayarkan" = Bendahara (ditetapkan server).
/// Setiap unduhan wajib menyebut keperluannya; keperluan ikut tercetak di slip.

const _contohKeperluan = ['Pengajuan pinjaman / kredit bank', 'Arsip pribadi', 'Pelaporan pajak', 'Administrasi lembaga'];

Future<String?> _tanyaKeperluan(BuildContext context, int jumlah) {
  final c = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setSt) {
        final ok = c.text.trim().length >= 4;
        return AlertDialog(
          title: Text(jumlah > 1 ? 'Unduh $jumlah slip honor' : 'Unduh slip honor'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Untuk keperluan apa slip ini diunduh? Keperluan akan tercetak di slip dan dicatat.', style: TextStyle(fontSize: 13)),
              const SizedBox(height: 10),
              TextField(
                controller: c,
                autofocus: true,
                maxLength: 120,
                decoration: const InputDecoration(labelText: 'Keperluan', hintText: 'mis. pengajuan pinjaman bank'),
                onChanged: (_) => setSt(() {}),
              ),
              Wrap(spacing: 6, runSpacing: 4, children: [
                for (final k in _contohKeperluan)
                  ActionChip(label: Text(k, style: const TextStyle(fontSize: 12)), onPressed: () => setSt(() => c.text = k)),
              ]),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
            FilledButton(onPressed: ok ? () => Navigator.pop(ctx, c.text.trim()) : null, child: const Text('Unduh')),
          ],
        );
      },
    ),
  );
}

/// Minta keperluan, ambil data slip dari server, lalu buka PDF-nya.
Future<void> cetakSlipHonor(BuildContext context, List<String> ids) async {
  if (ids.isEmpty) return;
  final keperluan = await _tanyaKeperluan(context, ids.length);
  if (keperluan == null || !context.mounted) return;
  final r = await jalankan(context, () async {
    final d = peta(await Api.instance('waStafHonorSlip', [Sesi.instance.token, ids, keperluan], const Duration(minutes: 2)));
    return pdfSlipHonor(daftar(d['slip']).map(peta).toList(), peta(d['kop']));
  }, teksProses: 'Menyusun slip honor...');
  if (!r.ok || !context.mounted) return;
  await bukaPdfBytes(context, r.data!, ids.length == 1 ? 'Slip_Honor_${ids.first}.pdf' : 'Slip_Honor_${tanggalBerkas()}.pdf');
}

/// PDF F4 portrait (21,5 × 33 cm), 2 slip per halaman dengan garis potong.
Future<List<int>> pdfSlipHonor(List<Map<String, dynamic>> data, Map<String, dynamic> kop) async {
  final doc = PdfDocument();
  doc.pageSettings.size = const Size(609.45, 935.43);
  doc.pageSettings.margins.all = 0;
  PdfFont f({double s = 9, bool b = false, bool i = false}) =>
      PdfStandardFont(PdfFontFamily.helvetica, s, multiStyle: [if (b) PdfFontStyle.bold, if (i) PdfFontStyle.italic, if (!b && !i) PdfFontStyle.regular]);
  final kiri = PdfStringFormat(alignment: PdfTextAlignment.left, lineAlignment: PdfVerticalAlignment.top, wordWrap: PdfWordWrapType.word);
  final kanan = PdfStringFormat(alignment: PdfTextAlignment.right, lineAlignment: PdfVerticalAlignment.top);
  final kananTengah = PdfStringFormat(alignment: PdfTextAlignment.right, lineAlignment: PdfVerticalAlignment.middle);
  final kiriTengah = PdfStringFormat(alignment: PdfTextAlignment.left, lineAlignment: PdfVerticalAlignment.middle);
  final tengahAtas = PdfStringFormat(alignment: PdfTextAlignment.center, lineAlignment: PdfVerticalAlignment.top, wordWrap: PdfWordWrapType.word);
  final hitam = PdfSolidBrush(PdfColor(20, 20, 20));
  final abu = PdfSolidBrush(PdfColor(100, 100, 100));
  final pita = PdfSolidBrush(PdfColor(236, 236, 236));
  final garisTipis = PdfPen(PdfColor(170, 170, 170), width: 0.6);
  final garisIsi = PdfPen(PdfColor(200, 200, 200), width: 0.5);
  final garisPotong = PdfPen(PdfColor(150, 150, 150), width: 0.6)..dashStyle = PdfDashStyle.dash;
  const tinggiSlot = 935.43 / 2, lebar = 609.45, tepi = 26.0;
  const w = lebar - 2 * tepi;
  final kp = await KopPdf.siapkan(kop);
  late PdfGraphics g;
  for (var n = 0; n < data.length; n++) {
    if (n % 2 == 0) g = doc.pages.add().graphics;
    final s = data[n];
    final top = (n % 2) * tinggiSlot;
    if (n % 2 == 0) g.drawLine(garisPotong, Offset(8, top + tinggiSlot), Offset(lebar - 8, top + tinggiSlot));
    g.drawRectangle(pen: garisTipis, bounds: Rect.fromLTWH(tepi - 10, top + 10, w + 20, tinggiSlot - 20));
    kp.watermark(g, Rect.fromLTWH(tepi, top + 10, w, tinggiSlot - 20));   // v1.79.5
    final yG = kp.gambar(g, tepi, top + 17, w);
    // ── judul, nomor, QR ──
    const qr = 58.0;
    const wIsi = w - qr - 12;
    final yJ = yG + 9;
    g.drawImage(PdfBitmap(await pngQr(teks(s['url']))), Rect.fromLTWH(tepi + w - qr, yJ - 2, qr, qr));
    g.drawString('Pindai untuk verifikasi', f(s: 5.5), brush: abu, bounds: Rect.fromLTWH(tepi + w - qr - 6, yJ + qr - 1, qr + 12, 8), format: tengahAtas);
    g.drawString('SLIP HONOR TUTOR', f(s: 14, b: true), brush: hitam, bounds: Rect.fromLTWH(tepi, yJ, 240, 18), format: kiri);
    g.drawString('No. ${teks(s['nomor'])}', f(s: 9, b: true), brush: hitam, bounds: Rect.fromLTWH(tepi + wIsi - 180, yJ, 180, 12), format: kanan);
    // ── identitas ──
    var y = yJ + 24;
    // dua kolom: kiri (nama, jabatan), kanan (periode, status)
    void ident(double x, double lw, String a, String b) {
      g.drawString(a, f(s: 9), brush: abu, bounds: Rect.fromLTWH(x, y, lw, 13), format: kiri);
      g.drawString(':', f(s: 9), brush: abu, bounds: Rect.fromLTWH(x + lw - 6, y, 8, 13), format: kiri);
      g.drawString(b, f(s: 9.5, b: true), brush: hitam, bounds: Rect.fromLTWH(x + lw + 2, y, wIsi / 2 - lw - 4, 13), format: kiri);
    }

    ident(tepi, 50, 'Nama', teks(s['tutor']));
    ident(tepi + wIsi / 2, 72, 'Periode honor', bulanIndo(teks(s['bulan'])));
    y += 13;
    ident(tepi, 50, 'Jabatan', 'Tutor');
    ident(tepi + wIsi / 2, 72, 'Status', teks(s['status']));
    y += 13;
    if (y < yJ + qr + 10) y = yJ + qr + 10;
    // ── rincian (tabel selebar penuh) ──
    const xNilai = tepi + w - 130, wNilai = 130.0;
    void judul(String t) {
      g.drawRectangle(brush: pita, bounds: Rect.fromLTWH(tepi, y, w, 14));
      g.drawString(t, f(s: 8.5, b: true), brush: hitam, bounds: Rect.fromLTWH(tepi + 4, y, w - 8, 14), format: kiriTengah);
      y += 15;
    }

    void baris(String label, String nilai, {bool tebal = false}) {
      final fl = f(s: 9, b: tebal);
      final h = (fl.measureString(label, layoutArea: Size(w - wNilai - 10, 0), format: kiri).height + 3).clamp(13.0, 40.0);
      g.drawString(label, fl, brush: hitam, bounds: Rect.fromLTWH(tepi + 4, y + 1.5, w - wNilai - 10, h), format: kiri);
      g.drawString(nilai, f(s: 9, b: tebal), brush: hitam, bounds: Rect.fromLTWH(xNilai, y + 1.5, wNilai - 4, h), format: kanan);
      y += h;
      g.drawLine(garisIsi, Offset(tepi, y), Offset(tepi + w, y));
    }

    judul('RINCIAN HONOR');
    for (final x in daftar(s['rincian']).map(peta)) {
      baris(teks(x['label']), x['nilai'] == null ? teks(x['teks']) : rp(x['nilai']));
    }
    baris('Honor bruto', rp(s['bruto']), tebal: true);
    if (angka(s['sisa']) > 0) baris('Sudah dibayar (sisa ${rp(s['sisa'])} belum dibayar)', rp(s['dibayar']));
    baris('Potongan PPh 21', angka(s['pph']) > 0 ? '-${rp(s['pph'])}' : rp(0));
    y += 5;
    // ── diterima bersih ──
    g.drawRectangle(pen: PdfPen(PdfColor(30, 30, 30), width: 1.3), bounds: Rect.fromLTWH(tepi, y, w, 24));
    g.drawString('DITERIMA BERSIH', f(s: 10, b: true), brush: hitam, bounds: Rect.fromLTWH(tepi + 8, y, 200, 24), format: kiriTengah);
    g.drawString(rp(s['bersih']), f(s: 14, b: true), brush: hitam, bounds: Rect.fromLTWH(tepi + w - 220, y, 212, 24), format: kananTengah);
    y += 26;
    g.drawString('Terbilang: ${teks(s['terbilang'])}', f(s: 8.5, i: true), brush: hitam, bounds: Rect.fromLTWH(tepi, y, w, 12), format: kiri);
    y += 14;
    // ── pembayaran ──
    final bayar = daftar(s['pembayaran']).map(peta).toList();
    judul('PEMBAYARAN');
    for (final b in bayar.take(bayar.length > 2 ? 1 : 2)) {
      final ket = [tglIndo(teks(b['tanggal'])), teks(b['metode']), teks(b['rekening']), if (teks(b['sumber']).isNotEmpty) 'dana ${teks(b['sumber'])}']
          .where((e) => e.isNotEmpty)
          .join(' · ');
      baris(ket, rp(b['jumlah']));
    }
    if (bayar.length > 2) baris('… dan ${bayar.length - 1} pembayaran lain', rp(bayar.skip(1).fold<num>(0, (a, b) => a + angka(b['jumlah']))));
    // ── tanda tangan ──
    final yb = top + tinggiSlot - 34 - 89;
    final tglAkhir = bayar.isEmpty ? '' : tglIndo(teks(bayar.last['tanggal']));
    const wt = 200.0;
    final bend = peta(s['bendahara']);
    void ttd(double x, String atas, String nama, String jabatan) {
      g.drawString(atas, f(s: 8.5), brush: hitam, bounds: Rect.fromLTWH(x, yb, wt, 24), format: tengahAtas);
      g.drawString(nama, f(s: 10, b: true), brush: hitam, bounds: Rect.fromLTWH(x, yb + 62, wt, 13), format: tengahAtas);
      g.drawLine(PdfPen(PdfColor(30, 30, 30), width: 0.7), Offset(x + 20, yb + 75), Offset(x + wt - 20, yb + 75));
      g.drawString(jabatan, f(s: 8.5), brush: abu, bounds: Rect.fromLTWH(x, yb + 77, wt, 12), format: tengahAtas);
    }

    ttd(tepi, '\nYang membayarkan,', teks(bend['nama']), teks(bend['jabatan'], 'Bendahara'));
    ttd(tepi + w - wt, '${kp.kota.isEmpty ? '' : '${kp.kota}, '}$tglAkhir\nYang menerima,', teks(s['tutor']), 'Tutor');
    g.drawString('Dicetak untuk keperluan: ${teks(s['keperluan'])}', f(s: 7.5, i: true), brush: hitam,
        bounds: Rect.fromLTWH(tepi, top + tinggiSlot - 30, w, 10), format: kiri);
    g.drawString('Sah bila bertanda tangan Bendahara & berstempel lembaga · verifikasi lewat QR.', f(s: 6.3), brush: abu,
        bounds: Rect.fromLTWH(tepi, top + tinggiSlot - 20, w, 9), format: kiri);
  }
  final bytes = await doc.save();
  doc.dispose();
  return bytes;
}
