import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'mapel_detail.dart';

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
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Card(
              color: angka(d['total']) > 0 ? cs.errorContainer : cs.primaryContainer,
              child: ListTile(
                leading: IkonBulat(Icons.rate_review_rounded, warna: Gaya.warnaMenu('nilai'), ukuran: 42, sudut: 14),
                title: Text('${angka(d['total'])} jawaban belum dinilai', style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: const Text('Ketuk satu diskusi untuk membaca dan menilai tanggapan.'),
              ),
            ),
            // v1.39.2 (khusus Admin): nilai otomatis untuk tugas yang belum diselesaikan tutor
            if (Sesi.instance.isAdmin && angka(d['total']) > 0)
              Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 4),
                child: OutlinedButton.icon(
                  onPressed: () async {
                    if (await _nilaiOtomatis(context)) await segarkan();
                  },
                  icon: const Icon(Icons.auto_fix_high_rounded),
                  label: const Text('Nilai otomatis tugas yang sesinya sudah berakhir (KKM–85)'),
                ),
              ),
            if (perTutor.isNotEmpty) ...[
              const JudulBagian('Per tutor'),
              Card(
                child: Column(children: [
                  for (final t in perTutor)
                    ListTile(
                      dense: true,
                      leading: const Icon(Icons.person_rounded),
                      title: Text(teks(t['nama'])),
                      subtitle: Text('${angka(t['diskusi'])} diskusi'),
                      trailing: Lencana('${angka(t['belum'])} belum', warna: cs.error),
                    ),
                ]),
              ),
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
                    if (g['tanpaPengampu'] == true) 'Belum ada tutor pengampu — Anda dapat menilai',
                  ].join(' · ')),
                  trailing: Lencana('${angka(g['belum'])}', warna: cs.error),
                  onTap: () async {
                    await Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => DiskusiScreen(
                        idMapel: teks(g['idMapel']),
                        item: {'id': teks(g['idMateri']), 'judul': teks(g['judul'], 'Diskusi'), 'jenis': 'Diskusi'},
                        bolehNilai: g['milikSaya'] == true,
                      ),
                    ));
                    segarkan();
                  },
                ),
              ),
          ],
        );
      },
    );
  }
}

/// v1.39.2 (khusus Admin): jawaban diskusi yang belum dinilai tutor dan sesinya sudah berakhir diberi nilai acak
/// dari KKM sampai 85. Mengembalikan true bila ada yang dinilai.
Future<bool> _nilaiOtomatis(BuildContext context) async {
  final r = await jalankan(context, () => Api.instance('waAdminTugasNilaiOtomatis', [Sesi.instance.token, false]), teksProses: 'Menghitung...');
  if (!r.ok || !context.mounted) return false;
  final d = peta(r.data);
  final n = angka(d['jumlah']);
  final rg = peta(d['rentang']);
  if (n == 0) {
    kabar(context, 'Tidak ada tugas yang sesinya sudah berakhir dan belum dinilai.');
    return false;
  }
  final per = daftar(d['perMapel']).map(peta).toList();
  final ok = await konfirmasi(
    context,
    'Nilai otomatis $n jawaban?',
    'Jawaban diskusi yang belum dinilai tutor dan sesinya sudah berakhir diberi nilai acak dari ${angka(rg['dari'])} sampai ${angka(rg['sampai'])}. '
        'Jawaban yang sesinya masih berjalan tidak diubah. Penilai tercatat sebagai "(otomatis)" dan siswa menerima pemberitahuan nilai.\n\n'
        '${per.take(8).map((x) => '• ${teks(x['nama'])}: ${angka(x['jumlah'])}').join('\n')}${per.length > 8 ? '\n• … ${per.length - 8} mapel lain' : ''}',
    ya: 'Nilai otomatis',
  );
  if (!ok || !context.mounted) return false;
  final h = await jalankan(context, () => Api.instance('waAdminTugasNilaiOtomatis', [Sesi.instance.token, true], const Duration(minutes: 3)), teksProses: 'Menilai...');
  if (!h.ok || !context.mounted) return false;
  kabar(context, '${angka(peta(h.data)['terisi'])} jawaban dinilai otomatis.');
  return true;
}
