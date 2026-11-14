import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:syncfusion_flutter_pdf/pdf.dart';

import 'api.dart';
import 'session.dart';
import 'widgets.dart';
import 'unduh/unduh_stub.dart' if (dart.library.js_interop) 'unduh/unduh_web.dart';

String? get _t => Sesi.instance.token;

/// Batas waktu panggilan AI (server Apps Script berhenti di 6 menit).
const batasAi = Duration(minutes: 7);

/// Berkas PDF yang dipilih dari HP.
class BerkasPdf {
  BerkasPdf({required this.nama, required this.ukuran, this.path, this.bytes});
  final String nama;
  final int ukuran;
  final String? path;
  Uint8List? bytes;

  String get ukuranMb => (ukuran / 1048576).toStringAsFixed(1);

  Future<Uint8List> semua() async {
    if (bytes != null) return bytes!;
    bytes = await File(path!).readAsBytes();
    return bytes!;
  }

  Future<Uint8List> potong(int awal, int akhir) async {
    if (bytes != null) return Uint8List.sublistView(bytes!, awal, akhir);
    final raf = await File(path!).open();
    try {
      await raf.setPosition(awal);
      return await raf.read(akhir - awal);
    } finally {
      await raf.close();
    }
  }
}

/// Memilih satu atau beberapa PDF. Mengembalikan daftar kosong bila dibatalkan.
Future<List<BerkasPdf>> pilihPdf({bool banyak = false}) async {
  final r = await FilePicker.platform.pickFiles(
    type: FileType.custom,
    allowedExtensions: const ['pdf'],
    allowMultiple: banyak,
    withData: kIsWeb,
  );
  if (r == null) return [];
  return [
    for (final f in r.files) BerkasPdf(nama: f.name, ukuran: f.size, path: kIsWeb ? null : f.path, bytes: f.bytes),
  ];
}

/// Memilih berkas teks (.json/.txt) untuk impor hasil Gemini.
Future<List<({String nama, String teks})>> pilihTeks() async {
  final r = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['json', 'txt'], allowMultiple: true, withData: true);
  if (r == null) return [];
  if (r.files.length > 12) throw ApiException('Maksimal 12 berkas sekaligus.');
  final out = <({String nama, String teks})>[];
  for (final f in r.files) {
    if (f.size > 3 * 1048576) throw ApiException('Berkas "${f.name}" terlalu besar (maksimal 3 MB per berkas).');
    final b = f.bytes ?? (f.path != null ? await File(f.path!).readAsBytes() : Uint8List(0));
    out.add((nama: f.name, teks: utf8.decode(b, allowMalformed: true)));
  }
  return out;
}

const _potongan = 8 * 1024 * 1024;

/// Mengunggah PDF ke Gemini lewat server, dipotong 8 MB (sama dengan web).
/// [mulai] memanggil fungsi server yang mengembalikan {uploadUrl}. Mengembalikan ref {name, uri}.
Future<Map<String, dynamic>> unggahPdf(BerkasPdf f, Future<dynamic> Function() mulai, {void Function(int persen)? onProg}) async {
  final r = peta(await mulai());
  final url = teks(r['uploadUrl']);
  if (url.isEmpty) throw ApiException('Server tidak memberi alamat unggahan.');
  var offset = 0;
  while (true) {
    final akhir = math.min(offset + _potongan, f.ukuran);
    final b64 = base64Encode(await f.potong(offset, akhir));
    final terakhir = akhir >= f.ukuran;
    dynamic h;
    for (var coba = 0;; coba++) {
      try {
        h = await Api.instance('waStafAiKirimPotongan', [_t, url, offset, b64, terakhir], const Duration(minutes: 5));
        break;
      } on ApiException {
        if (coba >= 2) rethrow;
        await Future.delayed(const Duration(milliseconds: 1500));
      }
    }
    offset = akhir;
    onProg?.call((offset * 100 / math.max(1, f.ukuran)).round());
    if (terakhir) {
      final ref = peta(peta(h)['ref']);
      if (teks(ref['name']).isEmpty) throw ApiException('Respons unggahan tidak dikenali. Coba lagi.');
      return ref;
    }
  }
}

void bersihkanRef(Map<String, dynamic>? ref) {
  if (ref == null || teks(ref['name']).isEmpty) return;
  Api.instance('waStafAiBersihkan', [_t, teks(ref['name'])]).catchError((_) => null);
}

