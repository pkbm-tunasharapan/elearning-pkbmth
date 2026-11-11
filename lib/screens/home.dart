import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../agenda.dart';

import '../api.dart';
import '../config.dart';
import '../menu.dart';
import '../profil.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import '../ulang_tahun.dart';
import '../cari_menu.dart';
import '../dasbor.dart';
import 'dokumen_rpp.dart';
import '../siswa/kartu_siswa.dart';

/// Kerangka aplikasi: beranda bergradasi + navigasi bawah + laci menu.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _kunciScaffold = GlobalKey<ScaffoldState>();
  String _aktif = 'beranda';
  int _muatUlang = 0;

  List<MenuApp> get _menu => [for (final g in kelompokkanMenu(menuUntuk(Sesi.instance))) ...g.value];

  void _cari() => bukaCariMenu(context, _menu, _pilih);
  List<MenuApp> get _utama => _menu.where((m) => m.utama).take(3).toList();

  @override
  void initState() {
    super.initState();
    ProfilAkun.instance.pastikan();
  }

  MenuApp? get _menuAktif {
    for (final m in _menu) {
      if (m.id == _aktif) return m;
    }
    return null;
  }

  void _pilih(String id) => setState(() => _aktif = id);

  Future<void> _keluar() async {
    if (await konfirmasi(context, 'Keluar', 'Keluar dari akun ini?', ya: 'Keluar')) {
      await Sesi.instance.keluar();
    }
  }

  static const _ikonGrup = <String, IconData>{
    'Pembelajaran': Icons.auto_stories_rounded,
    'Nilai & Rapor': Icons.grading_rounded,
    'Kehadiran': Icons.how_to_reg_rounded,
    'Jadwal & Kalender': Icons.calendar_month_rounded,
    'Warga Belajar': Icons.school_rounded,
    'Keuangan & Honor': Icons.account_balance_wallet_rounded,
    'Pengguna & Komunikasi': Icons.forum_rounded,
    'Sistem': Icons.settings_suggest_rounded,
  };

  Widget _laci(bool lebar) {
    final s = Sesi.instance;
    final cs = Theme.of(context).colorScheme;
    void tutup() {
      if (!lebar) _kunciScaffold.currentState?.closeDrawer();
    }

    void buka(String id) {
      tutup();
      _pilih(id);
    }

    Widget item({required Widget ikon, required String judul, required bool aktif, required VoidCallback onTap}) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 1),
          child: ListTile(
            dense: true,
            visualDensity: const VisualDensity(vertical: -1),
            selected: aktif,
            selectedTileColor: cs.primary.withValues(alpha: 0.12),
            leading: ikon,
            title: Text(judul, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: aktif ? FontWeight.w800 : FontWeight.w600)),
            onTap: onTap,
          ),
        );

    final isi = ListView(padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 8, bottom: 12), children: [
      Container(
        margin: const EdgeInsets.fromLTRB(12, 4, 12, 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(gradient: Gaya.gradasi, borderRadius: BorderRadius.circular(Gaya.radius)),
        child: Row(children: [
          AvatarAkun(radius: 24, onTap: () => buka('profil')),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.nama, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15), overflow: TextOverflow.ellipsis),
              const SizedBox(height: 2),
              Text(s.peran, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5)),
            ]),
          ),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
        child: Material(
          color: cs.surfaceContainerHighest.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () {
              tutup();
              _cari();
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(children: [
                Icon(Icons.search_rounded, size: 20, color: cs.onSurfaceVariant),
                const SizedBox(width: 10),
                Expanded(child: Text('Cari menu…', style: TextStyle(color: cs.onSurfaceVariant))),
                if (lebar)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(border: Border.all(color: cs.outlineVariant), borderRadius: BorderRadius.circular(6)),
                    child: Text('Ctrl K', style: TextStyle(fontSize: 11, color: cs.onSurfaceVariant)),
                  ),
              ]),
            ),
          ),
        ),
      ),
      item(ikon: Icon(_aktif == 'beranda' ? Icons.home_rounded : Icons.home_outlined), judul: 'Beranda', aktif: _aktif == 'beranda', onTap: () => buka('beranda')),
      for (final g in kelompokkanMenu(_menu))
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              key: PageStorageKey('grupLaci-${g.key}'),
              initiallyExpanded: lebar || g.value.any((x) => x.id == _aktif),
              dense: true,
              visualDensity: const VisualDensity(vertical: -2),
              tilePadding: const EdgeInsets.symmetric(horizontal: 12),
              childrenPadding: EdgeInsets.zero,
              leading: Icon(_ikonGrup[g.key] ?? Icons.folder_rounded, size: 20, color: g.value.any((x) => x.id == _aktif) ? cs.primary : cs.onSurfaceVariant),
              title: Text(g.key, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5, color: g.value.any((x) => x.id == _aktif) ? cs.primary : null)),
              trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                Text('${g.value.length}', style: TextStyle(fontSize: 11.5, color: cs.outline)),
                const SizedBox(width: 4),
                const Icon(Icons.expand_more_rounded, size: 20),
              ]),
              children: [
                for (final x in g.value)
                  Padding(
                    padding: const EdgeInsets.only(left: 12),
                    child: item(ikon: Icon(x.ikon, color: Gaya.warnaMenu(x.id), size: 22), judul: x.judul, aktif: x.id == _aktif, onTap: () => buka(x.id)),
                  ),
              ],
            ),
          ),
        ),
      const Padding(padding: EdgeInsets.symmetric(horizontal: 24, vertical: 8), child: Divider()),
      item(ikon: const Icon(Icons.qr_code_2_rounded), judul: 'Kartu tutor (QR)', aktif: false, onTap: () {
        tutup();
        bukaKartuStaf(context);
      }),
      item(ikon: Icon(Icons.logout_rounded, color: cs.error), judul: 'Keluar', aktif: false, onTap: _keluar),
      Padding(
        padding: const EdgeInsets.fromLTRB(28, 4, 16, 0),
        child: Text('TH.E-Course versi $kVersi', style: TextStyle(fontSize: 12, color: cs.outline)),
      ),
    ]);
    final latar = Theme.of(context).navigationDrawerTheme.backgroundColor ?? cs.surfaceContainerLowest;
    return lebar ? Material(color: latar, child: isi) : Drawer(backgroundColor: latar, child: isi);
  }

  @override
  Widget build(BuildContext context) {
    final m = _menuAktif;
    final utama = _utama;
    // Navigasi bawah: Menu (kiri) · menu utama 1 · Beranda (tengah) · menu utama 2 · Profil
    final kiri = utama.isNotEmpty ? utama[0] : null;
    final kanan = utama.length > 1 ? utama[1] : null;
    final tujuan = <String>['menu', if (kiri != null) kiri.id, 'beranda', if (kanan != null) kanan.id, 'profil'];
    var idxBawah = tujuan.indexOf(_aktif);
    if (idxBawah < 0) idxBawah = 0;
    final lebar = MediaQuery.of(context).size.width >= 900;
    final laci = _laci(lebar);

    final isi = AnimatedSwitcher(
      duration: const Duration(milliseconds: 260),
      switchInCurve: Curves.easeOutCubic,
      transitionBuilder: (c, a) => FadeTransition(
        opacity: a,
        child: SlideTransition(position: Tween(begin: const Offset(0, 0.02), end: Offset.zero).animate(a), child: c),
      ),
      child: KeyedSubtree(
        key: ValueKey('$_aktif$_muatUlang'),
        child: _aktif == 'profil'
            ? ProfilScreen(denganAppBar: false, onKeluar: _keluar)
            : (m == null ? Beranda(onPilih: _pilih, onKeluar: _keluar, onCari: _cari, lebar: lebar) : m.halaman()),
      ),
    );

    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyK, control: true): _cari,
        const SingleActivator(LogicalKeyboardKey.keyK, meta: true): _cari,
      },
      child: Focus(
      autofocus: true,
      child: PopScope(
      canPop: _aktif == 'beranda',
      onPopInvokedWithResult: (sudah, _) {
        if (!sudah && _aktif != 'beranda') _pilih('beranda');
      },
      child: Scaffold(
      key: _kunciScaffold,
      appBar: m == null
          ? null
          : AppBar(
              automaticallyImplyLeading: false,
              leading: lebar ? null : IconButton(tooltip: 'Beranda', icon: const Icon(Icons.arrow_back_rounded), onPressed: () => _pilih('beranda')),
              titleSpacing: lebar ? 20 : 0,
              title: Row(children: [
                IkonBulat(m.ikon, warna: Gaya.warnaMenu(m.id), ukuran: 36, sudut: 12),
                const SizedBox(width: 12),
                Expanded(child: Text(m.judul, overflow: TextOverflow.ellipsis)),
              ]),
              actions: [
                IconButton(tooltip: 'Cari menu (Ctrl+K)', icon: const Icon(Icons.search_rounded), onPressed: _cari),
                if (!m.isNative)
                  IconButton(tooltip: 'Muat ulang', icon: const Icon(Icons.refresh_rounded), onPressed: () => setState(() => _muatUlang++)),
                const SizedBox(width: 4),
              ],
            ),
      drawer: lebar ? null : laci,
      body: lebar ? Row(children: [SizedBox(width: 300, child: laci), Expanded(child: isi)]) : isi,
      bottomNavigationBar: lebar
          ? null
          : DecoratedBox(
              decoration: BoxDecoration(boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 16, offset: const Offset(0, -4))]),
              child: NavigationBar(
                selectedIndex: idxBawah,
                onDestinationSelected: (i) {
                  final t = tujuan[i];
                  if (t == 'menu') {
                    _kunciScaffold.currentState?.openDrawer();
                  } else {
                    _pilih(t);
                  }
                },
                destinations: [
                  const NavigationDestination(icon: Icon(Icons.grid_view_rounded), label: 'Menu'),
                  if (kiri != null) NavigationDestination(icon: Icon(kiri.ikon), label: _labelPendek(kiri.judul)),
                  const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Beranda'),
                  if (kanan != null) NavigationDestination(icon: Icon(kanan.ikon), label: _labelPendek(kanan.judul)),
                  const NavigationDestination(icon: Icon(Icons.account_circle_outlined), selectedIcon: Icon(Icons.account_circle_rounded), label: 'Profil'),
                ],
              ),
            ),
      ),
      ),
      ),
    );
  }

  static String _labelPendek(String s) {
    const peta = {'Kelola Tutor & Enrollment': 'Pengguna', 'Mata Pelajaran': 'Mapel', 'Progres Kelas': 'Progres', 'Belum Dinilai': 'Nilai', 'Dokumen RPP': 'RPP', 'Absensi Warga Belajar': 'Absensi', 'Laporan Kehadiran': 'Laporan', 'Persetujuan Kehadiran KS': 'Persetujuan', 'Absen Tutor': 'Absen Tutor', 'Saldo Honor': 'Honor', 'Rekap Honor': 'Honor'};
    return peta[s] ?? s;
  }
}

