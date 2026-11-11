import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'config.dart';
import 'session.dart';
import 'siswa/sesi_siswa.dart';

/// Broadcast/pemberitahuan dari admin (Broadcast.gs).
/// - Aplikasi terbuka: diperiksa berkala oleh [Notif] -> dialog + notifikasi ponsel.
/// - Aplikasi tertutup (Android): WorkManager di MainActivity.kt memeriksa ~15 menit sekali
///   memakai kunci perangkat yang disimpan di shared_preferences (bc_kunci, bc_url, bc_dinotif).
class Pemberitahuan {
  Pemberitahuan._();
  static final Pemberitahuan instance = Pemberitahuan._();

  static const _kanal = MethodChannel('the_course/notif');
  bool get _android => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
  bool _jalan = false;
  bool _daftarJalan = false;
  bool _dialog = false;

  /// v1.50.0: jumlah notifikasi (kejadian) yang belum dibaca, untuk angka di lonceng.
  final belumDibaca = ValueNotifier<int>(0);

  /// Kotak masuk: kejadian 30 hari + pengumuman aktif (server: waNotifKotak).
  Future<List<Map<String, dynamic>>> kotak() async {
    final sp = await SharedPreferences.getInstance();
    var kunci = sp.getString('bc_kunci') ?? '';
    if (kunci.isEmpty) {
      await mulai();
      kunci = sp.getString('bc_kunci') ?? '';
    }
    if (kunci.isEmpty) return [];
    final h = peta(await Api.instance('waNotifKotak', [kunci], const Duration(minutes: 1)));
    final p = daftar(h['pesan']).map(peta).toList();
    final dib = await dibaca();
    belumDibaca.value = p.where((x) => teks(x['tipe']) == 'event' && !dib.contains(teks(x['id']))).length;
    return p;
  }

  Future<Set<String>> dibaca() async {
    final sp = await SharedPreferences.getInstance();
    return (sp.getStringList('np_dibaca') ?? <String>[]).toSet();
  }

  Future<void> tandaiDibaca(Iterable<String> ids) async {
    final sp = await SharedPreferences.getInstance();
    final l = sp.getStringList('np_dibaca') ?? <String>[];
    for (final id in ids) {
      if (id.isNotEmpty && !l.contains(id)) l.add(id);
    }
    await sp.setStringList('np_dibaca', l.length > 400 ? l.sublist(l.length - 400) : l);
    // bc_dilihat: pengumuman yang sudah dibuka dari kotak masuk tidak muncul lagi sebagai dialog
    final dl = sp.getStringList('bc_dilihat') ?? <String>[];
    for (final id in ids) {
      if (id.isNotEmpty && !dl.contains(id)) dl.add(id);
    }
    await sp.setStringList('bc_dilihat', dl.length > 200 ? dl.sublist(dl.length - 200) : dl);
    belumDibaca.value = (belumDibaca.value - ids.length).clamp(0, 9999).toInt();
  }

  String get _identitas {
    final ss = SesiSiswa.instance;
    if (ss.masuk) return 'siswa|${ss.nama.toLowerCase()}|${ss.idRombel}';
    final s = Sesi.instance;
    if (s.masuk) return 'staf|${s.peran}|${s.nama.toLowerCase()}';
    return '';
  }

  /// Daftarkan perangkat ini (sekali per akun) dan nyalakan pemeriksaan latar belakang.
  Future<void> mulai() async {
    if (_daftarJalan) return;
    _daftarJalan = true;
    try {
      final id = _identitas;
      if (id.isEmpty) return;
      final sp = await SharedPreferences.getInstance();
      var kunci = sp.getString('bc_kunci') ?? '';
      if (kunci.isEmpty || sp.getString('bc_id') != id) {
        if (kunci.isNotEmpty) {
          try {
            await Api.instance('waNotifKeluar', [kunci]);
          } catch (_) {}
        }
        final siswa = SesiSiswa.instance.masuk;
        final token = siswa ? SesiSiswa.instance.token : (Sesi.instance.token ?? '');
        if (token.isEmpty) return;
        final r = peta(await Api.instance('waNotifDaftar', [siswa ? 'siswa' : 'staf', token, kIsWeb ? 'web' : 'android']));
        kunci = teks(r['kunci']);
        if (kunci.isEmpty || id != _identitas) return;
        await sp.setString('bc_kunci', kunci);
        await sp.setString('bc_id', id);
      }
      await sp.setString('bc_url', kApiUrl);
      if (_android) {
        try {
          await _kanal.invokeMethod<bool>('izin');
          await _kanal.invokeMethod<bool>('jadwalkan', {'aktif': true});
        } catch (_) {}
      }
    } catch (_) {
    } finally {
      _daftarJalan = false;
    }
  }