List<List<int>> _bagiRentang(int n, int k) {
  final out = <List<int>>[];
  final dasar = n ~/ k, sisa = n % k;
  var a = 0;
  for (var i = 0; i < k; i++) {
    final b = a + dasar + (i < sisa ? 1 : 0);
    if (b > a) out.add([a, b]);
    a = b;
  }
  return out;
}

/// Memecah PDF besar per rentang halaman (isi halaman tidak diubah), sama dengan pecahPdf_ di web.
Future<List<BerkasPdf>> pecahPdf(BerkasPdf f, int batasByte, int maksHalaman, void Function(String teks, double frak) info) async {
  final batasKeras = (batasByte * 1.25).round();
  info('Membaca PDF besar...', 0);
  final sumber = await f.semua();
  int n;
  try {
    final d = PdfDocument(inputBytes: sumber);
    n = d.pages.count;
    d.dispose();
  } catch (e) {
    throw ApiException('PDF tidak bisa dibaca untuk dipecah ($e). Coba kompres atau pecah manual.');
  }
  if (n < 2) throw ApiException('PDF hanya berisi $n halaman sehingga tidak bisa dipecah. Kecilkan ukurannya terlebih dahulu.');
  final k = math.min(n, [2, (f.ukuran * 1.15 / batasByte).ceil(), (n / maksHalaman).ceil()].reduce(math.max));
  final antrean = _bagiRentang(n, k);
  final hasil = <Uint8List>[];
  while (antrean.isNotEmpty) {
    final r = antrean.removeAt(0);
    info('Memecah halaman ${r[0] + 1}–${r[1]} dari $n...', r[0] / n);
    await Future<void>.delayed(Duration.zero);
    final d = PdfDocument(inputBytes: sumber);
    for (var i = n - 1; i >= 0; i--) {
      if (i < r[0] || i >= r[1]) d.pages.removeAt(i);
    }
    final bytes = Uint8List.fromList(await d.save());
    d.dispose();
    if (bytes.length > batasKeras && r[1] - r[0] > 1) {
      final tengah = (r[0] + r[1]) ~/ 2;
      antrean.insertAll(0, [
        [r[0], tengah],
        [tengah, r[1]]
      ]);
    } else if (bytes.length > batasKeras) {
      throw ApiException('Satu halaman saja berukuran lebih dari ${batasKeras ~/ 1048576} MB.');
    } else {
      hasil.add(bytes);
    }
  }
  return [
    for (var i = 0; i < hasil.length; i++) BerkasPdf(nama: 'buku-bagian-${i + 1}.pdf', ukuran: hasil[i].length, bytes: hasil[i]),
  ];
}

// ───────────────────────── galat AI (sama dengan jenisGalat_ di web) ─────────────────────────

String bersihTanda(String m) => m.replaceAll(RegExp(r'\s*\[(?:tunggu:\d+|harian)\]'), '').replaceFirst(RegExp(r'^(Error|Exception):\s*'), '');

({String jenis, int detik}) jenisGalat(String msg) {
  if (RegExp(r'\[harian\]').hasMatch(msg)) return (jenis: 'harian', detik: 0);
  final t = RegExp(r'\[tunggu:(\d+)\]').firstMatch(msg);
  if (t != null) return (jenis: 'kuota', detik: int.parse(t[1]!));
  if (RegExp(r'Exceeded maximum execution time|Timed out|batas waktu|Waktu eksekusi|belum menjawab', caseSensitive: false).hasMatch(msg)) return (jenis: 'waktu', detik: 0);
  if (RegExp(r'sedang sibuk|Server error occurred|tidak merespons|network|jaringan|terhubung', caseSensitive: false).hasMatch(msg)) return (jenis: 'sibuk', detik: 0);
  if (RegExp(r'tidak berupa JSON|belum lengkap|terpotong|tidak menghasilkan', caseSensitive: false).hasMatch(msg)) return (jenis: 'jawaban', detik: 0);
  return (jenis: 'lain', detik: 0);
}

/// Galat AI yang sudah dibersihkan; [kuotaHabis] true bila kuota harian/berulang habis.
class GalatAi implements Exception {
  GalatAi(this.pesan, {this.kuotaHabis = false});
  final String pesan;
  final bool kuotaHabis;
  @override
  String toString() => pesan;
}

