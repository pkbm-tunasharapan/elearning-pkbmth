import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

/// "Penilaian Otomatis" (Admin & Superadmin): jawaban diskusi yang belum dinilai melewati batas waktu
/// diberi nilai = KKM tanpa komentar, keterangan internal dicatat, dan tutor pengampu mendapat kinerja -1 per diskusi.
class OtoNilaiScreen extends StatefulWidget {
  const OtoNilaiScreen({super.key});

  @override
  State<OtoNilaiScreen> createState() => _OtoNilaiScreenState();
}

class _OtoNilaiScreenState extends State<OtoNilaiScreen> {
  int _v = 0;

  Future<void> _atur(Map<String, dynamic> d) async {
    final r = await jalankan(context, () => Api.instance('waAdminOtoNilaiAtur', [_t, d]), teksProses: 'Menyimpan pengaturan...');
    if (r.ok && mounted) setState(() => _v++);
  }

  Future<void> _jalankan(Map<String, dynamic> p) async {
    final ok = await konfirmasi(
      context,
      'Selesaikan ${angka(p['total'])} penilaian?',
      '${angka(p['total'])} jawaban di ${angka(p['jumlahDiskusi'])} diskusi akan diberi nilai ${teks(p['kkm'])} (KKM) tanpa komentar.\n\n'
          'Keterangan internal: "${teks(p['keterangan'])}" (tidak terlihat siswa).\n\n'
          'Tutor pengampu mendapat kinerja −1 untuk setiap diskusi. Tindakan ini tidak bisa dibatalkan.',
      ya: 'Selesaikan',
    );
    if (!ok || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminOtoNilaiJalankan', [_t], const Duration(minutes: 6)), teksProses: 'Menilai otomatis...');
    if (!r.ok || !mounted) return;
    final h = peta(r.data);
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        icon: const Icon(Icons.auto_fix_high_rounded, size: 40),
        title: const Text('Penilaian otomatis selesai'),
        content: Text('${angka(h['dinilai'])} jawaban di ${angka(h['diskusi'])} diskusi diberi nilai ${teks(h['kkm'])}.\n'
            'Total kinerja tutor: ${angka(h['poin'])}.'),
        actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Tutup'))],
      ),
    );
    if (mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waAdminOtoNilaiPratinjau', [_t], const Duration(minutes: 2))),
      bangun: (context, p, segarkan) {
        final hari = angka(p['hari'], 7);
        final diskusi = daftar(p['diskusi']).map(peta).toList();
        final perTutor = daftar(p['perTutor']).map(peta).toList();
        final total = angka(p['total']);
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  IkonBulat(Icons.auto_fix_high_rounded, warna: Gaya.ungu, ukuran: 40, sudut: 12),
                  const SizedBox(width: 12),
                  const Expanded(child: Text('Pengaturan', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16))),
                ]),
                const SizedBox(height: 10),
                Row(children: [
                  const Expanded(child: Text('Batas waktu penilaian')),
                  DropdownButton<int>(
                    value: const [3, 5, 7, 10, 14, 21, 30].contains(hari) ? hari : 7,
                    items: [for (final h in const [3, 5, 7, 10, 14, 21, 30]) DropdownMenuItem(value: h, child: Text('$h hari'))],
                    onChanged: (v) => v == null ? null : _atur({'hari': v}),
                  ),
                ]),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: p['otomatis'] == true,
                  onChanged: (v) => _atur({'otomatis': v}),
                  title: const Text('Jalankan otomatis setiap hari'),
                  subtitle: Text('Sekitar pukul ${teks(p['jam'], '2')}.00 · nilai otomatis = KKM (${teks(p['kkm'])})'),
                ),
                Text('Keterangan internal (hanya KS, Admin, dan tutor pengampu): "${teks(p['keterangan'])}"',
                    style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
              ]),
            ),
          ),
          const SizedBox(height: 6),
          Card(
            color: total > 0 ? cs.errorContainer.withValues(alpha: 0.35) : null,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(total > 0 ? '$total jawaban lewat batas $hari hari' : 'Tidak ada penilaian yang lewat batas $hari hari',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                if (total > 0) ...[
                  const SizedBox(height: 4),
                  Text('${angka(p['jumlahDiskusi'])} diskusi · ${perTutor.where((x) => angka(x['poin']) < 0).length} tutor akan mendapat kinerja minus'),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: () => _jalankan(p),
                    icon: const Icon(Icons.auto_fix_high_rounded),
                    label: const Text('Selesaikan semua penilaian sekarang'),
                  ),
                ],
              ]),
            ),
          ),
          if (perTutor.isNotEmpty) ...[
            const JudulBagian('Dampak per tutor'),
            Card(
              child: Column(children: [
                for (final x in perTutor)
                  ListTile(
                    dense: true,
                    leading: const Icon(Icons.person_rounded),
                    title: Text(teks(x['tutor'])),
                    subtitle: Text('${angka(x['diskusi'])} diskusi · ${angka(x['jawaban'])} jawaban'),
                    trailing: Text('${angka(x['poin'])}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: angka(x['poin']) < 0 ? cs.error : cs.outline)),
                  ),
              ]),
            ),
          ],
          if (diskusi.isNotEmpty) ...[
            const JudulBagian('Diskusi yang akan diselesaikan'),
            Card(
              child: Column(children: [
                for (final g in diskusi)
                  ListTile(
                    dense: true,
                    title: Text(teks(g['judul'], 'Diskusi'), maxLines: 1, overflow: TextOverflow.ellipsis),
                    subtitle: Text('${teks(g['mapel'])} · ${teks(g['rombel'])} · ${daftar(g['tutor']).isEmpty ? 'tanpa pengampu' : daftar(g['tutor']).join(', ')}\nterlama ${teks(g['terlama'])}'),
                    isThreeLine: true,
                    trailing: Lencana('${angka(g['jumlah'])}', warna: cs.error),
                  ),
              ]),
            ),
          ],
        ]);
      },
    );
  }
}
