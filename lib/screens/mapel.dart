import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'admin_lain.dart';
import 'mapel_detail.dart';

/// Daftar mata pelajaran yang diampu (tutor) atau semua mapel aktif (admin), dikelompokkan per rombel.
class MapelScreen extends StatefulWidget {
  const MapelScreen({super.key});

  @override
  State<MapelScreen> createState() => _MapelScreenState();
}

class _MapelScreenState extends State<MapelScreen> {
  String _cari = '';

  @override
  Widget build(BuildContext context) {
    return Muatan<List<Map<String, dynamic>>>(
      muat: () async {
        await Sesi.instance.segarkanProfil();
        return Sesi.instance.mapel;
      },
      bangun: (context, mapel, segarkan) {
        final q = _cari.toLowerCase();
        final saring = mapel.where((m) => q.isEmpty || '${teks(m['namaMapel'])} ${teks(m['namaRombel'])}'.toLowerCase().contains(q)).toList()
          ..sort((a, b) => '${teks(a['namaRombel'])}|${teks(a['namaMapel'])}'.compareTo('${teks(b['namaRombel'])}|${teks(b['namaMapel'])}'));
        final grup = <String, List<Map<String, dynamic>>>{};
        for (final m in saring) {
          grup.putIfAbsent(teks(m['namaRombel'], 'Tanpa rombel'), () => []).add(m);
        }
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Cari mapel atau kelas'),
              onChanged: (v) => setState(() => _cari = v),
            ),
            if (mapel.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const KesiapanScreen())),
                  icon: const Icon(Icons.fact_check_rounded),
                  label: const Text('Cek Kesiapan Rombel'),
                ),
              ),
            if (mapel.isEmpty && daftar(Sesi.instance.profil['pengajuan']).isNotEmpty)
              Card(
                margin: const EdgeInsets.only(top: 14),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Pengajuan mata pelajaran Anda menunggu persetujuan admin', style: TextStyle(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    const Text('Mapel akan muncul di sini setelah admin menyetujui. Tarik ke bawah untuk memuat ulang.'),
                    const SizedBox(height: 8),
                    for (final x in daftar(Sesi.instance.profil['pengajuan']).map(peta)) Text('• ${teks(x['namaMapel'])} · ${teks(x['namaRombel'])}'),
                  ]),
                ),
              )
            else if (mapel.isEmpty)
              const Kosong(pesan: 'Belum ada mata pelajaran yang Anda ampu. Hubungi admin untuk didaftarkan.'),
            for (final e in grup.entries) ...[
              JudulBagian(e.key, sub: '${e.value.length} mapel'),
              Card(
                child: Column(children: [
                  for (final m in e.value)
                    ListTile(
                      leading: IkonBulat(Icons.menu_book_rounded, warna: Gaya.warnaMenu(teks(m['namaMapel'])), ukuran: 42, sudut: 14),
                      title: Text(teks(m['namaMapel'])),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => MapelDetailScreen(
                          idMapel: teks(m['idMapel']),
                          namaMapel: teks(m['namaMapel']),
                          namaRombel: teks(m['namaRombel']),
                        ),
                      )),
                    ),
                ]),
              ),
            ],
          ],
        );
      },
    );
  }
}
