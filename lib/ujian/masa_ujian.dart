import 'package:flutter/material.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../session.dart';
import '../widgets.dart';
import 'pengawas.dart';
import 'tinjauan.dart';

String? get _t => Sesi.instance.token;

const _namaJenis = {'UTS': 'UTS', 'UAS': 'UAS', 'LAIN': 'Ujian Lainnya', 'TRYOUT': 'Tryout'};
const _hariNama = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

String _hari(String iso) {
  final d = DateTime.tryParse(iso);
  return d == null ? '' : _hariNama[d.weekday - 1];
}

Future<String?> _pilihTgl(BuildContext context, String awal, {String? dari, String? sampai}) async {
  final n = DateTime.now();
  final a = DateTime.tryParse(dari ?? '') ?? DateTime(n.year - 1);
  final b = DateTime.tryParse(sampai ?? '') ?? DateTime(n.year + 2);
  var i = DateTime.tryParse(awal) ?? n;
  if (i.isBefore(a)) i = a;
  if (i.isAfter(b)) i = b;
  final d = await showDatePicker(context: context, firstDate: a, lastDate: b, initialDate: i);
  return d == null ? null : tglIso(d);
}

Future<String?> _pilihJam(BuildContext context, String awal) async {
  final p = awal.split(':');
  final t = await showTimePicker(
    context: context,
    initialTime: TimeOfDay(hour: int.tryParse(p.first) ?? 7, minute: p.length > 1 ? int.tryParse(p[1]) ?? 30 : 30),
    builder: (c, w) => MediaQuery(data: MediaQuery.of(c).copyWith(alwaysUse24HourFormat: true), child: w!),
  );
  return t == null ? null : '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
}

String _pesertaTeks(Map<String, dynamic> m) {
  final ps = peta(m['peserta']);
  switch (teks(ps['mode'])) {
    case 'rombel':
      return '${daftar(ps['rombel']).length} rombel';
    case 'siswa':
      return '${daftar(ps['siswa']).length} siswa tertentu';
    default:
      return 'Semua siswa & rombel';
  }
}

/// v1.52.0: Masa Ujian serentak (UTS / UAS / Ujian Lainnya / Tryout) dengan tanggal bebas, peserta pilihan,
/// dan slot harian yang berlaku bersamaan untuk semua rombel peserta (tatap muka maupun full online, di APK).
class MasaUjianScreen extends StatefulWidget {
  const MasaUjianScreen({super.key});

  @override
  State<MasaUjianScreen> createState() => _MasaUjianScreenState();
}

class _MasaUjianScreenState extends State<MasaUjianScreen> {
  int _ulang = 0;

  Future<Map<String, dynamic>> _muat() async => peta(await Api.instance('waStafMasaDaftar', [_t], const Duration(seconds: 90)));

  Future<void> _form(Map<String, dynamic> d, [Map<String, dynamic>? m]) async {
    final id = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => _FormMasa(data: d, masa: m)));
    if (id == null || !mounted) return;
    setState(() => _ulang++);
    if (m == null) await _buka(id);
  }

  Future<void> _buka(String id) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => MasaRinciScreen(id: id)));
    if (mounted) setState(() => _ulang++);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Masa Ujian Serentak'), actions: [
        IconButton(
          tooltip: 'Tinjauan pelanggaran berat',
          icon: const Icon(Icons.gavel_rounded),
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TinjauanPelanggaranScreen())),
        ),
        IconButton(
          tooltip: 'Aturan sanksi',
          icon: const Icon(Icons.rule_rounded),
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AturanSanksiScreen())),
        ),
      ]),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey('mu$_ulang'),
        muat: _muat,
        bangun: (c, d, segar) {
          final masa = daftar(d['masa']).map(peta).toList();
          return Stack(children: [
            RefreshIndicator(
              onRefresh: segar,
              child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 96), children: [
                const Text(
                    'Atur UTS, UAS, Ujian Lainnya, atau Tryout dengan tanggal bebas (mis. satu minggu setiap hari). Setiap slot berlaku serentak '
                    'untuk semua rombel peserta, tatap muka maupun full online, dan dikerjakan di aplikasi. Soal diambil dari bank soal kurikulum. '
                    'Jadwal per sesi yang sudah ditetapkan sebelumnya tetap berjalan.',
                    style: TextStyle(fontSize: 12.5)),
                const SizedBox(height: 12),
                if (masa.isEmpty) const Kosong(pesan: 'Belum ada masa ujian. Tekan "Masa ujian baru".', ikon: Icons.event_available_outlined),
                for (final m in masa)
                  Card(
                    child: ListTile(
                      onTap: () => _buka(teks(m['id'])),
                      title: Text(teks(m['nama']), style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text('${_namaJenis[teks(m['jenis'])] ?? teks(m['jenis'])} · Semester ${m['smt']} · ${teks(m['dari'])} s.d. ${teks(m['sampai'])}\n'
                          '${_pesertaTeks(m)} · ${m['jumlahSlot'] ?? 0} slot · ${m['jumlahJadwal'] ?? 0} jadwal kelas'),
                      isThreeLine: true,
                      trailing: Lencana(teks(m['status'], 'Draft'), warna: teks(m['status']) == 'Ditetapkan' ? Colors.green.shade700 : Colors.orange.shade800),
                    ),
                  ),
              ]),
            ),
            Positioned(
              right: 16,
              bottom: 16,
              child: FloatingActionButton.extended(onPressed: () => _form(d), icon: const Icon(Icons.add_rounded), label: const Text('Masa ujian baru')),
            ),
          ]);
        },
      ),
    );
  }
}

