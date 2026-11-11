import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../berkas.dart';
import '../config.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

const _bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const _hariNama = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const _namaJenis = {'UTS': 'Ujian Tengah Semester', 'UAS': 'Ujian Akhir Semester', 'LAIN': 'Ujian Lainnya', 'TRYOUT': 'Tryout'};

String _hari(String iso) {
  final d = DateTime.tryParse(iso);
  return d == null ? '' : _hariNama[d.weekday - 1];
}

String _tglPanjang(String iso) {
  final d = DateTime.tryParse(iso);
  return d == null ? iso : '${d.day} ${_bulan[d.month - 1]} ${d.year}';
}

String _jamDari(int ms) {
  if (ms <= 0) return '';
  final d = DateTime.fromMillisecondsSinceEpoch(ms);
  return '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

Color _warnaStatus(String s) => switch (s) {
      'Mengerjakan' => Colors.blue.shade700,
      'Selesai' => Colors.green.shade700,
      'Terkunci' => Colors.red.shade700,
      'Terputus' => Colors.orange.shade800,
      'Waktu habis' => Colors.brown,
      _ => Colors.grey.shade700,
    };

// ═════════════════════════ DAFTAR TUGAS PENGAWAS ═════════════════════════

/// v1.53.0: daftar ruang yang diawasi pengguna ini (pengelola ujian melihat semua ruang).
class PengawasScreen extends StatefulWidget {
  const PengawasScreen({super.key});

  @override
  State<PengawasScreen> createState() => _PengawasScreenState();
}

class _PengawasScreenState extends State<PengawasScreen> {
  int _v = 0;
  bool _semua = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pengawas Ujian')),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey('pw$_v'),
        muat: () async => peta(await Api.instance('waStafPengawasTugas', [_t], const Duration(seconds: 90))),
        bangun: (c, d, segar) {
          final kelola = d['kelola'] == true;
          final now = angka(d['sekarangMs'], DateTime.now().millisecondsSinceEpoch);
          final semua = daftar(d['tugas']).map(peta).toList();
          final isi = semua.where((x) => !kelola || _semua || x['milik'] == true).toList();
          final perHari = <String, List<Map<String, dynamic>>>{};
          for (final x in isi) {
            perHari.putIfAbsent(teks(x['tanggal']), () => []).add(x);
          }
          return RefreshIndicator(
            onRefresh: segar,
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
              const Text('Buka ruang yang Anda awasi untuk melihat token ujian, memantau siswa secara langsung, membuka kunci, menambah waktu, '
                  'serta membuat daftar hadir dan berita acara.', style: TextStyle(fontSize: 12.5)),
              if (kelola)
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _semua,
                  onChanged: (v) => setState(() => _semua = v),
                  title: const Text('Tampilkan semua ruang'),
                  subtitle: const Text('Sebagai pengelola ujian, Anda bisa membuka ruang mana pun.'),
                ),
              const SizedBox(height: 8),
              if (isi.isEmpty) const Kosong(pesan: 'Belum ada tugas mengawas ujian.', ikon: Icons.badge_outlined),
              for (final h in perHari.entries) ...[
                Padding(padding: const EdgeInsets.only(top: 10, bottom: 4), child: Text('${_hari(h.key)}, ${_tglPanjang(h.key)}', style: const TextStyle(fontWeight: FontWeight.w800))),
                for (final x in h.value)
                  Builder(builder: (_) {
                    final mulai = angka(x['mulaiMs']), akhir = angka(x['akhirMs']);
                    final st = now < mulai ? 'Akan datang' : (now <= akhir + 15 * 60000 ? 'Berlangsung' : 'Selesai');
                    return Card(
                      margin: const EdgeInsets.symmetric(vertical: 3),
                      child: ListTile(
                        onTap: () async {
                          await Navigator.of(context).push(MaterialPageRoute(builder: (_) => PantauRuangScreen(idSlot: teks(x['slot']), idRombel: teks(x['rombel']))));
                          if (mounted) setState(() => _v++);
                        },
                        leading: Text(teks(x['jam']), style: const TextStyle(fontWeight: FontWeight.w800)),
                        title: Text('${teks(x['mapel'])} · ${teks(x['namaRombel'])}'),
                        subtitle: Text('${teks(x['namaMasa'])} · ${x['durasi']} menit${teks(x['ruang']).isEmpty ? '' : ' · ${teks(x['ruang'])}'}\n'
                            'Pengawas: ${teks(x['pengawas'], 'belum ditentukan')}${teks(x['beritaAcara']).isEmpty ? '' : ' · berita acara dibuat'}'),
                        isThreeLine: true,
                        trailing: Lencana(st, warna: st == 'Berlangsung' ? Colors.blue.shade700 : (st == 'Selesai' ? Colors.green.shade700 : Colors.grey.shade700)),
                      ),
                    );
                  }),
              ],
            ]),
          );
        },
      ),
    );
  }
}

// ═════════════════════════ PANTAUAN RUANG ═════════════════════════

class PantauRuangScreen extends StatefulWidget {
  const PantauRuangScreen({super.key, required this.idSlot, required this.idRombel});
  final String idSlot;
  final String idRombel;

  @override
  State<PantauRuangScreen> createState() => _PantauRuangScreenState();
}

class _PantauRuangScreenState extends State<PantauRuangScreen> {
  Map<String, dynamic>? _d;
  String? _galat;
  Timer? _ulang;
  bool _sibuk = false;
  String _saring = '';

  @override
  void initState() {
    super.initState();
    _muat();
    _ulang = Timer.periodic(const Duration(seconds: 15), (_) => _muat(diam: true));
  }

  @override
  void dispose() {
    _ulang?.cancel();
    super.dispose();
  }

  Future<void> _muat({bool diam = false}) async {
    if (_sibuk) return;
    _sibuk = true;
    try {
      final d = peta(await Api.instance('waStafPengawasPantau', [_t, widget.idSlot, widget.idRombel], const Duration(seconds: 60)));
      if (!mounted) return;
      _periksaBaru(d);
      setState(() { _d = d; _galat = null; });
    } on ApiException catch (e) {
      if (mounted && (!diam || _d == null)) setState(() => _galat = e.ramah);
    } catch (_) {
    } finally {
      _sibuk = false;
    }
  }

