import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'umum.dart';

String? get _t => Sesi.instance.token;

/// Kartu satu catatan presensi KS (hadir / izin / sakit / dinas).
class KartuPresensiKs extends StatelessWidget {
  const KartuPresensiKs({super.key, required this.x, this.aksi, this.tampilNama = false});
  final Map<String, dynamic> x;
  final Widget? aksi;
  final bool tampilNama;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final jenis = teks(x['jenis']);
    final hadir = jenis == 'Hadir';
    final ikon = switch (jenis) { 'Hadir' => Icons.how_to_reg_rounded, 'Sakit' => Icons.sick_rounded, 'Dinas' => Icons.directions_car_rounded, _ => Icons.event_busy_rounded };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            IkonBulat(ikon, warna: warnaStatusHadir(context, hadir ? 'Hadir' : jenis), ukuran: 38, sudut: 12),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text([if (tampilNama) teks(x['nama']), hadir ? 'Absen masuk' : (jenis == 'Dinas' ? 'Perjalanan dinas' : jenis)].join(' · '), style: const TextStyle(fontWeight: FontWeight.w800)),
                Text(hadir ? '${tglIndo(teks(x['tanggal']))} · ${teks(x['jam'])}' : '${tglIndo(teks(x['mulai']))}${teks(x['selesai']) != teks(x['mulai']) ? ' s.d. ${tglIndo(teks(x['selesai']))}' : ''}',
                    style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
              ]),
            ),
            Lencana(teks(x['status']), warna: warnaStatusHadir(context, teks(x['status']))),
          ]),
          if (hadir && x['jarak'] != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Jarak ${x['jarak']} m dari sekretariat · GPS ±${x['akurasi']} m', style: const TextStyle(fontSize: 12.5))),
          if (hadir && teks(x['cekAi']).isNotEmpty) Text('Pemeriksaan foto: ${teks(x['cekAi'])}', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
          if (teks(x['tujuan']).isNotEmpty) Text('Tujuan: ${teks(x['tujuan'])}', style: const TextStyle(fontSize: 12.5)),
          if (teks(x['keterangan']).isNotEmpty) Text(teks(x['keterangan']), style: const TextStyle(fontSize: 12.5)),
          if (teks(x['diputusOleh']).isNotEmpty)
            Text('Diputus ${teks(x['diputusOleh'])}${teks(x['catatan']).isNotEmpty ? ': ${teks(x['catatan'])}' : ''}', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant, fontStyle: FontStyle.italic)),
          if (x['adaFoto'] == true || aksi != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Wrap(spacing: 8, runSpacing: 6, children: [
                if (x['adaFoto'] == true)
                  OutlinedButton.icon(
                    onPressed: () => lihatFoto(context, () async => peta(await Api.instance('waStafKsFoto', [_t, teks(x['id'])]))),
                    icon: const Icon(Icons.photo_rounded, size: 18),
                    label: const Text('Lihat foto'),
                  ),
                if (aksi != null) aksi!,
              ]),
            ),
        ]),
      ),
    );
  }
}

/// Absen Kepala Sekolah: selfie di area Front Office sekretariat + lokasi GPS; izin/sakit/dinas.
class AbsenSayaScreen extends StatefulWidget {
  const AbsenSayaScreen({super.key});

  @override
  State<AbsenSayaScreen> createState() => _AbsenSayaScreenState();
}

class _AbsenSayaScreenState extends State<AbsenSayaScreen> {
  int _v = 0;
  String? _info;
  bool _sibuk = false;

