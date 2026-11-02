import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';

String _iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
DateTime? _dariIso(String s) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(s);
  return m == null ? null : DateTime(int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
}

const _bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
String _tgl(dynamic ms) {
  final n = angka(ms).toInt();
  if (n <= 0) return '';
  final d = DateTime.fromMillisecondsSinceEpoch(n);
  return '${d.day} ${_bulan[d.month - 1]} ${d.year}';
}

Future<DateTime?> _pilihSenin(BuildContext context, DateTime? awal) {
  var a = awal ?? DateTime.now();
  while (a.weekday != DateTime.monday) {
    a = a.add(const Duration(days: 1));
  }
  return showDatePicker(
    context: context,
    initialDate: a,
    firstDate: DateTime(2020),
    lastDate: DateTime(2100),
    selectableDayPredicate: (d) => d.weekday == DateTime.monday,
    helpText: 'Tanggal mulai (hari Senin)',
  );
}

/// Pengaturan tahun ajaran + proses tahun ajaran baru (naik kelas).
class TahunAjaranScreen extends StatefulWidget {
  const TahunAjaranScreen({super.key});

  @override
  State<TahunAjaranScreen> createState() => _TahunAjaranScreenState();
}

class _TahunAjaranScreenState extends State<TahunAjaranScreen> {
  int _versi = 0;

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Column(children: [
        const TabBar(tabs: [Tab(text: 'Pengaturan'), Tab(text: 'Tahun Ajaran Baru')]),
        Expanded(
          child: TabBarView(children: [
            _Pengaturan(key: ValueKey('p$_versi'), berubah: () => setState(() => _versi++)),
            _TahunBaru(key: ValueKey('b$_versi'), selesai: () => setState(() => _versi++)),
          ]),
        ),
      ]),
    );
  }
}

class _Pengaturan extends StatefulWidget {
  const _Pengaturan({super.key, required this.berubah});
  final VoidCallback berubah;

  @override
  State<_Pengaturan> createState() => _PengaturanState();
}

class _PengaturanState extends State<_Pengaturan> {
  Map<String, dynamic>? _d;
  String? _galat;
  final _label = TextEditingController();
  final _per = TextEditingController();
  final _uts = TextEditingController();
  final _uas = TextEditingController();
  final _masa = TextEditingController();
  DateTime? _mulai;
  TimeOfDay? _tayang;
  TimeOfDay? _batas;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  TimeOfDay? _jam(String s) {
    final m = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(s);
    return m == null ? null : TimeOfDay(hour: int.parse(m[1]!), minute: int.parse(m[2]!));
  }