/// Panggilan AI yang tahan batasan tier gratis (sama dengan panggilAi_ di web):
/// menunggu kuota, mengulang, dan mengecilkan pekerjaan bila waktu habis.
/// [tunggu] dipanggil dengan teks alasan dan detik tunggu untuk ditampilkan.
Future<dynamic> panggilAi(
  String fn,
  List<dynamic> Function() args, {
  required Future<void> Function(String alasan, int detik) tunggu,
  String Function()? kecilkan,
}) async {
  var coba = 0, ulangJawaban = 0;
  while (true) {
    try {
      return await Api.instance(fn, args(), batasAi);
    } on ApiException catch (e) {
      final msg = e.pesan;
      final k = jenisGalat(msg);
      coba++;
      if (k.jenis == 'harian') throw GalatAi(bersihTanda(msg), kuotaHabis: true);
      if (k.jenis == 'lain') throw GalatAi(bersihTanda(msg));
      if (k.jenis == 'waktu') {
        final t = kecilkan?.call() ?? '';
        if (t.isNotEmpty && coba <= 4) {
          await tunggu(t, 3);
          continue;
        }
        throw GalatAi('Proses AI melewati batas waktu server (6 menit) meskipun pekerjaan sudah dikecilkan. Coba lagi beberapa saat lagi. '
            'Bila terus terjadi, gunakan PDF yang lebih ringkas atau minta admin memilih model AI yang lebih cepat.');
      }
      if (k.jenis == 'jawaban') {
        if (++ulangJawaban <= 2) {
          await tunggu('Jawaban AI belum lengkap', 3);
          continue;
        }
        throw GalatAi(bersihTanda(msg));
      }
      if (k.jenis == 'kuota' && coba >= 3) throw GalatAi(bersihTanda(msg), kuotaHabis: true);
      if (coba >= 5) throw GalatAi(bersihTanda(msg));
      if (k.jenis == 'kuota') {
        await tunggu('Kuota AI gratis sedang penuh (percobaan ${coba + 1} dari 3)', math.min(90, math.max(20, k.detik + 3)));
      } else {
        await tunggu('Server AI sedang sibuk (percobaan ${coba + 1} dari 5)', 15 * coba);
      }
    }
  }
}

// ───────────────────────── simpan & buka berkas ─────────────────────────

/// Akun Dinas Pendidikan hanya mengawasi: tidak boleh mengunduh, mencetak, membagikan, atau mengekspor berkas.
bool get bolehUnduh => !Sesi.instance.isDinas;

bool _tolakDinas(BuildContext context) {
  if (bolehUnduh) return false;
  if (context.mounted) kabar(context, 'Akun Dinas Pendidikan hanya dapat melihat. Unduh, cetak, dan ekspor tidak tersedia.', galat: true);
  return true;
}

/// Web: unduh langsung lewat browser lalu beri kabar.
Future<void> _unduhWeb(BuildContext context, List<int> bytes, String nama, String mime) async {
  await unduhBerkasWeb(bytes, nama, mime);
  if (context.mounted) kabar(context, '$nama diunduh ke folder Unduhan.');
}

// v1.39.3: setiap berkas disimpan di folder baru (nama berkas tetap rapi). Bila memakai jalur yang sama, penampil PDF
// di HP sering menampilkan salinan lama dari cache (mis. rapor semester berjalan padahal yang dicetak semester lain).
Future<String> _simpan(List<int> bytes, String nama) async {
  final dir = await getTemporaryDirectory();
  final folder = Directory('${dir.path}/berkas_${DateTime.now().microsecondsSinceEpoch}');
  await folder.create(recursive: true);
  final f = File('${folder.path}/$nama');
  await f.writeAsBytes(bytes, flush: true);
  return f.path;
}

/// Membuka PDF (dari base64 server) dengan penampil PDF di HP. Tombol bagikan/simpan tersedia di sana.
Future<void> bukaPdfB64(BuildContext context, String b64, String nama) async {
  if (_tolakDinas(context)) return;
  if (kIsWeb) return _unduhWeb(context, base64Decode(b64), nama, 'application/pdf');
  final path = await _simpan(base64Decode(b64), nama);
  final r = await OpenFilex.open(path, type: 'application/pdf');
  if (r.type != ResultType.done && context.mounted) {
    await SharePlus.instance.share(ShareParams(files: [XFile(path, mimeType: 'application/pdf')], title: nama));
  }
}

