import 'package:flutter/material.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;
/// Satu entri per rombel·mapel (data kelas bisa ganda dari SIM & e-Learning).
List<Map<String, dynamic>> unikKelas(Iterable<Map<String, dynamic>> l) {
  final m = <String, Map<String, dynamic>>{};
  for (final k in l) {
    final key = '${teks(k['idRombel'])}|${teks(k['kodeMapel'])}';
    if (!m.containsKey(key) || (teks(m[key]!['idTutor']).isEmpty && teks(k['idTutor']).isNotEmpty)) m[key] = k;
  }
  return m.values.toList()..sort((a, b) => '${teks(a['namaRombel'])}${teks(a['namaMapel'])}'.compareTo('${teks(b['namaRombel'])}${teks(b['namaMapel'])}'));
}

const hariMinggu = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

/// Jadwal tatap muka: hari ini (dengan status absen tutor) dan pemetaan mingguan.
class JadwalScreen extends StatefulWidget {
  const JadwalScreen({super.key});

  @override
  State<JadwalScreen> createState() => _JadwalScreenState();
}

class _JadwalScreenState extends State<JadwalScreen> {
  int _tab = 0;
  String _tgl = tglIso(DateTime.now());
  int _v = 0;

  Future<void> _ubah(Map<String, dynamic> data, [Map<String, dynamic>? x]) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => FormPemetaan(data: data, x: x)));
    if (ok == true && mounted) setState(() => _v++);
  }

  Future<void> _hapus(Map<String, dynamic> x) async {
    if (!await konfirmasi(context, 'Hapus jadwal ini?', '${teks(x['namaMapel'])} · ${teks(x['namaRombel'])} · ${teks(x['hari'])} ${teks(x['mulai'])}. Jadwal dinonaktifkan mulai hari ini.', ya: 'Hapus')) return;
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafPemetaanHapus', [_t, teks(x['id'])]), teksProses: 'Menghapus...');
    if (r.ok && mounted) setState(() => _v++);
  }

  Widget _item(Map<String, dynamic> x, {bool status = false, bool kelola = false, Map<String, dynamic>? data}) {
    final cs = Theme.of(context).colorScheme;
    return ListTile(
      leading: Container(
        width: 62,
        padding: const EdgeInsets.symmetric(vertical: 6),
        decoration: BoxDecoration(color: Gaya.ungu.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(teks(x['mulai']), style: const TextStyle(fontWeight: FontWeight.w800)),
          Text(teks(x['selesai']), style: TextStyle(fontSize: 11.5, color: cs.onSurfaceVariant)),
        ]),
      ),
      title: Text('${teks(x['namaMapel'])} · ${teks(x['namaRombel'])}', maxLines: 2, overflow: TextOverflow.ellipsis),
      subtitle: Text([teks(x['namaTutor']), if (teks(x['slot']).isNotEmpty) teks(x['slot']), if (!status && teks(x['sampai']).isNotEmpty) 's.d. ${tglIndo(teks(x['sampai']))}'].join(' · ')),
      trailing: status
          ? Lencana(x['hadir'] == true ? 'Hadir ${teks(x['jamHadir'])}' : 'Belum absen', warna: x['hadir'] == true ? Colors.green : cs.outline)
          : (kelola
              ? PopupMenuButton<String>(
                  onSelected: (v) => v == 'ubah' ? _ubah(data!, x) : _hapus(x),
                  itemBuilder: (_) => const [PopupMenuItem(value: 'ubah', child: Text('Ubah')), PopupMenuItem(value: 'hapus', child: Text('Hapus'))],
                )
              : null),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(children: [
      Container(
        color: cs.surfaceContainerLowest,
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: SegmentedButton<int>(
          segments: const [ButtonSegment(value: 0, label: Text('Per tanggal'), icon: Icon(Icons.today_rounded)), ButtonSegment(value: 1, label: Text('Mingguan'), icon: Icon(Icons.view_week_rounded))],
          selected: {_tab},
          onSelectionChanged: (s) => setState(() => _tab = s.first),
        ),
      ),
      Expanded(
        child: _tab == 0
            ? Muatan<Map<String, dynamic>>(
                key: ValueKey('h|$_tgl|$_v'),
                muat: () async => peta(await Api.instance('waStafJadwalHari', [_t, _tgl])),
                bangun: (context, d, _) {
                  final j = daftar(d['jadwal']).map(peta).toList();
                  return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
                    Row(children: [
                      IconButton(onPressed: () => setState(() => _tgl = tglIso(DateTime.parse(_tgl).subtract(const Duration(days: 1)))), icon: const Icon(Icons.chevron_left_rounded)),
                      Expanded(
                        child: TextButton(
                          onPressed: () async {
                            final n = DateTime.now();
                            final p = await showDatePicker(context: context, firstDate: DateTime(n.year - 1), lastDate: DateTime(n.year + 1), initialDate: DateTime.parse(_tgl));
                            if (p != null) setState(() => _tgl = tglIso(p));
                          },
                          child: Text('${teks(d['hari'])}, ${tglIndo(_tgl)}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                        ),
                      ),
                      IconButton(onPressed: () => setState(() => _tgl = tglIso(DateTime.parse(_tgl).add(const Duration(days: 1)))), icon: const Icon(Icons.chevron_right_rounded)),
                    ]),
                    if (j.isEmpty) const Kosong(pesan: 'Tidak ada jadwal tatap muka pada tanggal ini.', ikon: Icons.event_available_rounded),
                    if (j.isNotEmpty) Card(child: Column(children: [for (final x in j) _item(x, status: true)])),
                  ]);
                },
              )
            : Muatan<Map<String, dynamic>>(
                key: ValueKey('m|$_v'),
                muat: () async => peta(await Api.instance('waStafPemetaanDaftar', [_t])),
                bangun: (context, d, _) {
                  final pm = daftar(d['pemetaan']).map(peta).toList();
                  final kelola = d['kelola'] == true;
                  return Stack(children: [
                    ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 100), children: [
                      if (pm.isEmpty) Kosong(pesan: kelola ? 'Belum ada pemetaan jadwal. Ketuk "Tambah jadwal".' : 'Belum ada jadwal tatap muka untuk Anda.', ikon: Icons.event_note_rounded),
                      for (final h in hariMinggu)
                        if (pm.any((x) => x['hari'] == h)) ...[
                          JudulBagian(h, sub: '${pm.where((x) => x['hari'] == h).length} jadwal'),
                          Card(child: Column(children: [for (final x in pm.where((x) => x['hari'] == h)) _item(x, kelola: kelola, data: d)])),
                        ],
                    ]),
                    if (kelola)
                      Positioned(
                        right: 16,
                        bottom: 16,
                        child: FloatingActionButton.extended(heroTag: 'tambahJadwal', onPressed: () => _ubah(d), icon: const Icon(Icons.add_rounded), label: const Text('Tambah jadwal')),
                      ),
                  ]);
                },
              ),
      ),
    ]);
  }
}

