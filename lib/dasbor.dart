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

  static bool boleh(String peran) => const {'Admin', 'Kepala Sekolah', 'Koordinator Kurikulum', 'Superadmin', 'Dinas Pendidikan'}.contains(peran);

  @override
  State<DasborLembaga> createState() => _DasborLembagaState();
}

class _DasborLembagaState extends State<DasborLembaga> {
  Map<String, dynamic>? _d;
  String? _galat;
  bool _muat = false;
  bool _semuaRombel = false;
  bool _semuaBelum = false;

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

    // v1.38.9: statistik TH.E-Course sesi berjalan + tatap muka hari ini + kehadiran semester
    final on = peta(d['online']);
    final adaSesi = on['adaSesi'] == true;
    final galatOn = teks(on['galat']);
    String nOn(Object? x) => galatOn.isNotEmpty ? '!' : (adaSesi ? '${angka(x)}' : '–');
    final ketTanpaSesi = galatOn.isNotEmpty ? 'gagal dimuat' : 'tidak ada sesi berjalan';
    final persenSem = on['persenSemester'];
    final ubinList = [
      ubin(Icons.groups_rounded, Gaya.warnaMenu('dataInduk'), '$n', 'Warga belajar aktif',
          '${angka(d['rombelAktif'])} rombel · ${angka(on['wb'])} di TH.E-Course', 'dataInduk'),
      ubin(Icons.phone_android_rounded, const Color(0xFF3B7DD8), nOn(on['sudahAbsenWb']), 'WB absen online',
          adaSesi ? 'dari ${angka(on['wb'])} WB · ${teks(on['sesi'])}' : ketTanpaSesi, 'laporanHadir'),
      ubin(Icons.fact_check_rounded, const Color(0xFF7A5AF8), nOn(on['absen']), 'Absensi hadir sesi ini',
          adaSesi ? 'dari ${angka(on['wajibAbsen'])} absensi mapel · ${angka(on['persenAbsen'])}%' : ketTanpaSesi, 'laporanHadir'),
      ubin(Icons.how_to_reg_rounded, const Color(0xFF2F9E8F), '${angka(d['hadir'])}', 'Hadir tatap muka hari ini',
          '${angka(d['persenHadir'])}% · ${angka(d['pulang'])} sudah pulang', 'absensi'),
      ubin(Icons.pending_actions_rounded, const Color(0xFFEF6B5B), nOn(on['belumWb']), 'Belum absensi / tugas',
          adaSesi ? '${angka(on['belumAbsenWb'])} belum absensi · ${angka(on['belumTugasWb'])} belum tugas' : ketTanpaSesi, null),
      ubin(Icons.insights_rounded, const Color(0xFFE9A23B), persenSem == null ? '–' : '${angka(persenSem)}%', 'Kehadiran semester',
          'TH.E-Course sejak Sesi 1', 'laporanHadir'),
    ];
    final rbOn = daftar(on['rombel']).map(peta).toList();
    final belum = daftar(on['belum']).map(peta).toList();
    final tampilBelum = _semuaBelum ? belum : belum.take(8).toList();

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
        if (adaSesi && rbOn.isNotEmpty)
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Expanded(child: Text('Absen online per rombel · ${teks(on['sesi'])}', style: const TextStyle(fontWeight: FontWeight.w800))),
                  TextButton(onPressed: () => widget.onPilih('laporanHadir'), child: const Text('Laporan')),
                ]),
                for (final r in (_semuaRombel ? rbOn : rbOn.take(6)))
                  _BarisRombel({'nama': r['nama'], 'aktif': r['wb'], 'hadir': r['absen'], 'absen': 0}, ket: 'sudah absen', belum: angka(r['belum'])),
                if (rbOn.length > 6)
                  TextButton(onPressed: () => setState(() => _semuaRombel = !_semuaRombel), child: Text(_semuaRombel ? 'Ringkas' : 'Lihat semua (${rbOn.length})')),
              ]),
            ),
          )
        else if (rombel.isNotEmpty)
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  const Expanded(child: Text('Hadir tatap muka per rombel', style: TextStyle(fontWeight: FontWeight.w800))),
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
        if (adaSesi && belum.isNotEmpty) ...[
          const SizedBox(height: 10),
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Belum lengkap di ${teks(on['sesi'])} (${angka(on['belumWb'])} WB)', style: const TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                for (final x in tampilBelum)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(teks(x['nama']), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text(teks(x['rombel']), style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
                        ]),
                      ),
                      Text(
                        [
                          if (angka(x['absen']) > 0) '${angka(x['absen'])}/${angka(x['dari'])} mapel belum absen',
                          if (angka(x['tugas']) > 0) '${angka(x['tugas'])} tugas',
                        ].join(' · '),
                        style: TextStyle(fontSize: 11.5, color: cs.error, fontWeight: FontWeight.w700),
                      ),
                    ]),
                  ),
                if (belum.length > 8)
                  TextButton(onPressed: () => setState(() => _semuaBelum = !_semuaBelum), child: Text(_semuaBelum ? 'Ringkas' : 'Lihat semua (${belum.length})')),
              ]),
            ),
          ),
        ],
        if (kurang.isNotEmpty && !Sesi.instance.isDinas) ...[
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
  const _BarisRombel(this.r, {this.ket = 'hadir', this.belum = 0});
  final Map<String, dynamic> r;
  final String ket;
  final num belum;

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
          width: 140,
          child: Text('$hadir/$aktif $ket${absen > 0 ? ' · $absen' : ''}${belum > 0 ? ' · $belum belum' : ''}', textAlign: TextAlign.right, style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
        ),
      ]),
    );
  }
}
