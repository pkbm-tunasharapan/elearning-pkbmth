import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

/// Buka susulan massal (admin): membuka SEMUA absensi, diskusi, dan ujian yang sudah terlewat
/// untuk satu/beberapa/semua rombel sampai waktu tertentu, agar siswa bisa memperbaiki yang tertinggal.
class SusulanMassalScreen extends StatefulWidget {
  const SusulanMassalScreen({super.key});

  @override
  State<SusulanMassalScreen> createState() => _SusulanMassalScreenState();
}

class _SusulanMassalScreenState extends State<SusulanMassalScreen> {
  int _versi = 0;
  bool _semua = true;
  final Set<String> _pilih = {};
  DateTime _sampai = _bawaan(7);
  final _alasan = TextEditingController();

  static DateTime _bawaan(int hari) {
    final n = DateTime.now().add(Duration(days: hari));
    return DateTime(n.year, n.month, n.day, 23, 59);
  }

  @override
  void dispose() {
    _alasan.dispose();
    super.dispose();
  }

  String _dua(int x) => x.toString().padLeft(2, '0');
  String _iso(DateTime d) => '${d.year}-${_dua(d.month)}-${_dua(d.day)} ${_dua(d.hour)}:${_dua(d.minute)}';
  String _tampil(DateTime d) {
    const bln = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return '${d.day} ${bln[d.month - 1]} ${d.year}, pukul ${_dua(d.hour)}:${_dua(d.minute)}';
  }

  Future<void> _pilihWaktu(int maksHari) async {
    final n = DateTime.now();
    final tgl = await showDatePicker(context: context, firstDate: n, lastDate: n.add(Duration(days: maksHari)), initialDate: _sampai.isBefore(n) ? n : _sampai);
    if (tgl == null || !mounted) return;
    final jam = await showTimePicker(context: context, initialTime: TimeOfDay(hour: _sampai.hour, minute: _sampai.minute));
    if (!mounted) return;
    setState(() => _sampai = DateTime(tgl.year, tgl.month, tgl.day, jam?.hour ?? 23, jam?.minute ?? 59));
  }

  Future<void> _mulai(List<Map<String, dynamic>> rombel) async {
    if (!_semua && _pilih.isEmpty) {
      kabar(context, 'Pilih minimal satu rombel.', galat: true);
      return;
    }
    final cakupan = _semua ? 'semua rombel' : rombel.where((r) => _pilih.contains(teks(r['id']))).map((r) => teks(r['nama'])).join(', ');
    final ok = await konfirmasi(
      context,
      'Buka susulan massal',
      'Semua absensi, diskusi, dan ujian yang sudah terlewat untuk $cakupan akan dibuka sampai ${_tampil(_sampai)}.\n\n'
          'Ujian terjadwal (UTS/UAS) dibuka sebagai ujian susulan untuk siswa yang belum mengerjakan. '
          'Bila ada masa susulan yang masih berjalan, masa itu diganti dengan yang baru. Lanjutkan?',
      ya: 'Buka',
    );
    if (!ok || !mounted) return;
    final r = await jalankan(
      context,
      () => Api.instance('waAdminSusulanMulai', [_t, {'sampai': _iso(_sampai), 'rombel': _semua ? <String>[] : _pilih.toList(), 'alasan': _alasan.text.trim()}], const Duration(minutes: 3)),
      teksProses: 'Membuka susulan...',
    );
    if (r.ok && mounted) {
      final m = peta(peta(r.data)['masa']);
      kabar(context, 'Susulan dibuka sampai ${teks(m['sampai'])}. ${angka(m['aksesUjian']).toInt()} akses ujian susulan dibuat.');
      setState(() => _versi++);
    }
  }

