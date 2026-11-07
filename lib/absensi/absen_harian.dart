import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'absen_wb.dart';
import 'umum.dart';

String? get _t => Sesi.instance.token;

/// Menu "Absensi Warga Belajar": Admin & Kepala Sekolah memakai absensi harian global,
/// Tutor tetap memakai absensi per mapel yang diampu.
class AbsensiMenuScreen extends StatelessWidget {
  const AbsensiMenuScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final peran = Sesi.instance.peran;
    return peran == 'Admin' || peran == 'Kepala Sekolah' ? const AbsenHarianScreen() : const AbsensiWbScreen();
  }
}

/// Absensi harian global: scan QR pertama = datang, scan berikutnya = pulang.
/// Izin/Sakit/Alpa diisi manual dari daftar. Tidak terkait rombel/mapel tertentu.
class AbsenHarianScreen extends StatefulWidget {
  const AbsenHarianScreen({super.key});

  @override
  State<AbsenHarianScreen> createState() => _AbsenHarianScreenState();
}

class _AbsenHarianScreenState extends State<AbsenHarianScreen> {
  String _tanggal = tglIso(DateTime.now());
  String _rombel = '';
  String _kodeBuka = '';
  String _cari = '';
  int _v = 0;

  Future<T> _denganKodeBuka<T>(Future<T> Function() aksi) async {
    while (true) {
      try {
        return await aksi();
      } on ApiException catch (e) {
        if (!e.pesan.contains('Kode Buka') || !mounted) rethrow;
        final k = await mintaTeks(context, 'Di luar jam absensi', label: 'Kode Buka dari admin', huruf: true);
        if (k == null || k.isEmpty) rethrow;
        _kodeBuka = k;
      }
    }
  }

