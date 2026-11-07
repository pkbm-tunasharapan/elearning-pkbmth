import 'package:flutter/material.dart';

import '../absensi/umum.dart' show tglIso, tglIndo;
import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

/// Rekap kinerja tutor (poin minus dari penilaian otomatis). KS/Admin/Koordinator: semua tutor; tutor: miliknya sendiri.
class KinerjaTutorScreen extends StatefulWidget {
  const KinerjaTutorScreen({super.key});

  @override
  State<KinerjaTutorScreen> createState() => _KinerjaTutorScreenState();
}

class _KinerjaTutorScreenState extends State<KinerjaTutorScreen> {
  late String _dari;
  late String _sampai;

  @override
  void initState() {
    super.initState();
    final n = DateTime.now();
    // Bawaan: semester berjalan (Juli–Desember atau Januari–Juni).
    _dari = tglIso(DateTime(n.year, n.month >= 7 ? 7 : 1, 1));
    _sampai = tglIso(n);
  }

  Future<void> _rentang() async {
    final n = DateTime.now();
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(n.year - 3),
      lastDate: n,
      initialDateRange: DateTimeRange(start: DateTime.parse(_dari), end: DateTime.parse(_sampai)),
    );
    if (r != null) {
      setState(() {
        _dari = tglIso(r.start);
        _sampai = tglIso(r.end);
      });
    }
  }

  void _ekspor(Map<String, dynamic> d) {
    final sub = 'Periode ${tglIndo(_dari)} – ${tglIndo(_sampai)}';
    final rekap = daftar(d['rekap']).map(peta).toList();
    final baris = daftar(d['baris']).map(peta).toList();
    pilihEkspor(
      context,
      judul: 'Rekap Kinerja Tutor',
      sub: sub,
      kepala: const ['Tutor', 'Total poin', 'Kejadian', 'Jawaban terlambat dinilai', 'Tanggal', 'Mapel', 'Rombel', 'Diskusi', 'Poin', 'Keterangan'],
      baris: [
        for (final r in rekap) [teks(r['tutor']), '${angka(r['poin'])}', '${angka(r['kejadian'])}', '${angka(r['jawaban'])}', '', '', '', '', '', ''],
        for (final b in baris)
          ['', '', '', '', tglIndo(teks(b['tanggal'])), teks(b['mapel']), teks(b['rombel']), teks(b['judul']), '${angka(b['poin'])}', teks(b['keterangan'])],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(children: [
      Container(
        color: cs.surfaceContainerLowest,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: OutlinedButton.icon(onPressed: _rentang, icon: const Icon(Icons.date_range_rounded), label: Text('${tglIndo(_dari)} – ${tglIndo(_sampai)}')),
      ),
      Expanded(
        child: Muatan<Map<String, dynamic>>(
          key: ValueKey('$_dari|$_sampai'),
          muat: () async => peta(await Api.instance('waStafKinerjaTutor', [_t, {'dari': _dari, 'sampai': _sampai}])),
          bangun: (context, d, segarkan) {
            final rekap = daftar(d['rekap']).map(peta).toList();
            final baris = daftar(d['baris']).map(peta).toList();
            return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
              Row(children: [
                Expanded(
                  child: Text(
                    d['semua'] == true ? 'Poin minus muncul bila diskusi tidak dinilai tutor sampai batas waktu dan diselesaikan sistem.' : 'Catatan kinerja Anda.',
                    style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
                  ),
                ),
                TextButton.icon(onPressed: rekap.isEmpty ? null : () => _ekspor(d), icon: const Icon(Icons.download_rounded, size: 18), label: const Text('Ekspor')),
              ]),
              if (rekap.isEmpty) const Kosong(pesan: 'Tidak ada catatan kinerja minus pada periode ini.', ikon: Icons.verified_rounded),
              if (rekap.isNotEmpty) ...[
                const JudulBagian('Rekap per tutor'),
                Card(
                  child: Column(children: [
                    for (final r in rekap)
                      ListTile(
                        leading: CircleAvatar(
                          backgroundColor: (angka(r['poin']) < 0 ? cs.error : cs.outline).withValues(alpha: 0.12),
                          child: Icon(Icons.person_rounded, color: angka(r['poin']) < 0 ? cs.error : cs.outline),
                        ),
                        title: Text(teks(r['tutor']), style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('${angka(r['kejadian'])} diskusi · ${angka(r['jawaban'])} jawaban tidak dinilai tepat waktu'),
                        trailing: Text('${angka(r['poin'])}', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: angka(r['poin']) < 0 ? cs.error : cs.outline)),
                      ),
                  ]),
                ),
                JudulBagian('Rincian', sub: '${angka(d['total'])} catatan'),
                Card(
                  child: Column(children: [
                    for (final b in baris)
                      ListTile(
                        dense: true,
                        title: Text('${teks(b['tutor'])} · ${teks(b['judul'], 'Diskusi')}', maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text('${tglIndo(teks(b['tanggal']))} · ${teks(b['mapel'])} · ${teks(b['rombel'])} · ${angka(b['jawaban'])} jawaban\n${teks(b['keterangan'])}'),
                        isThreeLine: true,
                        trailing: Text('${angka(b['poin'])}', style: TextStyle(fontWeight: FontWeight.w900, color: angka(b['poin']) < 0 ? cs.error : cs.outline)),
                      ),
                  ]),
                ),
              ],
            ]);
          },
        ),
      ),
    ]);
  }
}
