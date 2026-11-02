import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';
import 'home.dart';

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
            if (mapel.isEmpty) const Kosong(pesan: 'Belum ada mata pelajaran yang Anda ampu. Hubungi admin untuk didaftarkan.'),
            for (final e in grup.entries) ...[
              JudulBagian(e.key, sub: '${e.value.length} mapel'),
              Card(
                child: Column(children: [
                  for (final m in e.value)
                    ListTile(
                      leading: const IkonBulat(Icons.menu_book_rounded, ukuran: 42, sudut: 14),
                      title: Text(teks(m['namaMapel'])),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => MapelWebScreen(
                          judul: '${teks(m['namaMapel'])} · ${teks(m['namaRombel'])}',
                          idMapel: teks(m['idMapel']),
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
