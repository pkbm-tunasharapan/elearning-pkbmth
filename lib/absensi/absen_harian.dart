import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'absen_wb.dart';
import 'antrean_pindai.dart';
import 'umum.dart';

String? get _t => Sesi.instance.token;

/// Menu "Absensi Warga Belajar": Admin & Kepala Sekolah memakai absensi harian global,
/// Tutor tetap memakai absensi per mapel yang diampu.
class AbsensiMenuScreen extends StatelessWidget {
  const AbsensiMenuScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final peran = Sesi.instance.peran;
    return peran == 'Admin' || peran == 'Kepala Sekolah' ? const AbsenHarianScreen() : const AbsensiWbScreen();
  }
}

/// Absensi harian global: scan QR pertama = datang, scan berikutnya = pulang.
/// Izin/Sakit/Alpa diisi manual dari daftar. Tidak terkait rombel/mapel tertentu.
class AbsenHarianScreen extends StatefulWidget {
  const AbsenHarianScreen({super.key});

  @override
  State<AbsenHarianScreen> createState() => _AbsenHarianScreenState();
}

class _AbsenHarianScreenState extends State<AbsenHarianScreen> {
  String _tanggal = tglIso(DateTime.now());
  String _rombel = '';
  String _cari = '';
  int _v = 0;
  final _antre = AntreanPindai.harian;
  int _menungguLalu = 0;

  /// Daftar warga belajar terakhir yang dimuat, untuk mengenali kartu di HP tanpa menunggu server.
  List<Map<String, dynamic>> _roster = const [];

  @override
  void initState() {
    super.initState();
    _antre.addListener(_antreBerubah);
    _antre.muat();
  }

  @override
  void dispose() {
    _antre.removeListener(_antreBerubah);
    super.dispose();
  }

  // Muat ulang daftar setelah antrean selesai terkirim agar status di layar sesuai server.
  void _antreBerubah() {
    final n = _antre.menunggu;
    if (_menungguLalu > 0 && n == 0 && !_antre.mengirim && mounted) setState(() => _v++);
    _menungguLalu = n;
  }

  Map<String, dynamic>? _kenali(String kode) {
    final k = kode.trim().toLowerCase();
    for (final s in _roster) {
      if (teks(s['id']).toLowerCase() == k || (teks(s['nisn']).isNotEmpty && teks(s['nisn']).toLowerCase() == k) || teks(s['nama']).toLowerCase() == k) return s;
    }
    return null;
  }

  String _jamKini() {
    final n = DateTime.now();
    return '${n.hour.toString().padLeft(2, '0')}:${n.minute.toString().padLeft(2, '0')}';
  }

