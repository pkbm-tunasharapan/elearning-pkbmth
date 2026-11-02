import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';

/// Reset data uji coba (admin): mengosongkan sheet transaksi, data induk tetap.
class ResetScreen extends StatefulWidget {
  const ResetScreen({super.key});

  @override
  State<ResetScreen> createState() => _ResetScreenState();
}

class _ResetScreenState extends State<ResetScreen> {
  int _versi = 0;
  final Set<String> _pilih = {};
  bool _awal = true;
  final _frasa = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_versi),
      muat: () async => peta(await Api.instance('waAdminResetRencana', [Sesi.instance.token])),
      bangun: (context, d, segarkan) {
        final bersih = daftar(d['bersih']).map(peta).toList();
        final simpan = daftar(d['simpan']).map(peta).toList();
        final frasa = teks(d['frasa']);
        if (_awal) {
          _pilih.addAll(bersih.where((x) => angka(x['baris']) > 0).map((x) => teks(x['nama'])));
          _awal = false;
        }
        final totalPilih = bersih.where((x) => _pilih.contains(teks(x['nama']))).fold<num>(0, (n, x) => n + angka(x['baris']));
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Card(
              color: cs.errorContainer,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  'Reset mengosongkan data hasil uji coba (materi, diskusi, nilai, absensi, dan sejenisnya). '
                  'Data induk seperti siswa, staf, rombel, dan mata pelajaran TIDAK dihapus. Tindakan ini tidak bisa dibatalkan.',
                  style: TextStyle(color: cs.onErrorContainer),
                ),
              ),
            ),
            JudulBagian('Dikosongkan', sub: '${totalPilih.toInt()} baris dari ${angka(d['total']).toInt()} baris'),
            Card(
              child: Column(children: [
                for (final x in bersih)
                  CheckboxListTile(
                    dense: true,
                    title: Text(teks(x['nama'])),
                    subtitle: Text('${angka(x['baris']).toInt()} baris'),
                    value: _pilih.contains(teks(x['nama'])),
                    onChanged: (v) => setState(() => v == true ? _pilih.add(teks(x['nama'])) : _pilih.remove(teks(x['nama']))),
                  ),
              ]),
            ),
            JudulBagian('Dipertahankan'),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Wrap(spacing: 6, runSpacing: 6, children: [
                  for (final x in simpan) Lencana('${teks(x['nama'])} (${angka(x['baris']).toInt()})', warna: Colors.green),
                ]),
              ),
            ),
            const SizedBox(height: 14),
            TextField(controller: _frasa, decoration: InputDecoration(labelText: 'Ketik persis: $frasa')),
            const SizedBox(height: 12),
            FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: cs.error, foregroundColor: cs.onError),
              onPressed: _pilih.isEmpty
                  ? null
                  : () async {
                      if (_frasa.text.trim() != frasa) {
                        kabar(context, 'Ketik persis: $frasa', galat: true);
                        return;
                      }
                      final ok = await konfirmasi(context, 'Reset data?', '${_pilih.length} sheet akan dikosongkan. Lanjutkan?', ya: 'Reset');
                      if (!ok || !context.mounted) return;
                      final r = await jalankan(context, () => Api.instance('waAdminResetData', [Sesi.instance.token, frasa, _pilih.toList()], const Duration(seconds: 120)),
                          teksProses: 'Mengosongkan data...');
                      if (r.ok && context.mounted) {
                        final h = peta(r.data);
                        kabar(context, '${angka(h['total']).toInt()} baris dikosongkan dari ${daftar(h['sheet']).length} sheet.');
                        setState(() {
                          _frasa.clear();
                          _pilih.clear();
                          _awal = true;
                          _versi++;
                        });
                      }
                    },
              icon: const Icon(Icons.delete_sweep),
              label: const Text('Reset data terpilih'),
            ),
          ],
        );
      },
    );
  }
}
