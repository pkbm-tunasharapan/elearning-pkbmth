import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

/// v1.50.0: Admin mengatur jenis notifikasi yang diterima tiap peran.
class NotifAturanScreen extends StatefulWidget {
  const NotifAturanScreen({super.key});

  @override
  State<NotifAturanScreen> createState() => _NotifAturanScreenState();
}

class _NotifAturanScreenState extends State<NotifAturanScreen> {
  Map<String, Set<String>>? _pilih;
  Map<String, dynamic>? _d;
  String? _galat;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  void _isi(Map<String, dynamic> d) {
    _d = d;
    _pilih = {for (final j in daftar(d['jenis']).map(peta)) teks(j['kode']): daftar(j['peran']).map(teks).toSet()};
  }

  Future<void> _muat() async {
    try {
      final d = peta(await Api.instance('waAdminNotifAturan', [_t]));
      if (mounted) setState(() { _isi(d); _galat = null; });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  Future<void> _simpan() async {
    final p = _pilih;
    if (p == null) return;
    final r = await jalankan(context, () async => peta(await Api.instance('waAdminNotifAturanSimpan', [_t, {for (final e in p.entries) e.key: e.value.toList()}])),
        teksProses: 'Menyimpan...');
    if (r.ok && mounted) {
      setState(() => _isi(r.data!));
      kabar(context, 'Pengaturan notifikasi tersimpan.');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_galat != null) return PesanGalat(pesan: _galat!, ulangi: _muat);
    final d = _d, p = _pilih;
    if (d == null || p == null) return const Center(child: CircularProgressIndicator());
    final peranStaf = daftar(d['peranStaf']).map(teks).toList();
    final jenis = daftar(d['jenis']).map(peta).toList();
    final grup = <String, List<Map<String, dynamic>>>{};
    for (final j in jenis) {
      grup.putIfAbsent(teks(j['grup']), () => []).add(j);
    }
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
      const Text('Atur jenis notifikasi yang diterima tiap peran. Notifikasi tampil di lonceng aplikasi dan sebagai notifikasi ponsel '
          '(Android, walau aplikasi tertutup). Notifikasi siswa dan tutor hanya dikirim ke orang yang bersangkutan.', style: TextStyle(fontSize: 12.5)),
      for (final g in grup.entries) ...[
        JudulBagian(g.key),
        for (final j in g.value)
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
              child: teks(j['sasaran']) == 'peran'
                  ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(teks(j['nama']), style: const TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 6),
                      Wrap(spacing: 6, runSpacing: 4, children: [
                        for (final r in peranStaf)
                          FilterChip(
                            label: Text(r),
                            selected: p[teks(j['kode'])]!.contains(r),
                            onSelected: (v) => setState(() => v ? p[teks(j['kode'])]!.add(r) : p[teks(j['kode'])]!.remove(r)),
                          ),
                      ]),
                    ])
                  : SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(teks(j['nama']), style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(teks(j['sasaran']) == 'siswa' ? 'Ke siswa yang bersangkutan' : 'Ke tutor yang bersangkutan'),
                      value: p[teks(j['kode'])]!.isNotEmpty,
                      onChanged: (v) => setState(() => p[teks(j['kode'])] = v ? {teks(j['sasaran']) == 'siswa' ? 'Siswa' : 'Tutor'} : <String>{}),
                    ),
            ),
          ),
      ],
      const SizedBox(height: 12),
      FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: _simpan, child: const Text('Simpan pengaturan notifikasi')),
    ]);
  }
}