// ---------------------------------------------------------------- form masa
class _FormMasa extends StatefulWidget {
  const _FormMasa({required this.data, this.masa});
  final Map<String, dynamic> data;
  final Map<String, dynamic>? masa;

  @override
  State<_FormMasa> createState() => _FormMasaState();
}

class _FormMasaState extends State<_FormMasa> {
  final _nama = TextEditingController();
  final _kkm = TextEditingController();
  final _catatan = TextEditingController();
  String _jenis = 'UTS', _mode = 'semua', _cakupan = 'UAS';
  int _smt = 1;
  String _dari = '', _sampai = '';
  final Set<String> _rombel = {};
  final Set<String> _siswa = {};

  @override
  void initState() {
    super.initState();
    final m = widget.masa;
    final b = peta(widget.data['bawaan']);
    _kkm.text = '${b['kkm'] ?? 70}';
    if (m != null) {
      _nama.text = teks(m['nama']);
      _kkm.text = teks(m['kkm'], _kkm.text);
      _catatan.text = teks(m['catatan']);
      _jenis = teks(m['jenis'], 'UTS');
      _smt = angka(m['smt'], 1);
      _dari = teks(m['dari']);
      _sampai = teks(m['sampai']);
      _cakupan = teks(m['cakupan'], 'UAS');
      final ps = peta(m['peserta']);
      _mode = teks(ps['mode'], 'semua');
      _rombel.addAll(daftar(ps['rombel']).map((e) => '$e'));
      _siswa.addAll(daftar(ps['siswa']).map((e) => '$e'));
    }
  }

