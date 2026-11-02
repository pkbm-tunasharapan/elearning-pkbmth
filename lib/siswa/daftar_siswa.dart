import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../widgets.dart';

/// Pendaftaran siswa baru (sama dengan halaman Daftar di web): data diri → kode OTP email → akun jadi.
class DaftarSiswaScreen extends StatefulWidget {
  const DaftarSiswaScreen({super.key});

  @override
  State<DaftarSiswaScreen> createState() => _DaftarSiswaScreenState();
}

class _DaftarSiswaScreenState extends State<DaftarSiswaScreen> {
  int _langkah = 1;
  final _nama = TextEditingController();
  final _email = TextEditingController();
  final _otp = TextEditingController();
  DateTime? _lahir;
  String _rombel = '';
  List<Map<String, dynamic>>? _daftarRombel;
  String? _galatRombel;
  String? _pesan;
  bool _pesanInfo = false;
  bool _sibuk = false;
  String _sesi = '';
  String _emailMasked = '';
  int _jeda = 0;
  Timer? _timer;
  Map<String, dynamic> _hasil = {};

  @override
  void initState() {
    super.initState();
    _muatRombel();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _nama.dispose();
    _email.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _muatRombel() async {
    try {
      final d = peta(await Api.instance('waDaftarRombel'));
      final rb = daftar(d['rombel']).map(peta).toList()..sort((a, b) => teks(a['nama']).compareTo(teks(b['nama'])));
      if (mounted) setState(() => _daftarRombel = rb);
    } on ApiException catch (_) {
      if (mounted) setState(() => _galatRombel = 'Gagal memuat kelas. Coba lagi.');
    }
  }

  void _galat(String t, {bool info = false}) => setState(() {
        _pesan = t;
        _pesanInfo = info;
      });

  void _mulaiJeda(int detik) {
    _timer?.cancel();
    setState(() => _jeda = detik);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _jeda--);
      if (_jeda <= 0) t.cancel();
    });
  }

  String _isoLahir() =>
      _lahir == null ? '' : '${_lahir!.year}-${_lahir!.month.toString().padLeft(2, '0')}-${_lahir!.day.toString().padLeft(2, '0')}';

  Future<void> _mulai() async {
    setState(() => _pesan = null);
    final nama = _nama.text.trim(), email = _email.text.trim();
    if (nama.length < 3) return _galat('Tulis nama lengkap Anda.');
    if (_lahir == null) return _galat('Pilih tanggal lahir Anda.');
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(email)) return _galat('Alamat email belum benar.');
    if (_rombel.isEmpty) return _galat('Pilih kelas (rombel) Anda.');
    setState(() => _sibuk = true);
    try {
      final h = peta(await Api.instance('waDaftarMulai', [
        {'nama': nama, 'tanggalLahir': _isoLahir(), 'email': email, 'idRombel': _rombel}
      ]));
      if (!mounted) return;
      if (h['sukses'] != true) return _galat(teks(h['pesan'], 'Pendaftaran gagal. Coba lagi.'));
      _sesi = teks(h['sesi']);
      _emailMasked = teks(h['emailMasked']);
      _otp.clear();
      setState(() => _langkah = 2);
      _mulaiJeda(45);
    } on ApiException catch (e) {
      if (mounted) _galat('Terjadi kesalahan: ${e.ramah}');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Future<void> _kirimUlang() async {
    setState(() {
      _pesan = null;
      _sibuk = true;
    });
    try {
      final h = peta(await Api.instance('waDaftarKirimUlang', [_sesi]));
      if (!mounted) return;
      if (h['sukses'] != true) return _galat(teks(h['pesan'], 'Gagal mengirim ulang.'));
      _galat('Kode baru sudah dikirim.', info: true);
      _mulaiJeda(45);
    } on ApiException catch (e) {
      if (mounted) _galat('Terjadi kesalahan: ${e.ramah}');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Future<void> _verifikasi() async {
    setState(() => _pesan = null);
    final kode = _otp.text.replaceAll(RegExp(r'\D'), '');
    if (kode.length != 6) return _galat('Kode verifikasi terdiri dari 6 angka.');
    setState(() => _sibuk = true);
    try {
      final h = peta(await Api.instance('waDaftarVerifikasi', [_sesi, kode]));
      if (!mounted) return;
      if (h['sukses'] != true) {
        _galat(teks(h['pesan'], 'Verifikasi gagal.'));
        if (h['ulang'] == true) setState(() => _langkah = 1);
        return;
      }
      _timer?.cancel();
      setState(() {
        _hasil = h;
        _langkah = 3;
      });
    } on ApiException catch (e) {
      if (mounted) _galat('Terjadi kesalahan: ${e.ramah}');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Widget _petunjuk(String t) => Padding(
        padding: const EdgeInsets.only(top: 6, bottom: 14),
        child: Text(t, style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant, height: 1.4)),
      );

  Widget _langkah1() {
    final rb = _daftarRombel;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('Langkah 1 dari 2 - isi data diri', style: TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 14),
      TextField(controller: _nama, maxLength: 80, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nama Lengkap', counterText: '')),
      _petunjuk('Penting: tulis nama persis seperti di data kependudukan (KTP/Kartu Keluarga/akta lahir), tanpa singkatan atau nama panggilan. '
          'Jika nama Anda sudah ada di daftar kelas, Anda hanya perlu memverifikasi email.'),
      InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () async {
          final kini = DateTime.now();
          final t = await showDatePicker(
            context: context,
            initialDate: _lahir ?? DateTime(kini.year - 16),
            firstDate: DateTime(1940),
            lastDate: kini,
            helpText: 'Tanggal lahir',
          );
          if (t != null) setState(() => _lahir = t);
        },
        child: InputDecorator(
          decoration: const InputDecoration(labelText: 'Tanggal Lahir', suffixIcon: Icon(Icons.calendar_month_rounded)),
          child: Text(_lahir == null ? 'Pilih tanggal' : '${_lahir!.day.toString().padLeft(2, '0')}-${_lahir!.month.toString().padLeft(2, '0')}-${_lahir!.year}'),
        ),
      ),
      _petunjuk('Tanggal lahir ini menjadi kata sandi Anda saat masuk, dengan format TH-ddmmyyyy (contoh lahir 3 Maret 2009: TH-03032009).'),
      TextField(controller: _email, maxLength: 120, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email', hintText: 'nama@gmail.com', counterText: '')),
      _petunjuk('Kode verifikasi 6 angka akan dikirim ke email ini. Pakai email yang aktif dan bisa Anda buka sekarang. Kode ini hanya diminta sekali, saat mendaftar.'),
      if (rb == null && _galatRombel == null)
        const LinearProgressIndicator()
      else
        DropdownButtonFormField<String>(
          initialValue: _rombel.isEmpty ? null : _rombel,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Kelas (Rombel)'),
          hint: Text(_galatRombel ?? ((rb ?? []).isEmpty ? 'Belum ada kelas yang membuka pendaftaran' : '- Pilih kelas -')),
          items: [for (final r in rb ?? <Map<String, dynamic>>[]) DropdownMenuItem(value: teks(r['idRombel']), child: Text(teks(r['nama'])))],
          onChanged: (v) => setState(() => _rombel = v ?? ''),
        ),
      _petunjuk((rb != null && rb.isEmpty)
          ? 'Pendaftaran belum dibuka untuk kelas mana pun. Hubungi tutor atau admin.'
          : 'Pilih kelas Anda. Bila kelas Anda belum muncul, pendaftarannya belum dibuka; tanyakan ke tutor atau admin.'),
      FilledButton(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
        onPressed: _sibuk ? null : _mulai,
        child: _sibuk ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Kirim Kode ke Email'),
      ),
      const SizedBox(height: 8),
      TextButton(onPressed: () => Navigator.pop(context), child: const Text('Sudah punya akun? Masuk di sini')),
    ]);
  }

  Widget _langkah2() {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('Langkah 2 dari 2 - verifikasi email', style: TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 10),
      Text.rich(TextSpan(children: [
        const TextSpan(text: 'Kode 6 angka sudah dikirim ke '),
        TextSpan(text: _emailMasked, style: const TextStyle(fontWeight: FontWeight.w800)),
        const TextSpan(text: '. Cek kotak masuk, dan folder Spam bila belum terlihat. Kode berlaku 10 menit.'),
      ])),
      const SizedBox(height: 16),
      TextField(
        controller: _otp,
        autofocus: true,
        keyboardType: TextInputType.number,
        textAlign: TextAlign.center,
        maxLength: 6,
        autofillHints: const [AutofillHints.oneTimeCode],
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        style: const TextStyle(fontSize: 28, letterSpacing: 12, fontWeight: FontWeight.w800),
        onSubmitted: (_) => _verifikasi(),
        decoration: const InputDecoration(labelText: 'Kode Verifikasi', hintText: '------', counterText: ''),
      ),
      const SizedBox(height: 14),
      FilledButton(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
        onPressed: _sibuk ? null : _verifikasi,
        child: _sibuk ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Verifikasi dan Daftar'),
      ),
      const SizedBox(height: 8),
      OutlinedButton(
        onPressed: _sibuk || _jeda > 0 ? null : _kirimUlang,
        child: Text(_jeda > 0 ? 'Kirim ulang kode ($_jeda dtk)' : 'Kirim ulang kode'),
      ),
      TextButton(
        onPressed: () {
          _timer?.cancel();
          setState(() {
            _pesan = null;
            _sesi = '';
            _langkah = 1;
          });
        },
        child: const Text('Ubah data / email'),
      ),
    ]);
  }

  Widget _langkah3() {
    final kode = teks(_hasil['kodeAkses']);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Icon(Icons.verified_rounded, color: Colors.green, size: 72),
      const SizedBox(height: 8),
      const Text('Pendaftaran berhasil', textAlign: TextAlign.center, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.green)),
      const SizedBox(height: 8),
      Text(teks(_hasil['nama']), textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
      Text('Kelas: ${teks(_hasil['namaRombel'])}', textAlign: TextAlign.center),
      const SizedBox(height: 16),
      const Text('Kata Sandi Anda untuk masuk (bersama nama lengkap):'),
      _kotakBesar(teks(_hasil['kataSandi'])),
      const SizedBox(height: 12),
      const Text('Kode Akses Anda (diminta saat mengirim jawaban, diskusi, dan ujian):'),
      _kotakBesar(kode),
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
        child: const Text(
          'Simpan Kode Akses ini sekarang (catat atau tangkap layar). Kode tidak ditampilkan lagi; bila hilang, minta tutor untuk melihatnya di data siswa.\n'
          'Untuk masuk berikutnya: tulis nama lengkap dan kata sandi TH- diikuti tanggal lahir (ddmmyyyy). Kode verifikasi email tidak diminta lagi.',
          style: TextStyle(color: Colors.black87, height: 1.4),
        ),
      ),
      const SizedBox(height: 16),
      FilledButton(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
        onPressed: () => Navigator.pop(context, {'nama': teks(_hasil['nama']), 'kataSandi': teks(_hasil['kataSandi'])}),
        child: const Text('Masuk ke E-Course TH'),
      ),
    ]);
  }

  Widget _kotakBesar(String t) => Container(
        margin: const EdgeInsets.only(top: 6),
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHigh, borderRadius: BorderRadius.circular(14)),
        child: SelectableText(t, textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: 2)),
      );

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return PopScope(
      canPop: _langkah != 2,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _langkah == 2) setState(() => _langkah = 1);
      },
      child: Scaffold(
        appBar: AppBar(title: const Text('Daftar Siswa Baru')),
        body: ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 32), children: [
          if (_pesan != null)
            Container(
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: _pesanInfo ? cs.primaryContainer : cs.errorContainer, borderRadius: BorderRadius.circular(14)),
              child: Text(_pesan!, style: TextStyle(color: _pesanInfo ? cs.onPrimaryContainer : cs.onErrorContainer)),
            ),
          if (_langkah == 1) _langkah1() else if (_langkah == 2) _langkah2() else _langkah3(),
        ]),
      ),
    );
  }
}
