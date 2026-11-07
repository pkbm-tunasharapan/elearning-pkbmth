import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../config.dart';
import '../session.dart';
import '../siswa/sesi_siswa.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

// ───────────────────────── pelapor galat ─────────────────────────

int _terlapor = 0;
final Set<String> _sudahDilapor = {};

/// Mengirim galat aplikasi ke tab "Log Galat" di server. Paling banyak 5 laporan per sesi
/// aplikasi dan setiap galat yang sama hanya dikirim sekali, supaya tidak membebani server.
Future<void> laporGalat(Object galat, StackTrace? jejak, {String layar = ''}) async {
  final pesan = '$galat';
  if (galat is ApiException || _terlapor >= 5 || !_sudahDilapor.add(pesan)) return;
  _terlapor++;
  final pengguna = Sesi.instance.masuk ? '${Sesi.instance.nama} (${Sesi.instance.peran})' : (SesiSiswa.instance.masuk ? 'Siswa' : '');
  try {
    await Api.instance('waStafLaporGalat', [
      {
        'pesan': pesan.length > 500 ? pesan.substring(0, 500) : pesan,
        'stack': '${jejak ?? ''}'.split('\n').take(15).join('\n'),
        'layar': layar,
        'versi': kVersi,
        'pengguna': pengguna,
      }
    ], const Duration(seconds: 20));
  } catch (_) {
    // Gagal melapor tidak boleh menimbulkan galat baru.
  }
}

/// Dipanggil sekali di main(): semua galat yang tidak tertangani dikirim ke server.
void pasangPelaporGalat() {
  final bawaan = FlutterError.onError;
  FlutterError.onError = (d) {
    bawaan?.call(d);
    laporGalat(d.exception, d.stack, layar: d.library ?? 'flutter');
  };
  PlatformDispatcher.instance.onError = (e, s) {
    laporGalat(e, s, layar: 'async');
    return true;
  };
}

// ───────────────────────── cek versi aplikasi ─────────────────────────

/// 1 bila [a] lebih baru dari [b], -1 bila lebih lama, 0 bila sama.
int bandingVersi(String a, String b) {
  List<int> p(String s) => s.split('.').map((x) => int.tryParse(x.trim()) ?? 0).toList();
  final x = p(a), y = p(b);
  for (var i = 0; i < 3; i++) {
    final u = i < x.length ? x[i] : 0, v = i < y.length ? y[i] : 0;
    if (u != v) return u > v ? 1 : -1;
  }
  return 0;
}

bool _sudahCekVersi = false;

/// Menanyakan versi terbaru ke server sekali per sesi aplikasi; bila lebih baru, tawarkan unduh.
Future<void> cekVersiAplikasi(GlobalKey<NavigatorState> kunci) async {
  if (kIsWeb || _sudahCekVersi) return;
  _sudahCekVersi = true;
  Map<String, dynamic> d;
  try {
    d = peta(await Api.instance('waStafVersiApp', [], const Duration(seconds: 30)));
  } catch (_) {
    return;
  }
  final terbaru = teks(d['versi']), url = teks(d['url']);
  if (terbaru.isEmpty || url.isEmpty || bandingVersi(terbaru, kVersi) <= 0) return;
  final ctx = kunci.currentContext;
  if (ctx == null || !ctx.mounted) return;
  final wajib = d['wajib'] == true;
  await showDialog<void>(
    context: ctx,
    barrierDismissible: !wajib,
    builder: (c) => PopScope(
      canPop: !wajib,
      child: AlertDialog(
        icon: const Icon(Icons.system_update_rounded),
        title: Text('Versi $terbaru tersedia'),
        content: Text([
          'Versi Anda: $kVersi.',
          if (teks(d['catatan']).isNotEmpty) teks(d['catatan']),
          if (wajib) 'Pembaruan ini wajib dipasang agar aplikasi tetap berjalan benar.',
        ].join('\n\n')),
        actions: [
          if (!wajib) TextButton(onPressed: () => Navigator.pop(c), child: const Text('Nanti')),
          FilledButton.icon(
            onPressed: () => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication),
            icon: const Icon(Icons.download_rounded),
            label: const Text('Unduh pembaruan'),
          ),
        ],
      ),
    ),
  );
}

// ───────────────────────── layar Pemeliharaan Sistem (admin) ─────────────────────────

class PemeliharaanScreen extends StatelessWidget {
  const PemeliharaanScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const DefaultTabController(
      length: 3,
      child: Column(children: [
        TabBar(tabs: [Tab(text: 'Kesehatan Data'), Tab(text: 'Log Galat'), Tab(text: 'Versi Aplikasi')]),
        Expanded(child: TabBarView(children: [_KesehatanData(), _LogGalat(), _VersiAplikasi()])),
      ]),
    );
  }
}

