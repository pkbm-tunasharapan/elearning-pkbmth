import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../agenda.dart';
import '../api.dart';
import '../config.dart';
import '../kalender.dart';
import '../profil.dart';
import '../referral/referral.dart';
import '../ruang.dart';
import '../ujian/kelayakan.dart';
import '../theme.dart';
import '../ulang_tahun.dart';
import '../widgets.dart';
import 'kartu_siswa.dart';
import 'mapel_siswa.dart';
import 'pencapaian_siswa.dart';
import 'pin_siswa.dart';
import 'sesi_siswa.dart';
import 'tagihan_siswa.dart';
import '../kotak_notif.dart';
import '../ujian/kisi_kisi.dart';

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

/// Beranda siswa. v1.92.0 (desain ulang "rapi & tenang"): kepala polos, aksi cepat ringkas,
/// agenda sebagai kartu "Hari ini", mata pelajaran berupa daftar. Isi & fungsi sama dengan versi lama.
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
    final gelap = Theme.of(context).brightness == Brightness.dark;
    final aksi = <_AksiCepat>[
      _AksiCepat(ikon: Icons.request_quote_outlined, judul: 'Tagihan', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TagihanSiswaScreen()))),
      _AksiCepat(ikon: Icons.fact_check_outlined, judul: 'Kelayakan', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const KelayakanSiswaScreen()))),
      _AksiCepat(ikon: Icons.checklist_rounded, judul: 'Kisi-kisi', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const KisiSiswaScreen()))),
      _AksiCepat(ikon: Icons.workspace_premium_outlined, judul: 'Pencapaian', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PencapaianSiswaScreen()))),
      _AksiCepat(ikon: Icons.calendar_month_outlined, judul: 'Kalender', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => KalenderSiswaScreen(idRombel: s.idRombel, nama: s.nama)))),
      _AksiCepat(ikon: Icons.forum_outlined, judul: 'Chatroom', onTap: () => bukaChatSiswa(Navigator.of(context), 'ROMBEL')),
    ];
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: gelap ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      child: Scaffold(
        body: RefreshIndicator(
          edgeOffset: atas,
          onRefresh: () async {
            AgendaBeranda.segarkan();
            await s.muat();
            await ProfilAkun.instance.pastikan(paksa: true);
          },
          child: ListView(padding: EdgeInsets.fromLTRB(0, atas + 8, 0, 0), children: [
            // kepala: sapaan, nama, rombel; lonceng & kartu QR
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 4, 12),
              child: Row(children: [
                AvatarAkun(radius: 24, onTap: onProfil, terang: false),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    TeksSapaan(style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                    Text(s.nama, maxLines: 1, overflow: TextOverflow.ellipsis, style: tt.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                    Text('${s.namaRombel} · ${mapel.length} mata pelajaran', maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                  ]),
                ),
                LoncengNotif(warna: cs.onSurfaceVariant),
                IconButton(
                  tooltip: 'Kartu siswa (QR)',
                  onPressed: () => bukaKartuSiswa(context),
                  icon: Icon(Icons.qr_code_2_rounded, color: cs.onSurfaceVariant, size: 26),
                ),
              ]),
            ),
            const SpandukPin(),
            const KartuUlangTahun(padding: EdgeInsets.fromLTRB(16, 8, 16, 0)),
            // aksi cepat
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: LayoutBuilder(builder: (context, c) {
                final kolom = c.maxWidth >= 560 ? 6 : 3;
                return GridView.count(
                  crossAxisCount: kolom,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 1.25,
                  children: aksi,
                );
              }),
            ),
            // agenda: ujian & batas waktu tugas (sumber sama: waSiswaBeranda)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
              child: Text('Hari ini & mendatang', style: tt.titleSmall?.copyWith(fontWeight: FontWeight.w700, color: cs.onSurfaceVariant)),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: AgendaBeranda(
                kunci: 'siswa-${s.idRombel}-${s.nama}',
                muat: (paksa) => Api.instance('waSiswaBeranda', [s.token, paksa], const Duration(minutes: 2)),
                onPilih: (m) {
                  if (m == 'kalender') Navigator.of(context).push(MaterialPageRoute(builder: (_) => KalenderSiswaScreen(idRombel: s.idRombel, nama: s.nama)));
                },
                bolehMenu: const {'kalender'},
              ),
            ),
            // mata pelajaran: daftar baris
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
              child: Text('Mata pelajaran', style: tt.titleSmall?.copyWith(fontWeight: FontWeight.w700, color: cs.onSurfaceVariant)),
            ),
            if (mapel.isEmpty) const Kosong(pesan: 'Belum ada mata pelajaran aktif untuk kelas Anda.'),
            if (mapel.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Container(
                  decoration: BoxDecoration(
                    color: cs.surfaceContainerLowest,
                    borderRadius: BorderRadius.circular(Gaya.radius),
                    border: Border.all(color: Gaya.garis(context)),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Column(children: [
                    for (var i = 0; i < mapel.length; i++) ...[
                      if (i > 0) Divider(height: 1, indent: 64, color: Gaya.garis(context)),
                      Material(
                        color: Colors.transparent,
                        child: ListTile(
                          shape: const RoundedRectangleBorder(),
                          leading: IkonBulat(ikonMapel(teks(mapel[i]['nama'])), warna: cs.primary, ukuran: 40, sudut: 12),
                          title: Text(teks(mapel[i]['nama']), maxLines: 1, overflow: TextOverflow.ellipsis),
                          subtitle: teks(mapel[i]['tutor']).isEmpty ? null : Text('Tutor: ${teks(mapel[i]['tutor'])}', maxLines: 1, overflow: TextOverflow.ellipsis),
                          trailing: Icon(Icons.chevron_right_rounded, color: cs.outline),
                          onTap: () => Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) => MapelSiswaScreen(idMapel: teks(mapel[i]['id']), namaMapel: teks(mapel[i]['nama']), tutor: teks(mapel[i]['tutor'])),
                          )),
                        ),
                      ),
                    ],
                  ]),
                ),
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

