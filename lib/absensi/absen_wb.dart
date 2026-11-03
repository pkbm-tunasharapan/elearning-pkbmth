import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'umum.dart';

String? get _t => Sesi.instance.token;

/// Konteks absensi (peran, kelas yang boleh diabsen, jam buka) — dipakai beberapa layar.
Future<Map<String, dynamic>> muatKonteksAbsen() async => peta(await Api.instance('waStafAbsenKonteks', [_t]));

/// Absensi warga belajar: Tutor (kelas yang diampu), Kepala Sekolah, dan Admin.
class AbsensiWbScreen extends StatefulWidget {
  const AbsensiWbScreen({super.key});

  @override
  State<AbsensiWbScreen> createState() => _AbsensiWbScreenState();
}

class _AbsensiWbScreenState extends State<AbsensiWbScreen> {
  Map<String, dynamic>? _kelas;
  String _tanggal = tglIso(DateTime.now());
  String _kodeBuka = '';
  int _v = 0;

  String _kunci(Map<String, dynamic> k) => '${teks(k['idRombel'])}|${teks(k['kodeMapel'])}';

  Future<Map<String, dynamic>> _catat(Map<String, dynamic> d) async {
    while (true) {
      try {
        return peta(await Api.instance('waStafAbsenWbCatat', [_t, {...d, 'tanggal': _tanggal, 'idRombel': teks(_kelas!['idRombel']), 'kodeMapel': teks(_kelas!['kodeMapel']), 'kodeBuka': _kodeBuka}]));
      } on ApiException catch (e) {
        if (!e.pesan.contains('Kode Buka') || !mounted) rethrow;
        final k = await mintaTeks(context, 'Di luar jam absensi', label: 'Kode Buka dari admin', huruf: true);
        if (k == null || k.isEmpty) rethrow;
        _kodeBuka = k;
      }
    }
  }

  Future<void> _ubahStatus(Map<String, dynamic> s, String status) async {
    final r = await jalankan(context, () => _catat({'idWb': teks(s['id']), 'status': status}), teksProses: 'Mencatat...');
    if (r.ok && mounted) setState(() => _v++);
  }

