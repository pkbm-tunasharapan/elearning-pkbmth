import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';

/// Progres kegiatan kelas (admin, kepala sekolah, koordinator kurikulum).
class ProgresScreen extends StatelessWidget {
  const ProgresScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      muat: () async => peta(await Api.instance('waStafProgresDaftar', [Sesi.instance.token])),
      bangun: (context, d, segarkan) {
        final rombel = daftar(d['rombel']).map(peta).toList();
        final kini = peta(d['kini']);
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Sesi berjalan', style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 4),
                  kini.isEmpty ? Text(teks(d['kini'], '-')) : NilaiJson(kini),
                  const SizedBox(height: 6),
                  Text('Jumlah sesi: ${angka(d['jumlahSesi'])}', style: Theme.of(context).textTheme.bodySmall),
                ]),
              ),
            ),
            const SizedBox(height: 8),
            if (rombel.isEmpty) const Kosong(pesan: 'Belum ada rombel aktif.'),
            for (final r in rombel)
              Card(
                margin: const EdgeInsets.symmetric(vertical: 5),
                child: ListTile(
                  title: Text(teks(r['namaRombel']), style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${r['siswa'] is List ? (r['siswa'] as List).length : angka(r['siswa'])} siswa'),
                      if (r['ringkas'] != null) NilaiJson(r['ringkas']),
                    ]),
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => ProgresKelasScreen(idRombel: teks(r['idRombel']), nama: teks(r['namaRombel'])),
                  )),
                ),
              ),
          ],
        );
      },
    );
  }
}

class ProgresKelasScreen extends StatelessWidget {
  const ProgresKelasScreen({super.key, required this.idRombel, required this.nama});
  final String idRombel;
  final String nama;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Progres $nama')),
      body: Muatan<Map<String, dynamic>>(
        muat: () async => peta(await Api.instance('waStafProgresKelas', [Sesi.instance.token, idRombel])),
        bangun: (context, d, segarkan) {
          final mapel = daftar(d['mapel']);
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              if (d['ringkas'] != null)
                Card(child: Padding(padding: const EdgeInsets.all(14), child: NilaiJson(d['ringkas']))),
              const JudulBagian('Mata pelajaran'),
              if (mapel.isEmpty) const Kosong(pesan: 'Belum ada data mapel.'),
              for (final m in mapel.map(peta))
                Card(
                  margin: const EdgeInsets.symmetric(vertical: 5),
                  child: ExpansionTile(
                    title: Text(teks(m['namaMapel'], teks(m['nama'], 'Mapel')), style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: teks(m['tutor']).isNotEmpty ? Text(teks(m['tutor'])) : null,
                    childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                    children: [NilaiJson(Map<String, dynamic>.from(m)..remove('namaMapel'))],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
