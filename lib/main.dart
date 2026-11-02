import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import 'config.dart';
import 'screens/home.dart';
import 'screens/login.dart';
import 'session.dart';
import 'theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  Sesi.instance.muat();
  runApp(const AplikasiStaf());
}

class AplikasiStaf extends StatefulWidget {
  const AplikasiStaf({super.key});

  @override
  State<AplikasiStaf> createState() => _AplikasiStafState();
}

class _AplikasiStafState extends State<AplikasiStaf> {
  StreamSubscription<Uri>? _langgananTautan;
  final _kunciPesan = GlobalKey<ScaffoldMessengerState>();

  @override
  void initState() {
    super.initState();
    if (!kIsWeb) {
      // Login Google: halaman web mengembalikan tiket lewat bmstaf://sso?tiket=...
      _langgananTautan = AppLinks().uriLinkStream.listen(_terimaTautan, onError: (_) {});
    }
  }

  @override
  void dispose() {
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
      title: kNamaAplikasi,
      debugShowCheckedModeBanner: false,
      theme: Gaya.tema(Brightness.light),
      darkTheme: Gaya.tema(Brightness.dark),
      home: ListenableBuilder(
        listenable: Sesi.instance,
        builder: (context, _) {
          final s = Sesi.instance;
          if (!s.siap) return const _Pembuka();
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
            Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(28)),
              child: const Icon(Icons.auto_stories_rounded, color: Colors.white, size: 44),
            ),
            const SizedBox(height: 18),
            const SizedBox(width: 26, height: 26, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.6)),
          ]),
        ),
      ),
    );
  }
}
