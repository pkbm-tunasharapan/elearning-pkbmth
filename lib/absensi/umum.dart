import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../api.dart';
import '../widgets.dart';

String tglIso(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

const _bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
String tglIndo(String iso) {
  final p = iso.split('-');
  if (p.length != 3) return iso;
  final b = int.tryParse(p[1]) ?? 0;
  return '${int.tryParse(p[2]) ?? p[2]} ${b >= 1 && b <= 12 ? _bulan[b - 1] : p[1]} ${p[0]}';
}

Color warnaStatusHadir(BuildContext c, String s) => switch (s) {
      'Hadir' || 'Diterima' || 'Disetujui' => Colors.green,
      'Izin' || 'Dinas' => const Color(0xFF3B82F6),
      'Sakit' || 'Menunggu' || 'Perlu dicek' => const Color(0xFFE9A23B),
      'Alpa' || 'Ditolak' => Theme.of(c).colorScheme.error,
      _ => Theme.of(c).colorScheme.outline,
    };

/// Pindai satu QR lalu kembali dengan isinya (null bila dibatalkan).
Future<String?> pindaiSekali(BuildContext context, {String judul = 'Pindai QR'}) =>
    Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => PemindaiQr(judul: judul)));

/// Layar pemindai QR. Bila [onKode] diisi, layar tetap terbuka (pindai beruntun) dan
/// menampilkan hasil tiap pindaian; bila tidak, layar tertutup dengan isi QR pertama.
class PemindaiQr extends StatefulWidget {
  const PemindaiQr({super.key, this.judul = 'Pindai QR', this.onKode, this.onKodeCepat, this.bawah, this.petunjuk});
  final String judul;
  final Future<String> Function(String kode)? onKode;

  /// Mode cepat (antrean): pindaian langsung dicatat di HP tanpa menunggu server.
  /// Mengembalikan pesan untuk ditampilkan; pemindai siap untuk kartu berikutnya seketika.
  final String Function(String kode)? onKodeCepat;

  /// Panel tambahan di bawah pesan (mis. status antrean pengiriman).
  final Widget? bawah;
  final String? petunjuk;

  @override
  State<PemindaiQr> createState() => _PemindaiQrState();
}

class _PemindaiQrState extends State<PemindaiQr> {
  final _c = MobileScannerController(formats: const [BarcodeFormat.qrCode], detectionSpeed: DetectionSpeed.noDuplicates);
  final _manual = TextEditingController();
  bool _sibuk = false;
  String? _pesan;
  bool _galat = false;
  String _terakhir = '';
  DateTime _waktuTerakhir = DateTime(2000);

  @override
  void dispose() {
    _c.dispose();
    _manual.dispose();
    super.dispose();
  }

  Future<void> _terima(String kode) async {
    kode = kode.trim();
    if (kode.isEmpty || _sibuk) return;
    if (kode == _terakhir && DateTime.now().difference(_waktuTerakhir).inSeconds < (widget.onKodeCepat != null ? 15 : 4)) return;
    _terakhir = kode;
    _waktuTerakhir = DateTime.now();
    if (widget.onKodeCepat != null) {
      HapticFeedback.mediumImpact();
      setState(() { _pesan = widget.onKodeCepat!(kode); _galat = false; });
      return;
    }
    if (widget.onKode == null) {
      Navigator.pop(context, kode);
      return;
    }
    setState(() => _sibuk = true);
    try {
      final h = await widget.onKode!(kode);
      if (mounted) setState(() { _pesan = h; _galat = false; });
    } on ApiException catch (e) {
      if (mounted) setState(() { _pesan = e.ramah; _galat = true; });
    } catch (e) {
      if (mounted) setState(() { _pesan = '$e'; _galat = true; });
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(widget.judul), actions: [
        IconButton(tooltip: 'Lampu', onPressed: () => _c.toggleTorch(), icon: const Icon(Icons.flashlight_on_rounded)),
        IconButton(tooltip: 'Ganti kamera', onPressed: () => _c.switchCamera(), icon: const Icon(Icons.cameraswitch_rounded)),
      ]),
      body: Column(children: [
        Expanded(
          child: Stack(alignment: Alignment.center, children: [
            MobileScanner(
              controller: _c,
              onDetect: (cap) {
                for (final b in cap.barcodes) {
                  final v = b.rawValue;
                  if (v != null && v.trim().isNotEmpty) {
                    _terima(v);
                    break;
                  }
                }
              },
            ),
            IgnorePointer(
              child: Container(
                width: 240,
                height: 240,
                decoration: BoxDecoration(border: Border.all(color: Colors.white, width: 3), borderRadius: BorderRadius.circular(24)),
              ),
            ),
            if (_sibuk) const CircularProgressIndicator(),
          ]),
        ),
        Container(
          color: cs.surfaceContainerLowest,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: SafeArea(
            top: false,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              if (_pesan != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: (_galat ? cs.error : Colors.green).withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
                  child: Row(children: [
                    Icon(_galat ? Icons.error_rounded : Icons.check_circle_rounded, color: _galat ? cs.error : Colors.green),
                    const SizedBox(width: 10),
                    Expanded(child: Text(_pesan!, style: const TextStyle(fontWeight: FontWeight.w700))),
                  ]),
                ),
              if (widget.bawah != null) widget.bawah!,
              Text(widget.petunjuk ?? 'Arahkan kamera ke QR pada kartu.', style: TextStyle(color: cs.onSurfaceVariant, fontSize: 12.5)),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(
                  child: TextField(
                    controller: _manual,
                    decoration: const InputDecoration(isDense: true, hintText: 'Atau ketik NISN / ID / nama'),
                    onSubmitted: (v) { _terima(v); _manual.clear(); },
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(onPressed: () { _terima(_manual.text); _manual.clear(); }, child: const Text('OK')),
              ]),
            ]),
          ),
        ),
      ]),
    );
  }
}