  Future<void> _pindai() async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PemindaiQr(
        judul: 'Pindai kartu WB · ${teks(_kelas!['namaRombel'])}',
        petunjuk: 'Pindai QR kartu warga belajar satu per satu. Hasil langsung tercatat Hadir.',
        onKode: (kode) async {
          final d = await _catat({'kode': kode, 'status': 'Hadir'});
          return d['sudah'] == true ? teks(d['pesan']) : '${teks(d['nama'])} — ${teks(d['status'])}';
        },
      ),
    ));
    if (mounted) setState(() => _v++);
  }

  Future<void> _semuaHadir(List<Map<String, dynamic>> siswa) async {
    final belum = siswa.where((s) => teks(s['status']).isEmpty).toList();
    if (belum.isEmpty) return kabar(context, 'Semua sudah tercatat.');
    if (!await konfirmasi(context, 'Tandai ${belum.length} warga belajar Hadir?', 'Hanya yang belum tercatat. Status bisa diubah lagi setelahnya.', ya: 'Tandai Hadir')) return;
    if (!mounted) return;
    final r = await jalankan(context, () async {
      for (final s in belum) {
        await _catat({'idWb': teks(s['id']), 'status': 'Hadir'});
      }
      return true;
    }, teksProses: 'Mencatat ${belum.length} warga belajar...');
    if (r.ok && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      muat: muatKonteksAbsen,
      bangun: (context, ks, _) {
        if (ks['tutorTerhubung'] == false) {
          return const Kosong(pesan: 'Akun Anda belum terhubung dengan data tutor di SIM SETARA (email/nomor HP/nama tidak cocok). Hubungi admin.', ikon: Icons.link_off_rounded);
        }
        final kelas = daftar(ks['kelas']).map(peta).toList();
        if (kelas.isEmpty) return const Kosong(pesan: 'Belum ada kelas (rombel × mapel) yang dapat Anda absen.', ikon: Icons.event_busy_rounded);
        _kelas ??= kelas.first;
        if (!kelas.any((k) => _kunci(k) == _kunci(_kelas!))) _kelas = kelas.first;
        final bolehLampau = ks['peran'] == 'Kepala Sekolah' || ks['peran'] == 'Admin';
        final jam = peta(ks['jam']);
        return Column(children: [
          Container(
            color: cs.surfaceContainerLowest,
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              DropdownButtonFormField<String>(
                isExpanded: true,
                initialValue: _kunci(_kelas!),
                decoration: const InputDecoration(labelText: 'Rombel · Mapel', isDense: true),
                items: [for (final k in kelas) DropdownMenuItem(value: _kunci(k), child: Text('${teks(k['namaRombel'])} · ${teks(k['namaMapel'])}', overflow: TextOverflow.ellipsis))],
                onChanged: (v) => setState(() => _kelas = kelas.firstWhere((k) => _kunci(k) == v)),
              ),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: !bolehLampau
                        ? null
                        : () async {
                            final now = DateTime.now();
                            final d = await showDatePicker(context: context, firstDate: now.subtract(const Duration(days: 120)), lastDate: now, initialDate: DateTime.tryParse(_tanggal) ?? now);
                            if (d != null) setState(() => _tanggal = tglIso(d));
                          },
                    icon: const Icon(Icons.event_rounded, size: 18),
                    label: Text(tglIndo(_tanggal)),
                  ),
                ),
                const SizedBox(width: 8),
                Text('Jam ${teks(jam['buka'], '00:00')}–${teks(jam['tutup'], '23:59')}', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
              ]),
            ]),
          ),
          Expanded(
            child: Muatan<Map<String, dynamic>>(
              key: ValueKey('${_kunci(_kelas!)}|$_tanggal|$_v'),
              muat: () async => peta(await Api.instance('waStafAbsenWbDaftar', [_t, {'tanggal': _tanggal, 'idRombel': teks(_kelas!['idRombel']), 'kodeMapel': teks(_kelas!['kodeMapel'])}])),
              bangun: (context, d, segarkan) {
                final siswa = daftar(d['siswa']).map(peta).toList();
                final jml = <String, int>{'Hadir': 0, 'Izin': 0, 'Sakit': 0, 'Alpa': 0, 'Belum': 0};
                for (final s in siswa) {
                  final st = teks(s['status']);
                  jml[st.isEmpty ? 'Belum' : st] = (jml[st.isEmpty ? 'Belum' : st] ?? 0) + 1;
                }
                final sesi = peta(d['sesi']);
                return Stack(children: [
                  ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 100), children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${siswa.length} warga belajar', style: const TextStyle(fontWeight: FontWeight.w800)),
                          const SizedBox(height: 6),
                          RingkasStatus(jumlah: jml),
                          const SizedBox(height: 6),
                          Text(
                            sesi.isEmpty
                                ? 'Sesi tatap muka hari ini belum dibuka. Sesi dibuat otomatis saat absen pertama.'
                                : (sesi['tutorHadir'] == true ? 'Tutor tercatat hadir pukul ${teks(sesi['jamTutor'])}.' : 'Tutor belum diabsen oleh Kepala Sekolah.'),
                            style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
                          ),
                          if (siswa.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            OutlinedButton.icon(onPressed: () => _semuaHadir(siswa), icon: const Icon(Icons.done_all_rounded, size: 18), label: const Text('Tandai yang belum = Hadir')),
                          ],
                        ]),
                      ),
                    ),
                    if (siswa.isEmpty) const Kosong(pesan: 'Rombel ini belum punya warga belajar aktif.'),
                    Card(
                      child: Column(children: [
                        for (final s in siswa)
                          ListTile(
                            contentPadding: const EdgeInsets.fromLTRB(14, 4, 8, 4),
                            leading: CircleAvatar(
                              backgroundColor: warnaStatusHadir(context, teks(s['status'])).withValues(alpha: 0.15),
                              child: Text(teks(s['nama'], '?')[0], style: TextStyle(color: warnaStatusHadir(context, teks(s['status'])), fontWeight: FontWeight.w800)),
                            ),
                            title: Text(teks(s['nama']), maxLines: 1, overflow: TextOverflow.ellipsis),
                            subtitle: Text(teks(s['status']).isEmpty ? 'Belum diabsen' : '${teks(s['status'])} · ${teks(s['jam'])}${teks(s['oleh']).isEmpty ? '' : ' · ${teks(s['oleh'])}'}',
                                style: const TextStyle(fontSize: 12)),
                            trailing: PopupMenuButton<String>(
                              tooltip: 'Ubah status',
                              icon: Icon(teks(s['status']).isEmpty ? Icons.radio_button_unchecked_rounded : Icons.check_circle_rounded, color: warnaStatusHadir(context, teks(s['status']))),
                              onSelected: (v) => _ubahStatus(s, v),
                              itemBuilder: (_) => [for (final st in ['Hadir', 'Izin', 'Sakit', 'Alpa']) PopupMenuItem(value: st, child: Text(st))],
                            ),
                            onTap: teks(s['status']).isEmpty ? () => _ubahStatus(s, 'Hadir') : null,
                          ),
                      ]),
                    ),
                  ]),
                  Positioned(
                    right: 16,
                    bottom: 16,
                    child: FloatingActionButton.extended(
                      heroTag: 'pindaiWb',
                      backgroundColor: Gaya.ungu,
                      foregroundColor: Colors.white,
                      onPressed: _tanggal == tglIso(DateTime.now()) ? _pindai : null,
                      icon: const Icon(Icons.qr_code_scanner_rounded),
                      label: const Text('Pindai QR'),
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
