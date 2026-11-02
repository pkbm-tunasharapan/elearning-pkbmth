import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'session.dart';
import 'siswa/sesi_siswa.dart';

/// Pemberitahuan dalam aplikasi (sama dengan NotifChat/NotifNilai/NotifJawaban di web):
/// diperiksa tiap 15 detik selama aplikasi terbuka.
class Notif with WidgetsBindingObserver {
  Notif._();
  static final Notif instance = Notif._();

  final kunciNavigator = GlobalKey<NavigatorState>();
  final kunciPesan = GlobalKey<ScaffoldMessengerState>();

  /// Ruang chat yang sedang dibuka; pesannya tidak dikabarkan.
  String ruangAktif = '';

  /// Dipanggil saat notifikasi diketuk: kunci ruang ('ROMBEL', 'STAF', 'MAPEL:x').
  void Function(String kunci)? bukaRuang;

  /// Siswa: tugas diskusi dinilai. Staf: jawaban diskusi baru.
  void Function(Map<String, dynamic> n)? bukaNilai;

  Timer? _timer;
  bool _jalan = false;
  final _terlihat = <String>{};
  bool _aktif = true;
  bool _terpasang = false;

  void mulai() {
    if (!_terpasang) {
      WidgetsBinding.instance.addObserver(this);
      _terpasang = true;
    }
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 15), (_) => _cek());
    Future.delayed(const Duration(seconds: 3), _cek);
  }

  void henti() {
    _timer?.cancel();
    _timer = null;
    _terlihat.clear();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _aktif = state == AppLifecycleState.resumed;
    if (_aktif) _cek();
  }

  String get _identitas {
    final ss = SesiSiswa.instance;
    if (ss.masuk) return 'siswa|${ss.nama.toLowerCase()}|${ss.idRombel}';
    final s = Sesi.instance;
    if (s.masuk) return 'staf|${s.token}';
    return '';
  }

  Future<void> _cek() async {
    if (_jalan || !_aktif) return;
    final id = _identitas;
    if (id.isEmpty) return;
    _jalan = true;
    try {
      final sp = await SharedPreferences.getInstance();
      final kChat = 'notifChat|$id', kNilai = 'notifNilai|$id';
      var sejak = sp.getInt(kChat) ?? 0;
      final sejakNilai = sp.getInt(kNilai) ?? 0;
      final siswa = id.startsWith('siswa|');
      // Pemeriksaan pertama hanya menandai titik awal (server tidak mengembalikan apa pun bila sejak = 0).
      final h = peta(siswa
          ? await Api.instance('waRuangCek', [SesiSiswa.instance.nama, SesiSiswa.instance.idRombel, sejak, sejakNilai])
          : await Api.instance('waStafRuangCek', [Sesi.instance.token, sejak, sejakNilai]));
      if (id != _identitas) return;
      final kini = angka(h['sekarangMs']);
      if (kini <= 0) return;
      await sp.setInt(kChat, kini - 1000);
      await sp.setInt(kNilai, kini - 20000);
      if (sejak == 0) return;
      final baru = daftar(h['baru']).map(peta).where((p) {
        final k = '${teks(p['kunci'])}|${angka(p['waktu'])}|${teks(p['nama'])}';
        return _terlihat.add(k) && teks(p['kunci']) != ruangAktif;
      }).toList();
      final nilai = daftar(siswa ? h['nilai'] : h['jawaban']).map(peta).where((n) {
        return _terlihat.add('n|${teks(n['idMapel'])}|${teks(n['idMateri'])}|${teks(n['siswa'])}|${angka(n['waktu'])}');
      }).toList();
      if (baru.isNotEmpty) _tampilChat(baru, siswa);
      if (nilai.isNotEmpty) _tampilNilai(nilai, siswa);
    } catch (_) {
    } finally {
      _jalan = false;
    }
  }

  String namaRuang(String kunci, {bool siswa = false}) {
    if (kunci == 'ROMBEL') return 'Chatroom Rombel';
    if (kunci == 'STAF') return 'Ruang Staf';
    final id = kunci.replaceFirst('MAPEL:', '');
    if (siswa) {
      for (final m in SesiSiswa.instance.mapel) {
        if (teks(m['id']) == id) return 'Obrolan ${teks(m['nama'])}';
      }
      return 'Obrolan mapel';
    }
    for (final m in Sesi.instance.mapel) {
      if (teks(m['idMapel']) == id) return 'Chat ${teks(m['namaMapel'])} · ${teks(m['namaRombel'])}';
    }
    return 'Obrolan mapel';
  }

  void _tampilChat(List<Map<String, dynamic>> baru, bool siswa) {
    final p = baru.last;
    final kunci = teks(p['kunci']);
    final judul = baru.length > 1 ? '${baru.length} pesan baru' : 'Pesan baru';
    final peran = teks(p['peran'], 'Siswa');
    _snack(
      ikon: Icons.chat_bubble_rounded,
      teksUtama: '$judul · ${namaRuang(kunci, siswa: siswa)}',
      teksKecil: '${teks(p['nama'])}${peran != 'Siswa' ? ' ($peran)' : ''}: ${teks(p['pesan'])}',
      aksi: bukaRuang == null ? null : () => bukaRuang!(kunci),
    );
  }

  void _tampilNilai(List<Map<String, dynamic>> n, bool siswa) {
    if (siswa) {
      final mapel = n.map((x) => teks(x['mapel'])).where((x) => x.isNotEmpty).toSet().join(', ');
      _snack(
        ikon: Icons.grading_rounded,
        teksUtama: n.length > 1 ? '${n.length} tugas diskusi sudah dinilai' : 'Tugas diskusi sudah dinilai',
        teksKecil: 'Tugas diskusi mapel ${mapel.isEmpty ? 'Anda' : mapel} Anda sudah dinilai.',
        aksi: bukaNilai == null ? null : () => bukaNilai!(n.last),
      );
    } else {
      final x = n.last;
      _snack(
        ikon: Icons.rate_review_rounded,
        teksUtama: n.length > 1 ? '${n.length} jawaban diskusi baru' : 'Jawaban diskusi baru',
        teksKecil: '${teks(x['siswa'])} · ${teks(x['judul'])}${teks(x['mapel']).isNotEmpty ? ' · ${teks(x['mapel'])}' : ''}',
        aksi: bukaNilai == null ? null : () => bukaNilai!(x),
      );
    }
  }

  void _snack({required IconData ikon, required String teksUtama, required String teksKecil, VoidCallback? aksi}) {
    final m = kunciPesan.currentState;
    if (m == null) return;
    m
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 7),
        content: Row(children: [
          Icon(ikon, color: Colors.white),
          const SizedBox(width: 12),
          Expanded(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(teksUtama, style: const TextStyle(fontWeight: FontWeight.w800)),
              Text(teksKecil, maxLines: 2, overflow: TextOverflow.ellipsis),
            ]),
          ),
        ]),
        action: aksi == null ? null : SnackBarAction(label: 'Buka', onPressed: aksi),
      ));
  }
}
