import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../berkas.dart' show bagikanPng;
import '../honor/honor.dart' show rp;
import '../widgets.dart';

/// v1.90.0: info bayar (nomor VA, kode bayar, QRIS, tombol e-wallet) sebagai popup di aplikasi, tanpa halaman web.
/// [info] berasal dari server (kolom INFO BAYAR): {jenis: va|mandiri|qris|ewallet|gerai, metode, total, pokok, biaya,
/// kadaluarsa, judul, nama, jenisOrder, bank, nomor, antarBank, kodePerusahaan, kodeBayar, qr, qrUrl, aplikasi, tautan, gerai}.
/// Tidak menampilkan nama penyedia pembayaran. Hasil: true bila lunas.
Future<bool> tampilkanInfoBayar(
  BuildContext context, {
  required Map<String, dynamic> info,
  required Future<String> Function() cekStatus,
  String judul = 'Pembayaran',
  String keterangan = '',
  String lembaga = '',
}) async {
  final r = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (_) => _PopupBayar(info: info, cekStatus: cekStatus, judul: judul, keterangan: keterangan, lembaga: lembaga),
  );
  return r == true;
}

/// Keterangan sesuai konteks pembayaran: "Pembayaran <tagihan> · a.n. <nama>".
String konteksBayar(Map<String, dynamic> info, {String judul = '', String nama = ''}) {
  final j = judul.isNotEmpty ? judul : teks(info['judul']);
  final n = nama.isNotEmpty ? nama : teks(info['nama']);
  return [if (j.isNotEmpty) 'Pembayaran $j', if (n.isNotEmpty) 'a.n. $n'].join(' · ');
}

DateTime? _batas(Map<String, dynamic> info) {
  final s = teks(info['kadaluarsa']).trim();
  if (s.length < 16) return null;
  return DateTime.tryParse('${s.substring(0, 10)}T${s.substring(11, s.length >= 19 ? 19 : 16)}${s.length >= 19 ? '' : ':00'}+07:00');
}

String _teksBatas(Map<String, dynamic> info) {
  final s = teks(info['kadaluarsa']).trim();
  return s.length >= 16 ? s.substring(0, 16) : s;
}

/// Judul cara bayar per jenis (tanpa nama penyedia).
String judulInfoBayar(Map<String, dynamic> info) => switch (teks(info['jenis'])) {
      'va' => info['antarBank'] == true ? 'Transfer antarbank ke Virtual Account ${teks(info['bank'])}' : 'Transfer ke Virtual Account ${teks(info['bank'])}',
      'mandiri' => 'Bayar lewat Mandiri (Livin / ATM)',
      'qris' => 'Pindai QRIS',
      'ewallet' => 'Bayar dengan ${teks(info['aplikasi'], 'e-wallet')}',
      'gerai' => 'Bayar di kasir ${teks(info['gerai'], 'gerai')}',
      _ => teks(info['metode'], 'Pembayaran online'),
    };

/// Langkah singkat per jenis.
List<String> langkahBayar(Map<String, dynamic> info) {
  final bank = teks(info['bank']);
  return switch (teks(info['jenis'])) {
    'va' when info['antarBank'] == true => [
        'Buka m-banking / ATM bank Anda, pilih Transfer → Antarbank (ATM Bersama / Prima / Alto).',
        'Pilih bank tujuan $bank, masukkan nomor Virtual Account di atas.',
        'Pastikan nama & jumlah sesuai, lalu konfirmasi.',
      ],
    'va' => [
        'Buka m-banking / ATM / internet banking $bank.',
        'Pilih menu Transfer → Virtual Account (atau Bayar → Virtual Account).',
        'Masukkan nomor Virtual Account di atas; jumlah tagihan muncul otomatis.',
        'Periksa nama & jumlah, lalu konfirmasi.',
      ],
    'mandiri' => [
        'Buka Livin\' by Mandiri / ATM Mandiri, pilih Bayar → Multipayment.',
        'Masukkan Kode Perusahaan, lalu Kode Bayar di atas.',
        'Periksa jumlah, lalu konfirmasi.',
      ],
    'qris' => [
        'Buka aplikasi e-wallet atau m-banking yang mendukung QRIS.',
        'Pindai QR di atas. Bila membayar dari HP ini: simpan gambar QR, lalu pilih "Scan dari galeri".',
        'Periksa jumlah, lalu konfirmasi.',
      ],
    'ewallet' => ['Tekan tombol di atas untuk membuka aplikasi ${teks(info['aplikasi'], 'e-wallet')}, lalu konfirmasi pembayaran.'],
    'gerai' => ['Datang ke kasir ${teks(info['gerai'])}, sebutkan pembayaran online.', 'Tunjukkan Kode Bayar di atas dan bayar sesuai total.'],
    _ => const [],
  };
}

