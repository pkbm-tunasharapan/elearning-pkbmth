import 'package:flutter/material.dart';

import '../menu.dart';
import '../session.dart';
import '../widgets.dart';
import 'web_menu.dart';

/// Kerangka aplikasi: AppBar + navigasi bawah (menu utama) + laci (semua menu sesuai peran).
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _kunciScaffold = GlobalKey<ScaffoldState>();
  String _aktif = 'beranda';

  List<MenuApp> get _menu => menuUntuk(Sesi.instance);
  List<MenuApp> get _utama => _menu.where((m) => m.utama).take(3).toList();

  MenuApp? get _menuAktif {
    for (final m in _menu) {
      if (m.id == _aktif) return m;
    }
    return null;
  }

  void _pilih(String id) {
    setState(() => _aktif = id);
  }

  Future<void> _keluar() async {
    if (await konfirmasi(context, 'Keluar', 'Keluar dari akun ini?', ya: 'Keluar')) {
      await Sesi.instance.keluar();
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Sesi.instance;
    final m = _menuAktif;
    final utama = _utama;
    var idxBawah = 0;
    if (_aktif != 'beranda') {
      final i = utama.indexWhere((x) => x.id == _aktif);
      idxBawah = i >= 0 ? i + 1 : utama.length + 1;
    }
    final lebar = MediaQuery.of(context).size.width >= 900;

    final laci = NavigationDrawer(
      selectedIndex: _aktif == 'beranda' ? 0 : (_menu.indexWhere((x) => x.id == _aktif) + 1),
      onDestinationSelected: (i) {
        if (!lebar) _kunciScaffold.currentState?.closeDrawer();
        _pilih(i == 0 ? 'beranda' : _menu[i - 1].id);
      },
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 16, 12),
          child: Row(children: [
            CircleAvatar(child: Text(s.nama.isNotEmpty ? s.nama[0].toUpperCase() : '?')),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.nama, style: const TextStyle(fontWeight: FontWeight.w700), overflow: TextOverflow.ellipsis),
                const SizedBox(height: 2),
                Lencana(s.peran),
              ]),
            ),
          ]),
        ),
        const NavigationDrawerDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: Text('Beranda')),
        for (final x in _menu)
          NavigationDrawerDestination(
            icon: Icon(x.ikon),
            label: Text(x.isNative ? x.judul : '${x.judul}  🌐'),
          ),
        const Divider(indent: 20, endIndent: 20),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: ListTile(leading: const Icon(Icons.logout), title: const Text('Keluar'), onTap: _keluar),
        ),
        const SizedBox(height: 12),
      ],
    );

    final isi = KeyedSubtree(key: ValueKey(_aktif), child: m == null ? Beranda(onPilih: _pilih) : m.halaman());

    return Scaffold(
      key: _kunciScaffold,
      appBar: AppBar(
        title: Text(m?.judul ?? 'Beranda', overflow: TextOverflow.ellipsis),
        actions: [
          if (m != null && !m.isNative)
            IconButton(
              tooltip: 'Muat ulang',
              icon: const Icon(Icons.refresh),
              onPressed: () => setState(() {
                final a = _aktif;
                _aktif = 'beranda';
                WidgetsBinding.instance.addPostFrameCallback((_) => setState(() => _aktif = a));
              }),
            ),
        ],
      ),
      drawer: lebar ? null : laci,
      body: lebar ? Row(children: [SizedBox(width: 300, child: laci), const VerticalDivider(width: 1), Expanded(child: isi)]) : isi,
      bottomNavigationBar: lebar
          ? null
          : NavigationBar(
              selectedIndex: idxBawah < 0 ? 0 : (idxBawah > utama.length + 1 ? utama.length + 1 : idxBawah),
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
                const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Beranda'),
                for (final x in utama) NavigationDestination(icon: Icon(x.ikon), label: _labelPendek(x.judul)),
                const NavigationDestination(icon: Icon(Icons.menu), label: 'Menu'),
              ],
            ),
    );
  }

  static String _labelPendek(String s) {
    const peta = {'Kelola Tutor & Enrollment': 'Pengguna', 'Mata Pelajaran': 'Mapel', 'Progres Kelas': 'Progres', 'Belum Dinilai': 'Nilai'};
    return peta[s] ?? s;
  }
}

/// Beranda: sapaan + pintasan ke semua menu sesuai peran.
class Beranda extends StatelessWidget {
  const Beranda({super.key, required this.onPilih});
  final void Function(String id) onPilih;

  @override
  Widget build(BuildContext context) {
    final s = Sesi.instance;
    final menu = menuUntuk(s);
    final cs = Theme.of(context).colorScheme;
    return RefreshIndicator(
      onRefresh: () => s.segarkanProfil(),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: cs.primaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Halo, ${s.nama}', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Wrap(spacing: 8, runSpacing: 6, children: [
                  Lencana(s.peran),
                  Lencana('${s.mapel.length} mapel', warna: cs.tertiary),
                ]),
              ]),
            ),
          ),
          const SizedBox(height: 8),
          LayoutBuilder(builder: (context, c) {
            final kolom = c.maxWidth >= 700 ? 4 : (c.maxWidth >= 420 ? 3 : 2);
            return GridView.count(
              crossAxisCount: kolom,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.15,
              children: [
                for (final x in menu)
                  Card(
                    clipBehavior: Clip.antiAlias,
                    child: InkWell(
                      onTap: () => onPilih(x.id),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Icon(x.ikon, color: cs.primary, size: 28),
                            const Spacer(),
                            if (!x.isNative) Icon(Icons.public, size: 14, color: cs.outline),
                          ]),
                          const Spacer(),
                          Text(x.judul, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
                        ]),
                      ),
                    ),
                  ),
              ],
            );
          }),
          const SizedBox(height: 12),
          Text('Ikon 🌐 = menu dibuka dari halaman staf versi web di dalam aplikasi.', style: Theme.of(context).textTheme.bodySmall),
        ],
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
