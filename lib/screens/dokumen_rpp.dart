import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'rpp.dart';

/// Daftar mapel yang RPP-nya dapat dilihat/diunduh.
/// Kepala Sekolah, Koordinator Kurikulum, Admin: semua mapel aktif. Tutor: hanya mapel yang diampu.
Future<List<Map<String, dynamic>>> muatMapelRpp() async {
  final d = peta(await Api.instance('waStafRppDaftarMapel', [Sesi.instance.token]));
  return daftar(d['mapel']).map(peta).toList();
}

class DokumenRppScreen extends StatefulWidget {
  const DokumenRppScreen({super.key});

  @override
  State<DokumenRppScreen> createState() => _DokumenRppScreenState();
}

class _DokumenRppScreenState extends State<DokumenRppScreen> {
  String _cari = '';

  @override
  Widget build(BuildContext context) {
    final pimpinan = Sesi.instance.peran == 'Kepala Sekolah' || Sesi.instance.peran == 'Koordinator Kurikulum';
    return Muatan<List<Map<String, dynamic>>>(
      muat: muatMapelRpp,
      bangun: (context, mapel, segarkan) {
        final q = _cari.toLowerCase().trim();
        final saring = mapel.where((m) => q.isEmpty || '${teks(m['namaMapel'])} ${teks(m['namaRombel'])} ${teks(m['tutor'])}'.toLowerCase().contains(q)).toList()
          ..sort((a, b) => '${teks(a['namaRombel'])}|${teks(a['namaMapel'])}'.compareTo('${teks(b['namaRombel'])}|${teks(b['namaMapel'])}'));
        final grup = <String, List<Map<String, dynamic>>>{};
        for (final m in saring) {
          grup.putIfAbsent(teks(m['namaRombel'], 'Tanpa rombel'), () => []).add(m);
        }
        return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              Card(
                color: Theme.of(context).colorScheme.primaryContainer,
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Text(
                    pimpinan
                        ? 'Semua mapel aktif. Pilih mapel untuk melihat RPP per sesi, membuka PDF, atau mengunduh Word.'
                        : 'Mapel yang Anda ampu. Pilih mapel untuk melihat, menyusun, dan mengunduh RPP.',
                  ),
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Cari mapel, rombel, atau tutor'),
                onChanged: (v) => setState(() => _cari = v),
              ),
              if (mapel.isEmpty) const Kosong(pesan: 'Belum ada mata pelajaran yang dapat ditampilkan.'),
              for (final e in grup.entries) ...[
                JudulBagian(e.key, sub: '${e.value.length} mapel'),
                Card(
                  child: Column(children: [
                    for (final m in e.value)
                      ListTile(
                        leading: IkonBulat(Icons.description_rounded, warna: Gaya.warnaMenu(teks(m['namaMapel'])), ukuran: 42, sudut: 14),
                        title: Text(teks(m['namaMapel'])),
                        subtitle: teks(m['tutor']).isEmpty ? null : Text(teks(m['tutor']), maxLines: 1, overflow: TextOverflow.ellipsis),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => Scaffold(
                            appBar: AppBar(
                              title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text('RPP ${teks(m['namaMapel'])}', overflow: TextOverflow.ellipsis),
                                Text(teks(m['namaRombel']), style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                              ]),
                            ),
                            body: RppTab(idMapel: teks(m['idMapel'])),
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
