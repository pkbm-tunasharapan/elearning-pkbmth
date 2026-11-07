import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../api.dart';
import '../config.dart';
import '../session.dart';
import '../siswa/daftar_siswa.dart';
import 'daftar_tutor.dart';
import '../siswa/sesi_siswa.dart';
import '../theme.dart';
import '../masuk/google_web_stub.dart' if (dart.library.js_interop) '../masuk/google_web.dart';

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
  bool _siswa = true;
  String? _galat;

  bool _tutorBuka = false;

  @override
  void initState() {
    super.initState();
    _galat = Sesi.instance.pesanKeluar;
    // Tombol daftar tutor hanya muncul bila admin sedang membuka pendaftaran dengan kode undangan.
    Api.instance('waDaftarTutorStatus').then((r) {
      if (mounted) setState(() => _tutorBuka = peta(r)['terbuka'] == true);
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _nama.dispose();
    _kode.dispose();
    super.dispose();
  }

  Future<void> _masuk() async {
    if (_nama.text.trim().isEmpty || _kode.text.trim().isEmpty) {
      setState(() => _galat = _siswa ? 'Isi nama dan kata sandi.' : 'Isi nama dan kode akses.');
      return;
    }
    final angkaLahir = _kode.text.replaceAll(RegExp(r'\D'), '');
    if (_siswa && angkaLahir.length != 8) {
      setState(() => _galat = 'Isi 8 angka tanggal lahir dengan urutan ddmmyyyy. Contoh: 03032009.');
      return;
    }
    setState(() {
      _sibuk = true;
      _galat = null;
    });
    try {
      final g = _siswa ? await SesiSiswa.instance.masukSiswa(_nama.text, 'TH-$angkaLahir') : await Sesi.instance.masukKode(_nama.text, _kode.text);
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
    final tt = Theme.of(context).textTheme;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: Container(
          decoration: const BoxDecoration(gradient: Gaya.gradasi),
          child: Stack(children: [
            // Lingkaran dekoratif lembut
            const Positioned(top: -70, right: -50, child: _Gelembung(200, 0.12)),
            const Positioned(top: 140, left: -60, child: _Gelembung(140, 0.08)),
            const Positioned(bottom: -90, right: -40, child: _Gelembung(240, 0.10)),
            SafeArea(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: Column(children: [
                      Container(
                        decoration: BoxDecoration(shape: BoxShape.circle, boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.25), blurRadius: 24, offset: const Offset(0, 8))]),
                        child: Image.asset('assets/logo.png', width: 104, height: 104),
                      ),
                      const SizedBox(height: 16),
                      Text('PKBM TUNAS HARAPAN',
                          textAlign: TextAlign.center,
                          style: tt.titleMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w800, letterSpacing: 1.2)),
                      const SizedBox(height: 2),
                      Text('E-Course', textAlign: TextAlign.center, style: tt.headlineMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 28),
                      Container(
                        padding: const EdgeInsets.fromLTRB(22, 24, 22, 20),
                        decoration: BoxDecoration(
                          color: cs.surfaceContainerLowest,
                          borderRadius: BorderRadius.circular(28),
                          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 30, offset: const Offset(0, 12))],
                        ),
                        child: AutofillGroup(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                            Text('Selamat datang 👋', style: tt.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                            const SizedBox(height: 4),
                            Text(_siswa ? 'Masuk untuk belajar, berdiskusi, dan ujian.' : 'Masuk untuk mengelola kelas dan materi.', style: TextStyle(color: cs.onSurfaceVariant)),
                            const SizedBox(height: 20),
                            SegmentedButton<bool>(
                              segments: const [
                                ButtonSegment(value: true, label: Text('Siswa'), icon: Icon(Icons.school_rounded)),
                                ButtonSegment(value: false, label: Text('Tutor / Staf'), icon: Icon(Icons.badge_rounded)),
                              ],
                              selected: {_siswa},
                              onSelectionChanged: (v) => setState(() {
                                _siswa = v.first;
                                _kode.clear();
                                _galat = null;
                              }),
                            ),
                            const SizedBox(height: 18),
                            if (!_siswa) ...[
                            if (kIsWeb)
                              tombolGoogleWeb(
                                clientId: kGoogleServerClientId,
                                onIdToken: _masukGoogleToken,
                                onGalat: (p) {
                                  if (mounted) setState(() => _galat = p);
                                },
                              )
                            else
                              _TombolGoogle(onPressed: _sibuk ? null : _masukGoogle),
                              const SizedBox(height: 18),
                              Row(children: [
                                const Expanded(child: Divider()),
                                Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 12),
                                  child: Text('atau dengan kode akses', style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                                ),
                                const Expanded(child: Divider()),
                              ]),
                              const SizedBox(height: 18),
                            ],
                            TextField(
                              controller: _nama,
                              textInputAction: TextInputAction.next,
                              autofillHints: const [AutofillHints.username],
                              decoration: InputDecoration(hintText: _siswa ? 'Nama lengkap (sesuai data sekolah)' : 'Nama lengkap', prefixIcon: const Icon(Icons.person_rounded)),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: _kode,
                              obscureText: !_lihat,
                              autofillHints: const [AutofillHints.password],
                              onSubmitted: (_) => _masuk(),
                              keyboardType: _siswa ? TextInputType.number : TextInputType.text,
                              inputFormatters: _siswa ? [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(8)] : null,
                              decoration: InputDecoration(
                                hintText: _siswa ? 'ddmmyyyy' : 'Kode akses',
                                helperText: _siswa ? 'Kata sandi: tanggal lahir 8 angka, contoh 03032009' : null,
                                prefixIcon: const Icon(Icons.key_rounded),
                                prefixText: _siswa ? 'TH-' : null,
                                prefixStyle: const TextStyle(fontWeight: FontWeight.w800),
                                suffixIcon: IconButton(onPressed: () => setState(() => _lihat = !_lihat), icon: Icon(_lihat ? Icons.visibility_off_rounded : Icons.visibility_rounded)),
                              ),
                            ),
                            AnimatedSize(
                              duration: const Duration(milliseconds: 200),
                              child: _galat == null
                                  ? const SizedBox(width: double.infinity)
                                  : Container(
                                      margin: const EdgeInsets.only(top: 12),
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(color: cs.errorContainer, borderRadius: BorderRadius.circular(14)),
                                      child: Row(children: [
                                        Icon(Icons.info_rounded, color: cs.onErrorContainer, size: 20),
                                        const SizedBox(width: 10),
                                        Expanded(child: Text(_galat!, style: TextStyle(color: cs.onErrorContainer))),
                                      ]),
                                    ),
                            ),
                            const SizedBox(height: 18),
                            FilledButton(
                              onPressed: _sibuk ? null : _masuk,
                              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54)),
                              child: _sibuk
                                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5))
                                  : const Row(mainAxisAlignment: MainAxisAlignment.center, children: [Text('Masuk'), SizedBox(width: 8), Icon(Icons.arrow_forward_rounded, size: 20)]),
                            ),
                            if (_siswa || _tutorBuka) ...[
                              const SizedBox(height: 10),
                              TextButton.icon(
                                onPressed: _sibuk ? null : (_siswa ? _daftar : _daftarTutor),
                                icon: const Icon(Icons.person_add_alt_1_rounded),
                                label: Text(_siswa ? 'Belum punya akun? Daftar siswa baru' : 'Calon tutor? Daftar dengan kode undangan'),
                              ),
                            ],
                          ]),
                        ),
                      ),
                      const SizedBox(height: 18),
                      if (!_siswa)
                      Text(
                        'Masuk dengan Google memakai akun Google yang terdaftar di SIM SETARA. Kode akses diberikan oleh admin.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 12.5),
                      ),
                    ]),
                  ),
                ),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Future<void> _daftar() async {
    final r = await Navigator.of(context).push<Map<String, String>>(MaterialPageRoute(builder: (_) => const DaftarSiswaScreen()));
    if (r == null || !mounted) return;
    setState(() {
      _nama.text = r['nama'] ?? '';
      _kode.text = (r['kataSandi'] ?? '').replaceAll(RegExp(r'\D'), '');
      _galat = null;
    });
    if (_nama.text.isNotEmpty && _kode.text.length == 8) _masuk();
  }

  Future<void> _daftarTutor() async {
    final r = await Navigator.of(context).push<Map<String, String>>(MaterialPageRoute(builder: (_) => const DaftarTutorScreen()));
    if (r == null || !mounted) return;
    setState(() {
      _nama.text = r['nama'] ?? '';
      _kode.text = r['kode'] ?? '';
      _galat = null;
    });
    if (_nama.text.isNotEmpty && _kode.text.isNotEmpty) _masuk();
  }

  static bool _gsiSiap = false;

  /// Versi web: ID token dari tombol Google Identity Services langsung diperiksa server.
  Future<void> _masukGoogleToken(String idToken) async {
    if (_sibuk) return;
    setState(() {
      _sibuk = true;
      _galat = null;
    });
    try {
      final g = await Sesi.instance.masukGoogle(idToken);
      if (mounted && g != null) setState(() => _galat = g);
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    } catch (e) {
      if (mounted) setState(() => _galat = 'Login Google gagal: $e');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Future<void> _masukGoogle() async {
    setState(() {
      _sibuk = true;
      _galat = null;
    });
    try {
      final gs = GoogleSignIn.instance;
      if (!_gsiSiap) {
        await gs.initialize(serverClientId: kGoogleServerClientId);
        _gsiSiap = true;
      }
      // Selalu tampilkan pemilih akun (jangan otomatis memakai akun terakhir).
      try {
        await gs.signOut();
      } catch (_) {}
      final akun = await gs.authenticate(scopeHint: const ['email']);
      final idToken = akun.authentication.idToken;
      if (idToken == null || idToken.isEmpty) {
        if (mounted) setState(() => _galat = 'Google tidak memberikan data masuk. Coba lagi.');
        return;
      }
      final g = await Sesi.instance.masukGoogle(idToken);
      if (mounted && g != null) setState(() => _galat = g);
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) return;
      if (mounted) {
        setState(() => _galat = e.code == GoogleSignInExceptionCode.clientConfigurationError || e.code == GoogleSignInExceptionCode.providerConfigurationError
            ? 'Login Google belum siap di perangkat ini. Pastikan Layanan Google Play aktif, atau masuk dengan kode akses.'
            : 'Login Google gagal (${e.description ?? e.code.name}).');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    } catch (e) {
      if (mounted) setState(() => _galat = 'Login Google gagal: $e');
    } finally {
      try {
        await GoogleSignIn.instance.signOut();
      } catch (_) {}
      if (mounted) setState(() => _sibuk = false);
    }
  }
}

class _Gelembung extends StatelessWidget {
  const _Gelembung(this.ukuran, this.alfa);
  final double ukuran;
  final double alfa;

  @override
  Widget build(BuildContext context) => Container(
        width: ukuran,
        height: ukuran,
        decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: alfa)),
      );
}

class _TombolGoogle extends StatelessWidget {
  const _TombolGoogle({required this.onPressed});
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52), backgroundColor: Theme.of(context).colorScheme.surfaceContainerLowest),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Container(
          width: 24,
          height: 24,
          alignment: Alignment.center,
          decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white, boxShadow: [BoxShadow(color: Color(0x22000000), blurRadius: 3)]),
          child: const Text('G', style: TextStyle(fontWeight: FontWeight.w900, color: Color(0xFF4285F4), fontSize: 15)),
        ),
        const SizedBox(width: 12),
        const Text('Masuk dengan Google'),
      ]),
    );
  }
}
