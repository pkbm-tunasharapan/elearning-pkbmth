import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../widgets.dart';
import 'sesi_siswa.dart';

/// v1.39.0: membuat / mengganti PIN 6 angka warga belajar.
/// [wajib] = true: masa tenggang habis atau PIN di-reset; layar tidak bisa ditutup (hanya bisa keluar akun).
class BuatPinScreen extends StatefulWidget {
  const BuatPinScreen({super.key, this.wajib = false});
  final bool wajib;

  @override
  State<BuatPinScreen> createState() => _BuatPinScreenState();
}

class _BuatPinScreenState extends State<BuatPinScreen> {
  final _lama = TextEditingController();
  final _pin = TextEditingController();
  final _ulang = TextEditingController();
  bool _sibuk = false;
  bool _lihat = false;
  String? _galat;

  bool get _ganti => SesiSiswa.instance.punyaPin;

  @override
  void dispose() {
    _lama.dispose();
    _pin.dispose();
    _ulang.dispose();
    super.dispose();
  }

  Future<void> _simpan() async {
    final pin = _pin.text.trim(), ulang = _ulang.text.trim();
    String? g;
    if (_ganti && _lama.text.trim().length != 6) g = 'Isi PIN lama (6 angka).';
    if (g == null && pin.length != 6) g = 'PIN harus 6 angka.';
    if (g == null && pin != ulang) g = 'Ulangi PIN tidak sama. Ketik ulang dengan teliti.';
    if (g != null) {
      setState(() => _galat = g);
      return;
    }
    setState(() {
      _sibuk = true;
      _galat = null;
    });
    try {
      final hasil = await SesiSiswa.instance.buatPin(pin, _ganti ? _lama.text.trim() : '');
      if (!mounted) return;
      if (hasil != null) {
        setState(() => _galat = hasil);
        return;
      }
      kabar(context, _ganti ? 'PIN berhasil diganti.' : 'PIN berhasil dibuat. Mulai sekarang masuk dengan nama dan PIN ini.');
      if (Navigator.of(context).canPop()) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    } catch (e) {
      if (mounted) setState(() => _galat = '$e');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Widget _kolom(TextEditingController c, String label, {bool fokus = false}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: c,
          autofocus: fokus,
          obscureText: !_lihat,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
          style: const TextStyle(fontSize: 22, letterSpacing: 8, fontWeight: FontWeight.w800),
          decoration: InputDecoration(labelText: label, counterText: ''),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final st = SesiSiswa.instance.pin;
    return PopScope(
      canPop: !widget.wajib,
      child: Scaffold(
        appBar: AppBar(
          automaticallyImplyLeading: !widget.wajib,
          title: Text(_ganti ? 'Ganti PIN' : 'Buat PIN'),
          actions: [
            if (widget.wajib)
              TextButton(onPressed: _sibuk ? null : () => SesiSiswa.instance.keluar(), child: const Text('Keluar')),
          ],
        ),
        body: ListView(padding: const EdgeInsets.fromLTRB(20, 16, 20, 32), children: [
          Icon(Icons.lock_person_rounded, size: 56, color: cs.primary),
          const SizedBox(height: 12),
          Text(
            widget.wajib
                ? (st['reset'] == true ? 'PIN Anda sudah di-reset. Buat PIN baru untuk melanjutkan.' : 'Masa tenggang sudah habis. Buat PIN untuk melanjutkan belajar.')
                : _ganti
                    ? 'Masukkan PIN lama, lalu PIN baru.'
                    : 'Buat PIN 6 angka agar akun Anda aman.',
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
          ),
          const SizedBox(height: 8),
          Text(
            'Setelah PIN dibuat, masuk aplikasi dengan nama lengkap dan PIN ini (kata sandi TH- tanggal lahir tidak berlaku lagi). '
            'PIN juga diminta saat memulai ujian. Jangan beri tahu PIN kepada siapa pun. Lupa PIN? Minta tutor atau admin me-reset.',
            textAlign: TextAlign.center,
            style: TextStyle(color: cs.onSurfaceVariant, fontSize: 13),
          ),
          const SizedBox(height: 20),
          if (_ganti) _kolom(_lama, 'PIN lama', fokus: true),
          _kolom(_pin, 'PIN baru (6 angka)', fokus: !_ganti),
          _kolom(_ulang, 'Ulangi PIN baru'),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => setState(() => _lihat = !_lihat),
              icon: Icon(_lihat ? Icons.visibility_off_rounded : Icons.visibility_rounded, size: 18),
              label: Text(_lihat ? 'Sembunyikan PIN' : 'Lihat PIN'),
            ),
          ),
          Text('Hindari PIN mudah ditebak seperti 123456, 111111, atau tanggal lahir.', style: TextStyle(fontSize: 12, color: cs.outline)),
          if (_galat != null)
            Container(
              margin: const EdgeInsets.only(top: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: cs.errorContainer, borderRadius: BorderRadius.circular(14)),
              child: Text(_galat!, style: TextStyle(color: cs.onErrorContainer)),
            ),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: _sibuk ? null : _simpan,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            icon: _sibuk ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.check_rounded),
            label: Text(_ganti ? 'Simpan PIN baru' : 'Simpan PIN'),
          ),
        ]),
      ),
    );
  }
}

/// Spanduk di beranda siswa: ajakan membuat PIN selama masa tenggang.
class SpandukPin extends StatelessWidget {
  const SpandukPin({super.key});

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: SesiSiswa.instance, builder: (context, _) => _isi(context));

  Widget _isi(BuildContext context) {
    final st = SesiSiswa.instance.pin;
    if (st['perlu'] != true) return const SizedBox.shrink();
    final sisa = angka(st['sisaHari']);
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Material(
        color: sisa <= 2 ? cs.errorContainer : const Color(0xFFFFF4D6),
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BuatPinScreen())),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              Icon(Icons.lock_clock_rounded, color: sisa <= 2 ? cs.onErrorContainer : const Color(0xFF8A5A00), size: 30),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Segera buat PIN', style: TextStyle(fontWeight: FontWeight.w800)),
                  Text(
                    sisa > 0 ? 'Sisa $sisa hari. Setelah itu PIN wajib dibuat sebelum bisa belajar.' : 'Hari ini hari terakhir. Buat PIN sekarang.',
                    style: const TextStyle(fontSize: 12.5),
                  ),
                ]),
              ),
              const Icon(Icons.chevron_right_rounded),
            ]),
          ),
        ),
      ),
    );
  }
}
