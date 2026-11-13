import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

/// Broadcast / pemberitahuan (admin). Berbeda dengan popup promosi (hanya saat aplikasi dibuka):
/// muncul dalam ±30 detik di aplikasi yang sedang terbuka dan sebagai notifikasi ponsel,
/// serta diperiksa Android ±15 menit sekali walau aplikasi ditutup.
class BroadcastScreen extends StatefulWidget {
  const BroadcastScreen({super.key});

  @override
  State<BroadcastScreen> createState() => _BroadcastScreenState();
}

class _BroadcastScreenState extends State<BroadcastScreen> {
  int _versi = 0;
  final _judul = TextEditingController();
  final _isi = TextEditingController();
  bool _siswa = true;
  bool _staf = true;
  bool _semuaRombel = true;
  bool _semuaPeran = true;
  final Set<String> _rombel = {};
  final Set<String> _peran = {};
  int _hari = 7;
  bool _sekali = false;
  final _gulir = ScrollController();

  @override
  void dispose() {
    _judul.dispose();
    _isi.dispose();
    _gulir.dispose();
    super.dispose();
  }

  Future<void> _kirim() async {
    final judul = _judul.text.trim(), isi = _isi.text.trim();
    if (judul.length < 3 || isi.isEmpty) {
      kabar(context, 'Isi judul (minimal 3 karakter) dan isi pemberitahuan.', galat: true);
      return;
    }
    if (!_siswa && !_staf) {
      kabar(context, 'Pilih penerima: siswa, staf, atau keduanya.', galat: true);
      return;
    }
    if (_siswa && !_semuaRombel && _rombel.isEmpty) {
      kabar(context, 'Pilih minimal satu rombel, atau aktifkan "Semua rombel".', galat: true);
      return;
    }
    if (_staf && !_semuaPeran && _peran.isEmpty) {
      kabar(context, 'Pilih minimal satu peran staf, atau aktifkan "Semua staf".', galat: true);
      return;
    }
    final ok = await konfirmasi(context, 'Kirim pemberitahuan', 'Kirim "$judul" sekarang? Pemberitahuan langsung muncul di aplikasi penerima dan di notifikasi ponsel.', ya: 'Kirim');
    if (!ok || !mounted) return;
    final r = await jalankan(
      context,
      () => Api.instance('waAdminBroadcastKirim', [
        _t,
        {
          'judul': judul,
          'isi': isi,
          'siswa': _siswa,
          'staf': _staf,
          'rombel': _siswa && !_semuaRombel ? _rombel.toList() : <String>[],
          'peran': _staf && !_semuaPeran ? _peran.toList() : <String>[],
          'hari': _hari,
          'sekali': _sekali,
        }
      ]),
      teksProses: 'Mengirim...',
    );
    if (r.ok && mounted) {
      _judul.clear();
      _isi.clear();
      kabar(context, 'Pemberitahuan terkirim.');
      setState(() => _versi++);
    }
  }

  /// v1.70.1: ulangi broadcast dari riwayat - form diisi ulang (judul, isi, penerima, masa tampil), tinggal diperiksa lalu dikirim.
  void _ulangi(Map<String, dynamic> p) {
    final rb = daftar(p['rombel']).map(teks).where((x) => x.isNotEmpty).toSet();
    final pr = daftar(p['peran']).map(teks).where((x) => x.isNotEmpty).toSet();
    final h = angka(p['hari'], 7);
    setState(() {
      _judul.text = teks(p['judul']);
      _isi.text = teks(p['isi']);
      _siswa = p['siswa'] == true;
      _staf = p['staf'] == true;
      _semuaRombel = rb.isEmpty;
      _rombel..clear()..addAll(rb);
      _semuaPeran = pr.isEmpty;
      _peran..clear()..addAll(pr);
      _sekali = p['sekali'] == true;
      _hari = const [1, 3, 7, 14, 30].reduce((a, b) => (a - h).abs() <= (b - h).abs() ? a : b);
    });
    if (_gulir.hasClients) _gulir.animateTo(0, duration: const Duration(milliseconds: 350), curve: Curves.easeOut);
    kabar(context, 'Form diisi dari riwayat. Periksa atau ubah, lalu tekan Kirim sekarang.');
  }