/// Form tambah/ubah pemetaan (Admin & Kepala Sekolah).
class FormPemetaan extends StatefulWidget {
  const FormPemetaan({super.key, required this.data, this.x});
  final Map<String, dynamic> data;
  final Map<String, dynamic>? x;

  @override
  State<FormPemetaan> createState() => _FormPemetaanState();
}

class _FormPemetaanState extends State<FormPemetaan> {
  String? _kelas;
  String? _tutor;
  String _hari = 'Senin';
  String? _slot;
  late String _dari;
  String _sampai = '';

  List<Map<String, dynamic>> get _daftarKelas => unikKelas(daftar(widget.data['kelas']).map(peta));
  List<Map<String, dynamic>> get _daftarTutor => daftar(widget.data['tutor']).map(peta).toList();
  List<Map<String, dynamic>> get _slotList => daftar(peta(widget.data['aturan'])['slot']).map(peta).toList();
  String _kk(Map<String, dynamic> k) => '${teks(k['idRombel'])}|${teks(k['kodeMapel'])}';

  @override
  void initState() {
    super.initState();
    final x = widget.x;
    _dari = tglIso(DateTime.now());
    if (x != null) {
      _kelas = '${teks(x['idRombel'])}|${teks(x['kodeMapel'])}';
      _tutor = teks(x['idTutor']);
      _hari = teks(x['hari'], 'Senin');
      _slot = _slotList.where((s) => teks(s['nama']) == teks(x['slot'])).map((s) => teks(s['id'])).firstOrNull;
      _dari = teks(x['dari'], _dari);
      _sampai = teks(x['sampai']);
    }
    _slot ??= _slotList.isEmpty ? null : teks(_slotList.first['id']);
  }