/// Beranda: header bergradasi, ringkasan, menu cepat, dan semua menu.
class Beranda extends StatelessWidget {
  const Beranda({super.key, required this.onPilih, required this.onKeluar, this.onCari, this.lebar = false});
  final void Function(String id) onPilih;
  final VoidCallback onKeluar;
  final VoidCallback? onCari;
  final bool lebar;

  @override
  Widget build(BuildContext context) {
    final s = Sesi.instance;
    final menu = menuUntuk(s);
    final cepat = menu.where((m) => m.utama).toList();
    final lain = menu.where((m) => !m.utama).toList();
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final atas = MediaQuery.of(context).padding.top;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: RefreshIndicator(
      onRefresh: () async {
        AgendaBeranda.segarkan();
        await s.segarkanProfil();
        await ProfilAkun.instance.pastikan(paksa: true);
      },
      edgeOffset: atas,
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          // Header bergradasi
          Container(
            padding: EdgeInsets.fromLTRB(20, atas + 14, 12, 64),
            decoration: const BoxDecoration(
              gradient: Gaya.gradasi,
              borderRadius: BorderRadius.vertical(bottom: Radius.circular(32)),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Image.asset('assets/logo.png', width: 30, height: 30),
                const SizedBox(width: 8),
                const Text('TH.E-Course', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                const Spacer(),
                if (onCari != null) IconButton(onPressed: onCari, icon: const Icon(Icons.search_rounded, color: Colors.white), tooltip: 'Cari menu'),
                IconButton(onPressed: () => bukaKartuStaf(context), icon: const Icon(Icons.qr_code_2_rounded, color: Colors.white, size: 28), tooltip: 'Kartu tutor (QR)'),
                IconButton(onPressed: onKeluar, icon: const Icon(Icons.logout_rounded, color: Colors.white), tooltip: 'Keluar'),
              ]),
              const SizedBox(height: 8),
              Row(children: [
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: 0.6), width: 2)),
                  child: AvatarAkun(radius: 26, onTap: () => onPilih('profil')),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    TeksSapaan(style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13.5)),
                    Text(s.nama, maxLines: 1, overflow: TextOverflow.ellipsis, style: tt.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(20)),
                      child: Text(s.namaPeran, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                    ),
                  ]),
                ),
              ]),
            ]),
          ),
          // Kartu ringkasan yang "mengambang" di atas header
          Transform.translate(
            offset: const Offset(0, -44),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
                decoration: BoxDecoration(
                  color: cs.surfaceContainerLowest,
                  borderRadius: BorderRadius.circular(Gaya.radius),
                  boxShadow: Gaya.bayangan(context),
                ),
                child: IntrinsicHeight(
                  child: Row(children: [
                    if (s.peran == 'Bendahara') ...[
                      _Ringkas(ikon: Icons.account_balance_rounded, warna: Gaya.warnaMenu('keuangan'), nilai: 'Kas', label: 'Keuangan', onTap: () => onPilih('keuangan')),
                      const VerticalDivider(width: 1),
                      _Ringkas(ikon: Icons.payments_rounded, warna: Gaya.warnaMenu('rekapHonor'), nilai: 'Bayar', label: 'Honor tutor', onTap: () => onPilih('rekapHonor')),
                    ] else if (s.peran == 'Front Office') ...[
                      _Ringkas(ikon: Icons.badge_rounded, warna: Gaya.warnaMenu('absenTutor'), nilai: 'Darurat', label: 'Absen tutor', onTap: () => onPilih('absenTutor')),
                      const VerticalDivider(width: 1),
                      _Ringkas(ikon: Icons.summarize_rounded, warna: Gaya.warnaMenu('laporanHadir'), nilai: 'Lihat', label: 'Laporan kehadiran', onTap: () => onPilih('laporanHadir')),
                    ] else ...[
                      if (s.hanyaLihat)
                        _RingkasSemuaMapel(onPilih: onPilih)
                      else ...[
                        _Ringkas(ikon: Icons.menu_book_rounded, warna: Gaya.warnaMenu('mapelSaya'), nilai: '${s.jumlahMapel}', label: 'Mapel', onTap: () => onPilih('mapelSaya')),
                        const VerticalDivider(width: 1),
                        _Ringkas(ikon: Icons.groups_2_rounded, warna: Gaya.warnaMenu('siswaRombel'), nilai: '${s.jumlahRombel}', label: 'Rombel', onTap: () => onPilih('siswaRombel')),
                      ],
                      const VerticalDivider(width: 1),
                      if (s.peran == 'Superadmin')
                        _Ringkas(ikon: Icons.fact_check_rounded, warna: Gaya.warnaMenu('persetujuanKs'), nilai: 'Cek', label: 'Persetujuan KS', onTap: () => onPilih('persetujuanKs'))
                      else
                        _RingkasBelumDinilai(onTap: () => onPilih('nilai')),
                    ],
                  ]),
                ),
              ),
            ),
          ),
          Transform.translate(
            offset: const Offset(0, -28),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (DasborLembaga.boleh(s.peran)) DasborLembaga(onPilih: onPilih, lebar: lebar),
                const KartuUlangTahun(padding: EdgeInsets.only(bottom: 14)),
                if (cepat.isNotEmpty) ...[
                  Text('Akses cepat', style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 118,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: cepat.length,
                      separatorBuilder: (context, i) => const SizedBox(width: 12),
                      itemBuilder: (context, i) => _KartuCepat(menu: cepat[i], onTap: () => onPilih(cepat[i].id)),
                    ),
                  ),
                  const SizedBox(height: 22),
                ],
                Text('Agenda & informasi', style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                AgendaBeranda(
                  kunci: 'staf-${s.peran}',
                  muat: (paksa) => Api.instance('waStafBeranda', [s.token, paksa], const Duration(minutes: 2)),
                  onPilih: onPilih,
                  bolehMenu: {for (final m in menu) m.id},
                ),
                if (lain.isNotEmpty)
                  Align(
                    alignment: Alignment.center,
                    child: TextButton.icon(onPressed: () => _semuaMenuLembar(context, lain, onPilih), icon: const Icon(Icons.apps_rounded), label: Text('Semua menu (${lain.length})')),
                  ),
                const SizedBox(height: 14),
                Center(child: Text('Versi $kVersi', style: tt.bodySmall?.copyWith(color: cs.outline))),
                if (lain.any((x) => !x.isNative)) ...[
                  const SizedBox(height: 14),
                  Row(children: [
                    Icon(Icons.public, size: 14, color: cs.outline),
                    const SizedBox(width: 6),
                    Expanded(child: Text('Dibuka dari halaman staf versi web (segera dibuat native).', style: tt.bodySmall?.copyWith(color: cs.outline))),
                  ]),
                ],
              ]),
            ),
          ),
        ],
      ),
      ),
    );
  }
}