  // v1.55.0: peringatan pelanggaran baru (getar + pemberitahuan) dibanding pemuatan sebelumnya.
  final Map<String, int> _pelLama = {};
  final Map<String, String> _stLama = {};
  bool _awal = true;

  void _periksaBaru(Map<String, dynamic> d) {
    final baru = <String>[];
    for (final s in daftar(d['siswa']).map(peta)) {
      final k = '${teks(s['idUjian'])}|${teks(s['nama'])}';
      final n = angka(s['pelanggaran']);
      final st = teks(s['status']);
      if (!_awal) {
        if (n > (_pelLama[k] ?? 0)) {
          baru.add('${teks(s['nama'])}: ${teks(s['pelanggaranTerakhir'], 'pelanggaran')} (${angka(s['percobaan'])}/${angka(peta(d['sanksi'])['batasKeluar'], 3)})'
              '${_jamDari(angka(s['pelanggaranTerakhirMs'])).isEmpty ? '' : ' · ${_jamDari(angka(s['pelanggaranTerakhirMs']))}'}');
        } else if (st == 'Terputus' && _stLama[k] != 'Terputus') {
          baru.add('${teks(s['nama'])}: aplikasi terputus');
        }
      }
      _pelLama[k] = n;
      _stLama[k] = st;
    }
    _awal = false;
    if (baru.isEmpty) return;
    HapticFeedback.vibrate();
    Future<void>.delayed(const Duration(milliseconds: 350), HapticFeedback.heavyImpact);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        backgroundColor: Colors.red.shade800,
        duration: const Duration(seconds: 8),
        content: Text(baru.take(4).join('\n') + (baru.length > 4 ? '\n+${baru.length - 4} lainnya' : '')),
      ));
  }

  // urutan perhatian: pelanggaran berat / terkunci, terputus, baru melanggar (10 menit), lainnya
  int _bobot(Map<String, dynamic> s, int now) {
    if (s['berat'] == true || s['terkunci'] == true) return 0;
    if (teks(s['status']) == 'Terputus') return 1;
    final t = angka(s['pelanggaranTerakhirMs']);
    if (t > 0 && now - t < 10 * 60000) return 2;
    return 3;
  }

  Future<void> _mintaPimpinan(Map<String, dynamic> s) async {
    final a = await _mintaAlasan('Minta pimpinan membuka kunci ${teks(s['nama'])}?',
        'Ini kunci ke-${angka(s['kunciKe'])}. Koordinator Kurikulum, Kepala Sekolah, dan Admin akan menerima notifikasi untuk membukanya.');
    if (a == null || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafPengawasMintaBuka', [_t, widget.idSlot, widget.idRombel, s['idUjian'], s['idRombel'], s['nama'], a]),
        teksProses: 'Mengirim permintaan...');
    if (r.ok && mounted) { kabar(context, 'Permintaan terkirim ke pimpinan.'); _muat(); }
  }

  Future<String?> _mintaAlasan(String judul, String isi, {bool menit = false, void Function(int)? padaMenit}) async {
    final c = TextEditingController();
    var n = 10;
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => StatefulBuilder(
        builder: (d, set) => AlertDialog(
          title: Text(judul),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(isi, style: const TextStyle(fontSize: 13)),
            if (menit) ...[
              const SizedBox(height: 10),
              Wrap(spacing: 6, children: [
                for (final m in [5, 10, 15, 20, 30]) ChoiceChip(label: Text('+$m menit'), selected: n == m, onSelected: (_) => set(() => n = m)),
              ]),
            ],
            const SizedBox(height: 10),
            TextField(controller: c, maxLines: 2, decoration: const InputDecoration(labelText: 'Alasan (dicatat di berita acara)')),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Lanjut')),
          ],
        ),
      ),
    );
    final a = c.text.trim();
    c.dispose();
    if (ok != true) return null;
    if (a.length < 5) {
      if (mounted) kabar(context, 'Tulis alasan minimal 5 huruf.', galat: true);
      return null;
    }
    padaMenit?.call(n);
    return a;
  }

  Future<void> _bukaKunci(Map<String, dynamic> s) async {
    final a = await _mintaAlasan('Buka kunci ${teks(s['nama'])}?', 'Siswa bisa melanjutkan ujian dengan sisa waktunya. Hitungan pelanggaran kembali ke 0, tetapi riwayatnya tetap tercatat.');
    if (a == null || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafPengawasBukaKunci', [_t, widget.idSlot, widget.idRombel, s['idUjian'], s['idRombel'], s['nama'], a]), teksProses: 'Membuka kunci...');
    if (r.ok && mounted) { kabar(context, 'Kunci dibuka. Minta siswa menekan "Lanjutkan ujian".'); _muat(); }
  }

  Future<void> _tambahWaktu(Map<String, dynamic> s) async {
    var menit = 10;
    final a = await _mintaAlasan('Tambah waktu ${teks(s['nama'])}', 'Waktu tambahan langsung diterima aplikasi siswa dalam ±1 menit. Total tambahan maksimal 60 menit.',
        menit: true, padaMenit: (n) => menit = n);
    if (a == null || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafPengawasTambahWaktu', [_t, widget.idSlot, widget.idRombel, s['idUjian'], s['idRombel'], s['nama'], menit, a]),
        teksProses: 'Menambah waktu...');
    if (r.ok && mounted) { kabar(context, 'Waktu ditambah $menit menit.'); _muat(); }
  }

  Future<void> _izinPerangkat(Map<String, dynamic> s) async {
    final a = await _mintaAlasan('Izinkan perangkat baru untuk ${teks(s['nama'])}?',
        'Perangkat terdaftar (${teks(s['perangkat'], '-')}) dilepas. Perangkat berikutnya yang dipakai siswa untuk melanjutkan ujian akan terdaftar. Gunakan hanya bila ponsel siswa rusak, mati, atau bermasalah.');
    if (a == null || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafPengawasIzinPerangkat', [_t, widget.idSlot, widget.idRombel, s['idUjian'], s['idRombel'], s['nama'], a]),
        teksProses: 'Mengizinkan perangkat baru...');
    if (r.ok && mounted) { kabar(context, 'Siswa bisa melanjutkan dari perangkat baru.'); _muat(); }
  }

  Future<void> _gantiToken() async {
    if (!await konfirmasi(context, 'Ganti token?', 'Token lama tidak berlaku lagi untuk siswa yang belum mulai. Siswa yang sedang mengerjakan tidak terpengaruh. Token berlaku untuk semua ruang di slot ini.',
        ya: 'Ganti')) {
      return;
    }
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafPengawasToken', [_t, widget.idSlot, widget.idRombel]), teksProses: 'Membuat token baru...');
    if (r.ok && mounted) _muat();
  }

  void _rinci(Map<String, dynamic> s) {
    final log = daftar(s['log']).map(peta).toList();
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(c).size.height * 0.8),
          child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
            Text(teks(s['nama']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            Text('Status: ${teks(s['status'])}${teks(s['mulai']).isEmpty ? '' : ' · mulai ${teks(s['mulai'])}'}${teks(s['selesai']).isEmpty ? '' : ' · selesai ${teks(s['selesai'])}'}'
                '${s['sisaMenit'] == null ? '' : ' · sisa ${s['sisaMenit']} menit'}${angka(s['tambahMenit']) > 0 ? ' · tambahan ${s['tambahMenit']} menit' : ''}'
                '${teks(s['detak']).isEmpty ? '' : ' · tersambung terakhir ${teks(s['detak'])}'}'
                '${teks(s['perangkat']).isEmpty ? '' : ' · perangkat ${teks(s['perangkat'])}'}'),
            const SizedBox(height: 10),
            if (angka(s['kunciKe']) > 0 || s['berat'] == true)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(10)),
                  child: Text(
                    s['berat'] == true
                        ? 'PELANGGARAN BERAT: terkunci ${angka(s['kunciKe'])} kali. Jawaban dikirim otomatis apa adanya dan menunggu keputusan Kepala Sekolah (nilai tetap, susulan, atau dibatalkan).'
                        : 'Sudah terkunci ${angka(s['kunciKe'])} kali.${s['perluPimpinan'] == true ? ' Kunci ini hanya dapat dibuka pimpinan.' : ''}'
                            '${s['minta'] == true ? ' Permintaan buka sudah dikirim ke pimpinan.' : ''}',
                    style: TextStyle(color: Colors.red.shade900, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            const SizedBox(height: 10),
            Wrap(spacing: 8, runSpacing: 8, children: [
              if (s['terkunci'] == true && s['berat'] != true && (s['perluPimpinan'] != true || _d?['pimpinan'] == true))
                FilledButton.icon(onPressed: () { Navigator.pop(c); _bukaKunci(s); }, icon: const Icon(Icons.lock_open_rounded), label: const Text('Buka kunci')),
              if (s['terkunci'] == true && s['berat'] != true && s['perluPimpinan'] == true && _d?['pimpinan'] != true)
                FilledButton.icon(
                  onPressed: () { Navigator.pop(c); _mintaPimpinan(s); },
                  icon: const Icon(Icons.support_agent_rounded),
                  label: Text(s['minta'] == true ? 'Kirim ulang permintaan' : 'Minta pimpinan membuka'),
                ),
              if (teks(s['status']) == 'Mengerjakan' || teks(s['status']) == 'Terputus' || s['terkunci'] == true)
                OutlinedButton.icon(onPressed: () { Navigator.pop(c); _tambahWaktu(s); }, icon: const Icon(Icons.more_time_rounded), label: const Text('Tambah waktu')),
              if (teks(s['perangkat']).isNotEmpty && teks(s['status']) != 'Selesai')
                OutlinedButton.icon(onPressed: () { Navigator.pop(c); _izinPerangkat(s); }, icon: const Icon(Icons.phonelink_setup_rounded), label: const Text('Izinkan perangkat baru')),
            ]),
            const SizedBox(height: 12),
            const Text('Riwayat kejadian', style: TextStyle(fontWeight: FontWeight.w700)),
            if (log.isEmpty) const Text('Tidak ada kejadian tercatat.', style: TextStyle(fontSize: 13)),
            for (final l in log)
              ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: Icon(teks(l['oleh']) == 'Sistem' ? Icons.warning_amber_rounded : Icons.person_outline_rounded,
                    color: teks(l['oleh']) == 'Sistem' ? Colors.orange.shade800 : null),
                title: Text(teks(l['jenis'])),
                subtitle: Text('${teks(l['waktu']).length >= 16 ? teks(l['waktu']).substring(11, 16) : teks(l['waktu'])} · ${teks(l['detail'])}'
                    '${teks(l['oleh']) == 'Sistem' ? '' : ' · oleh ${teks(l['oleh'])}'}'),
              ),
          ]),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final d = _d;
    if (d == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Pantau ruang')),
        body: _galat != null ? PesanGalat(pesan: _galat!, ulangi: _muat) : const Center(child: CircularProgressIndicator()),
      );
    }
    final sl = peta(d['slot']), ms = peta(d['masa']);
    final siswa = daftar(d['siswa']).map(peta).toList();
    final rk = peta(d['ringkas']);
    final now = angka(d['sekarangMs']);
    final dibuka = now >= angka(sl['mulaiMs']) - 30 * 60000;
    final tampil = (_saring.isEmpty ? [...siswa] : siswa.where((s) => teks(s['status']) == _saring).toList())
      ..sort((a, b) {
        final x = _bobot(a, now).compareTo(_bobot(b, now));
        return x != 0 ? x : teks(a['nama']).compareTo(teks(b['nama']));
      });
    final perhatian = siswa.where((s) => _bobot(s, now) < 3).length;
    return Scaffold(
      appBar: AppBar(
        title: Text('${teks(sl['mapel'])} · ${teks(d['namaRombel'])}', overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(tooltip: 'Muat ulang', onPressed: _muat, icon: const Icon(Icons.refresh_rounded)),
          PopupMenuButton<String>(
            onSelected: (v) async {
              if (v == 'hadir') await cetakDaftarHadir(context, d);
              if (v == 'ba' && context.mounted) {
                await Navigator.of(context).push(MaterialPageRoute(builder: (_) => BeritaAcaraUjianScreen(idSlot: widget.idSlot, idRombel: widget.idRombel)));
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'hadir', child: Text('Cetak daftar hadir')),
              PopupMenuItem(value: 'ba', child: Text('Berita acara')),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _muat,
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(teks(ms['nama']), style: const TextStyle(fontWeight: FontWeight.w800)),
                Text('${_hari(teks(sl['tanggal']))}, ${_tglPanjang(teks(sl['tanggal']))} · ${teks(sl['jam'])}–${_jamDari(angka(sl['akhirMs']))} · ${sl['durasi']} menit'),
                Text('Ruang: ${teks(d['ruang'], '-')} · Pengawas: ${teks(d['pengawas'], 'belum ditentukan')}'),
                if (angka(sl['masukSampaiMs']) > 0) Text('Batas masuk ${_jamDari(angka(sl['masukSampaiMs']))}', style: const TextStyle(fontSize: 12.5)),
              ]),
            ),
          ),
          if (teks(sl['token']).isNotEmpty)
            Card(
              color: Theme.of(context).colorScheme.primaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Text('TOKEN UJIAN', style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: 1)),
                      Text(dibuka ? teks(sl['token']) : '••••••', style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900, letterSpacing: 6)),
                      Text(dibuka ? 'Umumkan kepada siswa saat ujian dimulai.' : 'Token tampil 30 menit sebelum ujian.', style: const TextStyle(fontSize: 12)),
                    ]),
                  ),
                  if (dibuka) IconButton(tooltip: 'Ganti token', onPressed: _gantiToken, icon: const Icon(Icons.autorenew_rounded)),
                ]),
              ),
            ),
          const SizedBox(height: 6),
          Wrap(spacing: 6, runSpacing: 6, children: [
            ChoiceChip(label: Text('Semua ${siswa.length}'), selected: _saring.isEmpty, onSelected: (_) => setState(() => _saring = '')),
            for (final s in ['Belum hadir', 'Mengerjakan', 'Terputus', 'Terkunci', 'Selesai', 'Waktu habis'])
              if ((rk[s] ?? 0) != 0)
                ChoiceChip(label: Text('$s ${rk[s]}'), selected: _saring == s, onSelected: (_) => setState(() => _saring = _saring == s ? '' : s)),
          ]),
          const SizedBox(height: 6),
          if (perhatian > 0)
            Card(
              color: Colors.red.shade50,
              child: ListTile(
                dense: true,
                leading: Icon(Icons.notification_important_rounded, color: Colors.red.shade800),
                title: Text('Perlu perhatian: $perhatian siswa', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.red.shade900)),
                subtitle: const Text('Terkunci, terputus, atau baru melanggar dalam 10 menit terakhir. Ditampilkan paling atas.'),
              ),
            ),
          if (siswa.isEmpty) const Kosong(pesan: 'Tidak ada peserta di ruang ini.'),
          for (final s in tampil)
            Card(
              margin: const EdgeInsets.symmetric(vertical: 3),
              color: switch (_bobot(s, now)) {
                0 => Colors.red.withValues(alpha: 0.10),
                1 => Colors.orange.withValues(alpha: 0.10),
                2 => Colors.amber.withValues(alpha: 0.12),
                _ => null,
              },
              shape: _bobot(s, now) == 0 ? RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: Colors.red.shade400, width: 1.5)) : null,
              child: ListTile(
                dense: true,
                onTap: () => _rinci(s),
                title: Text(teks(s['nama']), style: TextStyle(fontWeight: _bobot(s, now) < 3 ? FontWeight.w800 : FontWeight.w500)),
                subtitle: Text([
                  if (s['berat'] == true) 'PELANGGARAN BERAT',
                  if (angka(s['kunciKe']) > 0 && s['berat'] != true) 'kunci ke-${s['kunciKe']}${s['perluPimpinan'] == true ? ' (pimpinan)' : ''}',
                  if (_bobot(s, now) == 2 && teks(s['pelanggaranTerakhir']).isNotEmpty) '${teks(s['pelanggaranTerakhir'])} ${_jamDari(angka(s['pelanggaranTerakhirMs']))}',
                  if (teks(s['mulai']).isNotEmpty) 'mulai ${teks(s['mulai'])}',
                  if (s['sisaMenit'] != null) 'sisa ${s['sisaMenit']} mnt',
                  if (teks(s['selesai']).isNotEmpty) 'selesai ${teks(s['selesai'])}',
                  if (angka(s['tambahMenit']) > 0) '+${s['tambahMenit']} mnt',
                  if (angka(s['pelanggaran']) > 0) '${s['pelanggaran']} pelanggaran',
                ].join(' · ')),
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  if (angka(s['pelanggaran']) > 0) Padding(padding: const EdgeInsets.only(right: 6), child: Icon(Icons.warning_amber_rounded, color: Colors.orange.shade800, size: 20)),
                  Lencana(teks(s['status']), warna: _warnaStatus(teks(s['status']))),
                ]),
              ),
            ),
          const SizedBox(height: 10),
          Text('Diperbarui otomatis tiap 15 detik; ponsel bergetar saat ada pelanggaran baru. "Terputus" = aplikasi siswa tidak tersambung lebih dari 3 menit saat mengerjakan.',
              style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ]),
      ),
    );
  }
}