  String _jamTeks(TimeOfDay? t) => t == null ? '-' : '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  void _isi(Map<String, dynamic> d) {
    _d = d;
    _label.text = teks(d['label']);
    _per.text = teks(d['sesiPerSemester']);
    _uts.text = teks(d['uts']);
    _uas.text = teks(d['uas']);
    _masa.text = teks(d['masaBukaHari']);
    _mulai = _dariIso(teks(d['mulai']));
    _tayang = _jam(teks(d['jamTayang']));
    _batas = _jam(teks(d['jamBatas']));
  }

  Future<void> _muat() async {
    setState(() => _galat = null);
    try {
      final d = peta(await Api.instance('waAdminTaBaca', [Sesi.instance.token]));
      if (mounted) setState(() => _isi(d));
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  Future<void> _simpan() async {
    final data = {
      'label': _label.text.trim(),
      'mulai': _mulai == null ? '' : _iso(_mulai!),
      'sesiPerSemester': _per.text.trim(),
      'uts': _uts.text.trim(),
      'uas': _uas.text.trim(),
      'jamTayang': _jamTeks(_tayang),
      'jamBatas': _jamTeks(_batas),
      'masaBukaHari': _masa.text.trim(),
    };
    final r = await jalankan(context, () => Api.instance('waAdminTaSimpan', [Sesi.instance.token, data]), teksProses: 'Menyimpan tahun ajaran...');
    if (r.ok && mounted) {
      setState(() => _isi(peta(r.data)));
      kabar(context, 'Pengaturan tahun ajaran disimpan.');
    }
  }

  Widget _angka(TextEditingController c, String label) => Expanded(
        child: TextField(controller: c, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: label)),
      );

  @override
  Widget build(BuildContext context) {
    if (_galat != null) return PesanGalat(pesan: _galat!, ulangi: _muat);
    final d = _d;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final sesi = daftar(d['sesi']).map(peta).toList();
    final cs = Theme.of(context).colorScheme;
    return RefreshIndicator(
      onRefresh: _muat,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          Card(
            color: cs.primaryContainer,
            child: ListTile(
              leading: const Icon(Icons.event_note),
              title: Text('Tahun ajaran ${teks(d['label'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text([
                teks(d['rentangTahun']),
                teks(d['sekarang']).isEmpty ? 'Terdekat: ${teks(d['terdekat'])}' : 'Sekarang: ${teks(d['sekarang'])}',
              ].join('\n')),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                TextField(controller: _label, decoration: const InputDecoration(labelText: 'Nama tahun ajaran', hintText: 'mis. 2026/2027')),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: () async {
                    final t = await _pilihSenin(context, _mulai);
                    if (t != null) setState(() => _mulai = t);
                  },
                  icon: const Icon(Icons.calendar_month),
                  label: Text(_mulai == null ? 'Pilih tanggal mulai (Senin)' : 'Mulai: ${_tgl(_mulai!.millisecondsSinceEpoch)}'),
                ),
                const SizedBox(height: 10),
                Row(children: [_angka(_per, 'Sesi/semester'), const SizedBox(width: 8), _angka(_uts, 'Sesi UTS'), const SizedBox(width: 8), _angka(_uas, 'Sesi UAS')]),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () async {
                        final t = await showTimePicker(context: context, initialTime: _tayang ?? const TimeOfDay(hour: 7, minute: 0));
                        if (t != null) setState(() => _tayang = t);
                      },
                      child: Text('Tayang ${_jamTeks(_tayang)}'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () async {
                        final t = await showTimePicker(context: context, initialTime: _batas ?? const TimeOfDay(hour: 23, minute: 59));
                        if (t != null) setState(() => _batas = t);
                      },
                      child: Text('Batas ${_jamTeks(_batas)}'),
                    ),
                  ),
                ]),
                const SizedBox(height: 10),
                TextField(controller: _masa, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Lama sesi dibuka tutor (hari)')),
                const SizedBox(height: 14),
                FilledButton.icon(onPressed: _simpan, icon: const Icon(Icons.save), label: const Text('Simpan pengaturan')),
              ]),
            ),
          ),
          JudulBagian('Jadwal sesi', sub: '${sesi.length} sesi · ${angka(d['jumlahSemester'])} semester'),
          Card(
            child: Column(children: [
              for (final s in sesi)
                ListTile(
                  dense: true,
                  title: Text(teks(s['nama'])),
                  subtitle: Text([_tgl(s['mulaiMs']), _tgl(s['selesaiMs'])].where((x) => x.isNotEmpty).join(' – ')),
                  trailing: teks(s['status']) == 'berjalan'
                      ? Lencana('Berjalan', warna: Colors.green)
                      : teks(s['status']) == 'selesai'
                          ? Lencana('Selesai', warna: cs.outline)
                          : null,
                ),
            ]),
          ),
        ],
      ),
    );
  }
}

class _TahunBaru extends StatefulWidget {
  const _TahunBaru({super.key, required this.selesai});
  final VoidCallback selesai;

  @override
  State<_TahunBaru> createState() => _TahunBaruState();
}