  Future<void> _pindai() async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PemindaiQr(
        judul: 'Absensi harian',
        petunjuk: 'Scan kartu saat datang, scan lagi saat pulang. Pindaian langsung tercatat di HP dan dikirim otomatis.',
        onKodeCepat: (kode) {
          final s = _kenali(kode);
          _antre.tambah(kode, nama: s == null ? '' : teks(s['nama']));
          return s == null
              ? 'Kartu dipindai ${_jamKini()}. Nama muncul setelah terkirim.'
              : '${teks(s['nama'])} (${teks(s['rombel'])}) · ${_jamKini()}';
        },
        bawah: PanelAntreanPindai(antrean: _antre),
      ),
    ));
    if (mounted) setState(() => _v++);
  }

  Future<void> _ubah(Map<String, dynamic> s, String status) async {
    String ket = '';
    if (status != 'Hadir') {
      final k = await mintaTeks(context, '$status: ${teks(s['nama'])}', label: 'Keterangan (opsional)', awal: teks(s['ket']));
      if (k == null) return;
      ket = k;
    }
    if (!mounted) return;
    final r = await jalankan(
      context,
      () => Api.instance('waStafAbsenHarianCatat', [_t, {'tanggal': _tanggal, 'idWb': teks(s['id']), 'status': status, 'keterangan': ket}]),
      teksProses: 'Mencatat...',
    );
    if (r.ok && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      muat: () async => peta(await Api.instance('waStafAbsenHarianKonteks', [_t])),
      bangun: (context, ks, _) {
        final rombel = daftar(ks['rombel']).map(peta).toList();
        final jam = peta(ks['jam']);
        final hariIni = _tanggal == tglIso(DateTime.now());
        return Column(children: [
          Container(
            color: cs.surfaceContainerLowest,
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      final now = DateTime.now();
                      final d = await showDatePicker(context: context, firstDate: now.subtract(const Duration(days: 120)), lastDate: now, initialDate: DateTime.tryParse(_tanggal) ?? now);
                      if (d != null) setState(() => _tanggal = tglIso(d));
                    },
                    icon: const Icon(Icons.event_rounded, size: 18),
                    label: Text(tglIndo(_tanggal)),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    isExpanded: true,
                    initialValue: _rombel,
                    decoration: const InputDecoration(labelText: 'Rombel', isDense: true),
                    items: [
                      const DropdownMenuItem(value: '', child: Text('Semua rombel')),
                      for (final r in rombel) DropdownMenuItem(value: teks(r['id']), child: Text(teks(r['nama']), overflow: TextOverflow.ellipsis)),
                    ],
                    onChanged: (v) => setState(() => _rombel = v ?? ''),
                  ),
                ),
              ]),
              const SizedBox(height: 8),
              TextField(
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari nama', isDense: true),
                onChanged: (v) => setState(() => _cari = v.trim().toLowerCase()),
              ),
              const SizedBox(height: 4),
              Text('Absensi harian (global) · jam ${teks(jam['buka'], '00:00')}–${teks(jam['tutup'], '23:59')}',
                  style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
            ]),
          ),
          Expanded(
            child: Muatan<Map<String, dynamic>>(
              key: ValueKey('$_tanggal|$_rombel|$_v'),
              muat: () async => peta(await Api.instance('waStafAbsenHarianDaftar', [_t, {'tanggal': _tanggal, 'idRombel': _rombel}])),
              bangun: (context, d, segarkan) {
                final semua = daftar(d['siswa']).map(peta).toList();
                if (_rombel.isEmpty || _roster.isEmpty) _roster = semua;
                final siswa = _cari.isEmpty ? semua : semua.where((s) => teks(s['nama']).toLowerCase().contains(_cari)).toList();
                final jml = <String, int>{'Hadir': 0, 'Pulang': 0, 'Izin': 0, 'Sakit': 0, 'Alpa': 0, 'Belum': 0};
                for (final s in semua) {
                  final st = teks(s['status']);
                  jml[st.isEmpty ? 'Belum' : st] = (jml[st.isEmpty ? 'Belum' : st] ?? 0) + 1;
                  if (teks(s['pulang']).isNotEmpty) jml['Pulang'] = jml['Pulang']! + 1;
                }
                return Stack(children: [
                  RefreshIndicator(
                    onRefresh: segarkan,
                    child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 100), children: [
                      if (hariIni) PanelAntreanPindai(antrean: _antre, ringkas: true),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text('${semua.length} warga belajar aktif', style: const TextStyle(fontWeight: FontWeight.w800)),
                            const SizedBox(height: 6),
                            RingkasStatus(jumlah: jml),
                          ]),
                        ),
                      ),
                      if (siswa.isEmpty) const Kosong(pesan: 'Tidak ada warga belajar untuk ditampilkan.'),
                      Card(
                        child: Column(children: [
                          for (final s in siswa)
                            ListTile(
                              contentPadding: const EdgeInsets.fromLTRB(14, 2, 8, 2),
                              leading: CircleAvatar(
                                backgroundColor: warnaStatusHadir(context, teks(s['status'])).withValues(alpha: 0.15),
                                child: Icon(
                                  teks(s['pulang']).isNotEmpty ? Icons.logout_rounded : (teks(s['status']) == 'Hadir' ? Icons.login_rounded : Icons.person_outline_rounded),
                                  color: warnaStatusHadir(context, teks(s['status'])),
                                  size: 20,
                                ),
                              ),
                              title: Text(teks(s['nama']), maxLines: 1, overflow: TextOverflow.ellipsis),
                              subtitle: Text(
                                [
                                  teks(s['rombel']),
                                  if (teks(s['status']).isEmpty) 'Belum diabsen',
                                  if (teks(s['status']) == 'Hadir') 'Datang ${teks(s['datang'], '-')}${teks(s['pulang']).isEmpty ? '' : ' · pulang ${teks(s['pulang'])}'}',
                                  if (teks(s['status']).isNotEmpty && teks(s['status']) != 'Hadir') teks(s['status']),
                                  if (teks(s['ket']).isNotEmpty) teks(s['ket']),
                                ].join(' · '),
                                style: const TextStyle(fontSize: 12),
                              ),
                              trailing: PopupMenuButton<String>(
                                tooltip: 'Ubah status',
                                onSelected: (v) => _ubah(s, v),
                                itemBuilder: (_) => [for (final st in ['Hadir', 'Izin', 'Sakit', 'Alpa']) PopupMenuItem(value: st, child: Text(st))],
                              ),
                            ),
                        ]),
                      ),
                    ]),
                  ),
                  Positioned(
                    right: 16,
                    bottom: 16,
                    child: FloatingActionButton.extended(
                      heroTag: 'pindaiHarian',
                      backgroundColor: Gaya.ungu,
                      foregroundColor: Colors.white,
                      onPressed: hariIni ? _pindai : null,
                      icon: const Icon(Icons.qr_code_scanner_rounded),
                      label: const Text('Pindai datang / pulang'),
                    ),
                  ),
                ]);
              },
            ),
          ),
        ]);
      },
    );
  }
}