  Future<void> _simpan() async {
    if (_kelas == null || _slot == null) return kabar(context, 'Pilih kelas dan slot sesi.', galat: true);
    final p = _kelas!.split('|');
    final r = await jalankan(context, () => Api.instance('waStafPemetaanSimpan', [
          _t,
          {if (widget.x != null) 'id': teks(widget.x!['id']), 'idRombel': p[0], 'kodeMapel': p[1], 'idTutor': _tutor ?? '', 'hari': _hari, 'slot': _slot, 'dari': _dari, 'sampai': _sampai}
        ]), teksProses: 'Menyimpan & memeriksa bentrok...');
    if (r.ok && mounted) {
      kabar(context, 'Jadwal tersimpan.');
      Navigator.pop(context, true);
    }
  }

  Future<void> _pilihTgl(bool mulai) async {
    final n = DateTime.now();
    final d = await showDatePicker(context: context, firstDate: DateTime(n.year - 1), lastDate: DateTime(n.year + 2), initialDate: DateTime.tryParse(mulai ? _dari : (_sampai.isEmpty ? _dari : _sampai)) ?? n);
    if (d != null) setState(() => mulai ? _dari = tglIso(d) : _sampai = tglIso(d));
  }

  @override
  Widget build(BuildContext context) {
    final kelas = _daftarKelas;
    final tutor = _daftarTutor;
    return Scaffold(
      appBar: AppBar(title: Text(widget.x == null ? 'Tambah jadwal' : 'Ubah jadwal')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: kelas.any((k) => _kk(k) == _kelas) ? _kelas : null,
          decoration: const InputDecoration(labelText: 'Rombel · Mapel'),
          items: [for (final k in kelas) DropdownMenuItem(value: _kk(k), child: Text('${teks(k['namaRombel'])} · ${teks(k['namaMapel'])}', overflow: TextOverflow.ellipsis))],
          onChanged: (v) => setState(() {
            _kelas = v;
            final k = kelas.firstWhere((x) => _kk(x) == v);
            if (teks(k['idTutor']).isNotEmpty) _tutor = teks(k['idTutor']);
          }),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          key: ValueKey('tutor|$_tutor'),
          isExpanded: true,
          initialValue: tutor.any((t) => teks(t['id']) == _tutor) ? _tutor : null,
          decoration: const InputDecoration(labelText: 'Tutor pengajar'),
          items: [for (final t in tutor) DropdownMenuItem(value: teks(t['id']), child: Text(teks(t['nama'])))],
          onChanged: (v) => setState(() => _tutor = v),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _hari,
          decoration: const InputDecoration(labelText: 'Hari'),
          items: [for (final h in hariMinggu) DropdownMenuItem(value: h, child: Text(h))],
          onChanged: (v) => setState(() => _hari = v ?? _hari),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _slot,
          decoration: const InputDecoration(labelText: 'Slot sesi'),
          items: [for (final s in _slotList) DropdownMenuItem(value: teks(s['id']), child: Text('${teks(s['nama'])} (${teks(s['mulai'])}–${teks(s['selesai'])})'))],
          onChanged: (v) => setState(() => _slot = v),
        ),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: OutlinedButton(onPressed: () => _pilihTgl(true), child: Text('Mulai ${tglIndo(_dari)}'))),
          const SizedBox(width: 8),
          Expanded(child: OutlinedButton(onPressed: () => _pilihTgl(false), child: Text(_sampai.isEmpty ? 'Sampai: tanpa batas' : 'Sampai ${tglIndo(_sampai)}'))),
        ]),
        if (_sampai.isNotEmpty) Align(alignment: Alignment.centerRight, child: TextButton(onPressed: () => setState(() => _sampai = ''), child: const Text('Tanpa batas'))),
        const SizedBox(height: 20),
        FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: _simpan, child: const Text('Simpan jadwal')),
        const SizedBox(height: 8),
        const Text('Jadwal yang bentrok (tutor atau rombel sama pada jam yang beririsan) otomatis ditolak.', style: TextStyle(fontSize: 12)),
      ]),
    );
  }
}

/// Usulan jadwal: tutor mengajukan, Kepala Sekolah menyetujui/menolak.
class UsulanJadwalScreen extends StatefulWidget {
  const UsulanJadwalScreen({super.key});

  @override
  State<UsulanJadwalScreen> createState() => _UsulanJadwalScreenState();
}

class _UsulanJadwalScreenState extends State<UsulanJadwalScreen> {
  int _v = 0;
  bool get _tutor => Sesi.instance.peran == 'Tutor';