/// Membuka PDF yang dibuat di HP (bytes) dengan penampil PDF; bila gagal, lewat menu Bagikan.
Future<void> bukaPdfBytes(BuildContext context, List<int> bytes, String nama) async {
  if (_tolakDinas(context)) return;
  if (kIsWeb) return _unduhWeb(context, bytes, nama, 'application/pdf');
  final path = await _simpan(bytes, nama);
  final r = await OpenFilex.open(path, type: 'application/pdf');
  if (r.type != ResultType.done && context.mounted) {
    await SharePlus.instance.share(ShareParams(files: [XFile(path, mimeType: 'application/pdf')], title: nama));
  }
}

/// Mengirim satu atau beberapa gambar PNG lewat menu Bagikan (simpan ke Galeri/Drive, WhatsApp, dll.).
Future<void> bagikanPng(BuildContext context, List<({List<int> bytes, String nama})> gambar, {String judul = 'Gambar'}) async {
  if (_tolakDinas(context)) return;
  if (kIsWeb) {
    for (final g in gambar) {
      await unduhBerkasWeb(g.bytes, g.nama, 'image/png');
      // jeda singkat agar browser tidak menolak unduhan beruntun
      if (gambar.length > 1) await Future<void>.delayed(const Duration(milliseconds: 350));
    }
    if (context.mounted) kabar(context, gambar.length > 1 ? '${gambar.length} gambar diunduh ke folder Unduhan.' : '${gambar.first.nama} diunduh ke folder Unduhan.');
    return;
  }
  final files = <XFile>[];
  for (final g in gambar) {
    files.add(XFile(await _simpan(g.bytes, g.nama), mimeType: 'image/png'));
  }
  await SharePlus.instance.share(ShareParams(files: files, title: judul));
}

/// Mengirim dokumen Word (.doc HTML) lewat menu Bagikan (simpan ke Drive, WhatsApp, dll.).
Future<void> bagikanWord(BuildContext context, String html, String nama) async {
  if (_tolakDinas(context)) return;
  if (kIsWeb) return _unduhWeb(context, [0xEF, 0xBB, 0xBF, ...utf8.encode(html)], nama, 'application/msword');
  final path = await _simpan([0xEF, 0xBB, 0xBF, ...utf8.encode(html)], nama);
  final r = await OpenFilex.open(path, type: 'application/msword');
  if (r.type != ResultType.done) {
    await SharePlus.instance.share(ShareParams(files: [XFile(path, mimeType: 'application/msword')], title: nama));
  }
}

/// Membuka/membagikan berkas Excel .xlsx asli (bytes dari server).
Future<void> bagikanXlsx(BuildContext context, List<int> bytes, String nama) async {
  if (_tolakDinas(context)) return;
  const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (kIsWeb) return _unduhWeb(context, bytes, nama, mime);
  final path = await _simpan(bytes, nama);
  final r = await OpenFilex.open(path, type: mime);
  if (r.type != ResultType.done) {
    await SharePlus.instance.share(ShareParams(files: [XFile(path, mimeType: mime)], title: nama));
  }
}

/// Mengirim tabel HTML sebagai berkas Excel (.xls) lewat menu Bagikan.
Future<void> bagikanExcel(BuildContext context, String html, String nama) async {
  if (_tolakDinas(context)) return;
  if (kIsWeb) return _unduhWeb(context, [0xEF, 0xBB, 0xBF, ...utf8.encode(html)], nama, 'application/vnd.ms-excel');
  final path = await _simpan([0xEF, 0xBB, 0xBF, ...utf8.encode(html)], nama);
  final r = await OpenFilex.open(path, type: 'application/vnd.ms-excel');
  if (r.type != ResultType.done) {
    await SharePlus.instance.share(ShareParams(files: [XFile(path, mimeType: 'application/vnd.ms-excel')], title: nama));
  }
}

/// Membuat PDF dari HTML lewat server (waStafHtmlPdf atau fungsi lain) lalu membukanya.
Future<void> htmlKePdf(BuildContext context, {required String nama, String fn = 'waStafHtmlPdf', required List<dynamic> args}) async {
  if (_tolakDinas(context)) return;
  final r = await jalankan(context, () => Api.instance(fn, args, const Duration(minutes: 3)), teksProses: 'Membuat PDF...');
  if (!r.ok || !context.mounted) return;
  await bukaPdfB64(context, teks(peta(r.data)['b64']), nama);
}

String escHtml(dynamic s) => '${s ?? ''}'.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const _bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
String tanggalIni() {
  final t = DateTime.now();
  return '${t.day} ${_bulan[t.month - 1]} ${t.year}';
}

String tanggalBerkas() {
  final t = DateTime.now();
  return '${t.year}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')}';
}