/// Status antrean pindaian: jumlah menunggu, terkirim, gagal, dan permintaan Kode Buka.
class PanelAntreanPindai extends StatelessWidget {
  const PanelAntreanPindai({super.key, required this.antrean, this.ringkas = false});
  final AntreanPindai antrean;

  /// Ringkas: hanya tampil bila ada yang menunggu/gagal (dipakai di atas daftar).
  final bool ringkas;

  Future<void> _kodeBuka(BuildContext context) async {
    final k = await mintaTeks(context, 'Di luar jam absensi', label: 'Kode Buka dari admin', huruf: true);
    if (k != null && k.trim().isNotEmpty) antrean.pakaiKodeBuka(k.trim());
  }

  void _lihatGagal(BuildContext context) {
    final g = antrean.daftar.where((p) => p.status == 'gagal').toList().reversed.toList();
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), children: [
          const Text('Pindaian gagal', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 4),
          const Text('Catat manual dari daftar bila perlu.', style: TextStyle(fontSize: 12.5)),
          for (final p in g) ListTile(dense: true, leading: const Icon(Icons.error_outline_rounded), title: Text(p.nama.isEmpty ? p.kode : p.nama), subtitle: Text(p.pesan)),
          TextButton(onPressed: () { antrean.hapusSelesai(); Navigator.pop(c); }, child: const Text('Bersihkan catatan')),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return ListenableBuilder(
      listenable: antrean,
      builder: (context, _) {
        final m = antrean.menunggu, g = antrean.gagal, k = antrean.perluKode, ok = antrean.terkirim;
        if (ringkas && m == 0 && g == 0 && k == 0) return const SizedBox.shrink();
        final terbaru = ringkas ? const <PindaianAntre>[] : antrean.terbaru(4);
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.fromLTRB(12, 10, 8, 8),
          decoration: BoxDecoration(color: cs.surfaceContainerHigh, borderRadius: BorderRadius.circular(14)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              if (antrean.mengirim) const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) else Icon(m > 0 ? Icons.cloud_upload_outlined : Icons.cloud_done_outlined, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  [if (m > 0) '$m menunggu dikirim', if (!ringkas) '$ok terkirim', if (g > 0) '$g gagal', if (k > 0) '$k perlu Kode Buka'].join(' · '),
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                ),
              ),
              if (g > 0) TextButton(onPressed: () => _lihatGagal(context), child: const Text('Lihat')),
            ]),
            if (antrean.galatJaringan.isNotEmpty && m > 0) Text(antrean.galatJaringan, style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
            if (k > 0) Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: () => _kodeBuka(context), icon: const Icon(Icons.key_rounded, size: 18), label: const Text('Masukkan Kode Buka'))),
            for (final p in terbaru)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Row(children: [
                  Icon(
                    switch (p.status) { 'ok' => Icons.check_circle_rounded, 'gagal' => Icons.error_rounded, 'perluKode' => Icons.key_rounded, _ => Icons.schedule_rounded },
                    size: 16,
                    color: switch (p.status) { 'ok' => Colors.green, 'gagal' => cs.error, _ => cs.outline },
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(p.pesan.isNotEmpty ? p.pesan : (p.nama.isNotEmpty ? p.nama : 'Menunggu dikirim...'), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12.5)),
                  ),
                ]),
              ),
          ]),
        );
      },
    );
  }
}