  Future<void> _tarik(Map<String, dynamic> p) async {
    final ok = await konfirmasi(context, 'Tarik pemberitahuan', 'Tarik "${teks(p['judul'])}"? Pemberitahuan tidak dikirim lagi ke perangkat yang belum menerimanya.', ya: 'Tarik');
    if (!ok || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminBroadcastTarik', [_t, teks(p['id'])]), teksProses: 'Menarik...');
    if (r.ok && mounted) setState(() => _versi++);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Broadcast')),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_versi),
        muat: () async => peta(await Api.instance('waAdminBroadcastDaftar', [_t])),
        bangun: (context, d, segarkan) {
          final rombel = daftar(d['rombel']).map(peta).toList();
          final peran = daftar(d['peran']).map(teks).toList();
          final pesan = daftar(d['pesan']).map(peta).toList();
          final pr = peta(d['perangkat']);
          return ListView(controller: _gulir, padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Card(
              color: cs.secondaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  'Pemberitahuan muncul dalam ±30 detik di aplikasi yang sedang terbuka (sebagai pesan dan notifikasi ponsel). '
                  'Bila aplikasi ditutup, ponsel Android memeriksa sekitar 15 menit sekali lalu menampilkannya di notifikasi. '
                  'Perangkat terdaftar: ${angka(pr['siswa'])} siswa · ${angka(pr['staf'])} staf.',
                  style: TextStyle(color: cs.onSecondaryContainer),
                ),
              ),
            ),
            const JudulBagian('Kirim pemberitahuan baru'),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  TextField(controller: _judul, maxLength: 100, decoration: const InputDecoration(labelText: 'Judul')),
                  TextField(controller: _isi, maxLength: 1000, minLines: 3, maxLines: 8, decoration: const InputDecoration(labelText: 'Isi pemberitahuan', alignLabelWithHint: true)),
                  const SizedBox(height: 4),
                  const Text('Penerima', style: TextStyle(fontWeight: FontWeight.w700)),
                  CheckboxListTile(contentPadding: EdgeInsets.zero, value: _siswa, onChanged: (v) => setState(() => _siswa = v ?? false), title: const Text('Siswa')),
                  if (_siswa) ...[
                    SwitchListTile(contentPadding: const EdgeInsets.only(left: 16), value: _semuaRombel, onChanged: (v) => setState(() => _semuaRombel = v), title: const Text('Semua rombel')),
                    if (!_semuaRombel)
                      Padding(
                        padding: const EdgeInsets.only(left: 16, bottom: 6),
                        child: Wrap(spacing: 6, runSpacing: 6, children: [
                          for (final r in rombel)
                            FilterChip(
                              label: Text(teks(r['nama'])),
                              selected: _rombel.contains(teks(r['id'])),
                              onSelected: (v) => setState(() => v ? _rombel.add(teks(r['id'])) : _rombel.remove(teks(r['id']))),
                            ),
                        ]),
                      ),
                  ],
                  CheckboxListTile(contentPadding: EdgeInsets.zero, value: _staf, onChanged: (v) => setState(() => _staf = v ?? false), title: const Text('Staf (tutor, kepala sekolah, admin, dll.)')),
                  if (_staf) ...[
                    SwitchListTile(contentPadding: const EdgeInsets.only(left: 16), value: _semuaPeran, onChanged: (v) => setState(() => _semuaPeran = v), title: const Text('Semua staf')),
                    if (!_semuaPeran)
                      Padding(
                        padding: const EdgeInsets.only(left: 16, bottom: 6),
                        child: Wrap(spacing: 6, runSpacing: 6, children: [
                          for (final x in peran)
                            FilterChip(
                              label: Text(x),
                              selected: _peran.contains(x),
                              onSelected: (v) => setState(() => v ? _peran.add(x) : _peran.remove(x)),
                            ),
                        ]),
                      ),
                  ],
                  const SizedBox(height: 6),
                  DropdownButtonFormField<int>(
                    initialValue: _hari,
                    decoration: const InputDecoration(labelText: 'Ditampilkan selama'),
                    items: [for (final h in const [1, 3, 7, 14, 30]) DropdownMenuItem(value: h, child: Text('$h hari'))],
                    onChanged: (v) => setState(() => _hari = v ?? 7),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _sekali,
                    onChanged: (v) => setState(() => _sekali = v),
                    title: const Text('Tampilkan hanya satu kali'),
                    subtitle: const Text('Tiap penerima melihatnya sekali. Setelah dibuka, tidak muncul lagi di kotak masuk agar tidak menumpuk.'),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                    onPressed: _kirim,
                    icon: const Icon(Icons.send_rounded),
                    label: const Text('Kirim sekarang'),
                  ),
                ]),
              ),
            ),
            JudulBagian('Riwayat', sub: '${pesan.length} pemberitahuan terakhir'),
            if (pesan.isEmpty) const Kosong(pesan: 'Belum ada pemberitahuan.', ikon: Icons.campaign_outlined),
            for (final p in pesan)
              Card(
                child: ListTile(
                  title: Text(teks(p['judul']), style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const SizedBox(height: 4),
                    Text(teks(p['isi']), maxLines: 3, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 6),
                    Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                      Lencana(teks(p['status']), warna: teks(p['status']) == 'Aktif' ? Colors.green : Colors.grey),
                      Text('${teks(p['waktu'])} · ${teks(p['penerima'])} · s/d ${teks(p['berlaku'])}', style: const TextStyle(fontSize: 12)),
                    ]),
                  ]),
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    IconButton(tooltip: 'Ulangi broadcast', icon: const Icon(Icons.replay_rounded), onPressed: () => _ulangi(p)),
                    if (teks(p['status']) == 'Aktif') IconButton(tooltip: 'Tarik', icon: const Icon(Icons.undo_rounded), onPressed: () => _tarik(p)),
                  ]),
                ),
              ),
          ]);
        },
      ),
    );
  }
}
