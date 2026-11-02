import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../config.dart';
import '../menu.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'web_menu.dart';

String _sapaan() {
  final j = DateTime.now().hour;
  if (j < 11) return 'Selamat pagi';
  if (j < 15) return 'Selamat siang';
  if (j < 18) return 'Selamat sore';
  return 'Selamat malam';
}

String _inisial(String nama) {
  final b = nama.trim().split(RegExp(r'\s+')).where((x) => x.isNotEmpty).toList();
  if (b.isEmpty || b.first == '-') return '?';
  return (b.first[0] + (b.length > 1 ? b[1][0] : '')).toUpperCase();
}

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

  List<MenuApp> get _menu => menuUntuk(Sesi.instance);
  List<MenuApp> get _utama => _menu.where((m) => m.utama).take(3).toList();

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

  Widget _laci(bool lebar) {
    final s = Sesi.instance;
    final cs = Theme.of(context).colorScheme;
    return NavigationDrawer(
      selectedIndex: _aktif == 'beranda' ? 0 : (_menu.indexWhere((x) => x.id == _aktif) + 1),
      onDestinationSelected: (i) {
        if (!lebar) _kunciScaffold.currentState?.closeDrawer();
        _pilih(i == 0 ? 'beranda' : _menu[i - 1].id);
      },
      children: [
        Container(
          margin: const EdgeInsets.fromLTRB(12, 12, 12, 10),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(gradient: Gaya.gradasi, borderRadius: BorderRadius.circular(Gaya.radius)),
          child: Row(children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: Colors.white.withValues(alpha: 0.25),
              child: Text(_inisial(s.nama), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
            ),
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
        const NavigationDrawerDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: Text('Beranda')),
        for (final x in _menu)
          NavigationDrawerDestination(
            icon: Icon(x.ikon, color: Gaya.warnaMenu(x.id)),
            label: Text(x.isNative ? x.judul : '${x.judul}  🌐'),
          ),
        const Padding(padding: EdgeInsets.symmetric(horizontal: 24, vertical: 8), child: Divider()),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: ListTile(leading: Icon(Icons.logout_rounded, color: cs.error), title: Text('Keluar', style: TextStyle(color: cs.error)), onTap: _keluar),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(28, 4, 16, 0),
          child: Text('BM Staf versi $kVersi', style: TextStyle(fontSize: 12, color: cs.outline)),
        ),
        const SizedBox(height: 12),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final m = _menuAktif;
    final utama = _utama;
    var idxBawah = 0;
    if (_aktif != 'beranda') {
      final i = utama.indexWhere((x) => x.id == _aktif);
      idxBawah = i >= 0 ? i + 1 : utama.length + 1;
    }
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
        child: m == null ? Beranda(onPilih: _pilih, onMenu: () => _kunciScaffold.currentState?.openDrawer(), onKeluar: _keluar, lebar: lebar) : m.halaman(),
      ),
    );

    return Scaffold(
      key: _kunciScaffold,
      appBar: m == null
          ? null
          : AppBar(
              titleSpacing: lebar ? 20 : 0,
              title: Row(children: [
                IkonBulat(m.ikon, warna: Gaya.warnaMenu(m.id), ukuran: 36, sudut: 12),
                const SizedBox(width: 12),
                Expanded(child: Text(m.judul, overflow: TextOverflow.ellipsis)),
              ]),
              actions: [
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
                selectedIndex: idxBawah.clamp(0, utama.length + 1).toInt(),
                onDestinationSelected: (i) {
                  if (i == 0) {
                    _pilih('beranda');
                  } else if (i <= utama.length) {
                    _pilih(utama[i - 1].id);
                  } else {
                    _kunciScaffold.currentState?.openDrawer();
                  }
                },
                destinations: [
                  const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Beranda'),
                  for (final x in utama) NavigationDestination(icon: Icon(x.ikon), label: _labelPendek(x.judul)),
                  const NavigationDestination(icon: Icon(Icons.grid_view_rounded), label: 'Menu'),
                ],
              ),
            ),
    );
  }

  static String _labelPendek(String s) {
    const peta = {'Kelola Tutor & Enrollment': 'Pengguna', 'Mata Pelajaran': 'Mapel', 'Progres Kelas': 'Progres', 'Belum Dinilai': 'Nilai'};
    return peta[s] ?? s;
  }
}

/// Beranda: header bergradasi, ringkasan, menu cepat, dan semua menu.
class Beranda extends StatelessWidget {
  const Beranda({super.key, required this.onPilih, required this.onMenu, required this.onKeluar, this.lebar = false});
  final void Function(String id) onPilih;
  final VoidCallback onMenu;
  final VoidCallback onKeluar;
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
      onRefresh: () => s.segarkanProfil(),
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
                if (!lebar)
                  IconButton(onPressed: onMenu, icon: const Icon(Icons.menu_rounded, color: Colors.white), tooltip: 'Menu'),
                const Spacer(),
                IconButton(onPressed: onKeluar, icon: const Icon(Icons.logout_rounded, color: Colors.white), tooltip: 'Keluar'),
              ]),
              const SizedBox(height: 8),
              Row(children: [
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: 0.6), width: 2)),
                  child: CircleAvatar(
                    radius: 26,
                    backgroundColor: Colors.white.withValues(alpha: 0.25),
                    child: Text(_inisial(s.nama), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${_sapaan()},', style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 13.5)),
                    Text(s.nama, maxLines: 1, overflow: TextOverflow.ellipsis, style: tt.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
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
                    _Ringkas(ikon: Icons.badge_rounded, warna: Gaya.warnaMenu('pengguna'), nilai: s.peran, label: 'Peran'),
                    const VerticalDivider(width: 1),
                    _Ringkas(ikon: Icons.menu_book_rounded, warna: Gaya.warnaMenu('mapelSaya'), nilai: '${s.mapel.length}', label: 'Mapel'),
                    const VerticalDivider(width: 1),
                    _Ringkas(ikon: Icons.apps_rounded, warna: Gaya.warnaMenu('nilai'), nilai: '${menu.length}', label: 'Menu'),
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
                Text('Semua menu', style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                LayoutBuilder(builder: (context, c) {
                  final kolom = c.maxWidth >= 700 ? 4 : 3;
                  return GridView.count(
                    crossAxisCount: kolom,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    childAspectRatio: 0.92,
                    children: [for (final x in lain) _KartuMenu(menu: x, onTap: () => onPilih(x.id))],
                  );
                }),
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

class _Ringkas extends StatelessWidget {
  const _Ringkas({required this.ikon, required this.warna, required this.nilai, required this.label});
  final IconData ikon;
  final Color warna;
  final String nilai;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(children: [
        IkonBulat(ikon, warna: warna, ukuran: 36),
        const SizedBox(height: 8),
        Text(nilai, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        Text(label, style: TextStyle(fontSize: 11.5, color: Theme.of(context).colorScheme.onSurfaceVariant)),
      ]),
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

/// Dipakai menu Mapel: membuka satu mata pelajaran di versi web (materi, kurikulum, ujian, dst.).
class MapelWebScreen extends StatelessWidget {
  const MapelWebScreen({super.key, required this.judul, required this.idMapel});
  final String judul;
  final String idMapel;

  @override
  Widget build(BuildContext context) => WebMenu(judul: judul, tab: 'tabLihat', idMapel: idMapel, denganAppBar: true);
}
