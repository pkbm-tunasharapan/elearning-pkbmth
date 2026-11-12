import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import 'absensi/antrean_pindai.dart';
import 'api.dart';
import 'config.dart';
import 'notif.dart';
import 'pemberitahuan.dart';
import 'pemeliharaan/sistem.dart';
import 'profil.dart';
import 'promosi.dart';
import 'ruang.dart';
import 'screens/mapel_detail.dart';
import 'siswa/mapel_siswa.dart';
import 'screens/home.dart';
import 'screens/login.dart';
import 'session.dart';
import 'siswa/beranda_siswa.dart';
import 'siswa/pin_siswa.dart';
import 'siswa/sesi_siswa.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  pasangPelaporGalat();
  Api.instance.muatCache();   // v1.65.0: cache jawaban baca dari HP
  Sesi.instance.muat();
  SesiSiswa.instance.muat();
  runApp(const AplikasiStaf());
}

class AplikasiStaf extends StatefulWidget {
  const AplikasiStaf({super.key});

  @override
  State<AplikasiStaf> createState() => _AplikasiStafState();
}

class _AplikasiStafState extends State<AplikasiStaf> {
  StreamSubscription<Uri>? _langgananTautan;
  GlobalKey<ScaffoldMessengerState> get _kunciPesan => Notif.instance.kunciPesan;

  @override
  void initState() {
    super.initState();
    final n = Notif.instance;
    n.bukaRuang = (kunci) {
      final nav = n.kunciNavigator.currentState;
      if (nav == null) return;
      if (SesiSiswa.instance.masuk) {
        bukaChatSiswa(nav, kunci);
      } else if (Sesi.instance.masuk) {
        final id = kunci.replaceFirst('MAPEL:', '');
        final m = Sesi.instance.mapel.where((x) => teks(x['idMapel']) == id).firstOrNull;
        bukaChatStaf(nav, kunci, namaRombel: m == null ? '' : teks(m['namaRombel']));
      }
    };
    n.bukaNilai = (x) {
      final nav = n.kunciNavigator.currentState;
      if (nav == null) return;
      final idMapel = teks(x['idMapel']);
      if (SesiSiswa.instance.masuk) {
        final m = SesiSiswa.instance.mapel.where((e) => teks(e['id']) == idMapel).firstOrNull;
        nav.push(MaterialPageRoute(
          builder: (_) => MapelSiswaScreen(idMapel: idMapel, namaMapel: teks(m?['nama'], teks(x['mapel'])), tutor: teks(m?['tutor'])),
        ));
      } else if (Sesi.instance.masuk) {
        nav.push(MaterialPageRoute(
          builder: (_) => DiskusiScreen(idMapel: idMapel, item: {'id': teks(x['idMateri']), 'judul': teks(x['judul']), 'jenis': 'Diskusi'}, bolehNilai: true),
        ));
      }
    };
    Sesi.instance.addListener(_aturNotif);
    SesiSiswa.instance.addListener(_aturNotif);
    _aturNotif();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      // Urutan popup saat aplikasi dibuka: 1) promosi, 2) pembaruan aplikasi.
      await tampilkanPromosi(Notif.instance.kunciNavigator);
      await cekVersiAplikasi(Notif.instance.kunciNavigator);
      // pindaian absensi yang belum terkirim (mis. aplikasi ditutup saat sinyal putus) dikirim ulang
      if (Sesi.instance.token != null) AntreanPindai.harian.muat();
    });
    if (!kIsWeb) {
      // Login Google: halaman web mengembalikan tiket lewat bmstaf://sso?tiket=...
      _langgananTautan = AppLinks().uriLinkStream.listen(_terimaTautan, onError: (_) {});
    }
  }

  bool? _notifJalan;

  void _aturNotif() {
    ProfilAkun.instance.pastikan();
    final masuk = Sesi.instance.masuk || SesiSiswa.instance.masuk;
    if (masuk == _notifJalan) return;
    final sebelumnya = _notifJalan;
    _notifJalan = masuk;
    if (masuk) {
      Notif.instance.mulai();
    } else {
      Notif.instance.henti();
      // benar-benar keluar (bukan saat aplikasi baru dibuka): cabut pemberitahuan perangkat ini
      if (sebelumnya == true) Pemberitahuan.instance.keluar();
    }
  }

  @override
  void dispose() {
    Sesi.instance.removeListener(_aturNotif);
    SesiSiswa.instance.removeListener(_aturNotif);
    _langgananTautan?.cancel();
    super.dispose();
  }

  Future<void> _terimaTautan(Uri uri) async {
    if (uri.scheme != 'bmstaf' || uri.host != 'sso') return;
    final tiket = uri.queryParameters['tiket'] ?? '';
    if (tiket.isEmpty) return;
    _kunciPesan.currentState?.showSnackBar(const SnackBar(content: Text('Memproses login Google...')));
    String? galat;
    try {
      galat = await Sesi.instance.masukSso(tiket);
    } catch (e) {
      galat = '$e';
    }
    if (galat != null) {
      Sesi.instance.pesanKeluar = galat;
      _kunciPesan.currentState?.showSnackBar(SnackBar(content: Text(galat)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      scaffoldMessengerKey: _kunciPesan,
      navigatorKey: Notif.instance.kunciNavigator,
      title: kNamaAplikasi,
      debugShowCheckedModeBanner: false,
      theme: Gaya.tema(Brightness.light),
      darkTheme: Gaya.tema(Brightness.dark),
      home: ListenableBuilder(
        listenable: Listenable.merge([Sesi.instance, SesiSiswa.instance]),
        builder: (context, _) {
          final s = Sesi.instance;
          final ss = SesiSiswa.instance;
          if (!s.siap || !ss.siap) return const _Pembuka();
          // v1.39.0: masa tenggang PIN habis / PIN di-reset -> wajib buat PIN dulu
          if (ss.masuk) return ss.wajibPin ? const BuatPinScreen(wajib: true) : const BerandaSiswa();
          return s.masuk ? const HomeScreen() : const LoginScreen();
        },
      ),
    );
  }
}

/// Layar pembuka singkat saat sesi dimuat.
class _Pembuka extends StatelessWidget {
  const _Pembuka();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: Gaya.gradasi),
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Image.asset('assets/logo.png', width: 112, height: 112),
            const SizedBox(height: 18),
            const SizedBox(width: 26, height: 26, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.6)),
          ]),
        ),
      ),
    );
  }
}