/// v1.79.5: baris keterangan kop disusun piramida terbalik (terpanjang di atas, makin ke bawah makin pendek).
List<String> barisPiramida(Iterable<String> l) {
  final x = l.where((e) => e.trim().isNotEmpty).toList();
  final urut = List<int>.generate(x.length, (i) => i)..sort((a, b) => x[b].length != x[a].length ? x[b].length.compareTo(x[a].length) : a.compareTo(b));
  return [for (final i in urut) x[i]];
}

/// v1.79.5: logo dipudarkan (latar transparan) untuk watermark di tengah cetakan. null bila gagal.
Future<Uint8List?> pngSamar(Uint8List src, {double opasitas = 0.08, int sisi = 900}) async {
  try {
    final codec = await ui.instantiateImageCodec(src);
    final img = (await codec.getNextFrame()).image;
    final skala = sisi / math.max(img.width, img.height);
    final w = (img.width * skala).round(), h = (img.height * skala).round();
    final rec = ui.PictureRecorder();
    final c = Canvas(rec);
    c.drawImageRect(img, Rect.fromLTWH(0, 0, img.width.toDouble(), img.height.toDouble()), Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()),
        Paint()..color = Colors.white.withValues(alpha: opasitas)..filterQuality = FilterQuality.high);
    final hasil = await rec.endRecording().toImage(w, h);
    final b = await hasil.toByteData(format: ui.ImageByteFormat.png);
    return b?.buffer.asUint8List();
  } catch (_) {
    return null;
  }
}

/// v1.79.5: watermark logo samar di tengah halaman cetakan HTML (F4; [lanskap] = 33 × 21,5 cm, margin 10 mm).
/// [dataUri] = 'data:image/png;base64,...' dari logo; kosong = tanpa watermark.
Future<String> watermarkHtml(String dataUri, {bool lanskap = false, double ukuranMm = 120}) async {
  if (!dataUri.startsWith('data:image')) return '';
  final b = await pngSamar(base64Decode(dataUri.substring(dataUri.indexOf(',') + 1)));
  if (b == null) return '';
  final isiW = lanskap ? 310.0 : 195.0, isiH = lanskap ? 195.0 : 310.0;
  final kiri = (isiW - ukuranMm) / 2, atas = (isiH - ukuranMm) / 2;
  return '<div style="position:fixed;left:${kiri.toStringAsFixed(1)}mm;top:${atas.toStringAsFixed(1)}mm;width:${ukuranMm}mm;z-index:-1">'
      '<img src="data:image/png;base64,${base64Encode(b)}" style="width:${ukuranMm}mm"></div>';
}

/// Dokumen HTML untuk dijadikan PDF. Ukuran kertas bawaan semua cetakan: F4 (21,5 × 33 cm); [lanskap] = 33 × 21,5 cm.
/// (Nama fungsi tetap dokumenA4 agar pemanggil lama tidak berubah.)
String dokumenA4(String html, String css, {bool lanskap = false}) =>
    '<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${lanskap ? '330mm 215mm' : '215mm 330mm'};margin:10mm}'
    'body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:10pt;line-height:1.35}$css</style></head><body>$html</body></html>';

// ───────────────────────── tampilan langkah proses ─────────────────────────

/// Satu langkah proses panjang (unggah, susun AI, dst.).
class Langkah {
  Langkah(this.teks, {this.ket = 'Menunggu', this.bobot = 1, this.run});
  final String teks;
  String ket;
  String status = 'tunggu'; // tunggu | jalan | ok | gagal
  double frak = 0;
  final double bobot;
  Future<void> Function(Langkah l)? run;
}