/// Ubin aksi cepat beranda: ikon satu warna (warna utama) + label pendek.
class _AksiCepat extends StatelessWidget {
  const _AksiCepat({required this.ikon, required this.judul, required this.onTap});
  final IconData ikon;
  final String judul;
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
          decoration: BoxDecoration(
            color: cs.surfaceContainerLowest,
            borderRadius: BorderRadius.circular(Gaya.radius),
            border: Border.all(color: Gaya.garis(context)),
          ),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(ikon, color: cs.primary, size: 26),
            const SizedBox(height: 6),
            Text(judul, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
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
          ListTile(leading: const Icon(Icons.campaign_rounded), title: const Text('Referral: daftarkan teman'), onTap: () {
            Navigator.pop(c);
            Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => Scaffold(appBar: AppBar(title: const Text('Referral pendaftaran')), body: ReferralScreen(token: SesiSiswa.instance.token))));
          }),
          ListTile(leading: const Icon(Icons.calendar_month_rounded), title: const Text('Kalender akademik'), onTap: () {
            Navigator.pop(c);
            setState(() => _i = 3);
          }),
          ListTile(leading: const Icon(Icons.qr_code_2_rounded), title: const Text('Kartu siswa (QR)'), onTap: () {
            Navigator.pop(c);
            bukaKartuSiswa(context);
          }),
          ListTile(leading: const Icon(Icons.workspace_premium_rounded), title: const Text('Kartu pencapaian studi'), onTap: () {
            Navigator.pop(c);
            Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PencapaianSiswaScreen()));
          }),
          ListTile(
              leading: const Icon(Icons.lock_person_rounded),
              title: Text(s.punyaPin ? 'Ganti PIN' : 'Buat PIN'),
              subtitle: s.punyaPin ? null : const Text('Belum ada PIN'),
              onTap: () {
                Navigator.pop(c);
                Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BuatPinScreen()));
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
