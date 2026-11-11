import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../api.dart';
import '../honor/honor.dart' show rp;
import '../widgets.dart';

/// v1.49.0: pembayaran online DOKU dengan biaya admin ditanggung pembayar.
/// Total = pokok + biaya admin metode (sama dengan hitungan server gwHitungTotal_), tidak bisa diubah.
({int pokok, int biaya, int total}) hitungTotalBayar(num pokok, Map<String, dynamic> m) {
  final p0 = pokok.round();
  final persen = (m['persen'] is num ? m['persen'] as num : num.tryParse('${m['persen']}') ?? 0) / 100;
  final tetap = (m['tetap'] is num ? m['tetap'] as num : num.tryParse('${m['tetap']}') ?? 0).round();
  final total = persen > 0 && persen < 0.5 ? ((p0 + tetap) / (1 - persen)).ceil() : p0 + tetap;
  return (pokok: p0, biaya: total - p0, total: total);
}

/// Pilih metode bayar; tiap metode menampilkan tagihan + biaya admin = total. Hasil: kode metode (null = batal).
Future<String?> pilihMetodeBayar(BuildContext context, {required num pokok, required List<Map<String, dynamic>> metode, String judul = 'Pilih metode pembayaran'}) {
  final grup = <String, List<Map<String, dynamic>>>{};
  for (final m in metode) {
    grup.putIfAbsent(teks(m['grup'], 'Lainnya'), () => []).add(m);
  }
  return showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (c) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(c).size.height * 0.85),
        child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
          Text(judul, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          Text('Tagihan ${rp(pokok)}. Biaya admin tiap metode ditanggung pembayar; total tidak bisa diubah.', style: const TextStyle(fontSize: 12.5)),
          for (final g in grup.entries) ...[
            Padding(padding: const EdgeInsets.only(top: 12, bottom: 4), child: Text(g.key, style: const TextStyle(fontWeight: FontWeight.w700))),
            for (final m in g.value)
              Builder(builder: (c2) {
                final h = hitungTotalBayar(pokok, m);
                return Card(
                  margin: const EdgeInsets.symmetric(vertical: 3),
                  child: ListTile(
                    dense: true,
                    title: Text(teks(m['nama'])),
                    subtitle: Text('${rp(h.pokok)} + biaya admin ${rp(h.biaya)}'),
                    trailing: Text(rp(h.total), style: const TextStyle(fontWeight: FontWeight.w800)),
                    onTap: () => Navigator.pop(c, teks(m['kode'])),
                  ),
                );
              }),
          ],
        ]),
      ),
    ),
  );
}

/// Buka halaman pembayaran DOKU tanpa menampilkan link: Android = popup layar penuh di dalam aplikasi (WebView);
/// web = tab baru + jendela "menunggu pembayaran". [cekStatus] mengembalikan status order ('Lunas', 'Menunggu', ...).
/// Hasil: true bila lunas.
Future<bool> bukaPembayaranDoku(BuildContext context, {required String url, required Future<String> Function() cekStatus, String judul = 'Pembayaran'}) async {
  if (url.isEmpty) return false;
  if (kIsWeb) {
    await launchUrl(Uri.parse(url), webOnlyWindowName: '_blank');
    if (!context.mounted) return false;
    final r = await showDialog<bool>(context: context, barrierDismissible: false, builder: (_) => _TungguBayar(cekStatus: cekStatus, url: url));
    return r == true;
  }
  final r = await Navigator.of(context).push<bool>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => _HalamanBayar(url: url, judul: judul, cekStatus: cekStatus)));
  return r == true;
}

class _HalamanBayar extends StatefulWidget {
  const _HalamanBayar({required this.url, required this.judul, required this.cekStatus});
  final String url;
  final String judul;
  final Future<String> Function() cekStatus;

  @override
  State<_HalamanBayar> createState() => _HalamanBayarState();
}

class _HalamanBayarState extends State<_HalamanBayar> {
  late final WebViewController _c;
  Timer? _timer;
  int _progres = 0;
  bool _selesai = false, _sibuk = false;

