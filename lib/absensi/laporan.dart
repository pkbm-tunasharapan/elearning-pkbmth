import 'package:flutter/material.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';
import 'absen_ks.dart';
import 'umum.dart';

String? get _t => Sesi.instance.token;

/// Laporan kehadiran: tutor, warga belajar (syarat ujian 80%), sesi, dan Kepala Sekolah.
class LaporanHadirScreen extends StatefulWidget {
  const LaporanHadirScreen({super.key});

  @override
  State<LaporanHadirScreen> createState() => _LaporanHadirScreenState();
}

class _LaporanHadirScreenState extends State<LaporanHadirScreen> {
  late String _dari;
  late String _sampai;
  int _tab = 0;
  String _cari = '';

  @override
  void initState() {
    super.initState();
    final n = DateTime.now();
    _dari = tglIso(DateTime(n.year, n.month, 1));
    _sampai = tglIso(n);
  }

  Future<void> _rentang() async {
    final n = DateTime.now();
    final r = await showDateRangePicker(
      context: context,
      firstDate: DateTime(n.year - 2),
      lastDate: n,
      initialDateRange: DateTimeRange(start: DateTime.parse(_dari), end: DateTime.parse(_sampai)),
    );
    if (r != null) setState(() { _dari = tglIso(r.start); _sampai = tglIso(r.end); });
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tutorSaja = Sesi.instance.peran == 'Tutor';
    final tabs = ['Tutor', 'Warga Belajar', 'Sesi', if (!tutorSaja) 'Kepala Sekolah'];
    if (_tab >= tabs.length) _tab = 0;
    return Column(children: [
      Container(
        color: cs.surfaceContainerLowest,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          OutlinedButton.icon(onPressed: _rentang, icon: const Icon(Icons.date_range_rounded), label: Text('${tglIndo(_dari)} – ${tglIndo(_sampai)}')),
          const SizedBox(height: 8),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (var i = 0; i < tabs.length; i++)
                Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: Text(tabs[i]), selected: _tab == i, onSelected: (_) => setState(() => _tab = i))),
            ]),
          ),
        ]),
      ),
      Expanded(
        child: Muatan<Map<String, dynamic>>(
          key: ValueKey('$_dari|$_sampai'),
          muat: () async => peta(await Api.instance('waStafLaporanHadir', [_t, {'dari': _dari, 'sampai': _sampai}], const Duration(seconds: 180))),
          bangun: (context, d, _) {
            final syarat = angka(d['syaratPersen'], 80);
            final isi = _isiTab(context, d, tabs[_tab], syarat, cs);
            return Stack(children: [
              isi,
              Positioned(
                right: 16,
                bottom: 16,
                child: FloatingActionButton.small(
                  heroTag: 'eksporHadir',
                  tooltip: 'Ekspor Excel / PDF',
                  onPressed: () => _ekspor(context, d, tabs[_tab]),
                  child: const Icon(Icons.download_rounded),
                ),
              ),
            ]);
          },
        ),
      ),
    ]);
  }

  void _ekspor(BuildContext context, Map<String, dynamic> d, String tab) {
    final sub = 'Periode ${tglIndo(_dari)} – ${tglIndo(_sampai)}';
    switch (tab) {
      case 'Tutor':
        final t = daftar(d['tutor']).map(peta).toList();
        pilihEkspor(context, judul: 'Kehadiran Tutor', sub: sub, kepala: const ['No', 'Nama', 'Hadir', 'Sesi', 'Absen darurat'], baris: [
          for (var i = 0; i < t.length; i++) ['${i + 1}', teks(t[i]['nama']), '${t[i]['hadir']}', '${t[i]['sesi']}', '${angka(t[i]['darurat'])}'],
        ]);
      case 'Warga Belajar':
        final b = <List<String>>[];
        for (final r in daftar(d['rombel']).map(peta)) {
          for (final w in daftar(r['wb']).map(peta)) {
            b.add([teks(r['nama']), teks(w['nama']), '${w['hadir']}', '${w['izin']}', '${w['sakit']}', '${w['alpa']}', w['persen'] == null ? '-' : '${w['persen']}%']);
          }
        }
        pilihEkspor(context, judul: 'Kehadiran Warga Belajar', sub: sub, kepala: const ['Rombel', 'Nama', 'Hadir', 'Izin', 'Sakit', 'Alpa', 'Persentase'], baris: b);
      case 'Sesi':
        final s = daftar(d['sesi']).map(peta).toList();
        pilihEkspor(context, judul: 'Sesi Pembelajaran', sub: sub, kepala: const ['Tanggal', 'Mapel', 'Rombel', 'Kegiatan', 'Tutor', 'Kehadiran tutor'], baris: [
          for (final x in s)
            [
              tglIndo(teks(x['tanggal'])), teks(x['mapel']), teks(x['rombel']), teks(x['kegiatan']), teks(x['tutor']),
              teks(x['kegiatan']) != 'Tatap Muka' ? '-' : (x['tutorHadir'] == true ? '${x['darurat'] == true ? 'Darurat' : 'Hadir'} ${teks(x['jam'])}' : 'Belum'),
            ],
        ]);
      default:
        final k = daftar(d['ks']).map(peta).toList();
        pilihEkspor(context, judul: 'Kehadiran Kepala Sekolah', sub: sub, kepala: const ['Tanggal', 'Nama', 'Status', 'Jam', 'Keterangan'], baris: [
          for (final x in k) [tglIndo(teks(x['tanggal'])), teks(x['nama']), teks(x['status']), teks(x['jam'], teks(x['masuk'])), teks(x['keterangan'], teks(x['ket']))],
        ]);
    }
  }

  Widget _isiTab(BuildContext context, Map<String, dynamic> d, String tab, int syarat, ColorScheme cs) {
            switch (tab) {
              case 'Tutor':
                final t = daftar(d['tutor']).map(peta).toList();
                return ListView(padding: const EdgeInsets.all(16), children: [
                  if (t.isEmpty) const Kosong(pesan: 'Belum ada sesi tatap muka dengan tutor pada rentang ini.'),
                  Card(
                    child: Column(children: [
                      for (final x in t)
                        ListTile(
                          leading: const Icon(Icons.person_rounded),
                          title: Text(teks(x['nama'])),
                          subtitle: Text('Hadir ${x['hadir']} dari ${x['sesi']} sesi${angka(x['darurat']) > 0 ? ' · ${x['darurat']} lewat absen darurat' : ''}'),
                          trailing: Text('${x['hadir']}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                        ),
                    ]),
                  ),
                ]);
              case 'Warga Belajar':
                final rombel = daftar(d['rombel']).map(peta).toList();
                final q = _cari.toLowerCase();
                return ListView(padding: const EdgeInsets.all(16), children: [
                  TextField(decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Cari nama warga belajar'), onChanged: (v) => setState(() => _cari = v)),
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text('Persentase = hadir ÷ jumlah sesi rombel (tatap muka + belajar mandiri). Syarat ujian minimal $syarat%.', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                  ),
                  for (final r in rombel)
                    Builder(builder: (context) {
                      final wb = daftar(r['wb']).map(peta).where((w) => q.isEmpty || teks(w['nama']).toLowerCase().contains(q)).toList();
                      if (wb.isEmpty) return const SizedBox.shrink();
                      final kurang = wb.where((w) => w['persen'] != null && (w['persen'] as num) < syarat).length;
                      return Card(
                        child: ExpansionTile(
                          title: Text('Rombel ${teks(r['nama'])}', style: const TextStyle(fontWeight: FontWeight.w800)),
                          subtitle: Text('${r['totalSesi']} sesi · ${wb.length} WB${kurang > 0 ? ' · $kurang di bawah $syarat%' : ''}'),
                          children: [
                            for (final w in wb)
                              ListTile(
                                dense: true,
                                title: Text(teks(w['nama'])),
                                subtitle: Text('Hadir ${w['hadir']} · Izin ${w['izin']} · Sakit ${w['sakit']} · Alpa ${w['alpa']}'),
                                trailing: Text(w['persen'] == null ? '–' : '${w['persen']}%',
                                    style: TextStyle(fontWeight: FontWeight.w900, color: w['persen'] != null && (w['persen'] as num) < syarat ? cs.error : Colors.green)),
                              ),
                          ],
                        ),
                      );
                    }),
                ]);
              case 'Sesi':
                final s = daftar(d['sesi']).map(peta).toList();
                return ListView(padding: const EdgeInsets.all(16), children: [
                  if (s.isEmpty) const Kosong(pesan: 'Belum ada sesi pada rentang ini.'),
                  Card(
                    child: Column(children: [
                      for (final x in s)
                        ListTile(
                          dense: true,
                          leading: Icon(teks(x['kegiatan']) == 'Tatap Muka' ? Icons.groups_rounded : Icons.laptop_rounded),
                          title: Text('${teks(x['mapel'])} · ${teks(x['rombel'])}'),
                          subtitle: Text('${tglIndo(teks(x['tanggal']))} · ${teks(x['kegiatan'])}${teks(x['tutor']).isNotEmpty ? ' · ${teks(x['tutor'])}' : ''}'),
                          trailing: teks(x['kegiatan']) != 'Tatap Muka'
                              ? null
                              : Lencana(x['tutorHadir'] == true ? (x['darurat'] == true ? 'Darurat ${teks(x['jam'])}' : 'Hadir ${teks(x['jam'])}') : 'Tutor belum', warna: x['tutorHadir'] == true ? (x['darurat'] == true ? const Color(0xFFE9A23B) : Colors.green) : cs.outline),
                        ),
                    ]),
                  ),
                ]);
              default:
                final k = daftar(d['ks']).map(peta).toList();
                return ListView(padding: const EdgeInsets.all(16), children: [
                  if (k.isEmpty) const Kosong(pesan: 'Belum ada catatan kehadiran Kepala Sekolah pada rentang ini.'),
                  for (final x in k) KartuPresensiKs(x: x, tampilNama: true),
                ]);
            }
  }
}
