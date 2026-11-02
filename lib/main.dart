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

class AplikasiStaf extends StatelessWidget {
  const AplikasiStaf({super.key});

  @override
  Widget build(BuildContext context) {
    const benih = Color(0xFF4B2FD0);
    return MaterialApp(
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
