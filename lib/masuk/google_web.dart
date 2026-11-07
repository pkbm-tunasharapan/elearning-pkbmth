import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:google_sign_in_web/web_only.dart' as gweb;

/// Versi web: tombol resmi "Sign in with Google" (Google Identity Services) langsung di halaman,
/// tanpa membuka halaman Apps Script. ID token dikirim ke server (waStafMasukGoogle) seperti di APK.
Widget tombolGoogleWeb({required String clientId, required void Function(String idToken) onIdToken, required void Function(String pesan) onGalat}) =>
    _TombolGoogleWeb(clientId: clientId, onIdToken: onIdToken, onGalat: onGalat);

class _TombolGoogleWeb extends StatefulWidget {
  const _TombolGoogleWeb({required this.clientId, required this.onIdToken, required this.onGalat});
  final String clientId;
  final void Function(String idToken) onIdToken;
  final void Function(String pesan) onGalat;

  @override
  State<_TombolGoogleWeb> createState() => _TombolGoogleWebState();
}

class _TombolGoogleWebState extends State<_TombolGoogleWeb> {
  static Future<void>? _siap;
  StreamSubscription<GoogleSignInAuthenticationEvent>? _dengar;
  String? _galat;

  @override
  void initState() {
    super.initState();
    _siap ??= GoogleSignIn.instance.initialize(clientId: widget.clientId);
    _siap!.then((_) {
      if (!mounted) return;
      _dengar = GoogleSignIn.instance.authenticationEvents.listen((e) {
        if (e is GoogleSignInAuthenticationEventSignIn) {
          final t = e.user.authentication.idToken;
          if (t != null && t.isNotEmpty) {
            widget.onIdToken(t);
          } else {
            widget.onGalat('Google tidak memberikan data masuk. Coba lagi.');
          }
        }
      }, onError: (Object e) {
        if (e is GoogleSignInException && e.code == GoogleSignInExceptionCode.canceled) return;
        widget.onGalat('Login Google gagal: $e');
      });
      setState(() {});
    }).catchError((Object e) {
      if (mounted) setState(() => _galat = 'Login Google belum siap di browser ini ($e). Masuk dengan kode akses.');
    });
  }

  @override
  void dispose() {
    _dengar?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_galat != null) return Text(_galat!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5, color: Colors.white));
    return FutureBuilder<void>(
      future: _siap,
      builder: (context, s) => s.connectionState != ConnectionState.done
          ? const SizedBox(height: 44, child: Center(child: CircularProgressIndicator(strokeWidth: 2)))
          : SizedBox(
              height: 44,
              child: Center(
                child: gweb.renderButton(
                  configuration: gweb.GSIButtonConfiguration(
                    type: gweb.GSIButtonType.standard,
                    theme: gweb.GSIButtonTheme.outline,
                    size: gweb.GSIButtonSize.large,
                    text: gweb.GSIButtonText.signinWith,
                    shape: gweb.GSIButtonShape.pill,
                    locale: 'id',
                  ),
                ),
              ),
            ),
    );
  }
}
