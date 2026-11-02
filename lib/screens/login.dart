import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../config.dart';
import '../session.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _nama = TextEditingController();
  final _kode = TextEditingController();
  bool _sibuk = false;
  bool _lihat = false;
  String? _galat;

  @override
  void initState() {
    super.initState();
    _galat = Sesi.instance.pesanKeluar;
  }

  @override
  void dispose() {
    _nama.dispose();
    _kode.dispose();
    super.dispose();
  }

  Future<void> _masuk() async {
    if (_nama.text.trim().isEmpty || _kode.text.trim().isEmpty) {
      setState(() => _galat = 'Isi nama dan kode akses.');
      return;
    }
    setState(() {
      _sibuk = true;
      _galat = null;
    });
    try {
      final g = await Sesi.instance.masukKode(_nama.text, _kode.text);
      if (mounted && g != null) setState(() => _galat = g);
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    } catch (e) {
      if (mounted) setState(() => _galat = '$e');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [cs.primary, cs.tertiary]),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(22)),
                    child: const Icon(Icons.menu_book_rounded, color: Colors.white, size: 40),
                  ),
                  const SizedBox(height: 14),
                  const Text('Belajar Mandiri', style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
                  const Text('$kNamaSekolah · Tutor & Admin', style: TextStyle(color: Colors.white70)),
                  const SizedBox(height: 24),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: AutofillGroup(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          TextField(
                            controller: _nama,
                            textInputAction: TextInputAction.next,
                            autofillHints: const [AutofillHints.username],
                            decoration: const InputDecoration(labelText: 'Nama', hintText: 'Nama sesuai yang didaftarkan admin', prefixIcon: Icon(Icons.person_outline)),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _kode,
                            obscureText: !_lihat,
                            autofillHints: const [AutofillHints.password],
                            onSubmitted: (_) => _masuk(),
                            decoration: InputDecoration(
                              labelText: 'Kode Akses',
                              prefixIcon: const Icon(Icons.key_outlined),
                              suffixIcon: IconButton(onPressed: () => setState(() => _lihat = !_lihat), icon: Icon(_lihat ? Icons.visibility_off : Icons.visibility)),
                            ),
                          ),
                          if (_galat != null) ...[
                            const SizedBox(height: 12),
                            Text(_galat!, style: TextStyle(color: cs.error)),
                          ],
                          const SizedBox(height: 18),
                          FilledButton(
                            onPressed: _sibuk ? null : _masuk,
                            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
                            child: _sibuk ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Text('Masuk'),
                          ),
                          const SizedBox(height: 10),
                          OutlinedButton.icon(
                            onPressed: () => launchUrl(
                              Uri.parse(kIsWeb ? '$kWebUrl?halaman=staf' : '$kWebUrl?halaman=staf&appsso=1'),
                              mode: LaunchMode.externalApplication,
                            ),
                            icon: const Icon(Icons.account_circle_outlined),
                            label: const Text('Masuk dengan Google'),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            kIsWeb
                                ? 'Kode akses diberikan oleh admin. Login Google di versi web membuka halaman staf web.'
                                : 'Masuk dengan Google: browser terbuka, ketuk "Masuk dengan Google", pilih akun SIM SETARA, lalu ketuk "Kembali ke aplikasi BM Staf".',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ]),
                      ),
                    ),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
