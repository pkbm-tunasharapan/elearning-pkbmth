import 'dart:convert';

import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';
import 'umum.dart';

String? get _t => Sesi.instance.token;

/// Admin: lokasi sekretariat, radius, akurasi GPS, masa berlaku kode darurat, foto acuan area Front Office.
class AturAbsensiScreen extends StatefulWidget {
  const AturAbsensiScreen({super.key});

  @override
  State<AturAbsensiScreen> createState() => _AturAbsensiScreenState();
}

class _AturAbsensiScreenState extends State<AturAbsensiScreen> {
  Map<String, dynamic>? _d;
  String? _galat;
  final _lat = TextEditingController();
  final _lng = TextEditingController();
  final _radius = TextEditingController();
  final _akurasi = TextEditingController();
  final _menit = TextEditingController();
  String? _info;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  void _isi(Map<String, dynamic> d) {
    final a = peta(d['aturan']);
    _lat.text = a['lat'] == null ? '' : '${a['lat']}';
    _lng.text = a['lng'] == null ? '' : '${a['lng']}';
    _radius.text = '${a['radius'] ?? 30}';
    _akurasi.text = '${a['akurasi'] ?? 30}';
    _menit.text = '${a['kodeMenit'] ?? 240}';
  }

  Future<void> _muat() async {
    try {
      final d = peta(await Api.instance('waAdminAbsenAtur', [_t]));
      _isi(d);
      if (mounted) setState(() { _d = d; _galat = null; });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  Future<void> _ambilLokasi() async {
    setState(() => _info = 'Membaca lokasi...');
    try {
      final p = await lokasiAkurat(info: (s) { if (mounted) setState(() => _info = s); }, cukup: 8);
      setState(() {
        _lat.text = p.latitude.toStringAsFixed(7);
        _lng.text = p.longitude.toStringAsFixed(7);
        _info = 'Lokasi terbaca (±${p.accuracy.round()} m). Tekan Simpan.';
      });
    } on ApiException catch (e) {
      setState(() => _info = e.ramah);
    }
  }

  Future<void> _simpan() async {
    final r = await jalankan(context, () async => peta(await Api.instance('waAdminAbsenAturSimpan', [
          _t,
          {
            if (_lat.text.trim().isNotEmpty) 'lat': double.tryParse(_lat.text.trim()),
            if (_lng.text.trim().isNotEmpty) 'lng': double.tryParse(_lng.text.trim()),
            'radius': num.tryParse(_radius.text.trim()),
            'akurasi': num.tryParse(_akurasi.text.trim()),
            'kodeMenit': num.tryParse(_menit.text.trim()),
          }
        ])), teksProses: 'Menyimpan...');
    if (r.ok && mounted) { kabar(context, 'Pengaturan absensi tersimpan.'); _muat(); }
  }

  Future<void> _tambahAcuan() async {
    final f = await ambilFoto(bolehGaleri: true, context: context);
    if (f == null || !mounted) return;
    final r = await jalankan(context, () async => peta(await Api.instance('waAdminAbsenAcuanTambah', [_t, f], const Duration(seconds: 120))), teksProses: 'Mengunggah foto acuan...');
    if (r.ok && mounted) setState(() => _d = r.data);
  }

  Future<void> _hapusAcuan(String id) async {
    if (!await konfirmasi(context, 'Hapus foto acuan ini?', '', ya: 'Hapus')) return;
    if (!mounted) return;
    final r = await jalankan(context, () async => peta(await Api.instance('waAdminAbsenAcuanHapus', [_t, id])), teksProses: 'Menghapus...');
    if (r.ok && mounted) setState(() => _d = r.data);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    if (_galat != null) return PesanGalat(pesan: _galat!, ulangi: _muat);
    final d = _d;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final sim = peta(d['sim']);
    final acuan = daftar(d['acuan']).map(peta).toList();
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
      Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Dari Pengaturan Lembaga (Data Induk)', style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text('Jam absensi ${teks(sim['jamBuka'], '-')}–${teks(sim['jamTutup'], '-')} · Absensi ${sim['aktif'] == true ? 'aktif' : 'nonaktif'} · Kode Buka ${teks(sim['kodeBuka']).isEmpty ? 'tidak dipakai' : 'diisi'}'),
            Text('TP ${teks(sim['tahun'])} ${teks(sim['semester'])} · Honor per hadir Rp${teks(sim['honor'])}'),
          ]),
        ),
      ),
      const JudulBagian('Lokasi sekretariat (absen selfie Kepala Sekolah)'),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Berdirilah di area Front Office, lalu tekan "Ambil lokasi saat ini" agar koordinat seakurat mungkin.', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: TextField(controller: _lat, keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true), decoration: const InputDecoration(labelText: 'Lintang', isDense: true))),
              const SizedBox(width: 8),
              Expanded(child: TextField(controller: _lng, keyboardType: const TextInputType.numberWithOptions(decimal: true, signed: true), decoration: const InputDecoration(labelText: 'Bujur', isDense: true))),
            ]),
            const SizedBox(height: 8),
            OutlinedButton.icon(onPressed: _ambilLokasi, icon: const Icon(Icons.my_location_rounded), label: const Text('Ambil lokasi saat ini')),
            if (_info != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_info!, style: const TextStyle(fontSize: 12.5))),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: TextField(controller: _radius, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Radius (m)', isDense: true))),
              const SizedBox(width: 8),
              Expanded(child: TextField(controller: _akurasi, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Batas akurasi GPS (m)', isDense: true))),
            ]),
            const SizedBox(height: 8),
            TextField(controller: _menit, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Masa berlaku kode darurat FO (menit)', isDense: true)),
            const SizedBox(height: 12),
            FilledButton(onPressed: _simpan, child: const Text('Simpan')),
          ]),
        ),
      ),
      JudulBagian('Foto acuan area Front Office', sub: '${acuan.length}/4'),
      Text('Dipakai untuk memeriksa otomatis (AI) apakah latar selfie Kepala Sekolah benar di area Front Office. Foto yang tidak cocok ditandai "Perlu dicek" untuk Ketua Yayasan.',
          style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final a in acuan)
          Stack(children: [
            ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.memory(base64Decode(teks(a['dataUrl']).split(',').last), width: 140, height: 140, fit: BoxFit.cover)),
            Positioned(right: 0, top: 0, child: IconButton.filledTonal(onPressed: () => _hapusAcuan(teks(a['id'])), icon: const Icon(Icons.delete_rounded, size: 18))),
          ]),
        if (acuan.length < 4)
          InkWell(
            onTap: _tambahAcuan,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              width: 140,
              height: 140,
              decoration: BoxDecoration(border: Border.all(color: cs.outline), borderRadius: BorderRadius.circular(12)),
              child: const Column(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.add_a_photo_rounded), SizedBox(height: 6), Text('Tambah foto')]),
            ),
          ),
      ]),
    ]);
  }
}