class DaftarLangkah extends StatelessWidget {
  const DaftarLangkah({super.key, required this.langkah, this.tampilBar = true});
  final List<Langkah> langkah;
  final bool tampilBar;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final total = langkah.fold<double>(0, (a, l) => a + l.bobot);
    final isi = langkah.fold<double>(0, (a, l) => a + l.bobot * (l.status == 'ok' ? 1.0 : (l.status == 'tunggu' ? 0.0 : l.frak.clamp(0.0, 1.0).toDouble())));
    final semuaOk = langkah.isNotEmpty && langkah.every((l) => l.status == 'ok');
    final p = semuaOk ? 1.0 : (total == 0 ? 0.0 : math.min(0.99, isi / total));
    final idx = langkah.indexWhere((l) => l.status != 'ok');
    final gagal = langkah.any((l) => l.status == 'gagal');
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (tampilBar && langkah.isNotEmpty) ...[
        Row(children: [
          Expanded(
            child: Text(semuaOk ? 'Selesai' : 'Tahap ${idx + 1} dari ${langkah.length} · ${langkah[idx].teks}',
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          ),
          Text('${(p * 100).floor()}%', style: const TextStyle(fontWeight: FontWeight.w800)),
        ]),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(99),
          child: LinearProgressIndicator(value: p, minHeight: 8, color: gagal ? cs.error : (semuaOk ? Colors.green : null)),
        ),
        const SizedBox(height: 10),
      ],
      for (final l in langkah)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(
              width: 26,
              child: switch (l.status) {
                'ok' => const Icon(Icons.check_circle_rounded, color: Colors.green, size: 22),
                'gagal' => Icon(Icons.warning_rounded, color: cs.error, size: 22),
                'jalan' => const Padding(padding: EdgeInsets.all(3), child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2.2))),
                _ => Icon(Icons.hourglass_empty_rounded, color: cs.outline, size: 20),
              },
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(l.teks, style: const TextStyle(fontWeight: FontWeight.w700)),
                if (l.ket.isNotEmpty) Text(l.ket, style: TextStyle(fontSize: 12.5, color: l.status == 'gagal' ? cs.error : cs.onSurfaceVariant)),
              ]),
            ),
          ]),
        ),
    ]);
  }
}

// ───────────────────────── ekspor tabel (Excel / PDF), APK & web ─────────────────────────

/// Tabel HTML sederhana untuk Excel (.xls) atau PDF.
String tabelHtml(String judul, List<String> kepala, List<List<String>> baris, {String sub = '', bool excel = false}) {
  final b = StringBuffer();
  if (!excel) {
    b.write('<h3 style="margin:0 0 2mm">${escHtml(judul)}</h3>');
    if (sub.isNotEmpty) b.write('<div style="font-size:9pt;margin-bottom:3mm">${escHtml(sub)}</div>');
  }
  b.write('<table border="1" style="border-collapse:collapse;width:100%"><tr>');
  for (final k in kepala) {
    b.write('<th style="background:#ece8f7;padding:3px 5px;font-size:9pt">${escHtml(k)}</th>');
  }
  b.write('</tr>');
  for (final r in baris) {
    b.write('<tr>');
    for (final c in r) {
      b.write('<td style="padding:2px 5px;font-size:9pt;mso-number-format:\'\\@\'">${escHtml(c)}</td>');
    }
    b.write('</tr>');
  }
  b.write('</table>');
  if (excel) {
    return '<html><head><meta charset="utf-8"></head><body>'
        '<table><tr><td><b>${escHtml(judul)}</b></td></tr>${sub.isEmpty ? '' : '<tr><td>${escHtml(sub)}</td></tr>'}</table>$b</body></html>';
  }
  return b.toString();
}

/// Lembar pilihan "Ekspor Excel / PDF" lalu unduh/buka berkasnya.
Future<void> pilihEkspor(BuildContext context, {required String judul, required List<String> kepala, required List<List<String>> baris, String sub = ''}) async {
  if (_tolakDinas(context)) return;
  if (baris.isEmpty) return kabar(context, 'Tidak ada data untuk diekspor.');
  final p = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (c) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), child: Text('Ekspor ${baris.length} baris', style: const TextStyle(fontWeight: FontWeight.w800))),
        ListTile(leading: const Icon(Icons.grid_on_rounded, color: Color(0xFF1D7044)), title: const Text('Excel (.xls)'), onTap: () => Navigator.pop(c, 'xls')),
        ListTile(leading: const Icon(Icons.picture_as_pdf_rounded, color: Color(0xFFC62828)), title: const Text('PDF'), onTap: () => Navigator.pop(c, 'pdf')),
        const SizedBox(height: 8),
      ]),
    ),
  );
  if (p == null || !context.mounted) return;
  final nama = '${judul.replaceAll(RegExp(r'[^A-Za-z0-9]+'), '_')}_${tanggalBerkas()}';
  if (p == 'xls') {
    await bagikanExcel(context, tabelHtml(judul, kepala, baris, sub: sub, excel: true), '$nama.xls');
  } else {
    await htmlKePdf(context, nama: '$nama.pdf', args: [Sesi.instance.token, dokumenA4(tabelHtml(judul, kepala, baris, sub: sub), '', lanskap: kepala.length > 6)]);
  }
}