class _KesehatanData extends StatefulWidget {
  const _KesehatanData();

  @override
  State<_KesehatanData> createState() => _KesehatanDataState();
}

class _KesehatanDataState extends State<_KesehatanData> {
  int _v = 0;
  String _saring = '';

  Future<void> _jalankan() async {
    final r = await jalankan(context, () => Api.instance('waAdminCekData', [_t, true], const Duration(seconds: 300)), teksProses: 'Memeriksa data siswa...');
    if (r.ok && mounted) setState(() => _v++);
  }

  Future<void> _jadwal(bool aktif) async {
    final r = await jalankan(context, () => Api.instance('waAdminCekDataJadwal', [_t, aktif]), teksProses: 'Mengatur jadwal...');
    if (r.ok && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waAdminCekData', [_t, false])),
      bangun: (context, d, segarkan) {
        final cs = Theme.of(context).colorScheme;
        final ringkas = peta(d['ringkas']);
        final perJenis = peta(ringkas['perJenis']);
        final semua = daftar(d['masalah']).map(peta).toList();
        final masalah = _saring.isEmpty ? semua : semua.where((m) => teks(m['jenis']) == _saring).toList();
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Card(
            color: angka(ringkas['total']) > 0 ? cs.errorContainer : cs.primaryContainer,
            child: ListTile(
              leading: const Icon(Icons.health_and_safety_rounded),
              title: Text(ringkas.isEmpty ? 'Belum pernah diperiksa' : '${angka(ringkas['total'])} masalah data', style: const TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text(ringkas.isEmpty ? 'Membandingkan sheet Siswa e-learning dengan WARGA BELAJAR di SIM SETARA.' : 'Pemeriksaan terakhir ${teks(ringkas['waktu'])}'),
            ),
          ),
          FilledButton.icon(onPressed: _jalankan, icon: const Icon(Icons.play_arrow_rounded), label: const Text('Periksa sekarang')),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: d['jadwal'] == true,
            onChanged: _jadwal,
            title: const Text('Periksa otomatis tiap malam (pukul 01.00)'),
            subtitle: const Text('Hasil tersimpan di tab "Audit Data" spreadsheet e-learning.'),
          ),
          if (perJenis.isNotEmpty) ...[
            const JudulBagian('Jenis masalah'),
            Wrap(spacing: 8, runSpacing: 4, children: [
              ChoiceChip(label: Text('Semua (${semua.length})'), selected: _saring.isEmpty, onSelected: (_) => setState(() => _saring = '')),
              for (final e in perJenis.entries)
                ChoiceChip(label: Text('${e.key} (${angka(e.value)})'), selected: _saring == e.key, onSelected: (_) => setState(() => _saring = e.key)),
            ]),
          ],
          const SizedBox(height: 8),
          for (final m in masalah)
            Card(
              margin: const EdgeInsets.symmetric(vertical: 4),
              child: ListTile(
                title: Text(teks(m['nama'], '-'), style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text([
                  teks(m['jenis']),
                  if (teks(m['nisn']).isNotEmpty) 'NISN ${teks(m['nisn'])}',
                  if (teks(m['rombelEl']).isNotEmpty) 'E-learning: ${teks(m['rombelEl'])}',
                  if (teks(m['rombelSim']).isNotEmpty) 'SIM: ${teks(m['rombelSim'])}',
                  if (teks(m['ket']).isNotEmpty) teks(m['ket']),
                ].join(' · ')),
              ),
            ),
          if (ringkas.isNotEmpty && semua.isEmpty) const Kosong(pesan: 'Tidak ada masalah data. Bagus!', ikon: Icons.task_alt_rounded),
        ]);
      },
    );
  }
}

class _LogGalat extends StatefulWidget {
  const _LogGalat();

  @override
  State<_LogGalat> createState() => _LogGalatState();
}

class _LogGalatState extends State<_LogGalat> {
  int _v = 0;

