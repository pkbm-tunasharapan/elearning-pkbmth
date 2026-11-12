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
  // v1.69.1: gambar tampil penuh; tombol X di pojok kanan atas gambar, tombol aksi mengambang di bawah gambar tanpa latar.
  // Bila ada gambar, judul/teks tidak ditampilkan (tulisan biasanya sudah ada di gambar).
  void jalankanAksi(BuildContext c) {
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
  }

  Widget tombolAksi(BuildContext c) => FilledButton.icon(
        style: FilledButton.styleFrom(elevation: 4, shadowColor: Colors.black54, padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14)),
        icon: Icon(aksi == 'url' ? Icons.open_in_new_rounded : Icons.campaign_rounded, size: 18),
        label: Text(teks(d['tombol'], aksi == 'url' ? 'Buka' : 'Daftarkan sekarang')),
        onPressed: () => jalankanAksi(c),
      );

  Widget tombolX(BuildContext c) => Material(
        color: Colors.black.withValues(alpha: 0.55),
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => Navigator.pop(c),
          child: const Padding(padding: EdgeInsets.all(7), child: Icon(Icons.close_rounded, color: Colors.white, size: 22)),
        ),
      );

  await showDialog<void>(
    context: ctx,
    builder: (c) {
      final tinggi = MediaQuery.of(c).size.height;
      if (koma > 0) {
        return Dialog(
          backgroundColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          shadowColor: Colors.transparent,
          elevation: 0,
          insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: 520, maxHeight: tinggi * 0.9),
            child: Stack(children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Image.memory(base64Decode(gambar.substring(koma + 1)), fit: BoxFit.contain, gaplessPlayback: true),
              ),
              Positioned(top: 8, right: 8, child: tombolX(c)),
              if (aksi != 'tutup') Positioned(left: 16, right: 16, bottom: 16, child: Center(child: tombolAksi(c))),
            ]),
          ),
        );
      }
      return Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        clipBehavior: Clip.antiAlias,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: 520, maxHeight: tinggi * 0.9),
          child: Stack(children: [
            Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(18, 18, 52, 0),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    if (teks(d['judul']).isNotEmpty) Text(teks(d['judul']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                    if (teks(d['teks']).isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(teks(d['teks']))),
                  ]),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 14),
                child: aksi != 'tutup' ? Align(alignment: Alignment.centerRight, child: tombolAksi(c)) : const SizedBox.shrink(),
              ),
            ]),
            Positioned(top: 8, right: 8, child: tombolX(c)),
          ]),
        ),
      );
    },
  );
}
