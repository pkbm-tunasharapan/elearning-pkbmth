import 'package:flutter/material.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

const _jenisUjian = [('UTS', 'UTS'), ('UAS', 'UAS'), ('LAIN', 'Ujian lainnya')];

/// Jadwal ujian kelas tatap muka (terpusat). Admin/Superadmin/KS/Koordinator: usulan dari jadwal tatap muka
/// dalam rentang kalender akademik → tetapkan. Tutor: melihat jadwal mapelnya & mencetak naskah.
class UjianTerpusatScreen extends StatefulWidget {
  const UjianTerpusatScreen({super.key});

  @override
  State<UjianTerpusatScreen> createState() => _UjianTerpusatScreenState();
}

class _UjianTerpusatScreenState extends State<UjianTerpusatScreen> {
  int? _smt;
  String _jenis = 'UTS';
  String? _dari, _sampai;
  int _tab = 0; // 0 usulan, 1 terjadwal
  Map<String, dynamic>? _d;
  String? _galat;
  bool _memuat = false;

  // pilihan usulan: idMapel -> {idMapel, tanggal, jam, mode, label, sub}
  final Map<String, Map<String, dynamic>> _pilih = {};
  final Map<String, Map<String, dynamic>> _manual = {};
  final _durasi = TextEditingController();
  final _jumlah = TextEditingController();
  final _kkm = TextEditingController();
  final _judul = TextEditingController();
  String _modeBawaan = 'APK';

  @override
  void initState() {
    super.initState();
    _muat();
  }

  @override
  void dispose() {
    for (final c in [_durasi, _jumlah, _kkm, _judul]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _muat({bool resetRentang = false}) async {
    if (resetRentang) {
      _dari = null;
      _sampai = null;
    }
    _memuat = true;
    _galat = null;
    if (_d != null) setState(() {});
    try {
      final d = peta(await Api.instance('waStafUjtData', [
        _t,
        {if (_smt != null) 'smt': _smt, 'jenis': _jenis, if (_dari != null) 'dari': _dari, if (_sampai != null) 'sampai': _sampai}
      ], const Duration(seconds: 150)));
      _smt = angka(d['smt']);
      _pilih.clear();
      _manual.clear();
      for (final u in daftar(d['usulan']).map(peta)) {
        _pilih[teks(u['idMapel'])] = {'idMapel': teks(u['idMapel']), 'tanggal': teks(u['tanggal']), 'jam': teks(u['jam']), 'mode': _modeBawaan};
      }
      final b = peta(d['bawaan']);
      if (_durasi.text.isEmpty) _durasi.text = '${b['durasi'] ?? 60}';
      if (_jumlah.text.isEmpty) _jumlah.text = '${b['jumlah'] ?? 50}';
      if (_kkm.text.isEmpty) _kkm.text = '${b['kkm'] ?? 70}';
      if (d['kelola'] != true) _tab = 1;
      if (mounted) setState(() { _d = d; _memuat = false; });
    } on ApiException catch (e) {
      if (mounted) setState(() { _galat = e.ramah; _memuat = false; });
    }
  }

  Future<String?> _tgl(String awal) async {
    final n = DateTime.now();
    final d = await showDatePicker(context: context, firstDate: DateTime(n.year - 1), lastDate: DateTime(n.year + 2), initialDate: DateTime.tryParse(awal) ?? n);
    return d == null ? null : tglIso(d);
  }

  Future<String?> _jam(String awal) async {
    final p = awal.split(':');
    final t = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: int.tryParse(p.first) ?? 8, minute: p.length > 1 ? int.tryParse(p[1]) ?? 0 : 0),
      builder: (c, w) => MediaQuery(data: MediaQuery.of(c).copyWith(alwaysUse24HourFormat: true), child: w!),
    );
    return t == null ? null : '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
  }

  String _hari(String iso) {
    final d = DateTime.tryParse(iso);
    return d == null ? '' : const ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'][d.weekday - 1];
  }

  Future<void> _ubahWaktu(Map<String, dynamic> x) async {
    final t = await _tgl(teks(x['tanggal']));
    if (t == null || !mounted) return;
    final j = await _jam(teks(x['jam'], '08:00'));
    if (j == null) return;
    setState(() { x['tanggal'] = t; x['jam'] = j; });
  }