  Future<void> _absen() async {
    setState(() { _sibuk = true; _info = 'Menyiapkan...'; });
    try {
      final pos = await lokasiAkurat(info: (s) { if (mounted) setState(() => _info = s); });
      if (!mounted) return;
      setState(() => _info = 'Lokasi ±${pos.accuracy.round()} m. Ambil selfie dengan area Front Office terlihat di belakang Anda.');
      final foto = await ambilFoto(selfie: true);
      if (foto == null) { setState(() => _info = 'Dibatalkan.'); return; }
      setState(() => _info = 'Mengirim absen dan memeriksa foto...');
      final d = peta(await Api.instance('waStafKsAbsenMasuk', [_t, {'lat': pos.latitude, 'lng': pos.longitude, 'akurasi': pos.accuracy, 'mock': pos.isMocked, 'foto': foto}], const Duration(seconds: 180)));
      if (!mounted) return;
      kabar(context, teks(d['pesan'], 'Absen tercatat.'));
      setState(() { _info = null; _v++; });
    } on ApiException catch (e) {
      if (mounted) setState(() => _info = e.ramah);
    } catch (e) {
      if (mounted) setState(() => _info = '$e');
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Future<void> _ajukan() async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const _FormIzinKs()));
    if (ok == true && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waStafKsAbsenStatus', [_t])),
      bangun: (context, d, _) {
        final hariIni = d['hariIni'] == null ? null : peta(d['hariIni']);
        final riwayat = daftar(d['riwayat']).map(peta).toList();
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(gradient: Gaya.gradasi, borderRadius: BorderRadius.circular(Gaya.radius)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(tglIndo(teks(d['tanggal'])), style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 4),
              Text(hariIni == null ? 'Anda belum absen hari ini' : 'Sudah absen pukul ${teks(hariIni['jam'])} · ${teks(hariIni['status'])}',
                  style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
              const SizedBox(height: 12),
              if (d['lokasiSiap'] != true)
                const Text('Lokasi sekretariat belum diatur admin. Absen selfie belum dapat dilakukan.', style: TextStyle(color: Colors.white))
              else if (hariIni == null)
                FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: Colors.white, foregroundColor: Gaya.ungu, minimumSize: const Size.fromHeight(50)),
                  onPressed: _sibuk ? null : _absen,
                  icon: _sibuk ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.camera_front_rounded),
                  label: const Text('Absen masuk (selfie di Front Office)', style: TextStyle(fontWeight: FontWeight.w800)),
                ),
              if (_info != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_info!, style: const TextStyle(color: Colors.white))),
              const SizedBox(height: 8),
              Text('Syarat: berada di area Front Office (radius ${d['radius']} m), GPS akurat (±${d['akurasi']} m), selfie langsung dari kamera dengan latar Front Office.',
                  style: const TextStyle(color: Colors.white70, fontSize: 12)),
            ]),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: _ajukan,
            icon: const Icon(Icons.edit_calendar_rounded),
            label: const Text('Ajukan izin / sakit / perjalanan dinas'),
          ),
          JudulBagian('Riwayat', sub: '${riwayat.length} catatan'),
          if (riwayat.isEmpty) Kosong(pesan: 'Belum ada catatan.', ikon: Icons.history_rounded),
          for (final x in riwayat) KartuPresensiKs(x: x),
          Padding(padding: const EdgeInsets.only(top: 8), child: Text('Izin, sakit, dan perjalanan dinas disetujui oleh Ketua Yayasan.', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant))),
        ]);
      },
    );
  }
}

class _FormIzinKs extends StatefulWidget {
  const _FormIzinKs();

  @override
  State<_FormIzinKs> createState() => _FormIzinKsState();
}

class _FormIzinKsState extends State<_FormIzinKs> {
  String _jenis = 'Izin';
  DateTime _mulai = DateTime.now();
  DateTime _selesai = DateTime.now();
  final _alasan = TextEditingController();
  final _tujuan = TextEditingController();
  String? _foto;

  @override
  void dispose() {
    _alasan.dispose();
    _tujuan.dispose();
    super.dispose();
  }

  Future<void> _tgl(bool mulai) async {
    final now = DateTime.now();
    final d = await showDatePicker(context: context, firstDate: now.subtract(const Duration(days: 60)), lastDate: now.add(const Duration(days: 120)), initialDate: mulai ? _mulai : _selesai);
    if (d == null) return;
    setState(() {
      if (mulai) {
        _mulai = d;
        if (_selesai.isBefore(d)) _selesai = d;
      } else {
        _selesai = d.isBefore(_mulai) ? _mulai : d;
      }
    });
  }

