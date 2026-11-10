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

String get _pengguna => Sesi.instance.masuk ? '${Sesi.instance.nama} (${Sesi.instance.peran})' : (SesiSiswa.instance.masuk ? 'Siswa ${SesiSiswa.instance.nama}' : '');

/// Mengirim galat berkode ke tab "Log Galat" di server. Pesan diawali kode kejadian, mis. "[E101-K3Q9ZA]",
/// sehingga admin bisa mencari kode yang disampaikan pengguna. Paling banyak 8 laporan per sesi aplikasi,
/// dan galat yang sama hanya dikirim sekali.
Future<void> laporGalatKode(ApiException e) async {
  if (e.fn == 'waStafLaporGalat') return;
  final kunci = '${e.kode}|${e.fn}|${e.pesan}';
  if (_terlapor >= 8 || !_sudahDilapor.add(kunci)) return;
  _terlapor++;
  final pesan = '[${e.kodeLengkap}] ${e.pesan}';
  try {
    await Api.instance('waStafLaporGalat', [
      {
        'pesan': pesan.length > 500 ? pesan.substring(0, 500) : pesan,
        'stack': e.detail.length > 1500 ? e.detail.substring(0, 1500) : e.detail,
        'layar': e.fn.isEmpty ? 'aplikasi' : (e.fn.startsWith('wa') ? 'api:${e.fn}' : e.fn),
        'versi': '$kVersi${kIsWeb ? ' web' : ''}',
        'pengguna': _pengguna,
      }
    ], const Duration(seconds: 20));
  } catch (_) {
    // Gagal melapor tidak boleh menimbulkan galat baru.
  }
}

/// Galat Dart/Flutter yang tidak tertangani → E900 berkode.
Future<void> laporGalat(Object galat, StackTrace? jejak, {String layar = ''}) async {
  if (galat is ApiException) return;
  final st = '${jejak ?? ''}'.split('\n').take(15).join('\n');
  await laporGalatKode(ApiException('$galat', kode: 'E900', detail: '$galat\n$st', fn: layar));
}

