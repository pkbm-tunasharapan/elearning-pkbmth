import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';

import 'config.dart';
import 'screens/home.dart';
import 'screens/login.dart';
import 'session.dart';

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
    const benih = Color(0xFF4B2FD0);
    return MaterialApp(
      scaffoldMessengerKey: _kunciPesan,
      title: kNamaAplikasi,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: benih),
        inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
        cardTheme: const CardThemeData(margin: EdgeInsets.zero),
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: benih, brightness: Brightness.dark),
        inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
        cardTheme: const CardThemeData(margin: EdgeInsets.zero),
      ),
      home: ListenableBuilder(
        listenable: Sesi.instance,
        builder: (context, _) {
          final s = Sesi.instance;
          if (!s.siap) return const Scaffold(body: Center(child: CircularProgressIndicator()));
          return s.masuk ? const HomeScreen() : const LoginScreen();
        },
      ),
    );
  }
}