  Future<void> _pindai() async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PemindaiQr(
        judul: 'Absensi harian',
        petunjuk: 'Scan kartu saat datang, scan lagi saat pulang. Semua rombel bisa dipindai di sini.',
        onKode: (kode) async {
          final d = peta(await _denganKodeBuka(() async => Api.instance('waStafAbsenHarianPindai', [_t, {'kode': kode, 'kodeBuka': _kodeBuka}])));
          return teks(d['pesan']);
        },
      ),
    ));
    if (mounted) setState(() => _v++);
  }

  Future<void> _ubah(Map<String, dynamic> s, String status) async {
    String ket = '';
    if (status != 'Hadir') {
      final k = await mintaTeks(context, '$status: ${teks(s['nama'])}', label: 'Keterangan (opsional)', awal: teks(s['ket']));
      if (k == null) return;
      ket = k;
    }
    if (!mounted) return;
    final r = await jalankan(
      context,
      () => Api.instance('waStafAbsenHarianCatat', [_t, {'tanggal': _tanggal, 'idWb': teks(s['id']), 'status': status, 'keterangan': ket}]),
      teksProses: 'Mencatat...',
    );
    if (r.ok && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      muat: () async => peta(await Api.instance('waStafAbsenHarianKonteks', [_t])),
      bangun: (context, ks, _) {
        final rombel = daftar(ks['rombel']).map(peta).toList();
        final jam = peta(ks['jam']);
        final hariIni = _tanggal == tglIso(DateTime.now());
        return Column(children: [
          Container(
            color: cs.surfaceContainerLowest,
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      final now = DateTime.now();
                      final d = await showDatePicker(context: context, firstDate: now.subtract(const Duration(days: 120)), lastDate: now, initialDate: DateTime.tryParse(_tanggal) ?? now);
                      if (d != null) setState(() => _tanggal = tglIso(d));
                    },
                    icon: const Icon(Icons.event_rounded, size: 18),
                    label: Text(tglIndo(_tanggal)),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    isExpanded: true,
                    initialValue: _rombel,
                    decoration: const InputDecoration(labelText: 'Rombel', isDense: true),
                    items: [
                      const DropdownMenuItem(value: '', child: Text('Semua rombel')),
                      for (final r in rombel) DropdownMenuItem(value: teks(r['id']), child: Text(teks(r['nama']), overflow: TextOverflow.ellipsis)),
                    ],
                    onChanged: (v) => setState(() => _rombel = v ?? ''),
                  ),
                ),
              ]),
              const SizedBox(height: 8),
              TextField(
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari nama', isDense: true),
                onChanged: (v) => setState(() => _cari = v.trim().toLowerCase()),
              ),
              const SizedBox(height: 4),
              Text('Absensi harian (global) · jam ${teks(jam['buka'], '00:00')}–${teks(jam['tutup'], '23:59')}',
                  style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
            ]),
          ),
          Expanded(
            child: Muatan<Map<String, dynamic>>(
              key: ValueKey('$_tanggal|$_rombel|$_v'),
              muat: () async => peta(await Api.instance('waStafAbsenHarianDaftar', [_t, {'tanggal': _tanggal, 'idRombel': _rombel}])),
              bangun: (context, d, segarkan) {
                final semua = daftar(d['siswa']).map(peta).toList();
                final siswa = _cari.isEmpty ? semua : semua.where((s) => teks(s['nama']).toLowerCase().contains(_cari)).toList();
                final jml = <String, int>{'Hadir': 0, 'Pulang': 0, 'Izin': 0, 'Sakit': 0, 'Alpa': 0, 'Belum': 0};
                for (final s in semua) {
                  final st = teks(s['status']);
                  jml[st.isEmpty ? 'Belum' : st] = (jml[st.isEmpty ? 'Belum' : st] ?? 0) + 1;
                  if (teks(s['pulang']).isNotEmpty) jml['Pulang'] = jml['Pulang']! + 1;
                }
                return Stack(children: [
                  RefreshIndicator(
                    onRefresh: segarkan,
                    child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 100), children: [
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('${semua.length} warga belajar aktif', style: const TextStyle(fontWeight: FontWeight.w800)),
                            const SizedBox(height: 6),
                            RingkasStatus(jumlah: jml),
                          ]),
                        ),
                      ),
                      if (siswa.isEmpty) const Kosong(pesan: 'Tidak ada warga belajar untuk ditampilkan.'),
                      Card(
                        child: Column(children: [
                          for (final s in siswa)
                            ListTile(
                              contentPadding: const EdgeInsets.fromLTRB(14, 2, 8, 2),
                              leading: CircleAvatar(
                                backgroundColor: warnaStatusHadir(context, teks(s['status'])).withValues(alpha: 0.15),
                                child: Icon(
                                  teks(s['pulang']).isNotEmpty ? Icons.logout_rounded : (teks(s['status']) == 'Hadir' ? Icons.login_rounded : Icons.person_outline_rounded),
                                  color: warnaStatusHadir(context, teks(s['status'])),
                                  size: 20,
                                ),
                              ),
                              title: Text(teks(s['nama']), maxLines: 1, overflow: TextOverflow.ellipsis),
                              subtitle: Text(
                                [
                                  teks(s['rombel']),
                                  if (teks(s['status']).isEmpty) 'Belum diabsen',
                                  if (teks(s['status']) == 'Hadir') 'Datang ${teks(s['datang'], '-')}${teks(s['pulang']).isEmpty ? '' : ' · pulang ${teks(s['pulang'])}'}',
                                  if (teks(s['status']).isNotEmpty && teks(s['status']) != 'Hadir') teks(s['status']),
                                  if (teks(s['ket']).isNotEmpty) teks(s['ket']),
                                ].join(' · '),
                                style: const TextStyle(fontSize: 12),
                              ),
                              trailing: PopupMenuButton<String>(
                                tooltip: 'Ubah status',
                                onSelected: (v) => _ubah(s, v),
                                itemBuilder: (_) => [for (final st in ['Hadir', 'Izin', 'Sakit', 'Alpa']) PopupMenuItem(value: st, child: Text(st))],
                              ),
                            ),
                        ]),
                      ),
                    ]),
                  ),
                  Positioned(
                    right: 16,
                    bottom: 16,
                    child: FloatingActionButton.extended(
                      heroTag: 'pindaiHarian',
                      backgroundColor: Gaya.ungu,
                      foregroundColor: Colors.white,
                      onPressed: hariIni ? _pindai : null,
                      icon: const Icon(Icons.qr_code_scanner_rounded),
                      label: const Text('Pindai datang / pulang'),
                    ),
                  ),
                ]);
              },
            ),
          ),
        ]);
      },
    );
  }
}
