import 'package:flutter/material.dart';

/// Bukan web: tombol Google bawaan web tidak dipakai (APK memakai GoogleSignIn.authenticate()).
Widget tombolGoogleWeb({required String clientId, required void Function(String idToken) onIdToken, required void Function(String pesan) onGalat}) =>
    const SizedBox.shrink();