  @override
  void dispose() {
    for (final c in [_nama, _kkm, _catatan]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pilihSiswa() async {
    final wb = daftar(widget.data['wb']).map(peta).toList();
    final hasil = await showDialog<Set<String>>(context: context, builder: (_) => _DialogSiswa(wb: wb, awal: _siswa));
    if (hasil != null) setState(() => _siswa..clear()..addAll(hasil));
  }

  Future<void> _simpan() async {
    if (_dari.isEmpty || _sampai.isEmpty) return kabar(context, 'Pilih tanggal mulai dan selesai.', galat: true);
    final r = await jalankan(context, () async => peta(await Api.instance('waStafMasaSimpan', [
          _t,
          {
            if (widget.masa != null) 'id': widget.masa!['id'],
            'nama': _nama.text.trim(),
            'jenis': _jenis,
            'smt': _smt,
            'dari': _dari,
            'sampai': _sampai,
            'cakupan': _cakupan,
            'kkm': num.tryParse(_kkm.text.trim().replaceAll(',', '.')) ?? 70,
            'catatan': _catatan.text.trim(),
            'peserta': {'mode': _mode, 'rombel': _rombel.toList(), 'siswa': _siswa.toList()},
          }
        ])), teksProses: 'Menyimpan masa ujian...');
    if (!r.ok || !mounted) return;
    Navigator.of(context).pop(teks(r.data!['id']));
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final rombel = daftar(d['rombel']).map(peta).toList();
    final maksSmt = angka(d['jumlahSemester'], 2);
    final lain = _jenis == 'LAIN' || _jenis == 'TRYOUT';
    return Scaffold(
      appBar: AppBar(title: Text(widget.masa == null ? 'Masa ujian baru' : 'Ubah masa ujian')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        const Text('Jenis ujian', style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final j in _namaJenis.entries)
            ChoiceChip(label: Text(j.value), selected: _jenis == j.key, onSelected: (_) => setState(() => _jenis = j.key)),
        ]),
        if (_jenis == 'TRYOUT')
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text('Tryout untuk menguji kesiapan sistem, kelancaran, dan pengamanan ujian. Nilainya tidak masuk rapor dan tidak memakai syarat kehadiran.',
                style: TextStyle(fontSize: 12)),
          ),
        const SizedBox(height: 14),
        TextField(controller: _nama, decoration: InputDecoration(labelText: 'Nama masa ujian', hintText: '${_namaJenis[_jenis]} Semester $_smt 2026/2027')),
        const SizedBox(height: 14),
        SegmentedButton<int>(
          segments: [for (var s = 1; s <= maksSmt; s++) ButtonSegment(value: s, label: Text('Semester $s'))],
          selected: {_smt},
          onSelectionChanged: (v) => setState(() => _smt = v.first),
        ),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(
            child: OutlinedButton.icon(
              icon: const Icon(Icons.event_rounded),
              label: Text(_dari.isEmpty ? 'Tanggal mulai' : '${_hari(_dari)}, $_dari'),
              onPressed: () async {
                final t = await _pilihTgl(context, _dari);
                if (t != null) setState(() { _dari = t; if (_sampai.isEmpty || _sampai.compareTo(t) < 0) _sampai = t; });
              },
            ),
          ),
          const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('s.d.')),
          Expanded(
            child: OutlinedButton.icon(
              icon: const Icon(Icons.event_rounded),
              label: Text(_sampai.isEmpty ? 'Tanggal selesai' : '${_hari(_sampai)}, $_sampai'),
              onPressed: () async {
                final t = await _pilihTgl(context, _sampai.isEmpty ? _dari : _sampai, dari: _dari.isEmpty ? null : _dari);
                if (t != null) setState(() => _sampai = t);
              },
            ),
          ),
        ]),
        if (lain) ...[
          const SizedBox(height: 14),
          const Text('Cakupan bank soal', style: TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          SegmentedButton<String>(
            segments: const [ButtonSegment(value: 'UTS', label: Text('Sesi sebelum UTS')), ButtonSegment(value: 'UAS', label: Text('Seluruh semester'))],
            selected: {_cakupan},
            onSelectionChanged: (v) => setState(() => _cakupan = v.first),
          ),
        ],
        const SizedBox(height: 14),
        TextField(controller: _kkm, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'KKM')),
        const SizedBox(height: 18),
        const Text('Peserta', style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'semua', label: Text('Semua')),
            ButtonSegment(value: 'rombel', label: Text('Rombel tertentu')),
            ButtonSegment(value: 'siswa', label: Text('Siswa tertentu')),
          ],
          selected: {_mode},
          onSelectionChanged: (v) => setState(() => _mode = v.first),
        ),
        const SizedBox(height: 8),
        if (_mode == 'semua') const Text('Semua siswa aktif di semua rombel yang punya mapel di slot jadwal.', style: TextStyle(fontSize: 12.5)),
        if (_mode == 'rombel')
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final r in rombel)
              FilterChip(
                label: Text(teks(r['nama'])),
                selected: _rombel.contains(teks(r['id'])),
                onSelected: (v) => setState(() => v ? _rombel.add(teks(r['id'])) : _rombel.remove(teks(r['id']))),
              ),
          ]),
        if (_mode == 'siswa')
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.people_alt_outlined),
            title: Text('${_siswa.length} siswa dipilih'),
            subtitle: const Text('Ujian dibuat untuk rombel mereka, tetapi hanya siswa terpilih yang bisa mulai.'),
            trailing: OutlinedButton(onPressed: _pilihSiswa, child: const Text('Pilih')),
          ),
        const SizedBox(height: 14),
        TextField(controller: _catatan, maxLines: 2, decoration: const InputDecoration(labelText: 'Catatan (opsional)')),
        const SizedBox(height: 20),
        FilledButton.icon(onPressed: _simpan, icon: const Icon(Icons.save_rounded), label: const Text('Simpan')),
      ]),
    );
  }
}

class _DialogSiswa extends StatefulWidget {
  const _DialogSiswa({required this.wb, required this.awal});
  final List<Map<String, dynamic>> wb;
  final Set<String> awal;

  @override
  State<_DialogSiswa> createState() => _DialogSiswaState();
}