  /// Saat keluar: perangkat berhenti menerima pemberitahuan akun ini.
  Future<void> keluar() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final kunci = sp.getString('bc_kunci') ?? '';
      await sp.remove('bc_kunci');
      await sp.remove('bc_id');
      if (_android) {
        try {
          await _kanal.invokeMethod<bool>('jadwalkan', {'aktif': false});
        } catch (_) {}
      }
      if (kunci.isNotEmpty) await Api.instance('waNotifKeluar', [kunci]);
    } catch (_) {}
  }

  /// Ambil broadcast aktif; yang belum pernah dikabarkan -> notifikasi ponsel, yang belum dilihat -> dialog.
  Future<void> cek(GlobalKey<NavigatorState> nav) async {
    if (_jalan || _dialog) return;
    _jalan = true;
    final tampil = <Map<String, dynamic>>[];
    SharedPreferences? sp;
    try {
      sp = await SharedPreferences.getInstance();
      await sp.reload(); // pemeriksa latar belakang (native) juga menulis bc_dinotif
      final kunci = sp.getString('bc_kunci') ?? '';
      if (kunci.isEmpty) {
        await mulai();
        return;
      }
      final h = peta(await Api.instance('waNotifCek', [kunci]));
      if (h['sah'] == false) {
        // kunci tidak dikenal server lagi: daftar ulang pada pemeriksaan berikutnya
        await sp.remove('bc_kunci');
        await sp.remove('bc_id');
        return;
      }
      final pesan = daftar(h['pesan']).map(peta).toList().reversed.toList(); // terlama dulu
      final dinotif = (sp.getString('bc_dinotif') ?? '').split(',').where((x) => x.isNotEmpty).toList();
      final dilihat = sp.getStringList('bc_dilihat') ?? <String>[];
      final npDibaca = (sp.getStringList('np_dibaca') ?? <String>[]).toSet();
      var ubah = false, belum = 0;
      final eventBaru = <Map<String, dynamic>>[];
      for (final p in pesan) {
        final id = teks(p['id']);
        if (id.isEmpty) continue;
        final event = teks(p['tipe']) == 'event';   // v1.50.0: notifikasi per peran -> lonceng, bukan dialog
        if (event && !npDibaca.contains(id)) belum++;
        if (!dinotif.contains(id)) {
          if (event) eventBaru.add(p);
          if (_android) {
            try {
              await _kanal.invokeMethod<bool>('tampil', {'id': id, 'judul': teks(p['judul']), 'isi': teks(p['isi'])});
            } catch (_) {}
          }
          dinotif.add(id);
          ubah = true;
        }
        if (!event && !dilihat.contains(id)) tampil.add(p);
      }
      belumDibaca.value = belum;
      if (eventBaru.isNotEmpty) {
        final c = nav.currentContext;
        final m = c == null ? null : ScaffoldMessenger.maybeOf(c);
        final x = eventBaru.last;
        m?.showSnackBar(SnackBar(
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 6),
          content: Text(eventBaru.length > 1 ? '${eventBaru.length} notifikasi baru · ${teks(x['judul'])}' : '${teks(x['judul'])}\n${teks(x['isi'])}', maxLines: 3),
        ));
      }
      if (ubah) {
        final sisa = dinotif.length > 200 ? dinotif.sublist(dinotif.length - 200) : dinotif;
        await sp.setString('bc_dinotif', sisa.join(','));
      }
    } catch (_) {
    } finally {
      _jalan = false;
    }
    if (tampil.isEmpty || sp == null) return;
    _dialog = true;
    try {
      for (final p in tampil) {
        final c = nav.currentContext;
        if (c == null || !c.mounted) break;
        await showDialog<void>(
          context: c,
          builder: (d) => AlertDialog(
            icon: const Icon(Icons.campaign_rounded),
            title: Text(teks(p['judul'], 'Pemberitahuan')),
            content: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                SelectableText(teks(p['isi'])),
                const SizedBox(height: 12),
                Text('${teks(p['oleh'])} · ${teks(p['waktu'])}', style: TextStyle(fontSize: 12, color: Theme.of(d).colorScheme.onSurfaceVariant)),
              ]),
            ),
            actions: [FilledButton(onPressed: () => Navigator.pop(d), child: const Text('Mengerti'))],
          ),
        );
        final dilihat = sp.getStringList('bc_dilihat') ?? <String>[];
        dilihat.add(teks(p['id']));
        await sp.setStringList('bc_dilihat', dilihat.length > 200 ? dilihat.sublist(dilihat.length - 200) : dilihat);
      }
    } catch (_) {
    } finally {
      _dialog = false;
    }
  }
}