/// Dipanggil sekali di main(): semua galat dicatat dengan kode, dan tampilan yang gagal dibuat
/// diganti kotak ramah berisi kode (bukan layar abu-abu/merah).
void pasangPelaporGalat() {
  Api.instance.onGalat = laporGalatKode;
  pelaporGalatAplikasi = laporGalatKode;
  ErrorWidget.builder = (d) {
    final e = ApiException('Bagian tampilan gagal dibuat: ${d.exceptionAsString()}', kode: 'E901', detail: '${d.exception}\n${d.stack}', fn: d.library ?? 'tampilan');
    laporGalatKode(e);
    return Container(
      margin: const EdgeInsets.all(8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: const Color(0xFFFFF1F1), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFF2B8B5))),
      child: Text('Bagian ini gagal ditampilkan. Kode: ${e.kodeLengkap}', textDirection: TextDirection.ltr, style: const TextStyle(color: Color(0xFF8C1D18), fontSize: 13)),
    );
  };
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
    // token staf (bila sudah masuk) agar akun penguji ditawari RILIS UJI; tunggu sebentar sesi selesai dimuat
    for (var i = 0; i < 10 && Sesi.instance.token == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 300));
    }
    d = peta(await Api.instance('waStafVersiApp', [Sesi.instance.token ?? ''], const Duration(seconds: 30)));
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
        title: Text(d['uji'] == true ? 'Rilis uji $terbaru tersedia' : 'Versi $terbaru tersedia'),
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
              subtitle: Text(ringkas.isEmpty ? 'Membandingkan sheet Siswa e-learning dengan WARGA BELAJAR di Data Induk.' : 'Pemeriksaan terakhir ${teks(ringkas['waktu'])}'),
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
  String _cari = '';
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
        final q = _cari.trim().toUpperCase();
        final baris = daftar(d['baris']).map(peta).where((b) => q.isEmpty || '${b['pesan']} ${b['fungsi']} ${b['pengguna']} ${b['detail']}'.toUpperCase().contains(q)).toList();
        return RefreshIndicator(
          onRefresh: segarkan,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Row(children: [
              Expanded(child: Text('${angka(d['total'])} catatan (200 terbaru ditampilkan)', style: TextStyle(color: cs.onSurfaceVariant))),
              if (baris.isNotEmpty) TextButton.icon(onPressed: _bersihkan, icon: const Icon(Icons.delete_sweep_rounded), label: const Text('Bersihkan')),
            ]),
            Padding(
              padding: const EdgeInsets.only(top: 4, bottom: 6),
              child: TextField(
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari kode galat dari pengguna, mis. E101-K3Q9ZA', isDense: true),
                onChanged: (v) => setState(() => _cari = v),
              ),
            ),
            Text('Kode: E1xx koneksi · E2xx server · E3xx peringatan · E9xx aplikasi', style: TextStyle(fontSize: 11.5, color: cs.outline)),
            if (baris.isEmpty) Kosong(pesan: q.isEmpty ? 'Belum ada galat tercatat.' : 'Kode "$q" tidak ditemukan.', ikon: Icons.verified_rounded),
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

/// Versi aplikasi (v1.38.2): sepenuhnya otomatis. Server memeriksa GitHub Releases tiap jam, menyimpan APK
/// terbaru ke folder Drive sekolah, dan semua pengguna WAJIB memperbarui saat membuka aplikasi.
/// Versi aplikasi (v1.38.5): rilis dari GitHub masuk sebagai RILIS UJI (hanya ditawarkan ke penguji),
/// lalu naik menjadi RILIS RESMI (wajib untuk semua) otomatis bila lolos uji, atau saat admin menekan Resmikan.
class _VersiAplikasi extends StatefulWidget {
  const _VersiAplikasi();

  @override
  State<_VersiAplikasi> createState() => _VersiAplikasiState();
}

class _VersiAplikasiState extends State<_VersiAplikasi> {
  final _token = TextEditingController();
  int _v = 0;

  @override
  void dispose() {
    _token.dispose();
    super.dispose();
  }

  void _segar() => setState(() => _v++);

  Future<void> _simpanToken() async {
    if (_token.text.trim().isEmpty) {
      kabar(context, 'Tempel token GitHub terlebih dulu.', galat: true);
      return;
    }
    final r = await jalankan(context, () => Api.instance('waAdminRilisAtur', [_t, {'githubToken': _token.text.trim()}]), teksProses: 'Menyimpan token...');
    if (r.ok && mounted) {
      _token.clear();
      _segar();
    }
  }

  Future<void> _tarik() async {
    final r = await jalankan(context, () async => peta(await Api.instance('waAdminRilisTarik', [_t, false], const Duration(minutes: 6))),
        teksProses: 'Memeriksa rilis baru di GitHub...');
    if (!r.ok || !mounted) return;
    final h = r.data!;
    kabar(
      context,
      h['baru'] == true
          ? 'Versi ${teks(h['versi'])} tersimpan sebagai RILIS UJI (${teks(h['ukuranMb'])} MB). Hanya penguji yang ditawari dulu.'
          : teks(h['naik']).isNotEmpty
              ? 'Versi ${teks(h['naik'])} lolos uji dan kini menjadi rilis resmi.'
              : teks(h['lewat']).isNotEmpty
                  ? teks(h['lewat'])
                  : 'Belum ada rilis baru (${teks(h['tag'])}).',
    );
    _segar();
  }

  Future<void> _resmikan(Map<String, dynamic> u) async {
    final galat = angka(u['galat']);
    final ok = await konfirmasi(
      context,
      'Resmikan versi ${teks(u['versi'])}?',
      'Semua pengguna akan WAJIB memperbarui ke versi ini saat membuka aplikasi.'
          '${galat > 0 ? '\n\nPerhatian: tercatat $galat galat aplikasi dari versi ini. Periksa Log Galat dulu.' : ''}',
      ya: 'Resmikan',
    );
    if (!ok || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminRilisResmikan', [_t]), teksProses: 'Meresmikan...');
    if (r.ok && mounted) _segar();
  }

  Future<void> _batal(String jenis, String versi, String sebelum) async {
    final ok = await konfirmasi(
      context,
      jenis == 'uji' ? 'Tarik rilis uji $versi?' : 'Tarik rilis resmi $versi?',
      jenis == 'uji'
          ? 'Versi ini tidak lagi ditawarkan ke penguji. Rilis berikutnya dari GitHub akan menjadi rilis uji baru.'
          : 'Pengguna yang BELUM memperbarui tidak akan ditawari $versi lagi; versi resmi kembali ke $sebelum.\n\n'
              'HP yang sudah memasang $versi tidak bisa turun versi (aturan Android): buat rilis perbaikan bernomor lebih tinggi.',
      ya: 'Tarik',
    );
    if (!ok || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminRilisBatal', [_t, jenis]), teksProses: 'Menarik rilis...');
    if (r.ok && mounted) _segar();
  }

  Future<void> _penguji(List<Map<String, dynamic>> staf) async {
    final pilih = staf.where((s) => s['penguji'] == true).map((s) => teks(s['id'])).toSet();
    final hasil = await showDialog<Set<String>>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, atur) => AlertDialog(
          title: const Text('Akun penguji rilis'),
          content: SizedBox(
            width: double.maxFinite,
            child: ListView(shrinkWrap: true, children: [
              const Text('Semua Admin otomatis menjadi penguji. Tambahkan staf lain yang akan mencoba rilis uji di HP-nya.', style: TextStyle(fontSize: 12.5)),
              for (final s in staf)
                CheckboxListTile(
                  dense: true,
                  value: pilih.contains(teks(s['id'])),
                  onChanged: (v) => atur(() => v == true ? pilih.add(teks(s['id'])) : pilih.remove(teks(s['id']))),
                  title: Text(teks(s['nama'])),
                  subtitle: Text(teks(s['peran'])),
                ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(c, pilih), child: const Text('Simpan')),
          ],
        ),
      ),
    );
    if (hasil == null || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminRilisPenguji', [_t, hasil.toList()]), teksProses: 'Menyimpan penguji...');
    if (r.ok && mounted) _segar();
  }

  Future<void> _cadangan() async {
    final r = await jalankan(context, () async => peta(await Api.instance('waAdminCadanganSekarang', [_t], const Duration(minutes: 6))), teksProses: 'Menyalin seluruh database ke folder cadangan...');
    if (!r.ok || !mounted) return;
    kabar(context, 'Cadangan dibuat: ${teks(r.data!['nama'])} (${angka(r.data!['tersimpan'])} cadangan tersimpan).');
    _segar();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waAdminRilisStatus', [_t])),
      bangun: (context, d, segarkan) {
        final adaToken = d['adaToken'] == true;
        final resmi = peta(d['resmi']);
        final uji = d['uji'] == null ? null : peta(d['uji']);
        final staf = daftar(d['staf']).map(peta).toList();
        final penguji = staf.where((s) => s['penguji'] == true).map((s) => teks(s['nama'])).toList();
        final cad = peta(d['cadangan']);
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Card(
            color: cs.primaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Text(
                'Rilis baru dari GitHub diperiksa tiap jam dan masuk sebagai RILIS UJI: hanya ditawarkan ke akun penguji. '
                'Rilis naik menjadi RESMI (wajib untuk semua) otomatis setelah lolos uji, atau saat Anda menekan Resmikan.',
                style: TextStyle(color: cs.onPrimaryContainer),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  const Lencana('RESMI', warna: Colors.green),
                  const SizedBox(width: 8),
                  Expanded(child: Text('Versi ${teks(resmi['versi'], '-')}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
                ]),
                const SizedBox(height: 4),
                Text('Wajib untuk semua pengguna · ${teks(resmi['tag'])} · ${teks(resmi['waktu'])}', style: TextStyle(color: cs.onSurfaceVariant, fontSize: 12.5)),
                Text('Versi aplikasi ini: $kVersi', style: TextStyle(color: cs.onSurfaceVariant, fontSize: 12.5)),
                if (teks(d['sebelum']).isNotEmpty)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      onPressed: () => _batal('resmi', teks(resmi['versi']), teks(d['sebelum'])),
                      icon: Icon(Icons.undo_rounded, size: 18, color: cs.error),
                      label: Text('Tarik rilis resmi (kembali ke ${teks(d['sebelum'])})', style: TextStyle(color: cs.error)),
                    ),
                  ),
              ]),
            ),
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: uji == null
                  ? Row(children: [
                      const Lencana('UJI', warna: Colors.orange),
                      const SizedBox(width: 8),
                      Expanded(child: Text('Tidak ada rilis uji. Rilis baru dari GitHub akan muncul di sini.', style: TextStyle(color: cs.onSurfaceVariant))),
                    ])
                  : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Row(children: [
                        const Lencana('UJI', warna: Colors.orange),
                        const SizedBox(width: 8),
                        Expanded(child: Text('Versi ${teks(uji['versi'])}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
                      ]),
                      const SizedBox(height: 4),
                      Text('${teks(uji['tag'])} · sejak ${teks(uji['waktu'])} (${angka(uji['jam'])} jam)', style: TextStyle(color: cs.onSurfaceVariant, fontSize: 12.5)),
                      const SizedBox(height: 6),
                      Text('Syarat naik otomatis:', style: TextStyle(fontWeight: FontWeight.w700, color: cs.onSurface)),
                      Text('${daftar(uji['pakai']).length >= angka(peta(uji['syarat'])['penguji']) ? '✓' : '○'} Dipakai ${daftar(uji['pakai']).length}/${angka(peta(uji['syarat'])['penguji'])} penguji'
                          '${daftar(uji['pakai']).isEmpty ? '' : ': ${daftar(uji['pakai']).map(teks).join(', ')}'}'),
                      Text('${angka(uji['jam']) >= angka(peta(uji['syarat'])['jam']) ? '✓' : '○'} Minimal ${angka(peta(uji['syarat'])['jam'])} jam masa uji'),
                      Text('${angka(uji['galat']) == 0 ? '✓' : '✗'} Galat aplikasi dari versi ini: ${angka(uji['galat'])}',
                          style: TextStyle(color: angka(uji['galat']) == 0 ? null : cs.error, fontWeight: angka(uji['galat']) == 0 ? null : FontWeight.w700)),
                      const SizedBox(height: 10),
                      Wrap(spacing: 8, runSpacing: 6, children: [
                        FilledButton.icon(onPressed: () => _resmikan(uji), icon: const Icon(Icons.verified_rounded, size: 18), label: const Text('Resmikan sekarang')),
                        OutlinedButton.icon(onPressed: () => _batal('uji', teks(uji['versi']), ''), icon: const Icon(Icons.block_rounded, size: 18), label: const Text('Tarik rilis uji')),
                      ]),
                    ]),
            ),
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.science_rounded),
              title: const Text('Akun penguji'),
              subtitle: Text('Semua Admin${penguji.isEmpty ? '' : ' + ${penguji.join(', ')}'}'),
              trailing: const Icon(Icons.edit_rounded),
              onTap: () => _penguji(staf),
            ),
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text(d['otomatis'] == true ? 'Pemeriksaan tiap jam: aktif' : 'Pemeriksaan tiap jam: menunggu token GitHub',
                    style: TextStyle(color: d['otomatis'] == true ? Colors.green : cs.error, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                FilledButton.tonalIcon(onPressed: adaToken ? _tarik : null, icon: const Icon(Icons.cloud_download_rounded), label: const Text('Periksa rilis baru sekarang')),
              ]),
            ),
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Text('Cadangan database', style: TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text('Otomatis tiap Minggu pukul 02.00, ${angka(cad['jumlah'])} cadangan terbaru disimpan di Drive. '
                    'Terakhir: ${teks(cad['terakhir'], 'belum ada')}.', style: TextStyle(color: cs.onSurfaceVariant, fontSize: 12.5)),
                const SizedBox(height: 8),
                OutlinedButton.icon(onPressed: _cadangan, icon: const Icon(Icons.backup_rounded), label: const Text('Buat cadangan sekarang')),
              ]),
            ),
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Text('Token GitHub', style: TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                Text(adaToken ? 'Token tersimpan.' : 'Isi token GitHub (fine-grained, izin Contents: Read-only untuk repo ${teks(d['repo'])}).',
                    style: TextStyle(color: cs.onSurfaceVariant, fontSize: 12.5)),
                const SizedBox(height: 8),
                TextField(
                  controller: _token,
                  obscureText: true,
                  decoration: InputDecoration(labelText: adaToken ? 'Ganti token GitHub (opsional)' : 'Token GitHub', isDense: true),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(onPressed: _simpanToken, icon: const Icon(Icons.key_rounded), label: const Text('Simpan token')),
              ]),
            ),
          ),
        ]);
      },
    );
  }
}
