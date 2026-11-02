import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';
import 'web_menu.dart';

/// Daftar diskusi yang jawabannya belum dinilai.
class BelumDinilaiScreen extends StatelessWidget {
  const BelumDinilaiScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      muat: () async => peta(await Api.instance('waStafBelumDinilai', [Sesi.instance.token])),
      bangun: (context, d, segarkan) {
        final diskusi = daftar(d['diskusi']).map(peta).toList();
        final perTutor = daftar(d['perTutor']).map(peta).toList();
        final cs = Theme.of(context).colorScheme;
        return ListView(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
          children: [
            Card(
              color: angka(d['total']) > 0 ? cs.errorContainer : cs.primaryContainer,
              child: ListTile(
                leading: const Icon(Icons.rate_review_outlined),
                title: Text('${angka(d['total'])} jawaban belum dinilai', style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: const Text('Ketuk satu diskusi untuk menilai di versi web.'),
              ),
            ),
            if (perTutor.isNotEmpty) ...[
              const JudulBagian('Per tutor'),
              Card(child: Padding(padding: const EdgeInsets.all(12), child: NilaiJson(perTutor))),
            ],
            const JudulBagian('Diskusi'),
            if (diskusi.isEmpty) const Kosong(pesan: 'Semua jawaban diskusi sudah dinilai.', ikon: Icons.task_alt),
            for (final g in diskusi)
              Card(
                margin: const EdgeInsets.symmetric(vertical: 5),
                child: ListTile(
                  title: Text(teks(g['judul'], 'Diskusi'), style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text([
                    if (teks(g['namaMapel']).isNotEmpty) teks(g['namaMapel']),
                    if (teks(g['namaRombel']).isNotEmpty) teks(g['namaRombel']),
                    '${angka(g['belum'])} belum dari ${angka(g['jawaban'])} jawaban',
                    if (daftar(g['siswa']).isNotEmpty) daftar(g['siswa']).join(', '),
                    if (teks(g['terlama']).isNotEmpty) 'terlama ${teks(g['terlama'])}',
                  ].join(' · ')),
                  trailing: Lencana('${angka(g['belum'])}', warna: cs.error),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => WebMenu(judul: teks(g['judul'], 'Nilai diskusi'), tab: 'tabLihat', idMapel: teks(g['idMapel']), denganAppBar: true),
                  )),
                ),
              ),
          ],
        );
      },
    );
  }
}