  Future<void> _kirim() async {
    final r = await jalankan(context, () => Api.instance('waStafKsIzinAjukan', [
          _t,
          {'jenis': _jenis, 'mulai': tglIso(_mulai), 'selesai': tglIso(_selesai), 'alasan': _alasan.text, 'tujuan': _tujuan.text, if (_foto != null) 'foto': _foto}
        ], const Duration(seconds: 120)), teksProses: 'Mengirim pengajuan...');
    if (r.ok && mounted) {
      kabar(context, 'Pengajuan terkirim ke Ketua Yayasan.');
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ajukan izin / sakit / dinas')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'Izin', label: Text('Izin'), icon: Icon(Icons.event_busy_rounded)),
            ButtonSegment(value: 'Sakit', label: Text('Sakit'), icon: Icon(Icons.sick_rounded)),
            ButtonSegment(value: 'Dinas', label: Text('Dinas'), icon: Icon(Icons.directions_car_rounded)),
          ],
          selected: {_jenis},
          onSelectionChanged: (s) => setState(() => _jenis = s.first),
        ),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(child: OutlinedButton.icon(onPressed: () => _tgl(true), icon: const Icon(Icons.event_rounded, size: 18), label: Text('Mulai ${tglIndo(tglIso(_mulai))}'))),
          const SizedBox(width: 8),
          Expanded(child: OutlinedButton.icon(onPressed: () => _tgl(false), icon: const Icon(Icons.event_rounded, size: 18), label: Text('Selesai ${tglIndo(tglIso(_selesai))}'))),
        ]),
        if (_jenis == 'Dinas') ...[
          const SizedBox(height: 12),
          TextField(controller: _tujuan, decoration: const InputDecoration(labelText: 'Tujuan perjalanan dinas', hintText: 'mis. Dinas Pendidikan Kab. Cirebon')),
        ],
        const SizedBox(height: 12),
        TextField(controller: _alasan, minLines: 3, maxLines: 6, decoration: InputDecoration(labelText: _jenis == 'Dinas' ? 'Keperluan' : 'Keterangan')),
        const SizedBox(height: 12),
        Row(children: [
          OutlinedButton.icon(
            onPressed: () async {
              final f = await ambilFoto(bolehGaleri: true, context: context);
              if (f != null) setState(() => _foto = f);
            },
            icon: const Icon(Icons.add_a_photo_rounded),
            label: Text(_foto == null ? 'Lampirkan foto (opsional)' : 'Ganti foto'),
          ),
          if (_foto != null) ...[
            const SizedBox(width: 8),
            const Icon(Icons.check_circle_rounded, color: Colors.green),
            TextButton(onPressed: () => setState(() => _foto = null), child: const Text('Hapus')),
          ],
        ]),
        const SizedBox(height: 20),
        FilledButton.icon(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: _kirim, icon: const Icon(Icons.send_rounded), label: const Text('Kirim pengajuan')),
      ]),
    );
  }
}

/// Superadmin (Ketua Yayasan): persetujuan izin/sakit/dinas KS dan pemeriksaan foto absen.
class PersetujuanKsScreen extends StatefulWidget {
  const PersetujuanKsScreen({super.key});

  @override
  State<PersetujuanKsScreen> createState() => _PersetujuanKsScreenState();
}

class _PersetujuanKsScreenState extends State<PersetujuanKsScreen> {
  String _saring = 'Perlu tindakan';
  int _v = 0;

  Future<void> _putus(Map<String, dynamic> x, bool setuju) async {
    final cat = await mintaTeks(context, setuju ? 'Setujui / terima?' : 'Tolak?', label: 'Catatan (opsional)');
    if (cat == null || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafKsPutus', [_t, teks(x['id']), setuju, cat]), teksProses: 'Menyimpan...');
    if (r.ok && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waStafKsPresensiDaftar', [_t, {}])),
      bangun: (context, d, _) {
        final semua = daftar(d['data']).map(peta).toList();
        final perlu = semua.where((x) => teks(x['status']) == 'Menunggu' || teks(x['status']) == 'Perlu dicek').toList();
        final list = _saring == 'Perlu tindakan' ? perlu : semua;
        final boleh = d['bolehPutus'] == true;
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Wrap(spacing: 8, children: [
            for (final s in ['Perlu tindakan', 'Semua'])
              ChoiceChip(label: Text(s == 'Perlu tindakan' ? 'Perlu tindakan (${perlu.length})' : 'Semua (${semua.length})'), selected: _saring == s, onSelected: (_) => setState(() => _saring = s)),
          ]),
          const SizedBox(height: 8),
          if (list.isEmpty) const Kosong(pesan: 'Tidak ada yang perlu ditindaklanjuti.', ikon: Icons.task_alt_rounded),
          for (final x in list)
            KartuPresensiKs(
              x: x,
              tampilNama: true,
              aksi: boleh && (teks(x['status']) == 'Menunggu' || teks(x['status']) == 'Perlu dicek')
                  ? Wrap(spacing: 8, children: [
                      FilledButton.tonal(onPressed: () => _putus(x, true), child: Text(teks(x['jenis']) == 'Hadir' ? 'Terima' : 'Setujui')),
                      OutlinedButton(onPressed: () => _putus(x, false), child: const Text('Tolak')),
                    ])
                  : null,
            ),
        ]);
      },
    );
  }
}
