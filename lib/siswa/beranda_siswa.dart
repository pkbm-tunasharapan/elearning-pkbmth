import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../config.dart';
import '../theme.dart';
import '../widgets.dart';
import 'mapel_siswa.dart';
import 'sesi_siswa.dart';

String _sapaan() {
  final j = DateTime.now().hour;
  if (j < 11) return 'Selamat pagi';
  if (j < 15) return 'Selamat siang';
  if (j < 18) return 'Selamat sore';
  return 'Selamat malam';
}

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
class BerandaSiswa extends StatelessWidget {
  const BerandaSiswa({super.key});

  Future<void> _aturKode(BuildContext context) async {
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
          onRefresh: () => s.muat(),
          child: ListView(padding: EdgeInsets.zero, children: [
            Container(
              padding: EdgeInsets.fromLTRB(20, atas + 12, 8, 28),
              decoration: const BoxDecoration(gradient: Gaya.gradasi, borderRadius: BorderRadius.vertical(bottom: Radius.circular(32))),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Image.asset('assets/logo.png', width: 36, height: 36),
                  const SizedBox(width: 10),
                  const Text('E-Course TH', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
                  const Spacer(),
                  IconButton(tooltip: 'Kode akses ujian', onPressed: () => _aturKode(context), icon: const Icon(Icons.vpn_key_rounded, color: Colors.white)),
                  IconButton(
                    tooltip: 'Keluar',
                    onPressed: () async {
                      if (await konfirmasi(context, 'Keluar', 'Keluar dari akun ini?', ya: 'Keluar')) await s.keluar();
                    },
                    icon: const Icon(Icons.logout_rounded, color: Colors.white),
                  ),
                ]),
                const SizedBox(height: 18),
                Text('${_sapaan()},', style: TextStyle(color: Colors.white.withValues(alpha: 0.85))),
                Text(s.nama, style: tt.headlineSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(99)),
                  child: Text('${s.namaRombel} · ${mapel.length} mata pelajaran', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12.5)),
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
