import 'package:flutter/material.dart';

import 'api.dart';
import 'session.dart';
import 'theme.dart';
import 'widgets.dart';

/// Dasbor lembaga di beranda (Admin & pimpinan): kehadiran hari ini, per rombel, dan kelengkapan data.
class DasborLembaga extends StatefulWidget {
  const DasborLembaga({super.key, required this.onPilih, this.lebar = false});
  final void Function(String id) onPilih;
  final bool lebar;

  static bool boleh(String peran) => const {'Admin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Superadmin'}.contains(peran);

  @override
  State<DasborLembaga> createState() => _DasborLembagaState();
}

class _DasborLembagaState extends State<DasborLembaga> {
  Map<String, dynamic>? _d;
  String? _galat;
  bool _muat = false;
  bool _semuaRombel = false;

  @override
  void initState() {
    super.initState();
    _ambil(false);
  }

  Future<void> _ambil(bool paksa) async {
    setState(() {
      _muat = true;
      _galat = null;
    });
    try {
      final d = peta(await Api.instance('waStafDasbor', [Sesi.instance.token, paksa]));
      if (mounted) setState(() => _d = d);
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    } catch (e) {
      if (mounted) setState(() => _galat = '$e');
    } finally {
      if (mounted) setState(() => _muat = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final d = _d;
    if (d == null) {
      return Card(
        margin: const EdgeInsets.only(bottom: 14),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: _galat != null
              ? Row(children: [
                  Icon(Icons.error_outline_rounded, color: cs.error),
                  const SizedBox(width: 10),
                  Expanded(child: Text('Dasbor belum bisa dimuat: $_galat', style: const TextStyle(fontSize: 12.5))),
                  TextButton(onPressed: () => _ambil(true), child: const Text('Coba lagi')),
                ])
              : const SizedBox(height: 80, child: Center(child: CircularProgressIndicator(strokeWidth: 2))),
        ),
      );
    }
    final n = angka(d['wbAktif']);
    final rombel = daftar(d['rombel']).map(peta).toList();
    final data = peta(d['data']);
    final tampilRb = _semuaRombel ? rombel : rombel.take(6).toList();
    final kolom = widget.lebar ? 4 : 2;

    Widget ubin(IconData ikon, Color warna, String nilai, String label, String ket, String? menu) => _Ubin(
          ikon: ikon,
          warna: warna,
          nilai: nilai,
          label: label,
          ket: ket,
          onTap: menu == null ? null : () => widget.onPilih(menu),
        );

    final ubinList = [
      ubin(Icons.groups_rounded, Gaya.warnaMenu('dataInduk'), '$n', 'Warga belajar aktif', '${angka(d['rombelAktif'])} rombel', 'dataInduk'),
      ubin(Icons.how_to_reg_rounded, const Color(0xFF2F9E8F), '${angka(d['hadir'])}', 'Hadir hari ini', '${angka(d['persenHadir'])}% · ${angka(d['pulang'])} sudah pulang', 'absensi'),
      ubin(Icons.event_busy_rounded, const Color(0xFFE9A23B), '${angka(d['izin']) + angka(d['sakit']) + angka(d['alpa'])}', 'Tidak hadir',
          'Izin ${angka(d['izin'])} · Sakit ${angka(d['sakit'])} · Alpa ${angka(d['alpa'])}', 'absensi'),
      ubin(Icons.hourglass_empty_rounded, const Color(0xFFEF6B5B), '${angka(d['belum'])}', 'Belum diabsen', 'hari ini', 'absensi'),
    ];

    final kurang = <(String, int, String)>[
      ('Tanpa NISN', angka(data['tanpaNisn']), 'dataInduk'),
      ('Tanpa NIK', angka(data['tanpaNik']), 'dataInduk'),
      ('Biodata rapor belum ada', angka(data['tanpaBiodata']), 'imporDapodik'),
      ('Tanpa rombel aktif', angka(data['tanpaRombel']), 'dataInduk'),
    ].where((x) => x.$2 > 0).toList();

    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text('Ringkasan hari ini', style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
          Text('diperbarui ${teks(d['dibuat'])}', style: TextStyle(fontSize: 11.5, color: cs.outline)),
          IconButton(
            tooltip: 'Muat ulang',
            onPressed: _muat ? null : () => _ambil(true),
            icon: _muat ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.refresh_rounded, size: 20),
          ),
        ]),
        const SizedBox(height: 4),
        LayoutBuilder(builder: (context, c) {
          const jarak = 10.0;
          final w = (c.maxWidth - jarak * (kolom - 1)) / kolom;
          return Wrap(spacing: jarak, runSpacing: jarak, children: [for (final u in ubinList) SizedBox(width: w, child: u)]);
        }),
        const SizedBox(height: 10),
        if (rombel.isNotEmpty)
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  const Expanded(child: Text('Kehadiran per rombel', style: TextStyle(fontWeight: FontWeight.w800))),
                  TextButton(onPressed: () => widget.onPilih('absensi'), child: const Text('Buka absensi')),
                ]),
                for (final r in tampilRb) _BarisRombel(r),
                if (rombel.length > 6)
                  TextButton(
                    onPressed: () => setState(() => _semuaRombel = !_semuaRombel),
                    child: Text(_semuaRombel ? 'Ringkas' : 'Lihat semua (${rombel.length})'),
                  ),
              ]),
            ),
          ),
        if (kurang.isNotEmpty) ...[
          const SizedBox(height: 10),
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Kelengkapan data', style: TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  for (final k in kurang)
                    ActionChip(
                      avatar: Icon(Icons.warning_amber_rounded, size: 18, color: cs.error),
                      label: Text('${k.$1}: ${k.$2}'),
                      onPressed: () => widget.onPilih(k.$3),
                    ),
                ]),
              ]),
            ),
          ),
        ],
      ]),
    );
  }
}

class _Ubin extends StatelessWidget {
  const _Ubin({required this.ikon, required this.warna, required this.nilai, required this.label, required this.ket, this.onTap});
  final IconData ikon;
  final Color warna;
  final String nilai;
  final String label;
  final String ket;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: cs.surfaceContainerLowest,
      borderRadius: BorderRadius.circular(Gaya.radius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Gaya.radius),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(Gaya.radius), boxShadow: Gaya.bayangan(context)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              IkonBulat(ikon, warna: warna, ukuran: 34, sudut: 10),
              const Spacer(),
              Text(nilai, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
            ]),
            const SizedBox(height: 10),
            Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
            Text(ket, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
          ]),
        ),
      ),
    );
  }
}

class _BarisRombel extends StatelessWidget {
  const _BarisRombel(this.r);
  final Map<String, dynamic> r;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final aktif = angka(r['aktif']), hadir = angka(r['hadir']), absen = angka(r['absen']);
    final p = aktif == 0 ? 0.0 : hadir / aktif;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(children: [
        SizedBox(width: 72, child: Text(teks(r['nama']), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700))),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(value: p, minHeight: 8, backgroundColor: cs.surfaceContainerHighest, color: const Color(0xFF2F9E8F)),
          ),
        ),
        const SizedBox(width: 10),
        SizedBox(
          width: 96,
          child: Text('$hadir/$aktif hadir${absen > 0 ? ' · $absen' : ''}', textAlign: TextAlign.right, style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
        ),
      ]),
    );
  }
}
