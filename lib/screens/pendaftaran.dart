import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';

/// Pendaftaran siswa mandiri: buka/tutup pendaftaran per rombel + tautan pendaftaran.
class PendaftaranScreen extends StatefulWidget {
  const PendaftaranScreen({super.key});

  @override
  State<PendaftaranScreen> createState() => _PendaftaranScreenState();
}

class _PendaftaranScreenState extends State<PendaftaranScreen> {
  int _versi = 0;
  String? get _t => Sesi.instance.token;

  Future<void> _atur(String idRombel, String aksi) async {
    final r = await jalankan(context, () => Api.instance('waAdminAturDaftar', [_t, idRombel, aksi]), teksProses: 'Menyimpan...');
    if (r.ok && mounted) setState(() => _versi++);
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<List<dynamic>>(
      key: ValueKey(_versi),
      muat: () async {
        final hasil = await Future.wait([
          Api.instance('waAdminDaftarPendaftaran', [_t]),
          Api.instance('waUrlStaf', []),
        ]);
        return hasil;
      },
      bangun: (context, d, segarkan) {
        final rombel = daftar(peta(d[0])['rombel']).map(peta).toList();
        final url = teks(peta(d[1])['daftar']);
        final dibuka = rombel.where((r) => r['terbuka'] == true).length;
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Pendaftaran Siswa Mandiri', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  const Text('Siswa mendaftar sendiri dengan nama, tanggal lahir, email (OTP sekali), dan memilih rombel. Hanya rombel yang DIBUKA yang muncul di pilihan siswa. Masuk berikutnya memakai nama + kata sandi TH-ddmmyyyy.'),
                  const SizedBox(height: 10),
                  Text('Tautan pendaftaran', style: Theme.of(context).textTheme.labelLarge),
                  SelectableText(url.isEmpty ? '-' : url, style: const TextStyle(fontSize: 12.5)),
                  const SizedBox(height: 6),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    OutlinedButton.icon(
                      onPressed: url.isEmpty
                          ? null
                          : () async {
                              await Clipboard.setData(ClipboardData(text: url));
                              if (context.mounted) kabar(context, 'Tautan pendaftaran disalin.');
                            },
                      icon: const Icon(Icons.copy),
                      label: const Text('Salin tautan'),
                    ),
                    FilledButton.tonal(onPressed: () => _atur('', 'bukaSemua'), child: const Text('Buka semua')),
                    OutlinedButton(onPressed: () => _atur('', 'tutupSemua'), child: const Text('Tutup semua')),
                  ]),
                ]),
              ),
            ),
            JudulBagian('Rombel', sub: '$dibuka dari ${rombel.length} rombel dibuka'),
            if (rombel.isEmpty) const Kosong(pesan: 'Belum ada rombel aktif.'),
            Card(
              child: Column(children: [
                for (final r in rombel)
                  SwitchListTile(
                    title: Text(teks(r['nama'])),
                    subtitle: Text('${angka(r['jumlahSiswa'])} siswa · ${angka(r['jumlahMandiri'])} daftar mandiri'),
                    value: r['terbuka'] == true,
                    onChanged: (v) => _atur(teks(r['idRombel']), v ? 'buka' : 'tutup'),
                  ),
              ]),
            ),
          ],
        );
      },
    );
  }
}
