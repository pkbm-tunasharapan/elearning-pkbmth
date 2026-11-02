import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

/// Daftar siswa per rombel (admin: semua rombel; tutor: rombel yang diampu).
class SiswaRombelScreen extends StatefulWidget {
  const SiswaRombelScreen({super.key});

  @override
  State<SiswaRombelScreen> createState() => _SiswaRombelScreenState();
}

class _SiswaRombelScreenState extends State<SiswaRombelScreen> {
  String _cari = '';

  @override
  Widget build(BuildContext context) {
    return Muatan<List<dynamic>>(
      muat: () async => daftar(await Api.instance('waStafRombelSiswa', [Sesi.instance.token])),
      bangun: (context, data, segarkan) {
        final rombel = data.map(peta).toList();
        final q = _cari.toLowerCase();
        final total = rombel.fold<int>(0, (n, r) => n + daftar(r['siswa']).length);
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Cari nama siswa'),
              onChanged: (v) => setState(() => _cari = v),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text('${rombel.length} rombel · $total siswa', style: Theme.of(context).textTheme.bodySmall),
            ),
            if (rombel.isEmpty) const Kosong(pesan: 'Belum ada rombel.'),
            for (final r in rombel)
              Builder(builder: (context) {
                final siswa = daftar(r['siswa']).map(peta).where((s) => q.isEmpty || teks(s['nama']).toLowerCase().contains(q)).toList();
                if (q.isNotEmpty && siswa.isEmpty) return const SizedBox.shrink();
                final terdaftar = siswa.where((s) => teks(s['kontak']).isNotEmpty).length;
                return Card(
                  margin: const EdgeInsets.symmetric(vertical: 5),
                  child: ExpansionTile(
                    initiallyExpanded: q.isNotEmpty,
                    leading: IkonBulat(Icons.groups_rounded, warna: Gaya.warnaMenu(teks(r['namaRombel'])), ukuran: 42, sudut: 14),
                    title: Text(teks(r['namaRombel']), style: const TextStyle(fontWeight: FontWeight.w800)),
                    subtitle: Text('${siswa.length} siswa · $terdaftar sudah daftar mandiri'),
                    childrenPadding: const EdgeInsets.only(bottom: 8),
                    children: [
                      if (daftar(r['mapel']).isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                          child: Wrap(spacing: 6, runSpacing: 6, children: [for (final m in daftar(r['mapel'])) Lencana('$m')]),
                        ),
                      for (final s in siswa)
                        ListTile(
                          dense: true,
                          leading: CircleAvatar(
                            radius: 18,
                            backgroundColor: Gaya.warnaMenu(teks(s['nama'])).withValues(alpha: 0.15),
                            child: Text(teks(s['nama'], '?')[0].toUpperCase(), style: TextStyle(color: Gaya.warnaMenu(teks(s['nama'])), fontWeight: FontWeight.w800)),
                          ),
                          title: Text(teks(s['nama'])),
                          subtitle: Text([
                            if (teks(s['lahir']).isNotEmpty) 'lahir ${teks(s['lahir'])}',
                            if (teks(s['kontak']).isNotEmpty) teks(s['kontak']),
                            if (teks(s['daftar']).isNotEmpty) 'daftar ${teks(s['daftar'])}',
                          ].join(' · ')),
                          trailing: teks(s['kontak']).isNotEmpty ? const Icon(Icons.verified_outlined, color: Colors.green, size: 18) : null,
                        ),
                    ],
                  ),
                );
              }),
          ],
        );
      },
    );
  }
}