class _DialogSiswaState extends State<_DialogSiswa> {
  late final Set<String> _pilih = {...widget.awal};
  String _cari = '';

  @override
  Widget build(BuildContext context) {
    final q = _cari.toLowerCase();
    final isi = widget.wb.where((w) => q.isEmpty || '${w['nama']} ${w['rombel']}'.toLowerCase().contains(q)).toList();
    return AlertDialog(
      title: Text('Pilih siswa (${_pilih.length})'),
      content: SizedBox(
        width: 480,
        height: 480,
        child: Column(children: [
          TextField(decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari nama atau rombel'), onChanged: (v) => setState(() => _cari = v)),
          Expanded(
            child: ListView(children: [
              for (final w in isi)
                CheckboxListTile(
                  dense: true,
                  value: _pilih.contains(teks(w['id'])),
                  title: Text(teks(w['nama'])),
                  subtitle: Text(teks(w['rombel'])),
                  onChanged: (v) => setState(() => v == true ? _pilih.add(teks(w['id'])) : _pilih.remove(teks(w['id']))),
                ),
            ]),
          ),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
        FilledButton(onPressed: () => Navigator.pop(context, _pilih), child: const Text('Pakai')),
      ],
    );
  }
}

// ---------------------------------------------------------------- rinci masa + slot
class MasaRinciScreen extends StatefulWidget {
  const MasaRinciScreen({super.key, required this.id});
  final String id;

  @override
  State<MasaRinciScreen> createState() => _MasaRinciScreenState();
}

class _MasaRinciScreenState extends State<MasaRinciScreen> {
  Map<String, dynamic>? _d, _daftar;
  String? _galat;
  List<Map<String, dynamic>> _slot = [];
  bool _berubah = false;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat() async {
    setState(() => _galat = null);
    try {
      final d = peta(await Api.instance('waStafMasaRinci', [_t, widget.id], const Duration(seconds: 90)));
      if (!mounted) return;
      setState(() {
        _d = d;
        _slot = daftar(d['slot']).map(peta).map((s) {
          final k = peta(s['komposisi']);
          return {...s, 'mudah': k['mudah'], 'sedang': k['sedang'], 'sulit': k['sulit']};
        }).toList();
        _berubah = false;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  Map<String, dynamic> get _masa => peta(_d?['masa']);
  bool get _draft => teks(_masa['status'], 'Draft') == 'Draft';
  List<Map<String, dynamic>> get _mapel => daftar(_d?['mapel']).map(peta).toList();

  void _urut() => _slot.sort((a, b) => '${a['tanggal']}${a['jam']}'.compareTo('${b['tanggal']}${b['jam']}'));

  Future<void> _ubahSlot([Map<String, dynamic>? s]) async {
    final dipakai = _slot.where((x) => x != s).map((x) => teks(x['kode'])).toSet();
    final hasil = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => _DialogSlot(slot: s, mapel: _mapel.where((m) => !dipakai.contains(teks(m['kode']))).toList(), masa: _masa),
    );
    if (hasil == null) return;
    setState(() {
      if (s == null) {
        _slot.add(hasil);
      } else {
        s..clear()..addAll(hasil);
      }
      _urut();
      _berubah = true;
    });
  }

  Future<void> _usulan() async {
    final q = await showDialog<Map<String, dynamic>>(context: context, builder: (_) => const _DialogUsulan());
    if (q == null || !mounted) return;
    if (_slot.isNotEmpty && !await konfirmasi(context, 'Ganti slot yang ada?', 'Usulan otomatis menggantikan ${_slot.length} slot yang sedang disusun.', ya: 'Ganti')) return;
    if (!mounted) return;
    final r = await jalankan(context, () async => peta(await Api.instance('waStafMasaUsulan', [_t, widget.id, q], const Duration(seconds: 90))), teksProses: 'Menyusun usulan...');
    if (!r.ok || !mounted) return;
    setState(() {
      _slot = daftar(r.data!['slot']).map(peta).map((s) {
        final k = peta(s['komposisi']);
        return {...s, 'mudah': k['mudah'], 'sedang': k['sedang'], 'sulit': k['sulit']};
      }).toList();
      _berubah = true;
    });
    final sisa = daftar(r.data!['sisa']);
    if (sisa.isNotEmpty) kabar(context, '${sisa.length} mapel belum dapat hari: ${sisa.join(', ')}. Tambah jam per hari atau perpanjang masa.', galat: true);
  }

  Future<bool> _simpanSlot() async {
    final r = await jalankan(context, () => Api.instance('waStafMasaSlotSimpan', [
          _t,
          widget.id,
          _slot
              .map((s) => {'tanggal': s['tanggal'], 'jam': s['jam'], 'durasi': s['durasi'], 'kode': s['kode'], 'jumlah': s['jumlah'], 'mudah': s['mudah'], 'sedang': s['sedang'], 'sulit': s['sulit']})
              .toList(),
        ], const Duration(seconds: 90)), teksProses: 'Menyimpan slot...');
    if (!r.ok || !mounted) return false;
    kabar(context, 'Slot jadwal disimpan.');
    await _muat();
    return true;
  }

  Future<void> _kesiapan() async {
    if (_berubah && !await _simpanSlot()) return;
    if (!mounted) return;
    final r = await jalankan(context, () async => peta(await Api.instance('waStafMasaKesiapan', [_t, widget.id], const Duration(minutes: 3))), teksProses: 'Memeriksa bank soal...');
    if (!r.ok || !mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => _KesiapanScreen(data: r.data!)));
  }

  Future<void> _tetapkan() async {
    if (_berubah && !await _simpanSlot()) return;
    if (!mounted) return;
    if (_slot.isEmpty) return kabar(context, 'Tambahkan slot jadwal dulu.', galat: true);
    if (!await konfirmasi(context, 'Tetapkan ${teks(_masa['nama'])}?',
        '${_slot.length} slot akan dibuat untuk setiap rombel peserta yang punya mapel itu, pada tanggal dan jam yang sama. Siswa melihatnya di aplikasi; '
        'masa ujian terkunci sampai penetapan dibatalkan. Sebaiknya cek kesiapan bank soal dulu.',
        ya: 'Tetapkan')) {
      return;
    }
    if (!mounted) return;
    final r = await jalankan(context, () async => peta(await Api.instance('waStafMasaTetapkan', [_t, widget.id], const Duration(minutes: 6))), teksProses: 'Menetapkan jadwal serentak...');
    if (!r.ok || !mounted) return;
    final ok = daftar(r.data!['ditetapkan']).length;
    final lewat = daftar(r.data!['lewat']).map(peta).toList();
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('$ok jadwal kelas ditetapkan'),
        content: SizedBox(
          width: 480,
          child: ListView(shrinkWrap: true, children: [
            if (lewat.isEmpty) const Text('Semua jadwal berhasil ditetapkan.'),
            if (lewat.isNotEmpty) Text('${lewat.length} dilewati:', style: const TextStyle(fontWeight: FontWeight.w700)),
            for (final l in lewat) Text('• ${teks(l['nama'])}: ${teks(l['alasan'])}', style: const TextStyle(fontSize: 13)),
          ]),
        ),
        actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('OK'))],
      ),
    );
    _muat();
  }

  Future<void> _batal() async {
    final alasan = TextEditingController();
    final ya = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Batalkan penetapan?'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Semua jadwal kelas dari masa ini dihapus dan item ujiannya dinonaktifkan. Hanya bisa selama belum ada siswa yang mengerjakan.'),
          const SizedBox(height: 10),
          TextField(controller: alasan, decoration: const InputDecoration(labelText: 'Alasan')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Tidak')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Batalkan penetapan')),
        ],
      ),
    );
    final a = alasan.text.trim();
    alasan.dispose();
    if (ya != true || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafMasaBatal', [_t, widget.id, a], const Duration(minutes: 3)), teksProses: 'Membatalkan...');
    if (r.ok && mounted) _muat();
  }

  Future<void> _ubahMasa() async {
    final r = await jalankan(context, () async => peta(await Api.instance('waStafMasaDaftar', [_t])), teksProses: 'Memuat...');
    if (!r.ok || !mounted) return;
    final id = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => _FormMasa(data: r.data!, masa: _masa)));
    if (id != null) _muat();
  }

  @override
  Widget build(BuildContext context) {
    if (_galat != null) return Scaffold(appBar: AppBar(title: const Text('Masa ujian')), body: PesanGalat(pesan: _galat!, ulangi: _muat));
    if (_d == null) return Scaffold(appBar: AppBar(title: const Text('Masa ujian')), body: const Center(child: CircularProgressIndicator()));
    final m = _masa;
    final draft = _draft;
    final perHari = <String, List<Map<String, dynamic>>>{};
    for (final s in _slot) {
      perHari.putIfAbsent(teks(s['tanggal']), () => []).add(s);
    }
    final terpakai = _slot.map((s) => teks(s['kode'])).toSet();
    final belum = _mapel.where((x) => !terpakai.contains(teks(x['kode']))).toList();
    return PopScope(
      canPop: !_berubah,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final buang = await konfirmasi(context, 'Slot belum disimpan', 'Perubahan slot belum disimpan. Keluar tanpa menyimpan?', ya: 'Keluar');
        if (buang && context.mounted) {
          setState(() => _berubah = false);
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(title: Text(teks(m['nama'])), actions: [
          if (draft) IconButton(tooltip: 'Ubah masa ujian', onPressed: _ubahMasa, icon: const Icon(Icons.edit_outlined)),
          IconButton(tooltip: 'Muat ulang', onPressed: _muat, icon: const Icon(Icons.refresh_rounded)),
        ]),
        body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text('${_namaJenis[teks(m['jenis'])] ?? teks(m['jenis'])} · Semester ${m['smt']}', style: const TextStyle(fontWeight: FontWeight.w700))),
                  Lencana(teks(m['status'], 'Draft'), warna: draft ? Colors.orange.shade800 : Colors.green.shade700),
                ]),
                const SizedBox(height: 4),
                Text('${_hari(teks(m['dari']))}, ${teks(m['dari'])} s.d. ${_hari(teks(m['sampai']))}, ${teks(m['sampai'])}'),
                Text('Peserta: ${_pesertaTeks(m)} · KKM ${m['kkm']}${teks(m['cakupan']).isEmpty ? '' : ' · Cakupan ${teks(m['cakupan']) == 'UTS' ? 'sesi sebelum UTS' : 'seluruh semester'}'}'),
                if (!draft) Text('${_d!['jumlahJadwal'] ?? 0} jadwal kelas · ditetapkan ${teks(m['ditetapkanOleh'])} ${teks(m['ditetapkanPada'])}', style: const TextStyle(fontSize: 12.5)),
                if (teks(m['catatan']).isNotEmpty) Text(teks(m['catatan']), style: const TextStyle(fontSize: 12.5, fontStyle: FontStyle.italic)),
              ]),
            ),
          ),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            if (draft) OutlinedButton.icon(onPressed: _usulan, icon: const Icon(Icons.auto_awesome_outlined), label: const Text('Usulkan jadwal')),
            if (draft) OutlinedButton.icon(onPressed: () => _ubahSlot(), icon: const Icon(Icons.add_rounded), label: const Text('Tambah slot')),
            OutlinedButton.icon(onPressed: _kesiapan, icon: const Icon(Icons.fact_check_outlined), label: const Text('Cek kesiapan bank soal')),
            OutlinedButton.icon(
              onPressed: () async {
                if (_berubah && !await _simpanSlot()) return;
                if (!context.mounted) return;
                await Navigator.of(context).push(MaterialPageRoute(builder: (_) => PenugasanPengawasScreen(idMasa: widget.id)));
              },
              icon: const Icon(Icons.badge_outlined),
              label: const Text('Atur pengawas'),
            ),
          ]),
          const SizedBox(height: 8),
          JudulBagian('Slot jadwal (${_slot.length})', sub: draft ? 'Setiap slot berlaku serentak untuk semua rombel peserta.' : 'Terkunci. Batalkan penetapan untuk mengubah.'),
          if (_slot.isEmpty) const Kosong(pesan: 'Belum ada slot. Tekan "Usulkan jadwal" atau "Tambah slot".', ikon: Icons.event_busy_outlined),
          for (final h in perHari.entries) ...[
            Padding(padding: const EdgeInsets.only(top: 8, bottom: 2), child: Text('${_hari(h.key)}, ${h.key}', style: const TextStyle(fontWeight: FontWeight.w700))),
            for (final s in h.value)
              Card(
                margin: const EdgeInsets.symmetric(vertical: 3),
                child: ListTile(
                  dense: true,
                  leading: Text(teks(s['jam']), style: const TextStyle(fontWeight: FontWeight.w800)),
                  title: Text(teks(s['namaMapel'], teks(s['kode']))),
                  subtitle: Text('${s['durasi']} menit · ${s['jumlah']} soal (${s['mudah'] ?? '-'}/${s['sedang'] ?? '-'}/${s['sulit'] ?? '-'})'),
                  onTap: draft ? () => _ubahSlot(s) : null,
                  trailing: draft
                      ? IconButton(
                          tooltip: 'Hapus slot',
                          icon: const Icon(Icons.delete_outline_rounded),
                          onPressed: () => setState(() { _slot.remove(s); _berubah = true; }),
                        )
                      : null,
                ),
              ),
          ],
          if (draft && belum.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text('Mapel peserta yang belum dijadwalkan (${belum.length}): ${belum.map((x) => teks(x['nama'])).join(', ')}', style: const TextStyle(fontSize: 12.5)),
            ),
          const SizedBox(height: 16),
          if (draft && _berubah) FilledButton.tonalIcon(onPressed: _simpanSlot, icon: const Icon(Icons.save_rounded), label: const Text('Simpan slot')),
          if (draft) ...[
            const SizedBox(height: 8),
            FilledButton.icon(onPressed: _tetapkan, icon: const Icon(Icons.verified_rounded), label: const Text('Tetapkan masa ujian')),
          ],
          if (!draft) OutlinedButton.icon(onPressed: _batal, icon: const Icon(Icons.undo_rounded), label: const Text('Batalkan penetapan')),
        ]),
      ),
    );
  }
}