/// Ambil foto dari kamera (selfie = kamera depan), dikecilkan, sebagai data URL JPEG.
Future<String?> ambilFoto({bool selfie = false, bool bolehGaleri = false, BuildContext? context}) async {
  ImageSource sumber = ImageSource.camera;
  if (bolehGaleri && context != null) {
    final s = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.photo_camera_rounded), title: const Text('Ambil dengan kamera'), onTap: () => Navigator.pop(c, ImageSource.camera)),
          ListTile(leading: const Icon(Icons.photo_library_rounded), title: const Text('Pilih dari galeri'), onTap: () => Navigator.pop(c, ImageSource.gallery)),
        ]),
      ),
    );
    if (s == null) return null;
    sumber = s;
  }
  final f = await ImagePicker().pickImage(
    source: sumber,
    preferredCameraDevice: selfie ? CameraDevice.front : CameraDevice.rear,
    maxWidth: 1000,
    maxHeight: 1000,
    imageQuality: 70,
  );
  if (f == null) return null;
  final b = await f.readAsBytes();
  return 'data:image/jpeg;base64,${base64Encode(b)}';
}

/// Lokasi seakurat mungkin: ambil beberapa kali (maks. ~20 detik) dan pakai yang paling akurat.
Future<Position> lokasiAkurat({void Function(String)? info, double cukup = 15}) async {
  if (!await Geolocator.isLocationServiceEnabled()) {
    throw ApiException('GPS/Lokasi di HP belum dinyalakan. Nyalakan lalu ulangi.');
  }
  var izin = await Geolocator.checkPermission();
  if (izin == LocationPermission.denied) izin = await Geolocator.requestPermission();
  if (izin == LocationPermission.denied || izin == LocationPermission.deniedForever) {
    throw ApiException('Izin lokasi ditolak. Izinkan akses lokasi untuk aplikasi ini di Pengaturan HP.');
  }
  Position? terbaik;
  final selesai = DateTime.now().add(const Duration(seconds: 20));
  var n = 0;
  while (DateTime.now().isBefore(selesai) && n < 6) {
    n++;
    info?.call('Membaca lokasi GPS (percobaan $n)...');
    try {
      final p = await Geolocator.getCurrentPosition(locationSettings: const LocationSettings(accuracy: LocationAccuracy.best, timeLimit: Duration(seconds: 10)));
      if (terbaik == null || p.accuracy < terbaik.accuracy) terbaik = p;
      if (p.accuracy <= cukup) break;
    } on TimeoutException {
      // coba lagi
    }
  }
  if (terbaik == null) throw ApiException('Lokasi tidak terbaca. Pastikan GPS aktif lalu ulangi.');
  return terbaik;
}

class FotoServer extends StatelessWidget {
  const FotoServer({super.key, required this.muat});
  final Future<Map<String, dynamic>> Function() muat;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Map<String, dynamic>>(
      future: muat(),
      builder: (c, s) {
        if (s.hasError) return Padding(padding: const EdgeInsets.all(16), child: Text(s.error is ApiException ? (s.error as ApiException).ramah : '${s.error}'));
        if (!s.hasData) return const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()));
        return InteractiveViewer(child: Image.memory(base64Decode(teks(s.data!['b64'])), fit: BoxFit.contain));
      },
    );
  }
}

Future<void> lihatFoto(BuildContext context, Future<Map<String, dynamic>> Function() muat) => showDialog<void>(
      context: context,
      builder: (c) => Dialog(
        clipBehavior: Clip.antiAlias,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Flexible(child: FotoServer(muat: muat)),
          TextButton(onPressed: () => Navigator.pop(c), child: const Text('Tutup')),
        ]),
      ),
    );

Future<String?> mintaTeks(BuildContext context, String judul, {String label = '', String awal = '', bool huruf = false}) async {
  final c = TextEditingController(text: awal);
  final r = await showDialog<String>(
    context: context,
    builder: (d) => AlertDialog(
      title: Text(judul),
      content: TextField(controller: c, autofocus: true, textCapitalization: huruf ? TextCapitalization.characters : TextCapitalization.sentences, decoration: InputDecoration(labelText: label)),
      actions: [
        TextButton(onPressed: () => Navigator.pop(d), child: const Text('Batal')),
        FilledButton(onPressed: () => Navigator.pop(d, c.text.trim()), child: const Text('OK')),
      ],
    ),
  );
  return r;
}

/// Kartu ringkas jumlah per status.
class RingkasStatus extends StatelessWidget {
  const RingkasStatus({super.key, required this.jumlah});
  final Map<String, int> jumlah;

  @override
  Widget build(BuildContext context) => Wrap(spacing: 6, runSpacing: 6, children: [
        for (final e in jumlah.entries) Lencana('${e.key}: ${e.value}', warna: warnaStatusHadir(context, e.key)),
      ]);
}