void _semuaMenuLembar(BuildContext context, List<MenuApp> lain, void Function(String id) onPilih) {
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (c) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(c).size.height * 0.8),
        child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
          for (final g in kelompokkanMenu(lain)) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 8, 4, 8),
              child: Text(g.key, style: const TextStyle(fontWeight: FontWeight.w800)),
            ),
            Wrap(spacing: 12, runSpacing: 12, children: [
              for (final x in g.value)
                SizedBox(
                  width: 104,
                  height: 112,
                  child: _KartuMenu(menu: x, onTap: () {
                    Navigator.pop(c);
                    onPilih(x.id);
                  }),
                ),
            ]),
          ],
        ]),
      ),
    ),
  );
}

class _Ringkas extends StatelessWidget {
  const _Ringkas({required this.ikon, required this.warna, required this.nilai, required this.label, this.onTap});
  final IconData ikon;
  final Color warna;
  final String nilai;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Column(children: [
            IkonBulat(ikon, warna: warna, ukuran: 36),
            const SizedBox(height: 8),
            Text(nilai, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ]),
        ),
      ),
    );
  }
}

/// Jumlah jawaban siswa yang belum dinilai (diambil dari server saat beranda dibuka).
class _RingkasBelumDinilai extends StatefulWidget {
  const _RingkasBelumDinilai({required this.onTap});
  final VoidCallback onTap;

