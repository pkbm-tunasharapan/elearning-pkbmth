import 'package:flutter/material.dart';

import 'api.dart';
import 'chat.dart';
import 'notif.dart';
import 'session.dart';
import 'siswa/sesi_siswa.dart';
import 'theme.dart';
import 'widgets.dart';

Future<void> _bukaRuang(NavigatorState nav, String kunci, Widget layar) async {
  final n = Notif.instance;
  final lama = n.ruangAktif;
  n.ruangAktif = kunci;
  await nav.push(MaterialPageRoute(builder: (_) => layar));
  n.ruangAktif = lama;
}

/// Siswa: kunci 'ROMBEL' (chatroom rombel) atau 'MAPEL:<idMapel>' (obrolan mapel).
Future<void> bukaChatSiswa(NavigatorState nav, String kunci) {
  final s = SesiSiswa.instance;
  final rombel = kunci == 'ROMBEL';
  return _bukaRuang(
    nav,
    kunci,
    RuangChatScreen(
      judul: Notif.instance.namaRuang(kunci, siswa: true),
      subjudul: s.namaRombel,
      namaSaya: s.nama,
      peranSaya: 'Siswa',
      pesanKosong: rombel ? 'Belum ada pesan. Sapa teman sekelas Anda!' : 'Belum ada pesan di obrolan ini. Tanyakan sesuatu ke tutor atau teman sekelas.',
      petunjuk: rombel ? 'Tulis pesan untuk teman satu rombel...' : 'Tulis pesan untuk kelas dan tutor mapel ini...',
      poll: (sejak) => Api.instance('waRuangPoll', [s.nama, s.idRombel, kunci, sejak]),
      kirim: (t) => Api.instance('waRuangKirim', [s.nama, s.idRombel, kunci, t]),
    ),
  );
}

/// Staf: kunci 'STAF' (Ruang Staf) atau 'MAPEL:<idMapel>' (chat kelas).
Future<void> bukaChatStaf(NavigatorState nav, String kunci, {String namaRombel = ''}) {
  final s = Sesi.instance;
  final staf = kunci == 'STAF';
  return _bukaRuang(
    nav,
    kunci,
    RuangChatScreen(
      judul: Notif.instance.namaRuang(kunci),
      subjudul: staf ? 'Tutor · Admin · Owner' : namaRombel,
      namaSaya: s.nama,
      peranSaya: s.peran,
      pesanKosong: staf
          ? 'Belum ada pesan. Mulai obrolan dengan sesama tutor dan admin.'
          : 'Belum ada pesan. Obrolan ini hanya untuk siswa kelas${namaRombel.isEmpty ? '' : ' $namaRombel'}, tutor mapel, dan admin.',
      poll: (sejak) => Api.instance('waStafRuangPoll', [s.token, kunci, sejak]),
      kirim: (t) => Api.instance('waStafRuangKirim', [s.token, kunci, t]),
    ),
  );
}

/// Menu "Ruang Staf": Ruang Staf + chat kelas setiap mapel yang diampu (waStafRuangDaftar).
class RuangStafScreen extends StatelessWidget {
  const RuangStafScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      muat: () async => peta(await Api.instance('waStafRuangDaftar', [Sesi.instance.token])),
      bangun: (context, d, _) {
        final ruang = daftar(d['ruang']).map(peta).toList();
        final staf = ruang.where((r) => teks(r['jenis']) == 'staf').toList();
        final mapel = ruang.where((r) => teks(r['jenis']) == 'mapel').toList();
        Widget item(Map<String, dynamic> r) => ListTile(
              leading: IkonBulat(teks(r['jenis']) == 'staf' ? Icons.forum_rounded : Icons.chat_rounded,
                  warna: teks(r['jenis']) == 'staf' ? const Color(0xFFE9A23B) : Gaya.warnaMenu(teks(r['nama'])), ukuran: 42, sudut: 14),
              title: Text(teks(r['nama'])),
              subtitle: Text(teks(r['keterangan'])),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => bukaChatStaf(Navigator.of(context), teks(r['kunci']), namaRombel: teks(r['keterangan'])),
            );
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
          Card(child: Column(children: [for (final r in staf) item(r)])),
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 6, 4, 0),
            child: Text('Ruang obrolan khusus tutor, admin, dan owner. Siswa tidak bisa melihatnya.',
                style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ),
          if (mapel.isNotEmpty) ...[
            const JudulBagian('Chat kelas', sub: 'Obrolan siswa, tutor mapel, dan admin'),
            Card(child: Column(children: [for (final r in mapel) item(r)])),
          ],
        ]);
      },
    );
  }
}
