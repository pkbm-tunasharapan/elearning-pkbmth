import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../config.dart';
import '../kalender.dart';
import '../profil.dart';
import '../ruang.dart';
import '../theme.dart';
import '../widgets.dart';
import 'mapel_siswa.dart';
import 'sesi_siswa.dart';

const _ikonMapel = <String, IconData>{
  'matematika': Icons.calculate_rounded,
  'bahasa indonesia': Icons.translate_rounded,
  'bahasa inggris': Icons.language_rounded,
  'ipa': Icons.science_rounded,
  'ips': Icons.public_rounded,
  'pkn': Icons.flag_rounded,
  'pendidikan pancasila': Icons.flag_rounded,
  'agama': Icons.mosque_rounded,
  'seni': Icons.palette_rounded,
  'pjok': Icons.sports_soccer_rounded,
  'informatika': Icons.computer_rounded,
  'sejarah': Icons.history_edu_rounded,
  'ekonomi': Icons.trending_up_rounded,
  'geografi': Icons.map_rounded,
  'sosiologi': Icons.groups_rounded,
  'fisika': Icons.bolt_rounded,
  'kimia': Icons.biotech_rounded,
  'biologi': Icons.eco_rounded,
  'pemberdayaan': Icons.volunteer_activism_rounded,
  'keterampilan': Icons.handyman_rounded,
};

IconData ikonMapel(String nama) {
  final n = nama.toLowerCase();
  for (final e in _ikonMapel.entries) {
    if (n.contains(e.key)) return e.value;
  }
  return Icons.menu_book_rounded;
}

/// Beranda siswa: sapaan, kelas, dan daftar mata pelajaran.
class _BerandaIsi extends StatelessWidget {
  const _BerandaIsi({this.onProfil});
  final VoidCallback? onProfil;

  @override
  Widget build(BuildContext context) {
    final s = SesiSiswa.instance;
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final atas = MediaQuery.of(context).padding.top;
    final mapel = s.mapel;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: RefreshIndicator(
          edgeOffset: atas,
          onRefresh: () async {
            await s.muat();
            await ProfilAkun.instance.pastikan(paksa: true);
          },
          child: ListView(padding: EdgeInsets.zero, children: [
            Container(
              padding: EdgeInsets.fromLTRB(20, atas + 12, 8, 28),
              decoration: const BoxDecoration(gradient: Gaya.gradasi, borderRadius: BorderRadius.vertical(bottom: Radius.circular(32))),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Image.asset('assets/logo.png', width: 36, height: 36),
                  const SizedBox(width: 10),
                  const Text('TH.E-Course', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
                ]),
                const SizedBox(height: 18),
                Row(children: [
                  Container(
                    padding: const EdgeInsets.all(3),
                    decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: 0.6), width: 2)),
                    child: AvatarAkun(radius: 26, onTap: onProfil),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      TeksSapaan(style: TextStyle(color: Colors.white.withValues(alpha: 0.85))),
                      Text(s.nama, maxLines: 2, overflow: TextOverflow.ellipsis, style: tt.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                    ]),
                  ),
                ]),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(99)),
                  child: Text('${s.namaRombel} · ${mapel.length} mata pelajaran', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12.5)),
                ),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Row(children: [
                Expanded(
                  child: _Pintasan(
                    ikon: Icons.forum_rounded,
                    warna: const Color(0xFF2F9E8F),
                    judul: 'Chatroom',
                    sub: 'Teman satu rombel',
                    onTap: () => bukaChatSiswa(Navigator.of(context), 'ROMBEL'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _Pintasan(
                    ikon: Icons.calendar_month_rounded,
                    warna: const Color(0xFF7C3AED),
                    judul: 'Kalender',
                    sub: 'Jadwal sesi & ujian',
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => KalenderSiswaScreen(idRombel: s.idRombel, nama: s.nama))),
                  ),
                ),
              ]),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
              child: Text('Mata pelajaran', style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            ),
            if (mapel.isEmpty) const Kosong(pesan: 'Belum ada mata pelajaran aktif untuk kelas Anda.'),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: LayoutBuilder(builder: (context, c) {
                final kolom = c.maxWidth >= 700 ? 3 : 2;
                return GridView.count(
                  crossAxisCount: kolom,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 1.05,
                  children: [
                    for (final m in mapel)
                      Material(
                        color: Colors.transparent,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(Gaya.radius),
                          onTap: () => Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) => MapelSiswaScreen(idMapel: teks(m['id']), namaMapel: teks(m['nama']), tutor: teks(m['tutor'])),
                          )),
                          child: Ink(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(color: cs.surfaceContainerLowest, borderRadius: BorderRadius.circular(Gaya.radius), boxShadow: Gaya.bayangan(context)),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              IkonBulat(ikonMapel(teks(m['nama'])), warna: Gaya.warnaMenu(teks(m['nama'])), ukuran: 48, sudut: 16),
                              const Spacer(),
                              Text(teks(m['nama']), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, height: 1.2)),
                              if (teks(m['tutor']).isNotEmpty)
                                Text(teks(m['tutor']), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
                            ]),
                          ),
                        ),
                      ),
                  ],
                );
              }),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Center(child: Text('Versi $kVersi', style: tt.bodySmall?.copyWith(color: cs.outline))),
            ),
          ]),
        ),
      ),
    );
  }
}

