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
  // v1.40.2: langkah 0 = cek NISN/NIK + tanggal lahir ke Data Induk (cegah data ganda)
  int _langkah = 0;
  final _nomor = TextEditingController();
  Map<String, dynamic>? _idt;
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
    _nomor.dispose();
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
    final idt = _idt;
    if (idt == null && nama.length < 3) return _galat('Tulis nama lengkap Anda.');
    if (idt == null && _lahir == null) return _galat('Pilih tanggal lahir Anda.');
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(email)) return _galat('Alamat email belum benar.');
    if (idt == null && _rombel.isEmpty) return _galat('Pilih kelas (rombel) Anda.');
    setState(() => _sibuk = true);
    try {
      final h = peta(await Api.instance('waDaftarMulai', [
        idt != null ? {'kunciIdentitas': teks(idt['kunci']), 'email': email} : {'nama': nama, 'tanggalLahir': _isoLahir(), 'email': email, 'idRombel': _rombel}
      ]));
      if (!mounted) return;
      if (h['sukses'] != true) {
        _galat(teks(h['pesan'], 'Pendaftaran gagal. Coba lagi.'));
        if (h['mirip'] == true) setState(() => _langkah = 0);
        return;
      }
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

  Future<void> _cekIdentitas() async {
    setState(() => _pesan = null);
    final nomor = _nomor.text.replaceAll(RegExp(r'\D'), '');
    if (nomor.length < 8) return _galat('Tulis NISN (10 angka) atau NIK (16 angka).');
    if (_lahir == null) return _galat('Pilih tanggal lahir Anda.');
    setState(() => _sibuk = true);
    try {
      final h = peta(await Api.instance('waDaftarCekIdentitas', [{'nomor': nomor, 'tanggalLahir': _isoLahir()}]));
      if (!mounted) return;
      if (h['ada'] != true) return _galat(teks(h['pesan'], 'Data tidak ditemukan.'));
      if (h['sudahAkun'] == true) {
        _galat(teks(h['pesan']), info: true);
        setState(() => _idt = null);
        return;
      }
      setState(() {
        _idt = h;
        _langkah = 1;
      });
    } on ApiException catch (e) {
      if (mounted) _galat('Terjadi kesalahan: ${e.ramah}');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Widget _tanggalLahir() => InkWell(
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
      );

  Widget _langkah0() {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('Cari data Anda di sekolah', style: TextStyle(fontWeight: FontWeight.w700)),
      _petunjuk('Bila Anda sudah tercatat di PKBM, isi NISN atau NIK beserta tanggal lahir. Nama dan kelas diambil otomatis dari data sekolah, '
          'jadi tidak perlu diketik dan tidak akan tercatat ganda.'),
      TextField(
        controller: _nomor,
        keyboardType: TextInputType.number,
        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(16)],
        decoration: const InputDecoration(labelText: 'NISN atau NIK', hintText: '10 angka (NISN) / 16 angka (NIK)'),
      ),
      const SizedBox(height: 12),
      _tanggalLahir(),
      const SizedBox(height: 16),
      FilledButton(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
        onPressed: _sibuk ? null : _cekIdentitas,
        child: _sibuk ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Cari data saya'),
      ),
      const SizedBox(height: 8),
      OutlinedButton(
        onPressed: _sibuk
            ? null
            : () => setState(() {
                  _idt = null;
                  _pesan = null;
                  _langkah = 1;
                }),
        child: const Text('Saya siswa baru / belum punya NISN atau NIK'),
      ),
      TextButton(onPressed: () => Navigator.pop(context), child: const Text('Sudah punya akun? Masuk di sini')),
    ]);
  }

  Widget _petunjuk(String t) => Padding(
        padding: const EdgeInsets.only(top: 6, bottom: 14),
        child: Text(t, style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant, height: 1.4)),
      );

  Widget _langkah1() {
    final rb = _daftarRombel;
    final idt = _idt;
    if (idt != null) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Langkah 1 dari 2 - data Anda ditemukan', style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        Card(
          child: ListTile(
            leading: const Icon(Icons.verified_user_rounded, color: Colors.green),
            title: Text(teks(idt['namaSamar']), style: const TextStyle(fontWeight: FontWeight.w800)),
            subtitle: Text('Kelas ${teks(idt['rombel'])} · data dari sekolah'),
          ),
        ),
        _petunjuk('Benar ini data Anda? Bila bukan, tekan "Bukan saya" dan periksa NISN/NIK serta tanggal lahir.'),
        TextField(controller: _email, maxLength: 120, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email', hintText: 'nama@gmail.com', counterText: '')),
        _petunjuk('Kode verifikasi 6 angka akan dikirim ke email ini. Kata sandi masuk: TH- diikuti tanggal lahir (ddmmyyyy).'),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: _sibuk ? null : _mulai,
          child: _sibuk ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Ini saya · Kirim Kode ke Email'),
        ),
        TextButton(
            onPressed: () => setState(() {
                  _idt = null;
                  _langkah = 0;
                }),
            child: const Text('Bukan saya')),
      ]);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('Langkah 1 dari 2 - isi data diri', style: TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 14),
      TextField(controller: _nama, maxLength: 80, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nama Lengkap', counterText: '')),
      _petunjuk('Penting: tulis nama persis seperti di data kependudukan (KTP/Kartu Keluarga/akta lahir), tanpa singkatan atau nama panggilan. '
          'Jika nama Anda sudah ada di daftar kelas, Anda hanya perlu memverifikasi email.'),
      _tanggalLahir(),
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
      TextButton(onPressed: () => setState(() => _langkah = 0), child: const Text('Kembali: cari data dengan NISN/NIK')),
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
            _langkah = _idt == null ? 1 : 1;
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
        child: const Text('Masuk ke TH.E-Course'),
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
      canPop: _langkah == 0 || _langkah == 3,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(() => _langkah = _langkah == 2 ? 1 : 0);
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
          if (_langkah == 0) _langkah0() else if (_langkah == 1) _langkah1() else if (_langkah == 2) _langkah2() else _langkah3(),
        ]),
      ),
    );
  }
}