// ═════════════════════════ CETAK ═════════════════════════

const _css = '.kop{text-align:center;border-bottom:3px double #333;padding-bottom:6px;margin-bottom:10px}.lb{font-size:15pt;font-weight:bold}'
    'h2{text-align:center;font-size:13pt;margin:10px 0 2px;text-decoration:underline}.sub{text-align:center;margin-bottom:12px}'
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:4px 6px;font-size:10pt;vertical-align:top}th{background:#eee}.c{text-align:center}'
    '.id td{border:none;padding:2px 4px;font-size:10.5pt}.isi{font-size:10.5pt;line-height:1.6;text-align:justify}'
    '.ttd{width:100%;margin-top:18px}.ttd td{border:none;text-align:center;vertical-align:top;font-size:10.5pt}.ttd img{height:22mm}';

String _kop(Map<String, dynamic> sk) => '<div class="kop"><div class="lb">${escHtml(teks(sk['nama'], kNamaSekolah).toUpperCase())}</div>'
    '<div>NPSN ${escHtml(kNpsn)} · ${escHtml(teks(sk['alamat'], kAlamatLembaga))}</div></div>';

String _identitas(Map<String, dynamic> d) {
  final sl = peta(d['slot']), ms = peta(d['masa']);
  final baris = [
    ['Jenis ujian', '${_namaJenis[teks(ms['jenis'])] ?? teks(ms['jenis'])} · ${teks(ms['nama'])}'],
    ['Semester', teks(ms['smt'])],
    ['Mata pelajaran', teks(sl['mapel'])],
    ['Rombel / ruang', '${teks(d['namaRombel'])}${teks(d['ruang']).isEmpty ? '' : ' / ${teks(d['ruang'])}'}'],
    ['Hari, tanggal', '${_hari(teks(sl['tanggal']))}, ${_tglPanjang(teks(sl['tanggal']))}'],
    ['Waktu', '${teks(sl['jam'])} – ${_jamDari(angka(sl['akhirMs']))} WIB (${sl['durasi']} menit)'],
  ];
  return '<table class="id">${baris.map((b) => '<tr><td style="width:32%">${escHtml(b[0])}</td><td>: ${escHtml(b[1])}</td></tr>').join()}</table>';
}

/// Daftar hadir peserta ujian satu ruang (F4), dari data sistem.
Future<void> cetakDaftarHadir(BuildContext context, Map<String, dynamic> d) async {
  final siswa = daftar(d['siswa']).map(peta).toList();
  final sl = peta(d['slot']);
  final b = StringBuffer()
    ..write(_kop(peta(d['sekolah'])))
    ..write('<h2>DAFTAR HADIR PESERTA UJIAN</h2><div class="sub">Pelaksanaan serentak melalui aplikasi TH.E-Course</div>')
    ..write(_identitas(d))
    ..write('<br><table><tr><th style="width:6%">No</th><th>Nama peserta</th><th style="width:15%">NISN</th><th style="width:14%">Kehadiran</th>'
        '<th style="width:11%">Mulai</th><th style="width:11%">Selesai</th><th style="width:12%">Pelanggaran</th></tr>');
  var no = 0, hadir = 0;
  for (final s in siswa) {
    no++;
    final h = teks(s['status']) != 'Belum hadir';
    if (h) hadir++;
    b.write('<tr><td class="c">$no</td><td>${escHtml(s['nama'])}</td><td class="c">${escHtml(s['nisn'])}</td><td class="c">${h ? 'Hadir' : 'Tidak hadir'}</td>'
        '<td class="c">${escHtml(s['mulai'])}</td><td class="c">${escHtml(s['selesai'])}</td><td class="c">${angka(s['pelanggaran'])}</td></tr>');
  }
  b.write('</table><p class="isi">Jumlah peserta terdaftar $no orang, hadir $hadir orang, tidak hadir ${no - hadir} orang.</p>');
  b.write('<table class="ttd"><tr><td></td><td>${escHtml(_tglPanjang(teks(sl['tanggal'])))}<br>Pengawas<br><br><br><br><br><b><u>${escHtml(teks(d['pengawas'], '..............................'))}</u></b></td></tr></table>');
  await htmlKePdf(context, nama: 'Daftar_Hadir_${teks(sl['mapel'])}_${teks(d['namaRombel'])}_${teks(sl['tanggal'])}.pdf'.replaceAll(' ', '_'), args: [_t, dokumenA4(b.toString(), _css)]);
}

/// Naskah berita acara (HTML F4). Redaksi baku + pelanggaran otomatis + tindakan pengawas + keterangan + tanda tangan.
String htmlBeritaAcara(Map<String, dynamic> d, {required String keterangan, required String ttd, required String pengawas, String waktuSimpan = ''}) {
  final siswa = daftar(d['siswa']).map(peta).toList();
  final sl = peta(d['slot']), ms = peta(d['masa']), sk = peta(d['sekolah']);
  final kej = daftar(d['kejadian']).map(peta).toList();
  final pel = kej.where((k) => k['sistem'] == true).toList();
  final tindak = kej.where((k) => k['sistem'] != true).toList();
  final tidak = siswa.where((s) => teks(s['status']) == 'Belum hadir').toList();
  final hadir = siswa.length - tidak.length;
  final jenisNama = _namaJenis[teks(ms['jenis'])] ?? teks(ms['jenis']);
  final b = StringBuffer()
    ..write(_kop(sk))
    ..write('<h2>BERITA ACARA PELAKSANAAN UJIAN</h2><div class="sub">${escHtml(jenisNama.toUpperCase())} · ${escHtml(teks(ms['nama']))}</div>')
    ..write('<p class="isi">Pada hari ini <b>${escHtml(_hari(teks(sl['tanggal'])))}</b>, tanggal <b>${escHtml(_tglPanjang(teks(sl['tanggal'])))}</b>, '
        'pukul ${escHtml(teks(sl['jam']))} sampai ${escHtml(_jamDari(angka(sl['akhirMs'])))} WIB, telah diselenggarakan ${escHtml(jenisNama)} '
        '(${escHtml(teks(ms['nama']))}) Semester ${escHtml(ms['smt'])} mata pelajaran <b>${escHtml(sl['mapel'])}</b> bagi peserta didik rombel '
        '<b>${escHtml(d['namaRombel'])}</b>${teks(d['ruang']).isEmpty ? '' : ' di ruang ${escHtml(d['ruang'])}'} pada ${escHtml(teks(sk['nama'], kNamaSekolah))}. '
        'Ujian dilaksanakan serentak melalui aplikasi TH.E-Course dengan token ujian, pengacakan soal dan jawaban per peserta, '
        'serta pencatatan otomatis setiap kali peserta keluar dari aplikasi.</p>')
    ..write(_identitas(d))
    ..write('<p class="isi"><b>A. Kehadiran.</b> Peserta terdaftar ${siswa.length} orang, hadir dan mengerjakan $hadir orang, tidak hadir ${tidak.length} orang'
        '${tidak.isEmpty ? '.' : ', yaitu: ${tidak.map((s) => escHtml(s['nama'])).join(', ')}.'}</p>')
    ..write('<p class="isi"><b>B. Catatan aktivitas mencurigakan yang terekam sistem.</b> '
        '${pel.isEmpty ? 'Selama ujian berlangsung tidak terekam aktivitas mencurigakan.' : 'Selama ujian berlangsung terekam ${pel.length} kejadian sebagai berikut:'}</p>');
  if (pel.isNotEmpty) {
    b.write('<table><tr><th style="width:6%">No</th><th style="width:10%">Jam</th><th style="width:26%">Nama peserta</th><th style="width:20%">Mata pelajaran</th><th>Kejadian</th></tr>');
    var i = 0;
    for (final k in pel) {
      i++;
      b.write('<tr><td class="c">$i</td><td class="c">${escHtml(k['jam'])}</td><td>${escHtml(k['nama'])}</td><td>${escHtml(sl['mapel'])}</td>'
          '<td>${escHtml(k['jenis'])}${teks(k['detail']).isEmpty ? '' : ' (${escHtml(k['detail'])})'}</td></tr>');
    }
    b.write('</table>');
  }
  b.write('<p class="isi"><b>C. Tindakan pengawas.</b> ${tindak.isEmpty ? 'Tidak ada tindakan khusus (buka kunci atau tambahan waktu).' : ''}</p>');
  if (tindak.isNotEmpty) {
    b.write('<table><tr><th style="width:6%">No</th><th style="width:10%">Jam</th><th style="width:26%">Nama peserta</th><th style="width:24%">Tindakan</th><th>Alasan</th></tr>');
    var i = 0;
    for (final k in tindak) {
      i++;
      b.write('<tr><td class="c">$i</td><td class="c">${escHtml(k['jam'])}</td><td>${escHtml(k['nama'])}</td><td>${escHtml(k['jenis'])}</td><td>${escHtml(k['detail'])}</td></tr>');
    }
    b.write('</table>');
  }
  b.write('<p class="isi"><b>D. Keterangan pengawas.</b><br>${escHtml(keterangan).replaceAll('\n', '<br>')}</p>');
  b.write('<p class="isi">Demikian berita acara ini dibuat dengan sebenarnya untuk dapat dipergunakan sebagaimana mestinya.</p>');
  final kota = teks(sk['kota']);
  b.write('<table class="ttd"><tr><td>Mengetahui,<br>Kepala ${escHtml(teks(sk['nama'], kNamaSekolah))}<br><br><br><br><br><b><u>${escHtml(teks(sk['kepala'], '..............................'))}</u></b></td>'
      '<td>${escHtml(kota)}${kota.isEmpty ? '' : ', '}${escHtml(_tglPanjang(teks(sl['tanggal'])))}<br>Pengawas<br>'
      '${ttd.isEmpty ? '<br><br><br><br>' : '<img src="$ttd">'}<br><b><u>${escHtml(pengawas.isEmpty ? '..............................' : pengawas)}</u></b>'
      '${waktuSimpan.isEmpty ? '' : '<br><span style="font-size:8pt;color:#555">Ditandatangani digital ${escHtml(waktuSimpan)}</span>'}</td></tr></table>');
  return b.toString();
}

// ═════════════════════════ BERITA ACARA ═════════════════════════

class BeritaAcaraUjianScreen extends StatefulWidget {
  const BeritaAcaraUjianScreen({super.key, required this.idSlot, required this.idRombel});
  final String idSlot;
  final String idRombel;

  @override
  State<BeritaAcaraUjianScreen> createState() => _BeritaAcaraUjianScreenState();
}

class _BeritaAcaraUjianScreenState extends State<BeritaAcaraUjianScreen> {
  Map<String, dynamic>? _d;
  String? _galat;
  final _ket = TextEditingController();
  final _pad = GlobalKey<_PadTandaTanganState>();
  String _ttdLama = '';

  @override
  void initState() {
    super.initState();
    _muat();
  }

  @override
  void dispose() {
    _ket.dispose();
    super.dispose();
  }

  Future<void> _muat() async {
    try {
      final d = peta(await Api.instance('waStafPengawasBeritaAcara', [_t, widget.idSlot, widget.idRombel], const Duration(seconds: 90)));
      final ba = peta(d['beritaAcara']);
      if (!mounted) return;
      setState(() {
        _d = d;
        if (_ket.text.isEmpty) _ket.text = teks(ba['keterangan']);
        _ttdLama = teks(ba['ttd']);
        _galat = null;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  Future<String> _ttd() async {
    final p = _pad.currentState;
    if (p != null && p.ada) return await p.png();
    return _ttdLama;
  }

  Future<void> _simpan() async {
    final ket = _ket.text.trim();
    if (ket.length < 10) return kabar(context, 'Keterangan pengawas wajib diisi (minimal 10 huruf).', galat: true);
    final ttd = await _ttd();
    if (!mounted) return;
    if (ttd.isEmpty) return kabar(context, 'Bubuhkan tanda tangan di kotak tanda tangan.', galat: true);
    final r = await jalankan(context, () => Api.instance('waStafPengawasBeritaAcaraSimpan', [_t, widget.idSlot, widget.idRombel, {'keterangan': ket, 'ttd': ttd}]),
        teksProses: 'Menyimpan berita acara...');
    if (!r.ok || !mounted) return;
    kabar(context, 'Berita acara tersimpan.');
    _pad.currentState?.hapus();
    await _muat();
  }

  Future<void> _cetak() async {
    final d = _d!;
    final ba = peta(d['beritaAcara']);
    if (ba.isEmpty) return kabar(context, 'Simpan berita acara dulu, lalu cetak.', galat: true);
    final sl = peta(d['slot']);
    await htmlKePdf(context,
        nama: 'Berita_Acara_${teks(sl['mapel'])}_${teks(d['namaRombel'])}_${teks(sl['tanggal'])}.pdf'.replaceAll(' ', '_'),
        args: [
          _t,
          dokumenA4(htmlBeritaAcara(d, keterangan: teks(ba['keterangan']), ttd: teks(ba['ttd']), pengawas: teks(ba['pengawas']), waktuSimpan: teks(ba['waktu'])), _css)
        ]);
  }

  @override
  Widget build(BuildContext context) {
    final d = _d;
    if (d == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Berita acara')),
        body: _galat != null ? PesanGalat(pesan: _galat!, ulangi: _muat) : const Center(child: CircularProgressIndicator()),
      );
    }
    final kej = daftar(d['kejadian']).map(peta).toList();
    final pel = kej.where((k) => k['sistem'] == true).toList();
    final tindak = kej.where((k) => k['sistem'] != true).toList();
    final siswa = daftar(d['siswa']).map(peta).toList();
    final tidak = siswa.where((s) => teks(s['status']) == 'Belum hadir').toList();
    final ba = peta(d['beritaAcara']);
    final sl = peta(d['slot']);
    return Scaffold(
      appBar: AppBar(title: const Text('Berita acara'), actions: [
        IconButton(tooltip: 'Cetak PDF', onPressed: ba.isEmpty ? null : _cetak, icon: const Icon(Icons.print_rounded)),
      ]),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        Text('${teks(sl['mapel'])} · ${teks(d['namaRombel'])}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        Text('${_hari(teks(sl['tanggal']))}, ${_tglPanjang(teks(sl['tanggal']))} · ${teks(sl['jam'])}–${_jamDari(angka(sl['akhirMs']))}'),
        if (ba.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Lencana('Tersimpan ${teks(ba['waktu'])} oleh ${teks(ba['pengawas'])}', warna: Colors.green.shade700),
          ),
        const SizedBox(height: 12),
        JudulBagian('A. Kehadiran', sub: '${siswa.length} terdaftar · ${siswa.length - tidak.length} hadir · ${tidak.length} tidak hadir'),
        if (tidak.isNotEmpty) Text('Tidak hadir: ${tidak.map((s) => teks(s['nama'])).join(', ')}', style: const TextStyle(fontSize: 13)),
        const SizedBox(height: 8),
        JudulBagian('B. Aktivitas mencurigakan (otomatis)', sub: pel.isEmpty ? 'Tidak terekam aktivitas mencurigakan.' : '${pel.length} kejadian terekam sistem'),
        for (final k in pel)
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: Text(teks(k['jam']), style: const TextStyle(fontWeight: FontWeight.w700)),
            title: Text(teks(k['nama'])),
            subtitle: Text('${teks(sl['mapel'])} · ${teks(k['jenis'])}${teks(k['detail']).isEmpty ? '' : ' (${teks(k['detail'])})'}'),
          ),
        const SizedBox(height: 8),
        JudulBagian('C. Tindakan pengawas', sub: tindak.isEmpty ? 'Tidak ada tindakan khusus.' : '${tindak.length} tindakan'),
        for (final k in tindak)
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: Text(teks(k['jam']), style: const TextStyle(fontWeight: FontWeight.w700)),
            title: Text('${teks(k['jenis'])} · ${teks(k['nama'])}'),
            subtitle: Text('${teks(k['detail'])} · oleh ${teks(k['oleh'])}'),
          ),
        const SizedBox(height: 8),
        const JudulBagian('D. Keterangan pengawas (wajib)'),
        TextField(
          controller: _ket,
          minLines: 3,
          maxLines: 8,
          maxLength: 2000,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            hintText: 'Mis. ujian berjalan tertib; kendala jaringan pada 2 peserta pukul 08.10 dan sudah ditangani; tidak ada kecurangan lain yang terlihat.',
          ),
        ),
        const SizedBox(height: 8),
        const JudulBagian('Tanda tangan pengawas', sub: 'Tanda tangani di kotak di bawah dengan jari.'),
        if (_ttdLama.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(children: [
              const Text('Tersimpan: ', style: TextStyle(fontSize: 12.5)),
              Container(color: Colors.white, height: 50, child: Image.memory(base64Decode(_ttdLama.split(',').last), height: 50)),
              const SizedBox(width: 8),
              const Expanded(child: Text('Tanda tangani lagi untuk mengganti.', style: TextStyle(fontSize: 12))),
            ]),
          ),
        _PadTandaTangan(key: _pad),
        Align(alignment: Alignment.centerRight, child: TextButton.icon(onPressed: () => _pad.currentState?.hapus(), icon: const Icon(Icons.backspace_outlined), label: const Text('Hapus tanda tangan'))),
        const SizedBox(height: 8),
        FilledButton.icon(onPressed: _simpan, icon: const Icon(Icons.save_rounded), label: const Text('Simpan berita acara')),
        const SizedBox(height: 8),
        OutlinedButton.icon(onPressed: ba.isEmpty ? null : _cetak, icon: const Icon(Icons.picture_as_pdf_outlined), label: const Text('Cetak PDF (F4)')),
      ]),
    );
  }
}