class _Pintasan extends StatelessWidget {
  const _Pintasan({required this.ikon, required this.warna, required this.judul, required this.sub, required this.onTap});
  final IconData ikon;
  final Color warna;
  final String judul;
  final String sub;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(Gaya.radius),
        onTap: onTap,
        child: Ink(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: cs.surfaceContainerLowest, borderRadius: BorderRadius.circular(Gaya.radius), boxShadow: Gaya.bayangan(context)),
          child: Row(children: [
            IkonBulat(ikon, warna: warna, ukuran: 40, sudut: 12),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(judul, style: const TextStyle(fontWeight: FontWeight.w800)),
                Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}

Future<void> aturKodeAkses(BuildContext context) async {
  final c = TextEditingController(text: SesiSiswa.instance.kodeAkses);
  final ok = await showDialog<bool>(
    context: context,
    builder: (d) => AlertDialog(
      title: const Text('Kode akses ujian'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Kode akses diberikan tutor dan diperlukan saat ujian (UTS/UAS). Disimpan di HP ini agar tidak perlu diketik ulang.'),
        const SizedBox(height: 12),
        TextField(controller: c, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Kode akses')),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Batal')),
        FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Simpan')),
      ],
    ),
  );
  if (ok == true) {
    await SesiSiswa.instance.simpanKode(c.text);
    if (context.mounted) kabar(context, 'Kode akses disimpan.');
  }
}

/// Kerangka siswa: navigasi bawah Menu (kiri) · Chatroom · Beranda (tengah) · Kalender · Profil.
class BerandaSiswa extends StatefulWidget {
  const BerandaSiswa({super.key});

  @override
  State<BerandaSiswa> createState() => _BerandaSiswaState();
}

class _BerandaSiswaState extends State<BerandaSiswa> {
  int _i = 2;

  @override
  void initState() {
    super.initState();
    ProfilAkun.instance.pastikan();
  }

  Future<void> _keluar() async {
    if (await konfirmasi(context, 'Keluar', 'Keluar dari akun ini?', ya: 'Keluar')) {
      ProfilAkun.instance.kosongkan();
      await SesiSiswa.instance.keluar();
    }
  }

  void _menu() {
    final s = SesiSiswa.instance;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: const AvatarAkun(radius: 20, terang: false),
            title: Text(s.nama, style: const TextStyle(fontWeight: FontWeight.w800)),
            subtitle: Text(s.namaRombel),
          ),
          const Divider(),
          ListTile(leading: const Icon(Icons.home_rounded), title: const Text('Beranda'), onTap: () {
            Navigator.pop(c);
            setState(() => _i = 2);
          }),
          ListTile(leading: const Icon(Icons.forum_rounded), title: const Text('Chatroom rombel'), onTap: () {
            Navigator.pop(c);
            bukaChatSiswa(Navigator.of(context), 'ROMBEL');
          }),
          ListTile(leading: const Icon(Icons.calendar_month_rounded), title: const Text('Kalender akademik'), onTap: () {
            Navigator.pop(c);
            setState(() => _i = 3);
          }),
          ListTile(leading: const Icon(Icons.vpn_key_rounded), title: const Text('Kode akses ujian'), onTap: () {
            Navigator.pop(c);
            aturKodeAkses(context);
          }),
          ListTile(leading: const Icon(Icons.account_circle_rounded), title: const Text('Profil saya'), onTap: () {
            Navigator.pop(c);
            setState(() => _i = 4);
          }),
          ListTile(
            leading: Icon(Icons.logout_rounded, color: Theme.of(context).colorScheme.error),
            title: Text('Keluar', style: TextStyle(color: Theme.of(context).colorScheme.error)),
            onTap: () {
              Navigator.pop(c);
              _keluar();
            },
          ),
          Padding(padding: const EdgeInsets.all(8), child: Text('Versi $kVersi', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.outline))),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = SesiSiswa.instance;
    final Widget isi = switch (_i) {
      3 => KalenderSiswaScreen(idRombel: s.idRombel, nama: s.nama),
      4 => ProfilScreen(denganAppBar: false, onKeluar: _keluar),
      _ => _BerandaIsi(onProfil: () => setState(() => _i = 4)),
    };
    return Scaffold(
      body: AnimatedSwitcher(duration: const Duration(milliseconds: 220), child: KeyedSubtree(key: ValueKey(_i == 0 || _i == 1 ? 2 : _i), child: isi)),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _i,
        onDestinationSelected: (i) {
          if (i == 0) return _menu();
          if (i == 1) {
            bukaChatSiswa(Navigator.of(context), 'ROMBEL');
            return;
          }
          setState(() => _i = i);
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.grid_view_rounded), label: 'Menu'),
          NavigationDestination(icon: Icon(Icons.forum_outlined), selectedIcon: Icon(Icons.forum_rounded), label: 'Chatroom'),
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Beranda'),
          NavigationDestination(icon: Icon(Icons.calendar_month_outlined), selectedIcon: Icon(Icons.calendar_month_rounded), label: 'Kalender'),
          NavigationDestination(icon: Icon(Icons.account_circle_outlined), selectedIcon: Icon(Icons.account_circle_rounded), label: 'Profil'),
        ],
      ),
    );
  }
}
