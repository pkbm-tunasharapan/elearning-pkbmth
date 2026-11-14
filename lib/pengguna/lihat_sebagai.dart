import 'package:flutter/material.dart';

import '../api.dart';
import '../notif.dart';
import '../session.dart';
import '../siswa/sesi_siswa.dart';
import '../widgets.dart';

/// v1.81.0: Admin melihat aplikasi sebagai Tutor atau Siswa, HANYA MEMBACA.
/// Sesi Admin disimpan di memori dan dipulihkan saat keluar. Tidak ada yang ditulis ke penyimpanan HP,
/// jadi bila aplikasi ditutup, aplikasi kembali terbuka sebagai Admin.
/// Server menolak setiap tindakan yang mengubah data selama mode lihat (lihat Intip.gs).
class ModeLihat extends ChangeNotifier {
  ModeLihat._();
  static final ModeLihat instance = ModeLihat._();

  bool aktif = false;
  String nama = '';
  String jenis = '';   // 'tutor' | 'siswa'
  String? _tokenAdmin;
  Map<String, dynamic> _profilAdmin = {};
  String _kunci = '';

  String get label => jenis == 'tutor' ? 'Tutor' : 'Siswa';

  Future<void> mulai(String jenisBaru, Map<String, dynamic> h) async {
    final s = Sesi.instance;
    _tokenAdmin = s.token;
    _profilAdmin = s.profil;
    _kunci = teks(h['intip']);
    jenis = jenisBaru;
    nama = teks(h['nama']);
    final api = Api.instance;
    api.bersihkanCache();
    api.intip = _kunci;
    api.onModeLihatHabis = () => akhiri(pesan: 'Mode lihat sudah berakhir (berlaku 1 jam).');
    try {
      if (jenisBaru == 'tutor') {
        final tok = teks(h['token']);
        final prof = peta(await api('waStafProfil', [tok]));
        s.gantiSementara(tok, prof);
      } else {
        SesiSiswa.instance.gantiSementara(peta(h['siswa']));
        s.gantiSementara(null, {});   // sesi staf Admin disimpan di memori; layar & pemeriksaan latar memakai sesi siswa
      }
      aktif = true;
      notifyListeners();
      Notif.instance.kunciNavigator.currentState?.popUntil((r) => r.isFirst);
    } catch (e) {
      api.intip = null;
      api.onModeLihatHabis = null;
      rethrow;
    }
  }

  Future<void> akhiri({String? pesan}) async {
    if (!aktif) return;
    final api = Api.instance;
    final kunci = _kunci;
    api.intip = null;
    api.onModeLihatHabis = null;
    api.bersihkanCache();
    aktif = false;
    SesiSiswa.instance.gantiSementara({});
    Sesi.instance.gantiSementara(_tokenAdmin, _profilAdmin);
    final tok = _tokenAdmin;
    _tokenAdmin = null;
    _profilAdmin = {};
    _kunci = '';
    notifyListeners();
    final nav = Notif.instance.kunciNavigator.currentState;
    nav?.popUntil((r) => r.isFirst);
    if (pesan != null) Notif.instance.kunciPesan.currentState?.showSnackBar(SnackBar(content: Text(pesan)));
    if (tok != null) {
      try {
        await api('waAdminIntipAkhiri', [tok, kunci]);
      } catch (_) {}
    }
  }
}

/// Pita di atas setiap layar selama mode lihat.
class PitaModeLihat extends StatelessWidget {
  const PitaModeLihat({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: ModeLihat.instance,
      builder: (context, _) {
        final m = ModeLihat.instance;
        if (!m.aktif) return child;
        return Column(children: [
          Material(
            color: const Color(0xFFE67E22),
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
                child: Row(children: [
                  const Icon(Icons.visibility_rounded, color: Colors.white, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text('Mode lihat: ${m.nama} (${m.label}) – hanya baca',
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13)),
                  ),
                  TextButton.icon(
                    onPressed: () => m.akhiri(),
                    style: TextButton.styleFrom(foregroundColor: Colors.white, visualDensity: VisualDensity.compact),
                    icon: const Icon(Icons.logout_rounded, size: 18),
                    label: const Text('Keluar'),
                  ),
                ]),
              ),
            ),
          ),
          Expanded(child: MediaQuery.removePadding(context: context, removeTop: true, child: child)),
        ]);
      },
    );
  }
}