  @override
  State<_RingkasBelumDinilai> createState() => _RingkasBelumDinilaiState();
}

class _RingkasBelumDinilaiState extends State<_RingkasBelumDinilai> {
  static int? _terakhir;
  int? _n = _terakhir;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat() async {
    try {
      final d = peta(await Api.instance('waStafBelumDinilai', [Sesi.instance.token]));
      final n = angka(d['total']).toInt();
      _terakhir = n;
      if (mounted) setState(() => _n = n);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final n = _n;
    return _Ringkas(
      ikon: Icons.rate_review_rounded,
      warna: n != null && n > 0 ? Theme.of(context).colorScheme.error : Gaya.warnaMenu('nilai'),
      nilai: n == null ? '…' : '$n',
      label: 'Belum dinilai',
      onTap: widget.onTap,
    );
  }
}

class _KartuCepat extends StatelessWidget {
  const _KartuCepat({required this.menu, required this.onTap});
  final MenuApp menu;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final w = Gaya.warnaMenu(menu.id);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Gaya.radius),
        child: Ink(
          width: 150,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(Gaya.radius),
            gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [w, Color.lerp(w, Colors.white, 0.35)!]),
            boxShadow: [BoxShadow(color: w.withValues(alpha: 0.28), blurRadius: 14, offset: const Offset(0, 6))],
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.22), borderRadius: BorderRadius.circular(12)),
              child: Icon(menu.ikon, color: Colors.white, size: 22),
            ),
            const Spacer(),
            Text(menu.judul, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, height: 1.2)),
          ]),
        ),
      ),
    );
  }
}