  Future<void> _aturManual(Map<String, dynamic> b) async {
    final t = await _tgl(_dari ?? teks(_d?['dari']));
    if (t == null || !mounted) return;
    final j = await _jam('08:00');
    if (j == null) return;
    setState(() => _manual[teks(b['idMapel'])] = {'idMapel': teks(b['idMapel']), 'tanggal': t, 'jam': j, 'mode': _modeBawaan});
  }

  Future<void> _tetapkan() async {
    final d = _d!;
    final item = [..._pilih.values.where((x) => x['dipilih'] != false), ..._manual.values]
        .map((x) => {'idMapel': x['idMapel'], 'tanggal': x['tanggal'], 'jam': x['jam'], 'mode': x['mode']})
        .toList();
    if (item.isEmpty) return kabar(context, 'Belum ada jadwal yang dipilih.', galat: true);
    if (_jenis == 'LAIN' && _judul.text.trim().length < 3) return kabar(context, 'Isi nama ujian (mis. Ujian Kesetaraan).', galat: true);
    final nama = _jenis == 'LAIN' ? _judul.text.trim() : _jenis;
    if (!await konfirmasi(context, 'Tetapkan ${item.length} jadwal $nama?',
        'Semester ${d['smt']} · ${_durasi.text} menit · ${_jumlah.text} soal · KKM ${_kkm.text}. Soal diambil dari bank soal kurikulum. Jadwal terkunci untuk tutor.',
        ya: 'Tetapkan')) {
      return;
    }
    if (!mounted) return;
    final r = await jalankan(context, () async => peta(await Api.instance('waStafUjtTetapkan', [
          _t,
          {
            'smt': d['smt'],
            'jenis': _jenis,
            'judul': _judul.text.trim(),
            'durasi': int.tryParse(_durasi.text.trim()) ?? 60,
            'jumlah': int.tryParse(_jumlah.text.trim()) ?? 50,
            'kkm': num.tryParse(_kkm.text.trim().replaceAll(',', '.')) ?? 70,
            'item': item,
          }
        ], const Duration(minutes: 5))), teksProses: 'Menetapkan ${item.length} jadwal ujian...');
    if (!r.ok || !mounted) return;
    final h = r.data!;
    final ok = daftar(h['ditetapkan']).length;
    final lewat = daftar(h['lewat']).map(peta).toList();
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('$ok jadwal ditetapkan'),
        content: lewat.isEmpty
            ? const Text('Semua jadwal berhasil ditetapkan.')
            : SizedBox(
                width: 480,
                child: ListView(shrinkWrap: true, children: [
                  Text('${lewat.length} dilewati:', style: const TextStyle(fontWeight: FontWeight.w700)),
                  for (final l in lewat) Text('• ${teks(l['nama'])}: ${teks(l['alasan'])}', style: const TextStyle(fontSize: 13)),
                ]),
              ),
        actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('OK'))],
      ),
    );
    _tab = 1;
    _muat();
  }

  Future<void> _naskah(Map<String, dynamic> x, bool kunci) async {
    final r = await jalankan(context, () async => peta(await Api.instance('waStafUjtNaskah', [_t, teks(x['idUjian']), kunci], const Duration(minutes: 2))),
        teksProses: kunci ? 'Menyusun kunci jawaban...' : 'Menyusun naskah ujian...');
    if (!r.ok || !mounted) return;
    await bukaPdfB64(context, teks(r.data!['b64']), teks(r.data!['nama'], 'naskah.pdf'));
  }

  Future<void> _ubahTerjadwal(Map<String, dynamic> x) async {
    final hasil = await showDialog<Map<String, dynamic>>(context: context, builder: (_) => _DialogUbah(x: x, pilihTgl: _tgl, pilihJam: _jam));
    if (hasil == null || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafUjtUbah', [_t, teks(x['idUjian']), hasil]), teksProses: 'Menyimpan...');
    if (r.ok && mounted) { kabar(context, 'Jadwal diubah.'); _muat(); }
  }

  Future<void> _hapus(Map<String, dynamic> x) async {
    if (!await konfirmasi(context, 'Batalkan jadwal ini?', '${teks(x['judul'])} · ${teks(x['namaMapel'])} · ${teks(x['namaRombel'])}\n${teks(x['teks'])}', ya: 'Batalkan')) return;
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafUjtHapus', [_t, teks(x['idUjian'])]), teksProses: 'Membatalkan...');
    if (r.ok && mounted) _muat();
  }

  Widget _filter(Map<String, dynamic> d) {
    final maks = angka(d['jumlahSemester'], 2);
    return Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
      SegmentedButton<int>(
        segments: [for (var s = 1; s <= maks; s++) ButtonSegment(value: s, label: Text('Semester $s'))],
        selected: {_smt ?? 1},
        onSelectionChanged: (v) { _smt = v.first; _muat(resetRentang: true); },
      ),
      for (final j in _jenisUjian)
        ChoiceChip(
          label: Text(j.$2),
          selected: _jenis == j.$1,
          onSelected: (_) { _jenis = j.$1; _muat(resetRentang: true); },
        ),
    ]);
  }

  Widget _usulan(Map<String, dynamic> d) {
    final cs = Theme.of(context).colorScheme;
    final usulan = daftar(d['usulan']).map(peta).toList();
    final belum = daftar(d['belum']).map(peta).toList();
    final rentang = peta(d['rentang']);
    final dari = teks(d['dari']), sampai = teks(d['sampai']);
    final dipilih = _pilih.values.where((x) => x['dipilih'] != false).length + _manual.length;
    return Stack(children: [
      ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 100), children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(_jenis == 'LAIN' ? 'Rentang ujian (pilih tanggal)' : 'Rentang $_jenis menurut kalender akademik: ${teks(rentang['nama'])}',
                  style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Row(children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async { final t = await _tgl(dari); if (t != null) { _dari = t; _muat(); } },
                    child: Text(dari.isEmpty ? 'Dari tanggal' : 'Dari ${tglIndo(dari)}'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async { final t = await _tgl(sampai.isEmpty ? dari : sampai); if (t != null) { _sampai = t; _muat(); } },
                    child: Text(sampai.isEmpty ? 'Sampai tanggal' : 'Sampai ${tglIndo(sampai)}'),
                  ),
                ),
              ]),
              if (_jenis != 'LAIN' && (_dari != null || _sampai != null))
                Align(alignment: Alignment.centerRight, child: TextButton(onPressed: () => _muat(resetRentang: true), child: const Text('Kembali ke rentang kalender'))),
              const SizedBox(height: 4),
              Text('Setiap pertemuan tatap muka (menu Jadwal) di dalam rentang ini otomatis diusulkan menjadi sesi ujian pada tanggal & jam sesinya.',
                  style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
            ]),
          ),
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Pengaturan ujian (berlaku untuk semua jadwal yang ditetapkan)', style: TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              if (_jenis == 'LAIN') ...[
                TextField(controller: _judul, decoration: const InputDecoration(labelText: 'Nama ujian', hintText: 'mis. Ujian Kesetaraan', isDense: true)),
                const SizedBox(height: 8),
              ],
              Row(children: [
                Expanded(child: TextField(controller: _durasi, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Durasi (menit)', isDense: true))),
                const SizedBox(width: 8),
                Expanded(child: TextField(controller: _jumlah, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Jumlah soal', isDense: true))),
                const SizedBox(width: 8),
                Expanded(child: TextField(controller: _kkm, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'KKM', isDense: true))),
              ]),
              const SizedBox(height: 10),
              Row(children: [
                const Text('Mode bawaan: '),
                const SizedBox(width: 8),
                SegmentedButton<String>(
                  segments: const [ButtonSegment(value: 'APK', label: Text('APK'), icon: Icon(Icons.phone_android_rounded)), ButtonSegment(value: 'Kertas', label: Text('Kertas'), icon: Icon(Icons.description_outlined))],
                  selected: {_modeBawaan},
                  onSelectionChanged: (v) => setState(() {
                    _modeBawaan = v.first;
                    for (final x in [..._pilih.values, ..._manual.values]) {
                      x['mode'] = _modeBawaan;
                    }
                  }),
                ),
              ]),
              const SizedBox(height: 4),
              Text('APK: siswa mengerjakan di aplikasi di kelas dengan kode akses dari pengawas. Kertas: naskah dicetak dari bank soal, nilai diinput tutor di menu Nilai.',
                  style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
            ]),
          ),
        ),
        JudulBagian('Usulan dari jadwal tatap muka', sub: '${usulan.length} kelas'),
        if (usulan.isEmpty) const Kosong(pesan: 'Tidak ada pertemuan tatap muka di rentang ini (atau semua sudah terjadwal).', ikon: Icons.event_busy_rounded),
        for (final u in usulan) _barisPilih(u, _pilih[teks(u['idMapel'])]!, '${teks(u['slot']).isEmpty ? '' : '${teks(u['slot'])} · '}${teks(u['namaTutor'])}'),
        if (belum.isNotEmpty) ...[
          JudulBagian('Kelas tatap muka tanpa pertemuan di rentang ini', sub: '${belum.length} kelas · atur tanggal manual'),
          for (final b in belum)
            _manual.containsKey(teks(b['idMapel']))
                ? _barisPilih(b, _manual[teks(b['idMapel'])]!, 'Diatur manual', hapus: () => setState(() => _manual.remove(teks(b['idMapel']))))
                : Card(
                    child: ListTile(
                      dense: true,
                      title: Text('${teks(b['namaMapel'])} · ${teks(b['namaRombel'])}'),
                      trailing: TextButton.icon(onPressed: () => _aturManual(b), icon: const Icon(Icons.event_rounded, size: 18), label: const Text('Atur tanggal')),
                    ),
                  ),
        ],
      ]),
      Positioned(
        left: 16,
        right: 16,
        bottom: 16,
        child: FilledButton.icon(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: dipilih == 0 ? null : _tetapkan,
          icon: const Icon(Icons.lock_clock_rounded),
          label: Text('Tetapkan $dipilih jadwal'),
        ),
      ),
    ]);
  }

  Widget _barisPilih(Map<String, dynamic> info, Map<String, dynamic> x, String ket, {VoidCallback? hapus}) {
    final aktif = x['dipilih'] != false;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(4, 4, 8, 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          CheckboxListTile(
            dense: true,
            controlAffinity: ListTileControlAffinity.leading,
            value: aktif,
            onChanged: hapus != null ? (_) => hapus() : (v) => setState(() => x['dipilih'] = v ?? true),
            title: Text('${teks(info['namaMapel'])} · ${teks(info['namaRombel'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text('${_hari(teks(x['tanggal']))}, ${tglIndo(teks(x['tanggal']))} · ${teks(x['jam'])}\n$ket'),
            isThreeLine: true,
          ),
          if (aktif)
            Wrap(spacing: 8, runSpacing: 6, children: [
              const SizedBox(width: 8),
              OutlinedButton.icon(onPressed: () => _ubahWaktu(x), icon: const Icon(Icons.edit_calendar_rounded, size: 18), label: const Text('Ubah waktu')),
              SegmentedButton<String>(
                style: const ButtonStyle(visualDensity: VisualDensity.compact),
                segments: const [ButtonSegment(value: 'APK', label: Text('APK')), ButtonSegment(value: 'Kertas', label: Text('Kertas'))],
                selected: {teks(x['mode'], 'APK')},
                onSelectionChanged: (v) => setState(() => x['mode'] = v.first),
              ),
            ]),
        ]),
      ),
    );
  }

  Widget _terjadwal(Map<String, dynamic> d) {
    final cs = Theme.of(context).colorScheme;
    final list = daftar(d['terjadwal']).map(peta).toList();
    final kelola = d['kelola'] == true;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
      if (!kelola)
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text('Jadwal ujian kelas tatap muka ditetapkan terpusat oleh Admin/Kepala Sekolah. Untuk ujian kertas, cetak naskah & kunci di sini.',
              style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
        ),
      if (list.isEmpty) const Kosong(pesan: 'Belum ada jadwal ujian untuk pilihan ini.', ikon: Icons.event_note_rounded),
      for (final x in list)
        Card(
          child: ListTile(
            leading: Icon(teks(x['mode']) == 'Kertas' ? Icons.description_outlined : Icons.phone_android_rounded, color: cs.primary),
            title: Text('${teks(x['namaMapel'])} · ${teks(x['namaRombel'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text('${teks(x['judul'])}\n${teks(x['teks'])} · ${x['durasi']} menit · ${x['jumlah']} soal · KKM ${x['kkm']}'
                '${x['terpusat'] == true ? '' : ' · dijadwalkan tutor'}'),
            isThreeLine: true,
            trailing: PopupMenuButton<String>(
              onSelected: (v) {
                if (v == 'naskah') _naskah(x, false);
                if (v == 'kunci') _naskah(x, true);
                if (v == 'ubah') _ubahTerjadwal(x);
                if (v == 'hapus') _hapus(x);
              },
              itemBuilder: (_) => [
                const PopupMenuItem(value: 'naskah', child: Text('Cetak naskah soal (PDF)')),
                const PopupMenuItem(value: 'kunci', child: Text('Cetak kunci jawaban (PDF)')),
                if (kelola && x['sudahMulai'] != true) const PopupMenuItem(value: 'ubah', child: Text('Ubah waktu / mode')),
                if (kelola && x['sudahMulai'] != true) const PopupMenuItem(value: 'hapus', child: Text('Batalkan jadwal')),
              ],
            ),
          ),
        ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    if (_galat != null) return PesanGalat(pesan: _galat!, ulangi: _muat);
    final d = _d;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final kelola = d['kelola'] == true;
    final cs = Theme.of(context).colorScheme;
    return Column(children: [
      Container(
        width: double.infinity,
        color: cs.surfaceContainerLowest,
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _filter(d),
          if (kelola) ...[
            const SizedBox(height: 8),
            SegmentedButton<int>(
              segments: [
                ButtonSegment(value: 0, label: Text('Usulan (${daftar(d['usulan']).length})'), icon: const Icon(Icons.auto_awesome_motion_rounded)),
                ButtonSegment(value: 1, label: Text('Terjadwal (${daftar(d['terjadwal']).length})'), icon: const Icon(Icons.event_available_rounded)),
              ],
              selected: {_tab},
              onSelectionChanged: (v) => setState(() => _tab = v.first),
            ),
          ],
        ]),
      ),
      if (_memuat) const LinearProgressIndicator(minHeight: 2),
      Expanded(child: kelola && _tab == 0 ? _usulan(d) : _terjadwal(d)),
    ]);
  }
}