  Future<void> _akhiri() async {
    final ok = await konfirmasi(context, 'Akhiri masa susulan', 'Absensi, diskusi, dan ujian yang terlewat akan terkunci lagi, dan akses ujian susulan yang belum dipakai dicabut. Lanjutkan?', ya: 'Akhiri');
    if (!ok || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminSusulanAkhiri', [_t]), teksProses: 'Mengakhiri...');
    if (r.ok && mounted) {
      kabar(context, 'Masa susulan diakhiri.');
      setState(() => _versi++);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Buka Susulan Massal')),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_versi),
        muat: () async => peta(await Api.instance('waAdminSusulanBaca', [_t])),
        bangun: (context, d, segarkan) {
          final masa = d['masa'] == null ? null : peta(d['masa']);
          final rombel = daftar(d['rombel']).map(peta).toList();
          final maksHari = angka(d['maksHari']).toInt() == 0 ? 60 : angka(d['maksHari']).toInt();
          final aktif = masa != null && masa['aktif'] == true;
          return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Card(
              color: cs.secondaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  'Membuka sekaligus semua absensi, diskusi, dan ujian yang sudah terlewat, agar siswa bisa memperbaiki yang tertinggal. '
                  'Hanya sesi yang sudah berakhir saat susulan dibuka yang ikut dibuka. Pengerjaan selama masa susulan tercatat seperti biasa.',
                  style: TextStyle(color: cs.onSecondaryContainer),
                ),
              ),
            ),
            if (masa != null) ...[
              JudulBagian('Masa susulan terakhir'),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Lencana(teks(masa['status']), warna: aktif ? Colors.green : Colors.grey),
                      const SizedBox(width: 8),
                      Expanded(child: Text('${teks(masa['dari'])} s/d ${teks(masa['sampai'])}', style: const TextStyle(fontWeight: FontWeight.w700))),
                    ]),
                    const SizedBox(height: 6),
                    Text('Rombel: ${daftar(masa['namaRombel']).isEmpty ? 'Semua rombel' : daftar(masa['namaRombel']).map(teks).join(', ')}'),
                    Text('Akses ujian susulan dibuat: ${angka(masa['aksesUjian']).toInt()}'),
                    Text('Dibuka oleh: ${teks(masa['oleh'])}'),
                    if (teks(masa['alasan']).isNotEmpty) Text('Alasan: ${teks(masa['alasan'])}'),
                    if (teks(masa['diakhiri']).isNotEmpty) Text('Diakhiri ${teks(masa['diakhiri'])} oleh ${teks(masa['diakhiriOleh'])}'),
                    if (aktif) ...[
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(foregroundColor: cs.error),
                        onPressed: _akhiri,
                        icon: const Icon(Icons.lock_clock_rounded),
                        label: const Text('Akhiri sekarang'),
                      ),
                    ],
                  ]),
                ),
              ),
            ],
            JudulBagian(aktif ? 'Ganti dengan masa susulan baru' : 'Buka masa susulan baru'),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Berlaku sampai', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Wrap(spacing: 8, runSpacing: 6, children: [
                    for (final h in const [1, 3, 7, 14, 30])
                      ChoiceChip(
                        label: Text('$h hari'),
                        selected: _iso(_sampai) == _iso(_bawaan(h)),
                        onSelected: (_) => setState(() => _sampai = _bawaan(h)),
                      ),
                  ]),
                  const SizedBox(height: 6),
                  OutlinedButton.icon(
                    onPressed: () => _pilihWaktu(maksHari),
                    icon: const Icon(Icons.event_rounded, size: 18),
                    label: Text(_tampil(_sampai)),
                  ),
                  Text('Pilih tanggal dan jam sendiri (paling lama $maksHari hari).', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                  const Divider(height: 24),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _semua,
                    onChanged: (v) => setState(() => _semua = v),
                    title: const Text('Semua rombel'),
                  ),
                  if (!_semua)
                    Wrap(spacing: 6, runSpacing: 6, children: [
                      for (final r in rombel)
                        FilterChip(
                          label: Text(teks(r['nama'])),
                          selected: _pilih.contains(teks(r['id'])),
                          onSelected: (v) => setState(() => v ? _pilih.add(teks(r['id'])) : _pilih.remove(teks(r['id']))),
                        ),
                    ]),
                  const SizedBox(height: 10),
                  TextField(controller: _alasan, maxLength: 300, decoration: const InputDecoration(labelText: 'Alasan / catatan (opsional)')),
                  const SizedBox(height: 6),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                    onPressed: () => _mulai(rombel),
                    icon: const Icon(Icons.lock_open_rounded),
                    label: const Text('Buka susulan'),
                  ),
                ]),
              ),
            ),
          ]);
        },
      ),
    );
  }
}