/// Pesan teks (WA / salin) sesuai konteks pembayaran.
String pesanInfoBayar(Map<String, dynamic> info, {String nama = '', String judul = '', String lembaga = ''}) {
  final b = StringBuffer();
  final n = nama.isNotEmpty ? nama : teks(info['nama']);
  final j = judul.isNotEmpty ? judul : teks(info['judul']);
  b.writeln('Yth. ${n.isEmpty ? 'Bapak/Ibu' : n}, berikut pembayaran${j.isEmpty ? '' : ' $j'}${lembaga.isEmpty ? '' : ' di $lembaga'}:');
  b.writeln(judulInfoBayar(info));
  switch (teks(info['jenis'])) {
    case 'va':
      b.writeln('Nomor VA: ${teks(info['nomor'])}');
    case 'mandiri':
      b.writeln('Kode Perusahaan: ${teks(info['kodePerusahaan'])}');
      b.writeln('Kode Bayar: ${teks(info['kodeBayar'])}');
    case 'gerai':
      b.writeln('Kode Bayar: ${teks(info['kodeBayar'])}');
    case 'ewallet':
      if (teks(info['tautan']).isNotEmpty) b.writeln(teks(info['tautan']));
  }
  b.writeln('Total: ${rp(info['total'])}${info['biaya'] != null && angka(info['biaya']) > 0 ? ' (${rp(info['pokok'])} + biaya admin ${rp(info['biaya'])})' : ''}');
  if (_teksBatas(info).isNotEmpty) b.writeln('Bayar sebelum ${_teksBatas(info)} WIB.');
  b.write('Status lunas tercatat otomatis. Terima kasih.');
  return b.toString();
}