class _DialogUbah extends StatefulWidget {
  const _DialogUbah({required this.x, required this.pilihTgl, required this.pilihJam});
  final Map<String, dynamic> x;
  final Future<String?> Function(String) pilihTgl;
  final Future<String?> Function(String) pilihJam;

  @override
  State<_DialogUbah> createState() => _DialogUbahState();
}

class _DialogUbahState extends State<_DialogUbah> {
  late String _tanggal = teks(widget.x['tanggal']);
  late String _jam = teks(widget.x['jam']);
  late String _mode = teks(widget.x['mode'], 'APK');
  late final _durasi = TextEditingController(text: '${widget.x['durasi']}');

  @override
  void dispose() {
    _durasi.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('${teks(widget.x['namaMapel'])} · ${teks(widget.x['namaRombel'])}'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        OutlinedButton.icon(
          onPressed: () async { final t = await widget.pilihTgl(_tanggal); if (t != null) setState(() => _tanggal = t); },
          icon: const Icon(Icons.event_rounded),
          label: Text('Tanggal ${tglIndo(_tanggal)}'),
        ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          onPressed: () async { final j = await widget.pilihJam(_jam); if (j != null) setState(() => _jam = j); },
          icon: const Icon(Icons.schedule_rounded),
          label: Text('Jam mulai $_jam'),
        ),
        const SizedBox(height: 8),
        TextField(controller: _durasi, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Durasi (menit)', isDense: true)),
        const SizedBox(height: 10),
        SegmentedButton<String>(
          segments: const [ButtonSegment(value: 'APK', label: Text('APK')), ButtonSegment(value: 'Kertas', label: Text('Kertas'))],
          selected: {_mode},
          onSelectionChanged: (v) => setState(() => _mode = v.first),
        ),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
        FilledButton(
          onPressed: () => Navigator.pop(context, {'tanggal': _tanggal, 'jam': _jam, 'durasi': int.tryParse(_durasi.text.trim()), 'mode': _mode}),
          child: const Text('Simpan'),
        ),
      ],
    );
  }
}