class _DialogSlot extends StatefulWidget {
  const _DialogSlot({this.slot, required this.mapel, required this.masa});
  final Map<String, dynamic>? slot;
  final List<Map<String, dynamic>> mapel;
  final Map<String, dynamic> masa;

  @override
  State<_DialogSlot> createState() => _DialogSlotState();
}

class _DialogSlotState extends State<_DialogSlot> {
  late String _kode = teks(widget.slot?['kode']);
  late String _tgl = teks(widget.slot?['tanggal'], teks(widget.masa['dari']));
  late String _jam = teks(widget.slot?['jam'], '07:30');
  late final _durasi = TextEditingController(text: teks(widget.slot?['durasi'], '90'));
  late final _jumlah = TextEditingController(text: teks(widget.slot?['jumlah'], '40'));

  @override
  void dispose() {
    _durasi.dispose();
    _jumlah.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mapel = [...widget.mapel];
    if (_kode.isNotEmpty && !mapel.any((m) => teks(m['kode']) == _kode)) mapel.insert(0, {'kode': _kode, 'nama': teks(widget.slot?['namaMapel'], _kode)});
    return AlertDialog(
      title: Text(widget.slot == null ? 'Tambah slot' : 'Ubah slot'),
      content: SizedBox(
        width: 440,
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          DropdownButtonFormField<String>(
            initialValue: _kode.isEmpty ? null : _kode,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Mapel'),
            items: [for (final m in mapel) DropdownMenuItem(value: teks(m['kode']), child: Text(teks(m['nama']), overflow: TextOverflow.ellipsis))],
            onChanged: (v) => setState(() => _kode = v ?? ''),
          ),
          if (_kode.isNotEmpty)
            Builder(builder: (_) {
              final m = mapel.firstWhere((x) => teks(x['kode']) == _kode, orElse: () => {});
              final rb = daftar(m['rombel']);
              return rb.isEmpty
                  ? const SizedBox.shrink()
                  : Padding(padding: const EdgeInsets.only(top: 4), child: Text('Rombel: ${rb.join(', ')}', style: const TextStyle(fontSize: 12)));
            }),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () async {
                  final t = await _pilihTgl(context, _tgl, dari: teks(widget.masa['dari']), sampai: teks(widget.masa['sampai']));
                  if (t != null) setState(() => _tgl = t);
                },
                child: Text('${_hari(_tgl)}, $_tgl'),
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton(
              onPressed: () async {
                final j = await _pilihJam(context, _jam);
                if (j != null) setState(() => _jam = j);
              },
              child: Text(_jam),
            ),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: TextField(controller: _durasi, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Durasi (menit)'))),
            const SizedBox(width: 8),
            Expanded(child: TextField(controller: _jumlah, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Jumlah soal'))),
          ]),
          const SizedBox(height: 6),
          const Text('Komposisi mudah/sedang/sulit memakai aturan bawaan.', style: TextStyle(fontSize: 12)),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
        FilledButton(
          onPressed: () {
            if (_kode.isEmpty) return kabar(context, 'Pilih mapel.', galat: true);
            final m = mapel.firstWhere((x) => teks(x['kode']) == _kode, orElse: () => {});
            final jml = int.tryParse(_jumlah.text.trim()) ?? 40;
            final sama = widget.slot != null && angka(widget.slot!['jumlah']) == jml;
            Navigator.pop(context, {
              'tanggal': _tgl,
              'jam': _jam,
              'durasi': int.tryParse(_durasi.text.trim()) ?? 90,
              'jumlah': jml,
              'kode': _kode,
              'namaMapel': teks(m['nama'], _kode),
              // komposisi lama hanya dipakai bila jumlah soal tidak berubah
              if (sama) ...{'mudah': widget.slot!['mudah'], 'sedang': widget.slot!['sedang'], 'sulit': widget.slot!['sulit']},
            });
          },
          child: const Text('Pakai'),
        ),
      ],
    );
  }
}

class _DialogUsulan extends StatefulWidget {
  const _DialogUsulan();