/// Kotak tanda tangan di layar: digambar dengan jari, diekspor sebagai PNG (latar putih, garis hitam).
class _PadTandaTangan extends StatefulWidget {
  const _PadTandaTangan({super.key});

  @override
  State<_PadTandaTangan> createState() => _PadTandaTanganState();
}

class _PadTandaTanganState extends State<_PadTandaTangan> {
  final List<List<Offset>> _garis = [];
  Size _ukuran = const Size(320, 180);

  bool get ada => _garis.any((g) => g.length > 1);

  void hapus() => setState(_garis.clear);

  Future<String> png() async {
    final rec = ui.PictureRecorder();
    final c = Canvas(rec);
    c.drawRect(Offset.zero & _ukuran, Paint()..color = Colors.white);
    _LukisTtd.lukis(c, _garis);
    final img = await rec.endRecording().toImage(_ukuran.width.ceil(), _ukuran.height.ceil());
    final bd = await img.toByteData(format: ui.ImageByteFormat.png);
    if (bd == null) return '';
    return 'data:image/png;base64,${base64Encode(bd.buffer.asUint8List())}';
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (c, k) {
      _ukuran = Size(k.maxWidth.clamp(200, 520).toDouble(), 180);
      return Center(
        child: Container(
          width: _ukuran.width,
          height: _ukuran.height,
          decoration: BoxDecoration(color: Colors.white, border: Border.all(color: Colors.grey.shade500), borderRadius: BorderRadius.circular(8)),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: GestureDetector(
              onPanStart: (e) => setState(() => _garis.add([e.localPosition])),
              onPanUpdate: (e) {
                final p = e.localPosition;
                if (p.dx < 0 || p.dy < 0 || p.dx > _ukuran.width || p.dy > _ukuran.height) return;
                setState(() => _garis.last.add(p));
              },
              child: CustomPaint(painter: _LukisTtd(_garis, _garis.fold<int>(0, (a, g) => a + g.length)), size: _ukuran),
            ),
          ),
        ),
      );
    });
  }
}