class _TahunBaruState extends State<_TahunBaru> {
  Map<String, dynamic>? _d;
  String? _galat;
  final _label = TextEditingController();
  final _konfirmasi = TextEditingController();
  DateTime? _mulai;
  final Map<String, String> _tujuan = {};
  bool _arsip = true;
  bool _resetMateri = true;
  Map<String, dynamic>? _laporan;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat() async {
    setState(() => _galat = null);
    try {
      final d = peta(await Api.instance('waStafTahunBaruPratinjau', [Sesi.instance.token], const Duration(seconds: 120)));
      if (!mounted) return;
      setState(() {
        _d = d;
        _label.text = teks(d['saranLabel']);
        _mulai = _dariIso(teks(d['saranMulai']));
        _tujuan.clear();
        for (final r in daftar(d['rombel']).map(peta)) {
          _tujuan[teks(r['id'])] = teks(r['tujuan'], 'TETAP');
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  Future<void> _jalankan() async {
    if (_konfirmasi.text.trim().toUpperCase() != 'NAIK KELAS') {
      kabar(context, 'Ketik NAIK KELAS pada kotak konfirmasi.', galat: true);
      return;
    }
    final ok = await konfirmasi(context, 'Mulai tahun ajaran baru?',
        'Spreadsheet akan dicadangkan lebih dulu, lalu siswa dipindah sesuai peta kenaikan. Proses ini bisa memakan beberapa menit.',
        ya: 'Jalankan');
    if (!ok || !mounted) return;
    final rencana = {
      'konfirmasi': 'NAIK KELAS',
      'label': _label.text.trim(),
      'mulai': _mulai == null ? '' : _iso(_mulai!),
      'peta': _tujuan,
      'arsipData': _arsip,
      'resetMateri': _resetMateri,
    };
    final r = await jalankan(context, () => Api.instance('waStafTahunBaruJalankan', [Sesi.instance.token, rencana], const Duration(seconds: 360)),
        teksProses: 'Memproses tahun ajaran baru...');
    if (r.ok && mounted) setState(() => _laporan = peta(peta(r.data)['laporan']));
  }

  @override
  Widget build(BuildContext context) {
    if (_galat != null) return PesanGalat(pesan: _galat!, ulangi: _muat);
    final lap = _laporan;
    if (lap != null) {
      final s = peta(lap['siswa']);
      return ListView(padding: const EdgeInsets.all(16), children: [
        const Icon(Icons.celebration, size: 56, color: Colors.green),
        const SizedBox(height: 8),
        Text('Tahun ajaran ${_label.text} dimulai', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        Card(
          child: Column(children: [
            ListTile(title: const Text('Naik kelas'), trailing: Text('${angka(s['naik'])}')),
            ListTile(title: const Text('Lulus'), trailing: Text('${angka(s['lulus'])}')),
            ListTile(title: const Text('Tetap'), trailing: Text('${angka(s['tetap'])}')),
            if (teks(lap['cadanganUrl']).isNotEmpty)
              ListTile(
                leading: const Icon(Icons.backup),
                title: Text(teks(lap['cadanganNama'], 'Salinan cadangan')),
                trailing: const Icon(Icons.open_in_new),
                onTap: () => launchUrl(Uri.parse(teks(lap['cadanganUrl'])), mode: LaunchMode.externalApplication),
              ),
          ]),
        ),
        const SizedBox(height: 12),
        FilledButton(onPressed: widget.selesai, child: const Text('Selesai')),
      ]);
    }
    final d = _d;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final rombel = daftar(d['rombel']).map(peta).toList();
    final arsip = daftar(d['arsip']).map(peta).toList();
    final pilihan = <DropdownMenuItem<String>>[
      const DropdownMenuItem(value: 'TETAP', child: Text('Tetap di kelas ini')),
      const DropdownMenuItem(value: 'LULUS', child: Text('Lulus')),
      for (final r in rombel) DropdownMenuItem(value: teks(r['id']), child: Text('→ ${teks(r['nama'])}', overflow: TextOverflow.ellipsis)),
    ];
    final nilaiSah = pilihan.map((e) => e.value).toSet();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Text('Tahun ajaran sekarang: ${teks(d['labelLama'])}. Proses ini membuat cadangan spreadsheet, mengarsipkan data tahun lama, '
                'memindahkan siswa sesuai peta kenaikan, mengembalikan ${angka(d['materiReset'])} materi ke Draft, lalu memperbarui pengaturan tahun ajaran.'),
          ),
        ),
        const SizedBox(height: 12),
        TextField(controller: _label, decoration: const InputDecoration(labelText: 'Nama tahun ajaran baru')),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: () async {
            final t = await _pilihSenin(context, _mulai);
            if (t != null) setState(() => _mulai = t);
          },
          icon: const Icon(Icons.calendar_month),
          label: Text(_mulai == null ? 'Pilih tanggal mulai (Senin)' : 'Mulai: ${_tgl(_mulai!.millisecondsSinceEpoch)}'),
        ),
        JudulBagian('Peta kenaikan kelas', sub: '${rombel.length} rombel'),
        Card(
          child: Column(children: [
            for (final r in rombel)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${teks(r['nama'])} · ${angka(r['siswa'])} siswa', style: const TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String>(
                    initialValue: nilaiSah.contains(_tujuan[teks(r['id'])]) ? _tujuan[teks(r['id'])] : 'TETAP',
                    isExpanded: true,
                    isDense: true,
                    items: pilihan,
                    onChanged: (v) => setState(() => _tujuan[teks(r['id'])] = v ?? 'TETAP'),
                  ),
                  const SizedBox(height: 6),
                ]),
              ),
          ]),
        ),
        const SizedBox(height: 8),
        SwitchListTile(
          title: const Text('Arsipkan data tahun lama'),
          subtitle: Text(arsip.isEmpty ? 'Tidak ada sheet untuk diarsip' : arsip.map((a) => '${teks(a['nama'])} (${angka(a['baris'])})').join(', ')),
          value: _arsip,
          onChanged: (v) => setState(() => _arsip = v),
        ),
        SwitchListTile(
          title: const Text('Kembalikan materi ke Draft'),
          subtitle: Text('${angka(d['materiReset'])} materi terbit'),
          value: _resetMateri,
          onChanged: (v) => setState(() => _resetMateri = v),
        ),
        const SizedBox(height: 8),
        TextField(controller: _konfirmasi, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Ketik NAIK KELAS untuk konfirmasi')),
        const SizedBox(height: 12),
        FilledButton.icon(
          style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
          onPressed: _jalankan,
          icon: const Icon(Icons.school),
          label: const Text('Mulai tahun ajaran baru'),
        ),
      ],
    );
  }
}