/// Gambar instruksi bayar (PNG) sesuai konteks: lembaga, tagihan, a.n., cara bayar, nomor/kode/QR, total, batas waktu.
Future<Uint8List> pngInfoBayar(Map<String, dynamic> info, {String judul = '', String nama = '', String lembaga = ''}) async {
  const lebar = 720.0, pad = 36.0, sisi = 420.0;
  TextPainter tp(String s, double ukuran, {FontWeight w = FontWeight.w500, Color warna = Colors.black87}) => TextPainter(
        text: TextSpan(text: s, style: TextStyle(color: warna, fontSize: ukuran, fontWeight: w, height: 1.3)),
        textAlign: TextAlign.center,
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: lebar - 2 * pad);
  final jenis = teks(info['jenis']);
  final qr = teks(info['qr']);
  final adaQr = (jenis == 'qris' || jenis == 'ewallet') && qr.isNotEmpty;
  final kode = switch (jenis) {
    'va' => teks(info['nomor']),
    'mandiri' => 'Kode Perusahaan ${teks(info['kodePerusahaan'])}\nKode Bayar ${teks(info['kodeBayar'])}',
    'gerai' => teks(info['kodeBayar']),
    _ => '',
  };
  final atas = [
    if (lembaga.isNotEmpty) tp(lembaga, 26, w: FontWeight.w800),
    tp(konteksBayar(info, judul: judul, nama: nama), 22, w: FontWeight.w700),
    tp(judulInfoBayar(info), 22),
    if (kode.isNotEmpty) tp(kode, jenis == 'mandiri' ? 30 : 40, w: FontWeight.w800, warna: const Color(0xFF0D47A1)),
  ];
  final bawah = [
    tp('Total ${rp(info['total'])}', 34, w: FontWeight.w800, warna: const Color(0xFF1B5E20)),
    if (angka(info['biaya']) > 0) tp('${rp(info['pokok'])} + biaya admin ${rp(info['biaya'])}', 18, warna: Colors.black54),
    if (_teksBatas(info).isNotEmpty) tp('Bayar sebelum ${_teksBatas(info)} WIB', 18, warna: Colors.black54),
    for (final l in langkahBayar(info)) tp(l, 16, warna: Colors.black54),
  ];
  var tinggi = pad;
  for (final t in atas) {
    tinggi += t.height + 10;
  }
  if (adaQr) tinggi += sisi + 24;
  for (final t in bawah) {
    tinggi += t.height + 8;
  }
  tinggi += pad;
  final rec = ui.PictureRecorder();
  final c = Canvas(rec);
  c.drawRect(Rect.fromLTWH(0, 0, lebar, tinggi), Paint()..color = Colors.white);
  var y = pad;
  for (final t in atas) {
    t.paint(c, Offset((lebar - t.width) / 2, y));
    y += t.height + 10;
  }
  if (adaQr) {
    c.save();
    c.translate((lebar - sisi) / 2, y + 8);
    QrPainter(data: qr, version: QrVersions.auto, gapless: true).paint(c, const Size(sisi, sisi));
    c.restore();
    y += sisi + 24;
  }
  for (final t in bawah) {
    t.paint(c, Offset((lebar - t.width) / 2, y));
    y += t.height + 8;
  }
  final img = await rec.endRecording().toImage(lebar.round(), tinggi.round());
  final b = await img.toByteData(format: ui.ImageByteFormat.png);
  return b!.buffer.asUint8List();
}

/// Isi info bayar (dipakai di popup dan di layar VA custom).
class PanelInfoBayar extends StatelessWidget {
  const PanelInfoBayar({super.key, required this.info, this.judul = '', this.nama = '', this.lembaga = ''});
  final Map<String, dynamic> info;
  final String judul, nama, lembaga;

  void _salin(BuildContext context, String isi, String apa) {
    Clipboard.setData(ClipboardData(text: isi));
    kabar(context, '$apa disalin.');
  }