class _LukisTtd extends CustomPainter {
  _LukisTtd(this.garis, this.versi);
  final List<List<Offset>> garis;
  final int versi;

  static void lukis(Canvas c, List<List<Offset>> garis) {
    final p = Paint()
      ..color = Colors.black
      ..strokeWidth = 2.4
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;
    for (final g in garis) {
      if (g.length < 2) continue;
      final path = Path()..moveTo(g.first.dx, g.first.dy);
      for (final o in g.skip(1)) {
        path.lineTo(o.dx, o.dy);
      }
      c.drawPath(path, p);
    }
  }

  @override
  void paint(Canvas canvas, Size size) => lukis(canvas, garis);

  @override
  bool shouldRepaint(_LukisTtd old) => old.versi != versi || old.garis.length != garis.length;
}

// ═════════════════════════ PENUGASAN PENGAWAS (pengelola) ═════════════════════════

class PenugasanPengawasScreen extends StatefulWidget {
  const PenugasanPengawasScreen({super.key, required this.idMasa});
  final String idMasa;

  @override
  State<PenugasanPengawasScreen> createState() => _PenugasanPengawasScreenState();
}

class _PenugasanPengawasScreenState extends State<PenugasanPengawasScreen> {
  Map<String, dynamic>? _d;
  String? _galat;
  // rombel -> {ruang, pengawas, slot: {idSlot: idPengawas}}
  final Map<String, Map<String, dynamic>> _isi = {};
  final Map<String, TextEditingController> _ruang = {};

