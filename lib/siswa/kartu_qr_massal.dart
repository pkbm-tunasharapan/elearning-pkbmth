import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:syncfusion_flutter_pdf/pdf.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

/// Ukuran tata letak PDF: jumlah kolom QR per baris di kertas F4.
const _tataLetak = <int, String>{2: 'Besar (2 kolom)', 3: 'Sedang (3 kolom)', 4: 'Kecil (4 kolom)'};

/// Kartu QR siswa untuk dicetak / dijadikan ID Card (khusus admin).
/// Isi QR = NISN (atau ID WB bila NISN kosong) dari SIM SETARA, sama dengan kartu siswa digital
/// sehingga langsung dikenali pemindai absensi, ujian, dan keuangan. Keterangan hanya nama siswa.
class KartuQrMassalScreen extends StatefulWidget {
  const KartuQrMassalScreen({super.key});

  @override
  State<KartuQrMassalScreen> createState() => _KartuQrMassalScreenState();
}

class _KartuQrMassalScreenState extends State<KartuQrMassalScreen> {
  String _rombel = '';
  int _kolom = 3;
  final _cari = TextEditingController();
  String _saring = '';

  @override
  void dispose() {
    _cari.dispose();
    super.dispose();
  }

  Future<Map<String, dynamic>> _muat() async => peta(await Api.instance('waAdminKartuQr', [_t, _rombel], const Duration(seconds: 120)));