  @override
  State<_DialogUsulan> createState() => _DialogUsulanState();
}

class _DialogUsulanState extends State<_DialogUsulan> {
  final List<String> _jam = ['07:30', '09:30'];
  final _durasi = TextEditingController(text: '90');
  final _jumlah = TextEditingController(text: '40');

  @override
  void dispose() {
    _durasi.dispose();
    _jumlah.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Usulkan jadwal otomatis'),
      content: SizedBox(
        width: 420,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Mapel peserta dibagi ke hari-hari dalam masa ujian (Minggu dilewati), sesuai jam mulai di bawah. Hasilnya bisa diubah sebelum disimpan.',
              style: TextStyle(fontSize: 12.5)),
          const SizedBox(height: 10),
          const Text('Jam mulai per hari', style: TextStyle(fontWeight: FontWeight.w700)),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final j in [..._jam])
              InputChip(label: Text(j), onDeleted: _jam.length > 1 ? () => setState(() => _jam.remove(j)) : null),
            ActionChip(
              avatar: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Jam'),
              onPressed: () async {
                final j = await _pilihJam(context, '13:00');
                if (j != null && !_jam.contains(j)) setState(() => _jam..add(j)..sort());
              },
            ),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: TextField(controller: _durasi, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Durasi (menit)'))),
            const SizedBox(width: 8),
            Expanded(child: TextField(controller: _jumlah, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Jumlah soal'))),
          ]),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
        FilledButton(
          onPressed: () => Navigator.pop(context, {'jam': _jam, 'durasi': int.tryParse(_durasi.text.trim()) ?? 90, 'jumlah': int.tryParse(_jumlah.text.trim()) ?? 40}),
          child: const Text('Usulkan'),
        ),
      ],
    );
  }
}