  @override
  void initState() {
    super.initState();
    _muat();
  }

  @override
  void dispose() {
    for (final c in _ruang.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _muat() async {
    try {
      final d = peta(await Api.instance('waStafMasaPengawas', [_t, widget.idMasa], const Duration(seconds: 90)));
      _isi.clear();
      for (final r in daftar(d['rombel']).map(peta)) {
        _isi[teks(r['id'])] = {'pengawas': '', 'slot': <String, String>{}};
      }
      for (final t in daftar(d['tugas']).map(peta)) {
        final o = _isi[teks(t['rombel'])];
        if (o == null) continue;
        if (teks(t['slot']) == '*') {
          o['pengawas'] = teks(t['idPengawas']);
          (_ruang[teks(t['rombel'])] ??= TextEditingController()).text = teks(t['ruang']);
        } else {
          (o['slot'] as Map<String, String>)[teks(t['slot'])] = teks(t['idPengawas']);
        }
      }
      if (mounted) setState(() { _d = d; _galat = null; });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  Future<void> _simpan() async {
    final tugas = <Map<String, dynamic>>[];
    _isi.forEach((r, o) {
      final ruang = _ruang[r]?.text.trim() ?? '';
      if (teks(o['pengawas']).isNotEmpty || ruang.isNotEmpty) tugas.add({'slot': '*', 'rombel': r, 'ruang': ruang, 'idPengawas': o['pengawas']});
      (o['slot'] as Map<String, String>).forEach((s, idP) {
        if (idP.isNotEmpty) tugas.add({'slot': s, 'rombel': r, 'ruang': '', 'idPengawas': idP});
      });
    });
    final r = await jalankan(context, () => Api.instance('waStafMasaPengawasSimpan', [_t, widget.idMasa, tugas]), teksProses: 'Menyimpan penugasan...');
    if (r.ok && mounted) {
      kabar(context, 'Penugasan pengawas disimpan.');
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = _d;
    if (d == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Pengawas ujian')),
        body: _galat != null ? PesanGalat(pesan: _galat!, ulangi: _muat) : const Center(child: CircularProgressIndicator()),
      );
    }
    final staf = daftar(d['staf']).map(peta).toList();
    final slot = {for (final s in daftar(d['slot']).map(peta)) teks(s['id']): s};
    final rombel = daftar(d['rombel']).map(peta).toList();
    final idStaf = staf.map((u) => teks(u['id'])).toSet();
    String sah(String? v) => v != null && idStaf.contains(v) ? v : '';
    List<DropdownMenuItem<String>> pilihan(String kosong) => [
          DropdownMenuItem(value: '', child: Text(kosong)),
          for (final u in staf) DropdownMenuItem(value: teks(u['id']), child: Text('${teks(u['nama'])} (${teks(u['peran'])})', overflow: TextOverflow.ellipsis)),
        ];
    return Scaffold(
      appBar: AppBar(title: const Text('Pengawas ujian')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 96), children: [
        Text(teks(peta(d['masa'])['nama']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        const Text('Tentukan pengawas dan ruang tiap rombel untuk seluruh slot. Bila pengawas berganti pada slot tertentu, atur di "Ganti per slot".',
            style: TextStyle(fontSize: 12.5)),
        const SizedBox(height: 10),
        if (rombel.isEmpty) const Kosong(pesan: 'Belum ada slot jadwal dengan rombel peserta.'),
        for (final r in rombel)
          Card(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(teks(r['nama']), style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                Row(children: [
                  Expanded(
                    flex: 2,
                    child: DropdownButtonFormField<String>(
                      initialValue: sah(teks(_isi[teks(r['id'])]?['pengawas'])),
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Pengawas (semua slot)'),
                      items: pilihan('Belum ditentukan'),
                      onChanged: (v) => setState(() => _isi[teks(r['id'])]!['pengawas'] = v ?? ''),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(controller: _ruang[teks(r['id'])] ??= TextEditingController(), decoration: const InputDecoration(labelText: 'Ruang')),
                  ),
                ]),
                ExpansionTile(
                  tilePadding: EdgeInsets.zero,
                  title: Text('Ganti per slot (${(_isi[teks(r['id'])]!['slot'] as Map).values.where((x) => '$x'.isNotEmpty).length})', style: const TextStyle(fontSize: 13.5)),
                  children: [
                    for (final idS in daftar(r['slot']).map((e) => '$e'))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: DropdownButtonFormField<String>(
                          initialValue: sah((_isi[teks(r['id'])]!['slot'] as Map<String, String>)[idS]),
                          isExpanded: true,
                          decoration: InputDecoration(
                            labelText: '${_hari(teks(slot[idS]?['tanggal']))} ${teks(slot[idS]?['tanggal'])} ${teks(slot[idS]?['jam'])} · ${teks(slot[idS]?['namaMapel'])}',
                          ),
                          items: pilihan('Ikut pengawas semua slot'),
                          onChanged: (v) => setState(() => (_isi[teks(r['id'])]!['slot'] as Map<String, String>)[idS] = v ?? ''),
                        ),
                      ),
                  ],
                ),
              ]),
            ),
          ),
      ]),
      floatingActionButton: FloatingActionButton.extended(onPressed: _simpan, icon: const Icon(Icons.save_rounded), label: const Text('Simpan')),
    );
  }
}