  @override
  void initState() {
    super.initState();
    _c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (p) {
          if (mounted) setState(() => _progres = p);
        },
        onNavigationRequest: (req) {
          final u = req.url;
          if (u.startsWith('http://') || u.startsWith('https://') || u.startsWith('about:')) return NavigationDecision.navigate;
          // aplikasi bank / e-wallet (intent://, gojek://, shopeeid://, ...) dibuka di luar
          launchUrl(Uri.parse(u), mode: LaunchMode.externalApplication).catchError((_) => false);
          return NavigationDecision.prevent;
        },
      ))
      ..loadRequest(Uri.parse(widget.url));
    _timer = Timer.periodic(const Duration(seconds: 6), (_) => _cek(diam: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _cek({bool diam = false}) async {
    if (_sibuk || _selesai) return;
    _sibuk = true;
    try {
      final st = await widget.cekStatus();
      if (!mounted) return;
      if (st == 'Lunas') {
        _selesai = true;
        _timer?.cancel();
        kabar(context, 'Pembayaran berhasil dan sudah tercatat.');
        Navigator.of(context).pop(true);
      } else if (!diam) {
        kabar(context, 'Status: $st. Selesaikan pembayaran di halaman ini.');
      }
    } catch (_) {
      if (!diam && mounted) kabar(context, 'Belum bisa memeriksa status. Coba lagi.', galat: true);
    } finally {
      _sibuk = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _selesai,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        await _cek(diam: true);
        if (mounted && !_selesai) Navigator.of(context).pop(false);
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(widget.judul),
          actions: [TextButton.icon(onPressed: () => _cek(), icon: const Icon(Icons.refresh_rounded), label: const Text('Cek status'))],
          bottom: _progres < 100 ? PreferredSize(preferredSize: const Size.fromHeight(3), child: LinearProgressIndicator(value: _progres / 100)) : null,
        ),
        body: WebViewWidget(controller: _c),
      ),
    );
  }
}

class _TungguBayar extends StatefulWidget {
  const _TungguBayar({required this.cekStatus, required this.url});
  final Future<String> Function() cekStatus;
  final String url;

  @override
  State<_TungguBayar> createState() => _TungguBayarState();
}

class _TungguBayarState extends State<_TungguBayar> {
  Timer? _timer;
  String _status = 'Menunggu';
  bool _sibuk = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 6), (_) => _cek());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _cek() async {
    if (_sibuk) return;
    _sibuk = true;
    try {
      final st = await widget.cekStatus();
      if (!mounted) return;
      setState(() => _status = st);
      if (st == 'Lunas') {
        _timer?.cancel();
        Navigator.of(context).pop(true);
      }
    } catch (_) {
    } finally {
      _sibuk = false;
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Menunggu pembayaran'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          const LinearProgressIndicator(),
          const SizedBox(height: 12),
          Text('Halaman pembayaran DOKU terbuka di tab baru. Selesaikan pembayaran di sana; status di sini diperbarui otomatis.\n\nStatus: $_status'),
        ]),
        actions: [
          TextButton(onPressed: () => launchUrl(Uri.parse(widget.url), webOnlyWindowName: '_blank'), child: const Text('Buka lagi')),
          TextButton(onPressed: _cek, child: const Text('Saya sudah bayar')),
          FilledButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Tutup')),
        ],
      );
}

/// Ringkasan order untuk konfirmasi: tagihan + biaya admin = total.
Future<bool> konfirmasiTotalBayar(BuildContext context, Map<String, dynamic> o) async {
  return konfirmasi(
    context,
    'Bayar ${rp(o['jumlah'])}',
    '${teks(o['metode'])}\nTagihan ${rp(o['pokok'])} + biaya admin ${rp(o['biaya'])} = ${rp(o['jumlah'])}${teks(o['kadaluarsa']).isEmpty ? '' : '\nBerlaku sampai ${teks(o['kadaluarsa'])}'}',
    ya: 'Lanjut bayar',
  );
}