  String _namaBerkas(String s) => s.replaceAll(RegExp(r'[^A-Za-z0-9 _-]'), '').trim().replaceAll(RegExp(r'\s+'), '_');

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_rombel),
      muat: _muat,
      bangun: (context, d, segarkan) {
        final rombel = daftar(d['rombel']).map(peta).toList();
        final semua = daftar(d['siswa']).map(peta).toList();
        final q = _saring.toLowerCase();
        final siswa = q.isEmpty ? semua : semua.where((s) => teks(s['nama']).toLowerCase().contains(q)).toList();
        final tanpaKode = daftar(d['tanpaKode']).map((x) => teks(x)).toList();
        final cs = Theme.of(context).colorScheme;
        final namaRombel = _rombel == '*' ? 'Semua rombel' : teks(rombel.firstWhere((r) => teks(r['id']) == _rombel, orElse: () => {})['nama']);
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Card(
            color: cs.primaryContainer,
            child: const Padding(
              padding: EdgeInsets.all(14),
              child: Text('QR berisi NISN (atau ID Warga Belajar bila NISN kosong) dari Data Induk, sama dengan kartu siswa digital, '
                  'sehingga dapat langsung dipindai untuk absensi, ujian, dan keuangan. Keterangan di bawah QR hanya nama siswa.'),
            ),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _rombel.isEmpty ? null : _rombel,
            hint: const Text('Pilih rombel'),
            decoration: const InputDecoration(labelText: 'Rombel'),
            items: [
              const DropdownMenuItem(value: '*', child: Text('Semua rombel aktif')),
              for (final r in rombel)
                DropdownMenuItem(value: teks(r['id']), child: Text([teks(r['nama']), if (teks(r['program']).isNotEmpty) teks(r['program'])].join(' · '))),
            ],
            onChanged: (v) => setState(() {
              _rombel = v ?? '';
              _cari.clear();
              _saring = '';
            }),
          ),
          if (_rombel.isEmpty) const Kosong(pesan: 'Pilih rombel untuk menampilkan QR siswa.', ikon: Icons.qr_code_2_rounded),
          if (_rombel.isNotEmpty) ...[
            const SizedBox(height: 10),
            DropdownButtonFormField<int>(
              initialValue: _kolom,
              decoration: const InputDecoration(labelText: 'Ukuran QR di PDF (kertas F4)', isDense: true),
              items: [for (final e in _tataLetak.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
              onChanged: (v) => setState(() => _kolom = v ?? 3),
            ),
            const SizedBox(height: 10),
            Row(children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: siswa.isEmpty ? null : () => _buatPdf(siswa, namaRombel),
                  icon: const Icon(Icons.picture_as_pdf_rounded),
                  label: const Text('Unduh PDF'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: siswa.isEmpty ? null : () => _bagikanPng(siswa, namaRombel),
                  icon: const Icon(Icons.image_rounded),
                  label: const Text('Semua PNG'),
                ),
              ),
            ]),
            const SizedBox(height: 10),
            TextField(
              controller: _cari,
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari nama siswa', isDense: true),
              onChanged: (v) => setState(() => _saring = v.trim()),
            ),
            const SizedBox(height: 8),
            Text('${siswa.length} siswa aktif${q.isEmpty ? '' : ' (tersaring)'} · ketuk kartu untuk membagikan PNG satu siswa',
                style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
            if (tanpaKode.isNotEmpty)
              Card(
                color: cs.errorContainer,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text('${tanpaKode.length} siswa belum punya NISN maupun ID WB di Data Induk sehingga tidak dibuatkan QR: ${tanpaKode.join(', ')}'),
                ),
              ),
            if (siswa.isEmpty) const Kosong(pesan: 'Tidak ada siswa aktif dengan NISN/ID WB di rombel ini.', ikon: Icons.person_off_rounded),
            const SizedBox(height: 6),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 180, mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: 0.78),
              itemCount: siswa.length,
              itemBuilder: (_, i) {
                final s = siswa[i];
                return Card(
                  margin: EdgeInsets.zero,
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => _bagikanPng([s], teks(s['nama'])),
                    child: Padding(
                      padding: const EdgeInsets.all(8),
                      child: Column(children: [
                        Expanded(
                          child: Container(
                            color: Colors.white,
                            padding: const EdgeInsets.all(4),
                            child: QrImageView(data: teks(s['kode']), version: QrVersions.auto, backgroundColor: Colors.white, padding: EdgeInsets.zero),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(teks(s['nama']), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
                        if (_rombel == '*') Text(teks(s['namaRombel']), style: TextStyle(fontSize: 11, color: cs.onSurfaceVariant)),
                      ]),
                    ),
                  ),
                );
              },
            ),
          ],
        ]);
      },
    );
  }

  /// Gambar QR (tanpa teks) sebagai PNG berlatar putih.
  Future<Uint8List> _pngQr(String kode, double sisi) async {
    final rec = ui.PictureRecorder();
    final c = Canvas(rec);
    c.drawRect(Rect.fromLTWH(0, 0, sisi, sisi), Paint()..color = Colors.white);
    final tepi = sisi * 0.04;
    c.translate(tepi, tepi);
    QrPainter(data: kode, version: QrVersions.auto, gapless: true).paint(c, Size(sisi - 2 * tepi, sisi - 2 * tepi));
    final img = await rec.endRecording().toImage(sisi.round(), sisi.round());
    final b = await img.toByteData(format: ui.ImageByteFormat.png);
    return b!.buffer.asUint8List();
  }

  /// Gambar QR + nama di bawahnya sebagai PNG (untuk ditempel di desain ID Card).
  Future<Uint8List> _pngKartu(String kode, String nama) async {
    const lebar = 600.0, sisi = 560.0, pad = 20.0;
    final tp = TextPainter(
      text: TextSpan(text: nama, style: const TextStyle(color: Colors.black, fontSize: 34, fontWeight: FontWeight.w700)),
      textAlign: TextAlign.center,
      textDirection: TextDirection.ltr,
      maxLines: 2,
      ellipsis: '…',
    )..layout(maxWidth: lebar - 2 * pad);
    final tinggi = pad + sisi + 14 + tp.height + pad;
    final rec = ui.PictureRecorder();
    final c = Canvas(rec);
    c.drawRect(Rect.fromLTWH(0, 0, lebar, tinggi), Paint()..color = Colors.white);
    c.save();
    c.translate(pad, pad);
    QrPainter(data: kode, version: QrVersions.auto, gapless: true).paint(c, const Size(sisi, sisi));
    c.restore();
    tp.paint(c, Offset((lebar - tp.width) / 2, pad + sisi + 14));
    final img = await rec.endRecording().toImage(lebar.round(), tinggi.round());
    final b = await img.toByteData(format: ui.ImageByteFormat.png);
    return b!.buffer.asUint8List();
  }

  Future<void> _bagikanPng(List<Map<String, dynamic>> siswa, String judul) async {
    if (siswa.length > 60 &&
        !await konfirmasi(context, 'Bagikan ${siswa.length} gambar?', 'Jumlahnya banyak; sebagian aplikasi tujuan membatasi jumlah lampiran. Untuk cetak massal lebih baik pakai Unduh PDF.', ya: 'Lanjutkan')) {
      return;
    }
    if (!mounted) return;
    final r = await jalankan(context, () async {
      final out = <({List<int> bytes, String nama})>[];
      for (final s in siswa) {
        out.add((bytes: await _pngKartu(teks(s['kode']), teks(s['nama'])), nama: 'QR_${_namaBerkas(teks(s['nama']))}.png'));
      }
      return out;
    }, teksProses: 'Membuat ${siswa.length} gambar QR...');
    if (!r.ok || !mounted) return;
    await bagikanPng(context, r.data!, judul: 'Kartu QR $judul');
  }

  Future<void> _buatPdf(List<Map<String, dynamic>> siswa, String namaRombel) async {
    final kolom = _kolom;
    final r = await jalankan(context, () async {
      final doc = PdfDocument();
      // v1.40.1: kertas F4 (21,5 × 33 cm = 609,45 × 935,43 pt)
      doc.pageSettings.size = const Size(609.45, 935.43);
      doc.pageSettings.margins.all = 24;
      final fontNama = PdfStandardFont(PdfFontFamily.helvetica, kolom >= 4 ? 8.0 : (kolom == 3 ? 9.5 : 12.0), style: PdfFontStyle.bold);
      final garis = PdfPen(PdfColor(190, 190, 190), width: 0.5)..dashStyle = PdfDashStyle.dash;
      final format = PdfStringFormat(alignment: PdfTextAlignment.center, lineAlignment: PdfVerticalAlignment.top, wordWrap: PdfWordWrapType.word);
      final samarB = await logoSamarBytes();   // v1.79.7: watermark logo samar per halaman
      final samar = samarB == null ? null : PdfBitmap(samarB);
      late PdfPage hal;
      late Size area;
      late double selW, selH, tinggiNama;
      var baris = 0, perHal = 0;
      for (var i = 0; i < siswa.length; i++) {
        if (i == 0 || i % perHal == 0) {
          hal = doc.pages.add();
          area = hal.getClientSize();
          if (samar != null) {
            final s = area.width * 0.62, t = s * samar.height / samar.width;
            hal.graphics.drawImage(samar, Rect.fromLTWH((area.width - s) / 2, (area.height - t) / 2, s, t));
          }
          selW = area.width / kolom;
          tinggiNama = kolom >= 4 ? 24.0 : (kolom == 3 ? 28.0 : 36.0);
          selH = selW + tinggiNama - 4;
          baris = (area.height / selH).floor();
          perHal = baris * kolom;
        }
        final idx = i % perHal;
        final x = (idx % kolom) * selW, y = (idx ~/ kolom) * selH;
        final s = siswa[i];
        final pad = selW * 0.08;
        final sisiQr = selW - 2 * pad;
        hal.graphics.drawRectangle(pen: garis, bounds: Rect.fromLTWH(x + 2, y + 2, selW - 4, selH - 4));
        hal.graphics.drawImage(PdfBitmap(await _pngQr(teks(s['kode']), 360)), Rect.fromLTWH(x + pad, y + pad * 0.7, sisiQr, sisiQr));
        hal.graphics.drawString(teks(s['nama']), fontNama, bounds: Rect.fromLTWH(x + 4, y + pad * 0.7 + sisiQr + 2, selW - 8, tinggiNama), format: format);
      }
      final bytes = await doc.save();
      doc.dispose();
      return bytes;
    }, teksProses: 'Menyusun PDF ${siswa.length} kartu...');
    if (!r.ok || !mounted) return;
    await bukaPdfBytes(context, r.data!, 'Kartu_QR_${_namaBerkas(namaRombel)}.pdf');
  }
}
