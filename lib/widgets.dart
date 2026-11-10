import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';

/// Halaman yang memuat data dari backend dengan tarik-untuk-segarkan dan penanganan galat.
class Muatan<T> extends StatefulWidget {
  const Muatan({super.key, required this.muat, required this.bangun});

  final Future<T> Function() muat;
  final Widget Function(BuildContext context, T data, Future<void> Function() segarkan) bangun;

  @override
  State<Muatan<T>> createState() => _MuatanState<T>();
}

class _MuatanState<T> extends State<Muatan<T>> {
  late Future<T> _f;

  @override
  void initState() {
    super.initState();
    _f = widget.muat();
  }

  Future<void> _segarkan() async {
    final f = widget.muat();
    setState(() => _f = f);
    try {
      await f;
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: _f,
      builder: (context, s) {
        if (s.connectionState != ConnectionState.done) {
          return const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()));
        }
        if (s.hasError) {
          final e = keGalat(s.error!);
          return PesanGalat(pesan: e.ramah, kode: e.kodeLengkap, judul: e.judul, ulangi: _segarkan);
        }
        return RefreshIndicator(onRefresh: _segarkan, child: widget.bangun(context, s.data as T, _segarkan));
      },
    );
  }
}

class PesanGalat extends StatelessWidget {
  const PesanGalat({super.key, required this.pesan, this.ulangi, this.kode = '', this.judul = 'Ups, ada kendala'});
  final String pesan;
  final VoidCallback? ulangi;
  final String kode;
  final String judul;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          IkonBulat(Icons.cloud_off_rounded, warna: cs.error, ukuran: 72),
          const SizedBox(height: 16),
          Text(judul, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text(pesan, textAlign: TextAlign.center, style: TextStyle(color: cs.onSurfaceVariant)),
          if (kode.isNotEmpty) ...[const SizedBox(height: 12), KodeGalat(kode)],
          if (ulangi != null) ...[
            const SizedBox(height: 18),
            FilledButton.tonalIcon(onPressed: ulangi, icon: const Icon(Icons.refresh_rounded), label: const Text('Coba lagi')),
          ],
        ]),
      ),
    );
  }
}

class Kosong extends StatelessWidget {
  const Kosong({super.key, required this.pesan, this.ikon = Icons.inbox_rounded});
  final String pesan;
  final IconData ikon;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 44, horizontal: 24),
      child: Column(children: [
        IkonBulat(ikon, warna: cs.primary, ukuran: 76),
        const SizedBox(height: 14),
        Text(pesan, textAlign: TextAlign.center, style: TextStyle(color: cs.onSurfaceVariant, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

/// Ikon di dalam lingkaran pastel (gaya modern-lembut).
class IkonBulat extends StatelessWidget {
  const IkonBulat(this.ikon, {super.key, this.warna, this.ukuran = 44, this.sudut});
  final IconData ikon;
  final Color? warna;
  final double ukuran;
  /// null = lingkaran; diisi = kotak membulat.
  final double? sudut;

  @override
  Widget build(BuildContext context) {
    final c = warna ?? Theme.of(context).colorScheme.primary;
    return Container(
      width: ukuran,
      height: ukuran,
      decoration: BoxDecoration(
        color: c.withValues(alpha: Theme.of(context).brightness == Brightness.dark ? 0.22 : 0.12),
        shape: sudut == null ? BoxShape.circle : BoxShape.rectangle,
        borderRadius: sudut == null ? null : BorderRadius.circular(sudut!),
      ),
      child: Icon(ikon, color: c, size: ukuran * 0.5),
    );
  }
}

class Lencana extends StatelessWidget {
  const Lencana(this.label, {super.key, this.warna});
  final String label;
  final Color? warna;

  @override
  Widget build(BuildContext context) {
    final c = warna ?? Theme.of(context).colorScheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(99)),
      child: Text(label, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: c)),
    );
  }
}

class JudulBagian extends StatelessWidget {
  const JudulBagian(this.judul, {super.key, this.sub, this.aksi});
  final String judul;
  final String? sub;
  final Widget? aksi;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 20, 4, 10),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(judul, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            if (sub != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(sub!, style: Theme.of(context).textTheme.bodySmall)),
          ]),
        ),
        if (aksi != null) aksi!,
      ]),
    );
  }
}

/// Menampilkan data JSON apa pun secara rapi (dipakai untuk bagian yang strukturnya bervariasi).
class NilaiJson extends StatelessWidget {
  const NilaiJson(this.nilai, {super.key, this.kedalaman = 0});
  final dynamic nilai;
  final int kedalaman;

  static String label(String k) {
    final s = k.replaceAllMapped(RegExp(r'([a-z])([A-Z])'), (m) => '${m[1]} ${m[2]}');
    return s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
  }