  Future<void> _ajukan() async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const _FormUsulan()));
    if (ok == true && mounted) setState(() => _v++);
  }

  Future<void> _putus(Map<String, dynamic> u, bool setuju) async {
    final cat = await mintaTeks(context, setuju ? 'Setujui usulan?' : 'Tolak usulan?', label: 'Catatan (opsional)');
    if (cat == null || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafUsulanPutus', [_t, teks(u['id']), setuju, cat]), teksProses: setuju ? 'Menyetujui & membuat jadwal...' : 'Menolak...');
    if (r.ok && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waStafUsulanDaftar', [_t])),
      bangun: (context, d, _) {
        final us = daftar(d['usulan']).map(peta).toList();
        final boleh = d['bolehPutus'] == true;
        return Stack(children: [
          ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 100), children: [
            if (us.isEmpty) Kosong(pesan: _tutor ? 'Belum ada usulan. Ketuk "Usulkan jadwal".' : 'Belum ada usulan jadwal dari tutor.', ikon: Icons.edit_calendar_rounded),
            for (final u in us)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text('${teks(u['namaMapel'])} · ${teks(u['namaRombel'])}', style: const TextStyle(fontWeight: FontWeight.w800))),
                      Lencana(teks(u['status']), warna: warnaStatusHadir(context, teks(u['status']))),
                    ]),
                    Text('${teks(u['hari'])} · ${teks(u['slot'])}${_tutor ? '' : ' · ${teks(u['namaTutor'])}'}'),
                    if (teks(u['catatan']).isNotEmpty) Text(teks(u['catatan']), style: const TextStyle(fontSize: 12.5)),
                    Text('Diajukan ${teks(u['diajukan'])}${teks(u['diputusOleh']).isNotEmpty ? ' · diputus ${teks(u['diputusOleh'])}' : ''}', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                    if (boleh && teks(u['status']) == 'Menunggu')
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Wrap(spacing: 8, children: [
                          FilledButton.tonal(onPressed: () => _putus(u, true), child: const Text('Setujui')),
                          OutlinedButton(onPressed: () => _putus(u, false), child: const Text('Tolak')),
                        ]),
                      ),
                  ]),
                ),
              ),
          ]),
          if (_tutor)
            Positioned(right: 16, bottom: 16, child: FloatingActionButton.extended(heroTag: 'usulJadwal', onPressed: _ajukan, icon: const Icon(Icons.add_rounded), label: const Text('Usulkan jadwal'))),
        ]);
      },
    );
  }
}

class _FormUsulan extends StatefulWidget {
  const _FormUsulan();

  @override
  State<_FormUsulan> createState() => _FormUsulanState();
}

class _FormUsulanState extends State<_FormUsulan> {
  String? _kelas;
  String _hari = 'Senin';
  String? _slot;
  final _catatan = TextEditingController();

  @override
  void dispose() {
    _catatan.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Usulkan jadwal')),
      body: Muatan<Map<String, dynamic>>(
        muat: () async => peta(await Api.instance('waStafPemetaanDaftar', [_t])),
        bangun: (context, d, _) {
          final kelas = unikKelas(daftar(d['kelas']).map(peta));
          final slot = daftar(peta(d['aturan'])['slot']).map(peta).toList();
          _slot ??= slot.isEmpty ? null : teks(slot.first['id']);
          if (kelas.isEmpty) return const Kosong(pesan: 'Anda belum mengampu kelas apa pun.');
          return ListView(padding: const EdgeInsets.all(16), children: [
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _kelas,
              decoration: const InputDecoration(labelText: 'Rombel · Mapel'),
              items: [for (final k in kelas) DropdownMenuItem(value: '${teks(k['idRombel'])}|${teks(k['kodeMapel'])}', child: Text('${teks(k['namaRombel'])} · ${teks(k['namaMapel'])}', overflow: TextOverflow.ellipsis))],
              onChanged: (v) => setState(() => _kelas = v),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _hari,
              decoration: const InputDecoration(labelText: 'Hari'),
              items: [for (final h in hariMinggu) DropdownMenuItem(value: h, child: Text(h))],
              onChanged: (v) => setState(() => _hari = v ?? _hari),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _slot,
              decoration: const InputDecoration(labelText: 'Slot sesi'),
              items: [for (final s in slot) DropdownMenuItem(value: teks(s['id']), child: Text('${teks(s['nama'])} (${teks(s['mulai'])}–${teks(s['selesai'])})'))],
              onChanged: (v) => setState(() => _slot = v),
            ),
            const SizedBox(height: 12),
            TextField(controller: _catatan, decoration: const InputDecoration(labelText: 'Catatan untuk Kepala Sekolah (opsional)')),
            const SizedBox(height: 20),
            FilledButton(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              onPressed: () async {
                if (_kelas == null || _slot == null) return kabar(context, 'Pilih kelas dan slot.', galat: true);
                final p = _kelas!.split('|');
                final r = await jalankan(context, () => Api.instance('waStafUsulanAjukan', [_t, {'idRombel': p[0], 'kodeMapel': p[1], 'hari': _hari, 'slot': _slot, 'catatan': _catatan.text}]), teksProses: 'Mengirim usulan...');
                if (r.ok && context.mounted) {
                  kabar(context, 'Usulan terkirim ke Kepala Sekolah.');
                  Navigator.pop(context, true);
                }
              },
              child: const Text('Kirim usulan'),
            ),
          ]);
        },
      ),
    );
  }
}