/// Menu Admin: daftar tutor & siswa untuk dilihat.
class LihatSebagaiScreen extends StatefulWidget {
  const LihatSebagaiScreen({super.key});

  @override
  State<LihatSebagaiScreen> createState() => _LihatSebagaiScreenState();
}

class _LihatSebagaiScreenState extends State<LihatSebagaiScreen> {
  String _cari = '';

  Future<void> _buka(String jenis, Map<String, dynamic> x) async {
    final label = jenis == 'tutor' ? 'Tutor' : 'Siswa';
    final ok = await konfirmasi(context, 'Lihat sebagai ${teks(x['nama'])}?',
        'Aplikasi akan tampil seperti saat ${teks(x['nama'])} ($label) masuk. Semua hanya baca: tidak ada data yang bisa diubah, '
        'dan tidak meninggalkan jejak di akun tersebut. Berlaku 1 jam. Tekan "Keluar" pada pita oranye untuk kembali ke akun Admin.',
        ya: 'Lihat');
    if (!ok || !mounted) return;
    final h = await jalankan(context, () => Api.instance('waAdminIntipMulai', [Sesi.instance.token, jenis, teks(x['id'])]), teksProses: 'Membuka...');
    if (!h.ok || !mounted) return;
    final r = await jalankan(context, () => ModeLihat.instance.mulai(jenis, peta(h.data)), teksProses: 'Memuat tampilan $label...');
    if (!r.ok && mounted) kabar(context, 'Mode lihat gagal dibuka.');
  }

  bool _cocok(Map<String, dynamic> x) {
    final q = _cari.trim().toLowerCase();
    return q.isEmpty || '${teks(x['nama'])} ${teks(x['rombel'])}'.toLowerCase().contains(q);
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Lihat Sebagai'),
          bottom: const TabBar(tabs: [Tab(text: 'Tutor'), Tab(text: 'Siswa')]),
        ),
        body: Muatan<Map<String, dynamic>>(
          muat: () async => peta(await Api.instance('waAdminIntipDaftar', [Sesi.instance.token])),
          bangun: (context, d, segarkan) {
            Widget daftarNya(String jenis) {
              final semua = daftar(d[jenis]).map(peta).toList();
              final l = semua.where(_cocok).toList();
              return Column(children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: TextField(
                    decoration: InputDecoration(prefixIcon: const Icon(Icons.search_rounded), hintText: jenis == 'tutor' ? 'Cari tutor' : 'Cari siswa atau rombel', isDense: true),
                    onChanged: (v) => setState(() => _cari = v),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                  child: Text('${l.length} dari ${semua.length} · hanya baca, berlaku 1 jam', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                ),
                Expanded(
                  child: l.isEmpty
                      ? const Center(child: Text('Tidak ada yang cocok.'))
                      : ListView.separated(
                          itemCount: l.length,
                          separatorBuilder: (_, __) => const Divider(height: 1),
                          itemBuilder: (context, i) {
                            final x = l[i];
                            return ListTile(
                              leading: CircleAvatar(child: Icon(jenis == 'tutor' ? Icons.co_present_rounded : Icons.school_rounded, size: 20)),
                              title: Text(teks(x['nama'])),
                              subtitle: Text(jenis == 'tutor' ? teks(x['peran'], 'Tutor') : teks(x['rombel'])),
                              trailing: const Icon(Icons.visibility_outlined),
                              onTap: () => _buka(jenis, x),
                            );
                          },
                        ),
                ),
              ]);
            }

            return TabBarView(children: [daftarNya('tutor'), daftarNya('siswa')]);
          },
        ),
      ),
    );
  }
}
