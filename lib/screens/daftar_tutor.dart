import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../widgets.dart';

/// Pendaftaran tutor mandiri: nama + email + centang mapel → kode OTP email → akun tutor + pengajuan mapel.
class DaftarTutorScreen extends StatefulWidget {
  const DaftarTutorScreen({super.key});

  @override
  State<DaftarTutorScreen> createState() => _DaftarTutorScreenState();
}

class _DaftarTutorScreenState extends State<DaftarTutorScreen> {
  Map<String, dynamic>? _info;
  String? _galatInfo;
  int _langkah = 1;
  final _nama = TextEditingController();
  final _email = TextEditingController();
  final _otp = TextEditingController();
  final Set<String> _pilih = {};
  String? _pesan;
  bool _info2 = false;
  bool _sibuk = false;
  String _sesi = '';
  String _emailMasked = '';
  int _jeda = 0;
  Timer? _timer;
  Map<String, dynamic> _hasil = {};

  @override
  void initState() {
    super.initState();
    _muat();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _muat() async {
    try {
      final r = peta(await Api.instance('waDaftarTutorInfo'));
      if (mounted) setState(() => _info = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _galatInfo = e.ramah);
    }
  }

  void _tampil(String t, {bool info = false}) => setState(() {
        _pesan = t;
        _info2 = info;
      });

  void _mulaiJeda(int d) {
    _timer?.cancel();
    setState(() => _jeda = d);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _jeda--);
      if (_jeda <= 0) t.cancel();
    });
  }

  Future<void> _mulai() async {
    setState(() => _pesan = null);
    if (_nama.text.trim().length < 3) return _tampil('Tulis nama lengkap (minimal 3 huruf, tanpa angka).');
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(_email.text.trim())) return _tampil('Alamat email tidak valid.');
    if (_pilih.isEmpty) return _tampil('Centang minimal satu mata pelajaran yang Anda ampu.');
    setState(() => _sibuk = true);
    try {
      final h = peta(await Api.instance('waDaftarTutorMulai', [
        {'nama': _nama.text.trim(), 'email': _email.text.trim(), 'mapel': _pilih.toList()}
      ]));
      if (!mounted) return;
      if (h['sukses'] != true) return _tampil(teks(h['pesan'], 'Pendaftaran gagal. Coba lagi.'));
      _sesi = teks(h['sesi']);
      _emailMasked = teks(h['emailMasked']);
      _otp.clear();
      setState(() => _langkah = 2);
      _mulaiJeda(45);
    } on ApiException catch (e) {
      if (mounted) _tampil('Terjadi kesalahan: ${e.ramah}');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Future<void> _kirimUlang() async {
    setState(() => _sibuk = true);
    try {
      final h = peta(await Api.instance('waDaftarTutorKirimUlang', [_sesi]));
      if (!mounted) return;
      if (h['sukses'] != true) return _tampil(teks(h['pesan'], 'Gagal mengirim ulang.'));
      _tampil('Kode baru sudah dikirim.', info: true);
      _mulaiJeda(45);
    } on ApiException catch (e) {
      if (mounted) _tampil('Terjadi kesalahan: ${e.ramah}');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Future<void> _verifikasi() async {
    final kode = _otp.text.replaceAll(RegExp(r'\D'), '');
    if (kode.length != 6) return _tampil('Kode verifikasi terdiri dari 6 angka.');
    setState(() => _sibuk = true);
    try {
      final h = peta(await Api.instance('waDaftarTutorVerifikasi', [_sesi, kode]));
      if (!mounted) return;
      if (h['sukses'] != true) {
        _tampil(teks(h['pesan'], 'Verifikasi gagal.'));
        if (h['ulang'] == true) setState(() => _langkah = 1);
        return;
      }
      _timer?.cancel();
      setState(() {
        _hasil = h;
        _langkah = 3;
        _pesan = null;
      });
    } on ApiException catch (e) {
      if (mounted) _tampil('Terjadi kesalahan: ${e.ramah}');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Widget _langkah1() {
    final cs = Theme.of(context).colorScheme;
    final paket = daftar(_info!['paket']).map(peta).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('Langkah 1 dari 2 - data diri dan mata pelajaran', style: TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 14),
      TextField(controller: _nama, maxLength: 80, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nama lengkap', counterText: '')),
      const SizedBox(height: 12),
      TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email', hintText: 'nama@gmail.com')),
      const SizedBox(height: 6),
      Text('Kode verifikasi 6 angka dikirim ke email ini.', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
      const SizedBox(height: 14),
      Text('Mata pelajaran yang Anda ampu (${_pilih.length} dipilih)', style: const TextStyle(fontWeight: FontWeight.w800)),
      Text('Pilihan ini menjadi pengajuan; mapel baru aktif setelah disetujui admin.', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
      for (final p in paket)
        Card(
          margin: const EdgeInsets.only(top: 8),
          child: ExpansionTile(
            shape: const Border(),
            title: Text(teks(p['nama'], teks(p['kode']).isEmpty ? 'Lainnya' : 'Paket ${teks(p['kode'])}'), style: const TextStyle(fontWeight: FontWeight.w700)),
            children: [
              for (final r in daftar(p['rombel']).map(peta)) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                  child: Align(alignment: Alignment.centerLeft, child: Text(teks(r['namaRombel']), style: TextStyle(fontWeight: FontWeight.w700, color: cs.primary))),
                ),
                for (final m in daftar(r['mapel']).map(peta))
                  CheckboxListTile(
                    dense: true,
                    value: _pilih.contains(teks(m['idMapel'])),
                    title: Text(teks(m['namaMapel'])),
                    onChanged: (v) => setState(() => v == true ? _pilih.add(teks(m['idMapel'])) : _pilih.remove(teks(m['idMapel']))),
                  ),
              ],
            ],
          ),
        ),
      const SizedBox(height: 16),
      FilledButton(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
        onPressed: _sibuk ? null : _mulai,
        child: _sibuk ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Kirim Kode ke Email'),
      ),
    ]);
  }

  Widget _langkah2() => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Langkah 2 dari 2 - verifikasi email', style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        Text('Kode 6 angka sudah dikirim ke $_emailMasked. Cek kotak masuk, dan folder Spam bila belum terlihat.'),
        const SizedBox(height: 16),
        TextField(
          controller: _otp,
          autofocus: true,
          keyboardType: TextInputType.number,
          textAlign: TextAlign.center,
          maxLength: 6,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          style: const TextStyle(fontSize: 28, letterSpacing: 12, fontWeight: FontWeight.w800),
          onSubmitted: (_) => _verifikasi(),
          decoration: const InputDecoration(labelText: 'Kode Verifikasi', counterText: ''),
        ),
        const SizedBox(height: 14),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: _sibuk ? null : _verifikasi,
          child: const Text('Verifikasi dan Daftar'),
        ),
        const SizedBox(height: 8),
        OutlinedButton(onPressed: _sibuk || _jeda > 0 ? null : _kirimUlang, child: Text(_jeda > 0 ? 'Kirim ulang kode ($_jeda dtk)' : 'Kirim ulang kode')),
        TextButton(onPressed: () => setState(() => _langkah = 1), child: const Text('Ubah data / email')),
      ]);

  Widget _langkah3() {
    final kode = teks(_hasil['kodeAkses']);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Icon(Icons.verified_rounded, color: Colors.green, size: 72),
      const Text('Pendaftaran berhasil', textAlign: TextAlign.center, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.green)),
      const SizedBox(height: 8),
      Text(teks(_hasil['nama']), textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
      Text('${angka(_hasil['jumlah'])} mata pelajaran diajukan ke admin.', textAlign: TextAlign.center),
      const SizedBox(height: 16),
      const Text('Kode Akses Anda untuk masuk (bersama nama lengkap):'),
      Container(
        margin: const EdgeInsets.only(top: 6),
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHigh, borderRadius: BorderRadius.circular(14)),
        child: SelectableText(kode, textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: 2)),
      ),
      TextButton.icon(
        onPressed: () async {
          await Clipboard.setData(ClipboardData(text: kode));
          if (mounted) kabar(context, 'Kode akses disalin.');
        },
        icon: const Icon(Icons.copy_rounded),
        label: const Text('Salin kode'),
      ),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: const Color(0xFFFFF4DB), borderRadius: BorderRadius.circular(14)),
        child: const Text('Simpan Kode Akses ini sekarang. Mapel akan muncul setelah admin menyetujui pengajuan Anda.', style: TextStyle(color: Colors.black87)),
      ),
      const SizedBox(height: 16),
      FilledButton(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
        onPressed: () => Navigator.pop(context, {'nama': teks(_hasil['nama']), 'kode': kode}),
        child: const Text('Masuk ke E-Course TH'),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    Widget isi;
    if (_galatInfo != null) {
      isi = PesanGalat(pesan: _galatInfo!, ulangi: () {
        setState(() => _galatInfo = null);
        _muat();
      });
    } else if (_info == null) {
      isi = const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()));
    } else if (_info!['terbuka'] != true && _langkah == 1) {
      isi = const Kosong(pesan: 'Pendaftaran tutor sedang ditutup. Hubungi admin.', ikon: Icons.lock_outline_rounded);
    } else {
      isi = _langkah == 1 ? _langkah1() : (_langkah == 2 ? _langkah2() : _langkah3());
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Daftar sebagai Tutor')),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 32), children: [
        if (_pesan != null)
          Container(
            margin: const EdgeInsets.only(bottom: 14),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: _info2 ? cs.primaryContainer : cs.errorContainer, borderRadius: BorderRadius.circular(14)),
            child: Text(_pesan!, style: TextStyle(color: _info2 ? cs.onPrimaryContainer : cs.onErrorContainer)),
          ),
        isi,
      ]),
    );
  }
}