/// Admin: slot sesi dan aturan absen sesuai jadwal.
class AturJadwalScreen extends StatefulWidget {
  const AturJadwalScreen({super.key});

  @override
  State<AturJadwalScreen> createState() => _AturJadwalScreenState();
}

class _AturJadwalScreenState extends State<AturJadwalScreen> {
  List<Map<String, TextEditingController>>? _slot;
  bool _wajib = true;
  String? _galat;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat() async {
    try {
      final d = peta(await Api.instance('waStafJadwalAturan', [_t]));
      final a = peta(d['aturan']);
      if (!mounted) return;
      setState(() {
        _wajib = a['wajibJadwal'] != false;
        _slot = daftar(a['slot']).map(peta).map((s) => {
              'id': TextEditingController(text: teks(s['id'])),
              'nama': TextEditingController(text: teks(s['nama'])),
              'mulai': TextEditingController(text: teks(s['mulai'])),
              'selesai': TextEditingController(text: teks(s['selesai'])),
            }).toList();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  Future<void> _simpan() async {
    final r = await jalankan(context, () => Api.instance('waAdminJadwalAturanSimpan', [
          _t,
          {
            'wajibJadwal': _wajib,
            'slot': [for (final s in _slot!) {'id': s['id']!.text, 'nama': s['nama']!.text, 'mulai': s['mulai']!.text, 'selesai': s['selesai']!.text}],
          }
        ]), teksProses: 'Menyimpan...');
    if (r.ok && mounted) { kabar(context, 'Pengaturan jadwal tersimpan.'); _muat(); }
  }

  @override
  Widget build(BuildContext context) {
    if (_galat != null) return PesanGalat(pesan: _galat!, ulangi: _muat);
    final slot = _slot;
    if (slot == null) return const Center(child: CircularProgressIndicator());
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
      const JudulBagian('Slot sesi tatap muka'),
      for (var i = 0; i < slot.length; i++)
        Card(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
            child: Row(children: [
              Expanded(flex: 3, child: TextField(controller: slot[i]['nama'], decoration: const InputDecoration(labelText: 'Nama', isDense: true))),
              const SizedBox(width: 6),
              Expanded(flex: 2, child: TextField(controller: slot[i]['mulai'], decoration: const InputDecoration(labelText: 'Mulai', hintText: '13:00', isDense: true))),
              const SizedBox(width: 6),
              Expanded(flex: 2, child: TextField(controller: slot[i]['selesai'], decoration: const InputDecoration(labelText: 'Selesai', hintText: '14:30', isDense: true))),
              IconButton(onPressed: slot.length <= 1 ? null : () => setState(() => slot.removeAt(i)), icon: const Icon(Icons.delete_outline_rounded)),
            ]),
          ),
        ),
      Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          onPressed: () => setState(() => slot.add({
                'id': TextEditingController(text: 'S${slot.length + 1}'),
                'nama': TextEditingController(text: 'Sesi ${slot.length + 1}'),
                'mulai': TextEditingController(),
                'selesai': TextEditingController(),
              })),
          icon: const Icon(Icons.add_rounded),
          label: const Text('Tambah slot'),
        ),
      ),
      const JudulBagian('Absensi tutor'),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        value: _wajib,
        onChanged: (v) => setState(() => _wajib = v),
        title: const Text('Absen tutor hanya untuk kelas yang terjadwal hari itu'),
        subtitle: const Text('Di luar jadwal tetap bisa, tetapi wajib mengisi alasan dan ditandai di laporan.'),
      ),
      const SizedBox(height: 16),
      FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: _simpan, child: const Text('Simpan')),
    ]);
  }
}