  Future<void> _bersihkan() async {
    if (!await konfirmasi(context, 'Bersihkan log galat?', 'Semua catatan di tab "Log Galat" dihapus.', ya: 'Bersihkan')) return;
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminLogGalatBersihkan', [_t]), teksProses: 'Membersihkan...');
    if (r.ok && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waAdminLogGalat', [_t, 200])),
      bangun: (context, d, segarkan) {
        final cs = Theme.of(context).colorScheme;
        final baris = daftar(d['baris']).map(peta).toList();
        return RefreshIndicator(
          onRefresh: segarkan,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Row(children: [
              Expanded(child: Text('${angka(d['total'])} catatan (200 terbaru ditampilkan)', style: TextStyle(color: cs.onSurfaceVariant))),
              if (baris.isNotEmpty) TextButton.icon(onPressed: _bersihkan, icon: const Icon(Icons.delete_sweep_rounded), label: const Text('Bersihkan')),
            ]),
            if (baris.isEmpty) const Kosong(pesan: 'Belum ada galat tercatat.', ikon: Icons.verified_rounded),
            for (final b in baris)
              Card(
                margin: const EdgeInsets.symmetric(vertical: 4),
                child: ExpansionTile(
                  leading: Icon(teks(b['sumber']) == 'aplikasi' ? Icons.phone_android_rounded : Icons.dns_rounded, color: cs.error),
                  title: Text(teks(b['pesan'], '-'), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5)),
                  subtitle: Text([teks(b['waktu']), teks(b['fungsi']), if (teks(b['pengguna']).isNotEmpty) teks(b['pengguna']), if (teks(b['versi']).isNotEmpty) 'v${teks(b['versi'])}'].where((x) => x.isNotEmpty).join(' · '),
                      style: const TextStyle(fontSize: 12)),
                  childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  children: [SelectableText(teks(b['detail'], '(tanpa detail)'), style: const TextStyle(fontFamily: 'monospace', fontSize: 11.5))],
                ),
              ),
          ]),
        );
      },
    );
  }
}

class _VersiAplikasi extends StatefulWidget {
  const _VersiAplikasi();

  @override
  State<_VersiAplikasi> createState() => _VersiAplikasiState();
}

class _VersiAplikasiState extends State<_VersiAplikasi> {
  final _versi = TextEditingController();
  final _url = TextEditingController();
  final _catatan = TextEditingController();
  bool _wajib = false;
  bool _termuat = false;

  @override
  void dispose() {
    _versi.dispose();
    _url.dispose();
    _catatan.dispose();
    super.dispose();
  }

  Future<void> _simpan() async {
    final r = await jalankan(
      context,
      () => Api.instance('waAdminVersiAppAtur', [
        _t,
        {'versi': _versi.text.trim(), 'url': _url.text.trim(), 'catatan': _catatan.text.trim(), 'wajib': _wajib}
      ]),
      teksProses: 'Menyimpan...',
    );
    if (r.ok && mounted) kabar(context, 'Tersimpan. Pengguna dengan versi lebih lama akan ditawari pembaruan saat membuka aplikasi.');
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      muat: () async => peta(await Api.instance('waStafVersiApp', [])),
      bangun: (context, d, segarkan) {
        if (!_termuat) {
          _termuat = true;
          _versi.text = teks(d['versi']);
          _url.text = teks(d['url']);
          _catatan.text = teks(d['catatan']);
          _wajib = d['wajib'] == true;
        }
        final cs = Theme.of(context).colorScheme;
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Card(
            color: cs.primaryContainer,
            child: const Padding(
              padding: EdgeInsets.all(14),
              child: Text('Setelah APK baru selesai dibuat, isi versinya dan tautan unduh yang bisa dibuka semua staf '
                  '(misalnya berkas APK di Google Drive yang dibagikan "siapa saja yang memiliki link"). '
                  'Repo GitHub yang privat tidak bisa diunduh tanpa login.'),
            ),
          ),
          Text('Versi aplikasi ini: $kVersi', style: TextStyle(color: cs.onSurfaceVariant)),
          const SizedBox(height: 12),
          TextField(controller: _versi, decoration: const InputDecoration(labelText: 'Versi terbaru (mis. 1.17.0)'), keyboardType: TextInputType.number),
          const SizedBox(height: 10),
          TextField(controller: _url, decoration: const InputDecoration(labelText: 'Tautan unduh APK (https://...)'), keyboardType: TextInputType.url),
          const SizedBox(height: 10),
          TextField(controller: _catatan, decoration: const InputDecoration(labelText: 'Catatan pembaruan (opsional)'), maxLines: 3),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _wajib,
            onChanged: (v) => setState(() => _wajib = v),
            title: const Text('Wajib diperbarui'),
            subtitle: const Text('Dialog pembaruan tidak bisa ditutup.'),
          ),
          FilledButton.icon(onPressed: _simpan, icon: const Icon(Icons.save_rounded), label: const Text('Simpan')),
        ]);
      },
    );
  }
}