  @override
  Widget build(BuildContext context) {
    final v = nilai;
    final kecil = Theme.of(context).textTheme.bodySmall;
    if (v is Map) {
      final entri = v.entries.where((e) => e.value != null && '${e.value}' != '' && !(e.value is List && (e.value as List).isEmpty)).toList();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: entri.map((e) {
          final isi = e.value;
          if ((isi is Map || isi is List) && kedalaman < 3) {
            return Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label('${e.key}'), style: kecil?.copyWith(fontWeight: FontWeight.w700)),
                Padding(padding: const EdgeInsets.only(left: 10), child: NilaiJson(isi, kedalaman: kedalaman + 1)),
              ]),
            );
          }
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(width: 120, child: Text(label('${e.key}'), style: kecil?.copyWith(fontWeight: FontWeight.w600))),
              Expanded(child: Text(isi is Map || isi is List ? '…' : '$isi')),
            ]),
          );
        }).toList(),
      );
    }
    if (v is List) {
      if (v.every((x) => x is! Map && x is! List)) return Text(v.join(', '));
      return Column(
        children: [
          for (final x in v.take(200))
            Card(
              margin: const EdgeInsets.symmetric(vertical: 4),
              child: Padding(padding: const EdgeInsets.all(10), child: NilaiJson(x, kedalaman: kedalaman + 1)),
            ),
        ],
      );
    }
    return Text('${v ?? ''}');
  }
}

Future<bool> konfirmasi(BuildContext context, String judul, String isi, {String ya = 'Ya'}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(judul),
      content: Text(isi),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(ya)),
      ],
    ),
  );
  return r == true;
}

void kabar(BuildContext context, String pesan, {bool galat = false}) {
  if (galat) {
    tampilGalat(context, ApiException(pesan, kode: 'E300'));
    return;
  }
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(pesan),
      backgroundColor: galat ? Theme.of(context).colorScheme.error : null,
      behavior: SnackBarBehavior.floating,
    ));
}

class Hasil<T> {
  const Hasil(this.ok, [this.data]);
  final bool ok;
  final T? data;
}

/// Menjalankan aksi backend dengan dialog "memproses" dan pesan galat yang ramah.
Future<Hasil<T>> jalankan<T>(BuildContext context, Future<T> Function() aksi, {String teksProses = 'Memproses...'}) async {
  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => PopScope(
      canPop: false,
      child: AlertDialog(content: Row(children: [const CircularProgressIndicator(), const SizedBox(width: 20), Expanded(child: Text(teksProses))])),
    ),
  );
  try {
    final r = await aksi();
    if (context.mounted) Navigator.of(context, rootNavigator: true).pop();
    return Hasil<T>(true, r);
  } catch (e) {
    if (context.mounted) {
      Navigator.of(context, rootNavigator: true).pop();
      tampilGalat(context, e);
    }
    return Hasil<T>(false);
  }
}


// ───────────────────────── galat: kode & modal ─────────────────────────

/// Pelapor galat aplikasi (non-API) ke log admin; dipasang di pemeliharaan/sistem.dart.
void Function(ApiException e)? pelaporGalatAplikasi;

/// Mengubah galat apa pun menjadi ApiException berkode (galat aplikasi = E900 dan dicatat ke log).
ApiException keGalat(Object e) {
  if (e is ApiException) return e;
  final g = ApiException('Terjadi kesalahan pada aplikasi.', kode: 'E900', detail: '$e');
  pelaporGalatAplikasi?.call(g);
  return g;
}

/// Lencana kode galat yang bisa disalin.
class KodeGalat extends StatelessWidget {
  const KodeGalat(this.kode, {super.key});
  final String kode;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: cs.errorContainer.withValues(alpha: 0.5),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () async {
          await Clipboard.setData(ClipboardData(text: kode));
          if (context.mounted) {
            ScaffoldMessenger.of(context)
              ..hideCurrentSnackBar()
              ..showSnackBar(SnackBar(content: Text('Kode $kode disalin.'), behavior: SnackBarBehavior.floating));
          }
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text('Kode: ', style: TextStyle(fontSize: 12.5, color: cs.onErrorContainer)),
            SelectableText(kode, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, letterSpacing: 0.6, fontFamily: 'monospace', color: cs.onErrorContainer)),
            const SizedBox(width: 6),
            Icon(Icons.copy_rounded, size: 15, color: cs.onErrorContainer),
          ]),
        ),
      ),
    );
  }
}

/// Modal galat seragam: pesan ramah + kode galat untuk dilaporkan ke admin.
Future<void> tampilGalat(BuildContext context, Object galat, {VoidCallback? ulangi}) {
  final e = keGalat(galat);
  final cs = Theme.of(context).colorScheme;
  final info = e.kode == 'E210' || e.kode == 'E300';
  return showDialog<void>(
    context: context,
    builder: (c) => AlertDialog(
      icon: Icon(
        switch (e.kode) {
          'E101' || 'E102' || 'E105' => Icons.wifi_off_rounded,
          'E201' => Icons.lock_clock_rounded,
          'E202' => Icons.construction_rounded,
          'E210' || 'E300' => Icons.info_outline_rounded,
          _ => Icons.error_outline_rounded,
        },
        color: info ? cs.primary : cs.error,
        size: 40,
      ),
      title: Text(e.judul, textAlign: TextAlign.center),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(e.ramah, textAlign: TextAlign.center),
        const SizedBox(height: 14),
        KodeGalat(e.kodeLengkap),
        if (!info) ...[
          const SizedBox(height: 8),
          Text('Bila masalah berulang, sampaikan kode ini kepada admin.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
        ],
      ]),
      actionsAlignment: MainAxisAlignment.center,
      actions: [
        TextButton(onPressed: () => Navigator.pop(c), child: const Text('Tutup')),
        if (ulangi != null && e.bisaDiulang)
          FilledButton.icon(
            onPressed: () {
              Navigator.pop(c);
              ulangi();
            },
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Coba lagi'),
          ),
      ],
    ),
  );
}
