import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';
import 'referral/referral.dart';
import 'session.dart';
import 'siswa/sesi_siswa.dart';

bool _sudahPromosi = false;

/// Popup promosi saat aplikasi dibuka (sebelum jendela pembaruan). Konten diatur Admin; gambar disimpan
/// di HP per revisi agar tidak diunduh ulang setiap kali. Tidak tampil untuk Dinas Pendidikan.
Future<void> tampilkanPromosi(GlobalKey<NavigatorState> kunci) async {
  if (_sudahPromosi) return;
  _sudahPromosi = true;
  for (var i = 0; i < 30 && !(Sesi.instance.siap && SesiSiswa.instance.siap); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
  if (Sesi.instance.masuk && Sesi.instance.isDinas) return;
  final sp = await SharedPreferences.getInstance();
  final rev = sp.getInt('promoRev') ?? -1;
  Map<String, dynamic> d;
  try {
    d = peta(await Api.instance('waStafPromosi', [rev], const Duration(seconds: 25)));
  } catch (_) {
    return;
  }
  if (d['aktif'] != true) return;
  final staf = Sesi.instance.masuk, siswa = SesiSiswa.instance.masuk;
  final sasaran = teks(d['sasaran'], 'semua');
  if (sasaran == 'staf' && !staf) return;
  if (sasaran == 'siswa' && !siswa) return;
  var gambar = teks(d['gambar']);
  if (gambar.isNotEmpty) {
    await sp.setString('promoGambar', gambar);
    await sp.setInt('promoRev', angka(d['rev']));
  } else if (d['adaGambar'] == true && rev == angka(d['rev'])) {
    gambar = sp.getString('promoGambar') ?? '';
  }
  final ctx = kunci.currentContext;
  if (ctx == null || !ctx.mounted) return;
  final koma = gambar.indexOf(',');
  final aksi = teks(d['aksi'], 'tutup');
  await showDialog<void>(
    context: ctx,
    builder: (c) {
      final tinggi = MediaQuery.of(c).size.height;
      return Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        clipBehavior: Clip.antiAlias,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: 520, maxHeight: tinggi * 0.9),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Flexible(
              child: SingleChildScrollView(
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  if (koma > 0) Image.memory(base64Decode(gambar.substring(koma + 1)), fit: BoxFit.contain, gaplessPlayback: true),
                  if (teks(d['judul']).isNotEmpty || teks(d['teks']).isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        if (teks(d['judul']).isNotEmpty) Text(teks(d['judul']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                        if (teks(d['teks']).isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(teks(d['teks']))),
                      ]),
                    ),
                ]),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(children: [
                TextButton(onPressed: () => Navigator.pop(c), child: const Text('Tutup')),
                const Spacer(),
                if (aksi != 'tutup')
                  FilledButton.icon(
                    icon: Icon(aksi == 'url' ? Icons.open_in_new_rounded : Icons.campaign_rounded, size: 18),
                    label: Text(teks(d['tombol'], aksi == 'url' ? 'Buka' : 'Daftarkan sekarang')),
                    onPressed: () {
                      Navigator.pop(c);
                      if (aksi == 'url') {
                        launchUrl(Uri.parse(teks(d['url'])), mode: LaunchMode.externalApplication);
                        return;
                      }
                      final token = staf ? (Sesi.instance.token ?? '') : (siswa ? SesiSiswa.instance.token : '');
                      final nav = kunci.currentState;
                      if (token.isEmpty) {
                        final m = ScaffoldMessenger.maybeOf(kunci.currentContext!);
                        m?.showSnackBar(const SnackBar(content: Text('Masuk ke aplikasi terlebih dahulu untuk ikut program referral.')));
                        return;
                      }
                      nav?.push(MaterialPageRoute(builder: (_) => Scaffold(appBar: AppBar(title: const Text('Referral pendaftaran')), body: ReferralScreen(token: token))));
                    },
                  ),
              ]),
            ),
          ]),
        ),
      );
    },
  );
}