class _KartuMenu extends StatelessWidget {
  const _KartuMenu({required this.menu, required this.onTap});
  final MenuApp menu;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Gaya.radius),
        child: Ink(
          decoration: BoxDecoration(color: cs.surfaceContainerLowest, borderRadius: BorderRadius.circular(Gaya.radius), boxShadow: Gaya.bayangan(context)),
          padding: const EdgeInsets.fromLTRB(8, 14, 8, 10),
          child: Column(children: [
            Stack(clipBehavior: Clip.none, children: [
              IkonBulat(menu.ikon, warna: Gaya.warnaMenu(menu.id), ukuran: 50, sudut: 16),
              if (!menu.isNative)
                Positioned(right: -6, top: -6, child: Icon(Icons.public, size: 15, color: cs.outline)),
            ]),
            const Spacer(),
            Text(
              menu.judul,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, height: 1.2),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Ringkasan untuk Kepala Sekolah / Koordinator Kurikulum: seluruh mapel & rombel aktif.
class _RingkasSemuaMapel extends StatefulWidget {
  const _RingkasSemuaMapel({required this.onPilih});
  final void Function(String id) onPilih;

  @override
  State<_RingkasSemuaMapel> createState() => _RingkasSemuaMapelState();
}

class _RingkasSemuaMapelState extends State<_RingkasSemuaMapel> {
  static List<int>? _terakhir;
  List<int>? _n = _terakhir;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat() async {
    try {
      final m = await muatMapelRpp();
      String k(String x) => x.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
      final n = [
        m.map((x) => k(teks(x['namaMapel']))).where((x) => x.isNotEmpty).toSet().length,
        m.map((x) => teks(x['idRombel'])).where((x) => x.isNotEmpty).toSet().length,
      ];
      _terakhir = n;
      if (mounted) setState(() => _n = n);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final n = _n;
    return Expanded(
      flex: 2,
      child: IntrinsicHeight(
        child: Row(children: [
          _Ringkas(ikon: Icons.menu_book_rounded, warna: Gaya.warnaMenu('mapelSaya'), nilai: n == null ? '…' : '${n[0]}', label: 'Mapel', onTap: () => widget.onPilih('mapelSaya')),
          const VerticalDivider(width: 1),
          _Ringkas(ikon: Icons.groups_2_rounded, warna: Gaya.warnaMenu('siswaRombel'), nilai: n == null ? '…' : '${n[1]}', label: 'Rombel', onTap: () => widget.onPilih('siswaRombel')),
        ]),
      ),
    );
  }
}