  Widget _kotakKode(BuildContext context, String label, String isi, {double ukuran = 24}) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.fromLTRB(14, 8, 6, 8),
      decoration: BoxDecoration(color: cs.primaryContainer.withValues(alpha: 0.5), borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
            SelectableText(isi, style: TextStyle(fontSize: ukuran, fontWeight: FontWeight.w800, letterSpacing: 1.2)),
          ]),
        ),
        TextButton.icon(onPressed: () => _salin(context, isi.replaceAll(' ', ''), label), icon: const Icon(Icons.copy_rounded, size: 18), label: const Text('Salin')),
      ]),
    );
  }

  Widget _qr(BuildContext context) {
    final qr = teks(info['qr']), url = teks(info['qrUrl']);
    final Widget gambar = qr.isNotEmpty
        ? QrImageView(data: qr, version: QrVersions.auto, size: 220, backgroundColor: Colors.white)
        : Image.network(url, width: 220, height: 220, errorBuilder: (c, e, s) => const SizedBox(width: 220, height: 60, child: Center(child: Text('QR belum bisa dimuat.'))));
    return Column(children: [
      const SizedBox(height: 8),
      Container(padding: const EdgeInsets.all(8), color: Colors.white, child: gambar),
      if (qr.isNotEmpty)
        TextButton.icon(
          onPressed: () async {
            final png = await pngInfoBayar(info, judul: judul, nama: nama, lembaga: lembaga);
            if (!context.mounted) return;
            await bagikanPng(context, [(bytes: png, nama: 'QR_bayar.png')], judul: 'QR pembayaran');
          },
          icon: const Icon(Icons.download_rounded, size: 18),
          label: const Text('Simpan / bagikan gambar QR'),
        ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final jenis = teks(info['jenis']);
    final ket = konteksBayar(info, judul: judul, nama: nama);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
      if (ket.isNotEmpty) Text(ket, style: const TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      Text(judulInfoBayar(info), style: TextStyle(fontWeight: FontWeight.w800, color: cs.primary)),
      if (jenis == 'va') _kotakKode(context, 'Nomor Virtual Account', teks(info['nomor'])),
      if (jenis == 'mandiri') ...[
        _kotakKode(context, 'Kode Perusahaan', teks(info['kodePerusahaan']), ukuran: 20),
        _kotakKode(context, 'Kode Bayar', teks(info['kodeBayar'])),
      ],
      if (jenis == 'gerai') _kotakKode(context, 'Kode Bayar (tunjukkan ke kasir)', teks(info['kodeBayar'])),
      if (jenis == 'qris') _qr(context),
      if (jenis == 'ewallet') ...[
        const SizedBox(height: 8),
        if (teks(info['tautan']).isNotEmpty)
          FilledButton.icon(
            onPressed: () => launchUrl(Uri.parse(teks(info['tautan'])), mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.open_in_new_rounded),
            label: Text('Buka ${teks(info['aplikasi'], 'e-wallet')}'),
          ),
        if (teks(info['qr']).isNotEmpty || teks(info['qrUrl']).isNotEmpty) ...[
          const SizedBox(height: 6),
          Text('Atau pindai dari HP lain:', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
          _qr(context),
        ],
      ],
      const SizedBox(height: 10),
      _kotakKode(context, 'Total', rp(info['total']), ukuran: 20),
      if (angka(info['biaya']) > 0)
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text('${rp(info['pokok'])} + biaya admin ${rp(info['biaya'])}', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
        ),
      ExpansionTile(
        tilePadding: EdgeInsets.zero,
        title: const Text('Cara bayar', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
        children: [
          for (final (i, l) in langkahBayar(info).indexed)
            Align(alignment: Alignment.centerLeft, child: Padding(padding: const EdgeInsets.only(bottom: 4), child: Text('${i + 1}. $l', style: const TextStyle(fontSize: 12.5)))),
        ],
      ),
    ]);
  }
}

class _PopupBayar extends StatefulWidget {
  const _PopupBayar({required this.info, required this.cekStatus, required this.judul, required this.keterangan, required this.lembaga});
  final Map<String, dynamic> info;
  final Future<String> Function() cekStatus;
  final String judul, keterangan, lembaga;

  @override
  State<_PopupBayar> createState() => _PopupBayarState();
}

class _PopupBayarState extends State<_PopupBayar> {
  Timer? _cekBerkala, _detik;
  bool _sibuk = false, _lunas = false;
  String _status = 'Menunggu';

  @override
  void initState() {
    super.initState();
    _cekBerkala = Timer.periodic(const Duration(seconds: 6), (_) => _cek(diam: true));
    _detik = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _cekBerkala?.cancel();
    _detik?.cancel();
    super.dispose();
  }

  Future<void> _cek({bool diam = false}) async {
    if (_sibuk || _lunas) return;
    _sibuk = true;
    try {
      final st = await widget.cekStatus();
      if (!mounted) return;
      setState(() => _status = st);
      if (st == 'Lunas') {
        _lunas = true;
        _cekBerkala?.cancel();
        _detik?.cancel();
      } else if (!diam) {
        kabar(context, st == 'Menunggu' ? 'Pembayaran belum diterima. Status diperbarui otomatis.' : 'Status: $st');
      }
    } catch (_) {
      if (!diam && mounted) kabar(context, 'Belum bisa memeriksa status. Coba lagi.', galat: true);
    } finally {
      _sibuk = false;
    }
  }

  String _sisaWaktu() {
    final b = _batas(widget.info);
    if (b == null) return '';
    final d = b.difference(DateTime.now());
    if (d.isNegative) return 'Batas waktu sudah lewat';
    String dua(int n) => n.toString().padLeft(2, '0');
    final jam = d.inHours, mnt = d.inMinutes % 60, dtk = d.inSeconds % 60;
    return 'Sisa waktu ${jam > 0 ? '$jam:' : ''}${dua(mnt)}:${dua(dtk)} · sebelum ${_teksBatas(widget.info)} WIB';
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final selesai = _lunas;
    final gagal = _status == 'Kedaluwarsa' || _status == 'Gagal';
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 440),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(18, 14, 8, 12),
            decoration: BoxDecoration(color: cs.primary, borderRadius: const BorderRadius.vertical(top: Radius.circular(20))),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(widget.lembaga.isEmpty ? 'Pembayaran' : widget.lembaga, style: TextStyle(color: cs.onPrimary, fontWeight: FontWeight.w800, fontSize: 16)),
                  if (widget.judul.isNotEmpty) Text(widget.judul, style: TextStyle(color: cs.onPrimary.withValues(alpha: 0.85), fontSize: 12.5)),
                ]),
              ),
              IconButton(onPressed: () => Navigator.of(context).pop(selesai), icon: Icon(Icons.close_rounded, color: cs.onPrimary)),
            ]),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(18, 14, 18, 8),
              child: selesai
                  ? Column(children: [
                      const Icon(Icons.check_circle_rounded, size: 84, color: Colors.green),
                      const SizedBox(height: 8),
                      const Text('Pembayaran berhasil', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: Colors.green)),
                      const SizedBox(height: 4),
                      Text('${rp(widget.info['total'])} · tercatat otomatis', textAlign: TextAlign.center),
                      if (widget.keterangan.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(widget.keterangan, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5))),
                    ])
                  : PanelInfoBayar(info: widget.info, judul: teks(widget.info['judul'], widget.judul), lembaga: widget.lembaga),
            ),
          ),
          if (!selesai)
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 0, 18, 4),
              child: Row(children: [
                if (!gagal) const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)) else Icon(Icons.error_outline_rounded, size: 18, color: cs.error),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(gagal ? 'Pembayaran $_status. Tutup lalu buat pembayaran baru.' : 'Menunggu pembayaran · ${_sisaWaktu()}',
                      style: TextStyle(fontSize: 12, color: gagal ? cs.error : cs.onSurfaceVariant)),
                ),
              ]),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
            child: Wrap(alignment: WrapAlignment.end, spacing: 6, runSpacing: 4, children: [
              if (!selesai) ...[
                TextButton.icon(
                  onPressed: () async {
                    final png = await pngInfoBayar(widget.info, judul: teks(widget.info['judul'], widget.judul), lembaga: widget.lembaga);
                    if (!context.mounted) return;
                    await bagikanPng(context, [(bytes: png, nama: 'Instruksi_bayar.png')], judul: 'Instruksi bayar');
                  },
                  icon: const Icon(Icons.share_rounded, size: 18),
                  label: const Text('Bagikan instruksi'),
                ),
                TextButton(onPressed: _sibuk ? null : () => _cek(), child: const Text('Saya sudah bayar')),
              ],
              FilledButton(onPressed: () => Navigator.of(context).pop(selesai), child: Text(selesai ? 'Selesai' : 'Tutup')),
            ]),
          ),
        ]),
      ),
    );
  }
}