class _KesiapanScreen extends StatelessWidget {
  const _KesiapanScreen({required this.data});
  final Map<String, dynamic> data;

  Color _warna(String s) => switch (s) {
        'Siap' => Colors.green.shade700,
        'Sebagian' => Colors.blue.shade700,
        'Kurang' => Colors.orange.shade800,
        _ => Colors.red.shade700,
      };

  @override
  Widget build(BuildContext context) {
    final isi = daftar(data['kesiapan']).map(peta).toList();
    final rk = peta(data['ringkas']);
    return Scaffold(
      appBar: AppBar(title: const Text('Kesiapan bank soal')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final s in ['Siap', 'Sebagian', 'Kurang', 'Kosong']) Lencana('$s: ${rk[s] ?? 0}', warna: _warna(s)),
        ]),
        const SizedBox(height: 8),
        const Text(
            'Siap = bank soal cukup. Sebagian = ada sesi tanpa bank soal (soal diambil dari sesi lain). Kurang = soal di bank lebih sedikit dari jumlah soal ujian. '
            'Kosong = belum ada soal; siswa tidak bisa mulai. Minta tutor melengkapi bank soal di tab Kurikulum.',
            style: TextStyle(fontSize: 12.5)),
        const SizedBox(height: 10),
        if (isi.isEmpty) const Kosong(pesan: 'Belum ada slot yang cocok dengan rombel peserta.'),
        for (final x in isi)
          Card(
            margin: const EdgeInsets.symmetric(vertical: 3),
            child: ListTile(
              dense: true,
              title: Text('${teks(x['mapel'])} · ${teks(x['rombel'])}'),
              subtitle: Text('${_hari(teks(x['tanggal']))}, ${teks(x['tanggal'])} ${teks(x['jam'])} · ${x['peserta']} peserta · bank ${x['bank']} soal / perlu ${x['perlu']}'
                  '${daftar(x['tanpaBank']).isEmpty ? '' : '\nSesi tanpa bank soal: ${daftar(x['tanpaBank']).join(', ')}'}'),
              trailing: Lencana(teks(x['status']), warna: _warna(teks(x['status']))),
            ),
          ),
      ]),
    );
  }
}
