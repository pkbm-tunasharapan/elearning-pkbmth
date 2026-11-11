import 'package:flutter/material.dart';

import '../api.dart';
import '../nilai/opsi_rapor.dart' show semesterRapor;
import '../widgets.dart';
import 'sesi_siswa.dart';
import 'tagihan_siswa.dart';

/// Kartu Pencapaian Studi (siswa): nilai per mapel pada semester berjalan dan semester sebelumnya.
/// Angka dihitung server dengan rumus yang sama dengan rapor (waSiswaPencapaian).
class PencapaianSiswaScreen extends StatefulWidget {
  const PencapaianSiswaScreen({super.key});

  @override
  State<PencapaianSiswaScreen> createState() => _PencapaianSiswaScreenState();
}

class _PencapaianSiswaScreenState extends State<PencapaianSiswaScreen> {
  Map<String, String>? _per; // null = semester berjalan
  int _v = 0;

  Future<void> _bayar() async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TagihanSiswaScreen()));
    if (mounted) setState(() => _v++);
  }

  // v1.57.0: remedial diajukan langsung ke tutor mapel (Admin & Kepala Sekolah menerima notifikasi)
  Future<void> _ajukanRemedial(Map<String, dynamic> u) async {
    final c = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (dl) => AlertDialog(
        title: Text('Ajukan remedial ${teks(u['mapel'])}?'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${teks(u['judul'])} · nilai ${_n(u['persen'])} (KKM ${_n(u['kkm'])}). Pengajuan dikirim ke tutor mapel. Bila dalam 2 hari belum diputuskan, Admin atau Kepala Sekolah yang memutuskan.',
              style: const TextStyle(fontSize: 13)),
          const SizedBox(height: 10),
          TextField(controller: c, maxLines: 3, decoration: const InputDecoration(labelText: 'Catatan untuk tutor (opsional)', border: OutlineInputBorder())),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dl, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(dl, true), child: const Text('Ajukan')),
        ],
      ),
    );
    final a = c.text.trim();
    c.dispose();
    if (ok != true || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waUjianAjukan', [SesiSiswa.instance.idRombel, SesiSiswa.instance.nama, u['idUjian'], a]), teksProses: 'Mengirim pengajuan...');
    if (r.ok && mounted) {
      kabar(context, 'Pengajuan remedial terkirim ke tutor.');
      setState(() => _v++);
    }
  }

  Color _warnaUjian(String st) => switch (st) {
        'Lulus' => Colors.green.shade700,
        'Remedial' => Colors.red.shade700,
        'Tertahan' => Colors.orange.shade800,
        _ => Colors.grey.shade700,
      };
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
        key: ValueKey('${_per?['tahun']}|${_per?['semester']}|$_v'),
        muat: () async => peta(await Api.instance('waSiswaPencapaian', [SesiSiswa.instance.token, {...?_per}], const Duration(minutes: 3))),
        bangun: (context, d, segarkan) {
          if (_pilihan.isEmpty) _pilihan = semesterRapor(peta(d['periodeKini']));
          final per = peta(d['periode']);
          final rb = peta(d['rombel']);
          final ringkas = peta(d['ringkas']);
          final hadir = peta(d['kehadiran']);
          final mapel = daftar(d['mapel']).map(peta).toList();
          final ujian = daftar(d['ujian']).map(peta).toList();
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
                      if (m['tertahan'] != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Row(children: [
                            Expanded(child: Text(teks(peta(m['tertahan'])['pesan'], 'Nilai terbuka setelah biaya ujian dilunasi.'), style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: Colors.orange.shade900))),
                            TextButton.icon(onPressed: _bayar, icon: const Icon(Icons.payments_outlined, size: 18), label: const Text('Bayar')),
                          ]),
                        ),
                      if (m['akhir'] != null && m['tertahan'] == null)
                        Text(m['tuntas'] == true ? 'Tuntas' : 'Belum tuntas (di bawah KKM)',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: m['tuntas'] == true ? Colors.green.shade700 : cs.error)),
                    ]),
                  ),
                ),
              if (ujian.isNotEmpty) ...[
                const SizedBox(height: 8),
                const JudulBagian('Rekap nilai ujian', sub: 'Lulus KKM atau perlu remedial; remedial diajukan langsung ke tutor'),
                for (final u in ujian)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(child: Text('${teks(u['mapel'])} · ${teks(u['judul'])}', style: const TextStyle(fontWeight: FontWeight.w700))),
                          Text(u['tertahan'] != null ? '**' : _n(u['persen']), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18)),
                          const SizedBox(width: 6),
                          Lencana(teks(u['status']) == 'Tertahan' ? 'Belum lunas' : teks(u['status']), warna: _warnaUjian(teks(u['status']))),
                        ]),
                        Text('KKM ${_n(u['kkm'])}${teks(u['tanggal']).isEmpty ? '' : ' · ${teks(u['tanggal'])}'}', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                        if (u['tertahan'] != null)
                          Row(children: [
                            Expanded(child: Text(teks(peta(u['tertahan'])['pesan']), style: TextStyle(fontSize: 12.5, color: Colors.orange.shade900))),
                            TextButton.icon(onPressed: _bayar, icon: const Icon(Icons.payments_outlined, size: 18), label: const Text('Bayar')),
                          ]),
                        if (u['pengajuan'] != null)
                          Text('Pengajuan ${teks(peta(u['pengajuan'])['jenis']).toLowerCase()}: ${teks(peta(u['pengajuan'])['teks'], teks(peta(u['pengajuan'])['status']))}', style: const TextStyle(fontSize: 12.5)),
                        if (u['akses'] != null)
                          Text('Akses ${teks(peta(u['akses'])['jenis']).toLowerCase()}: ${teks(peta(u['akses'])['mulai'])} s.d. ${teks(peta(u['akses'])['selesai'])}. Kerjakan dari halaman ujian mapel.',
                              style: TextStyle(fontSize: 12.5, color: Colors.green.shade800, fontWeight: FontWeight.w600)),
                        if (u['bolehRemedial'] == true)
                          Align(
                            alignment: Alignment.centerRight,
                            child: FilledButton.tonalIcon(onPressed: () => _ajukanRemedial(u), icon: const Icon(Icons.replay_rounded), label: const Text('Ajukan remedial')),
                          ),
                      ]),
                    ),
                  ),
              ],
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
