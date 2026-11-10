import 'package:flutter/material.dart';

import '../api.dart';
import '../nilai/opsi_rapor.dart' show semesterRapor;
import '../widgets.dart';
import 'sesi_siswa.dart';

/// Kartu Pencapaian Studi (siswa): nilai per mapel pada semester berjalan dan semester sebelumnya.
/// Angka dihitung server dengan rumus yang sama dengan rapor (waSiswaPencapaian).
class PencapaianSiswaScreen extends StatefulWidget {
  const PencapaianSiswaScreen({super.key});

  @override
  State<PencapaianSiswaScreen> createState() => _PencapaianSiswaScreenState();
}

class _PencapaianSiswaScreenState extends State<PencapaianSiswaScreen> {
  Map<String, String>? _per; // null = semester berjalan
  List<Map<String, String>> _pilihan = const [];

  String _n(dynamic v) {
    if (v == null) return '–';
    final s = '$v'.trim();
    if (s.isEmpty) return '–';
    final d = double.tryParse(s);
    if (d == null) return s;
    return d == d.roundToDouble() ? d.toInt().toString() : d.toStringAsFixed(1);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Kartu Pencapaian Studi')),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey('${_per?['tahun']}|${_per?['semester']}'),
        muat: () async => peta(await Api.instance('waSiswaPencapaian', [SesiSiswa.instance.token, {...?_per}], const Duration(minutes: 3))),
        bangun: (context, d, segarkan) {
          if (_pilihan.isEmpty) _pilihan = semesterRapor(peta(d['periodeKini']));
          final per = peta(d['periode']);
          final rb = peta(d['rombel']);
          final ringkas = peta(d['ringkas']);
          final hadir = peta(d['kehadiran']);
          final mapel = daftar(d['mapel']).map(peta).toList();
          final idx = _pilihan.indexWhere((x) => x['tahun'] == teks(per['tahun']) && x['semester'] == teks(per['semester']));
          return RefreshIndicator(
            onRefresh: segarkan,
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
              Text(teks(d['nama']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
              Text('${teks(rb['nama'])}${teks(d['nisn']).isEmpty ? '' : ' · NISN ${teks(d['nisn'])}'}', style: TextStyle(color: cs.onSurfaceVariant)),
              const SizedBox(height: 12),
              if (_pilihan.isNotEmpty)
                DropdownButtonFormField<int>(
                  initialValue: idx < 0 ? 0 : idx,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Semester', prefixIcon: Icon(Icons.date_range_rounded)),
                  items: [
                    for (var i = 0; i < _pilihan.length; i++)
                      DropdownMenuItem(value: i, child: Text('Semester ${_pilihan[i]['semester']} ${_pilihan[i]['tahun']}${i == 0 ? ' (berjalan)' : ''}')),
                  ],
                  onChanged: (i) => setState(() => _per = i == null || i == 0 ? null : _pilihan[i]),
                ),
              const SizedBox(height: 12),
              Wrap(spacing: 8, runSpacing: 8, children: [
                Lencana('Rata-rata ${_n(ringkas['rata'])}', warna: cs.primary),
                Lencana('Tuntas ${angka(ringkas['tuntas'])} dari ${angka(ringkas['jumlahMapel'])} mapel', warna: Colors.green),
                Lencana('KKM ${_n(d['kkm'])}', warna: Colors.orange),
              ]),
              const SizedBox(height: 12),
              if (mapel.isEmpty) const Kosong(pesan: 'Belum ada mata pelajaran untuk semester ini.', ikon: Icons.school_outlined),
              for (final m in mapel)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Text(teks(m['nama']), style: const TextStyle(fontWeight: FontWeight.w700))),
                        Text(_n(m['akhir']), style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20, color: m['akhir'] == null ? cs.onSurfaceVariant : (m['tuntas'] == true ? Colors.green.shade700 : cs.error))),
                        if (teks(m['predikat']).isNotEmpty) ...[const SizedBox(width: 6), Lencana(teks(m['predikat']))],
                      ]),
                      const SizedBox(height: 6),
                      Text('Diskusi ${_n(m['diskusi'])} · UTS ${_n(m['uts'])} · UAS ${_n(m['uas'])}'
                          '${m['persenHadir'] == null ? '' : ' · Hadir ${_n(m['persenHadir'])}%'}',
                          style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
                      if (m['akhir'] != null)
                        Text(m['tuntas'] == true ? 'Tuntas' : 'Belum tuntas (di bawah KKM)',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: m['tuntas'] == true ? Colors.green.shade700 : cs.error)),
                    ]),
                  ),
                ),
              const SizedBox(height: 8),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Text('Ketidakhadiran tatap muka: Sakit ${angka(hadir['Sakit'])} · Izin ${angka(hadir['Izin'])} · Tanpa keterangan ${angka(hadir['Alpa'])}'),
                ),
              ),
              const SizedBox(height: 8),
              Text('Nilai akhir dihitung dengan rumus yang sama dengan rapor. Nilai yang belum diisi tutor ditampilkan "–".',
                  style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
            ]),
          );
        },
      ),
    );
  }
}
