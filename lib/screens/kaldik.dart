import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';
import 'kaldik_keterangan.dart';

/// v1.95.0: KALENDER AKADEMIK (kaldik). Tanggal sesi mengikuti kaldik: hari pertama masuk per semester, daftar libur
/// (minggu dengan libur >= 3 hari dilewati), dan sesi ujian bertanggal (UTS/UAS/UPK, boleh > 1 minggu).
/// Nomor sesi tetap 1..N per semester, jadi materi/kurikulum/absensi tidak berubah; hanya tanggalnya yang bergeser.

const _bln = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
String _iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
DateTime? _tgl(dynamic s) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(teks(s));
  return m == null ? null : DateTime(int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
}
String _teks(dynamic s) {
  final d = s is DateTime ? s : _tgl(s);
  return d == null ? '-' : '${d.day} ${_bln[d.month - 1]} ${d.year}';
}
String _rentang(dynamic a, dynamic b) {
  final x = a is DateTime ? a : _tgl(a), y = b is DateTime ? b : _tgl(b);
  if (x == null || y == null) return '-';
  if (x == y) return _teks(x);
  return x.year == y.year ? '${x.day} ${_bln[x.month - 1]} – ${_teks(y)}' : '${_teks(x)} – ${_teks(y)}';
}

class _Smt {
  DateTime? mulai, rapor;
  final libur = <Map<String, dynamic>>[];
  final tetap = <int, Map<String, dynamic>>{};
  List<Map<String, dynamic>> keterangan = [];   // baris tabel keterangan kaldik (arsip)

  _Smt.dari(Map<String, dynamic> m) {
    mulai = _tgl(m['mulai']);
    rapor = _tgl(m['rapor']);
    for (final l in daftar(m['libur']).map(peta)) {
      libur.add({'dari': teks(l['dari']), 'sampai': teks(l['sampai'], teks(l['dari'])), 'nama': teks(l['nama'], 'Libur')});
    }
    keterangan = daftar(m['keterangan']).map(peta).toList();
    peta(m['tetap']).forEach((k, v) {
      final n = int.tryParse(k);
      if (n != null) tetap[n] = {'dari': teks(peta(v)['dari']), 'sampai': teks(peta(v)['sampai']), 'ket': teks(peta(v)['ket'])};
    });
  }

  bool get kosong => mulai == null;

  Map<String, dynamic> keJson() => {
        'mulai': mulai == null ? '' : _iso(mulai!),
        'rapor': rapor == null ? '' : _iso(rapor!),
        'libur': libur,
        'tetap': {for (final e in tetap.entries) '${e.key}': e.value},
        if (keterangan.isNotEmpty) 'keterangan': keterangan,
      };
}

/// Editor kaldik. [simpanKeServer] true = simpan lewat waAdminTaKaldikSimpan lalu tampilkan pratinjau minggu;
/// false = kembalikan Map kaldik ke pemanggil (dipakai wizard Tahun Ajaran Baru).
class KaldikEditorScreen extends StatefulWidget {
  const KaldikEditorScreen({super.key, this.awal, this.label = '', this.uts = 9, this.uas = 18, this.upk = 0, this.simpanKeServer = true});
  final Map<String, dynamic>? awal;
  final String label;
  final int uts, uas, upk;
  final bool simpanKeServer;

  @override
  State<KaldikEditorScreen> createState() => _KaldikEditorScreenState();
}

class _KaldikEditorScreenState extends State<KaldikEditorScreen> {
  late final _Smt _s1 = _Smt.dari(peta(widget.awal?['s1']));
  late final _Smt _s2 = _Smt.dari(peta(widget.awal?['s2']));

  Future<DateTime?> _pilihTgl(DateTime? awal, String judul) => showDatePicker(
      context: context, initialDate: awal ?? DateTime.now(), firstDate: DateTime(2020), lastDate: DateTime(2100), helpText: judul);

  Future<DateTimeRange?> _pilihRentang(String judul, {DateTime? a, DateTime? b}) => showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(2100),
      initialDateRange: a != null && b != null ? DateTimeRange(start: a, end: b) : null,
      helpText: judul);

  Future<void> _tambahLibur(_Smt s, [int? ubah]) async {
    final lama = ubah == null ? null : s.libur[ubah];
    final r = await _pilihRentang('Tanggal libur', a: _tgl(lama?['dari']), b: _tgl(lama?['sampai']));
    if (r == null || !mounted) return;
    final c = TextEditingController(text: teks(lama?['nama']));
    final nama = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Libur ${_rentang(r.start, r.end)}'),
        content: TextField(controller: c, autofocus: true, decoration: const InputDecoration(labelText: 'Keterangan', hintText: 'mis. Libur Idul Fitri')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(ctx, c.text.trim().isEmpty ? 'Libur' : c.text.trim()), child: const Text('Simpan')),
        ],
      ),
    );
    if (nama == null) return;
    setState(() {
      final x = {'dari': _iso(r.start), 'sampai': _iso(r.end), 'nama': nama};
      if (ubah == null) {
        s.libur.add(x);
      } else {
        s.libur[ubah] = x;
      }
      s.libur.sort((a, b) => teks(a['dari']).compareTo(teks(b['dari'])));
    });
  }

  Future<void> _aturTetap(_Smt s, int n, String nama) async {
    final lama = s.tetap[n];
    final r = await _pilihRentang('Tanggal $nama (Sesi $n)', a: _tgl(lama?['dari']), b: _tgl(lama?['sampai']));
    if (r == null) return;
    setState(() => s.tetap[n] = {'dari': _iso(r.start), 'sampai': _iso(r.end), 'ket': nama});
  }

  // Isi semester dari tabel keterangan kaldik (tanpa AI).
  Future<void> _dariKeterangan(_Smt s, int smt) async {
    final kini = DateTime.now();
    final r = await Navigator.of(context).push<Map<String, dynamic>>(MaterialPageRoute(
        builder: (_) => KeteranganKaldikScreen(smt: smt, awal: s.keterangan, sedangBerjalan: s.mulai != null && !s.mulai!.isAfter(kini))));
    if (r == null || !mounted) return;
    final pakai = peta(r['pakai']);
    setState(() {
      if (pakai['mulai'] == true && r['mulai'] != null) s.mulai = _tgl(r['mulai']);
      if (pakai['rapor'] == true && r['rapor'] != null) s.rapor = _tgl(r['rapor']);
      if (pakai['libur'] == true) {
        s.libur
          ..clear()
          ..addAll(daftar(r['libur']).map((x) => Map<String, dynamic>.from(peta(x))));
      }
      final a = _tgl(r['uasDari']), b = _tgl(r['uasSampai']);
      if (pakai['uas'] == true && a != null && b != null && widget.uas > 0) {
        final senin = a.subtract(Duration(days: a.weekday - 1)), minggu = b.add(Duration(days: 7 - b.weekday));
        s.tetap[widget.uas] = {'dari': _iso(senin), 'sampai': _iso(minggu), 'ket': smt == 1 ? 'Asesmen sumatif akhir semester' : 'Asesmen sumatif akhir tahun'};
      }
      final ua = _tgl(r['utsDari']), ub = _tgl(r['utsSampai']);
      if (pakai['uts'] == true && ua != null && ub != null && widget.uts > 0) {
        s.tetap[widget.uts] = {
          'dari': _iso(ua.subtract(Duration(days: ua.weekday - 1))),
          'sampai': _iso(ub.add(Duration(days: 7 - ub.weekday))),
          'ket': 'Asesmen tengah semester'
        };
      }
      s.keterangan = daftar(r['keterangan']).map(peta).toList();
    });
    kabar(context, 'Keterangan diterapkan. Periksa lalu ketuk "Simpan & lihat jadwal".');
  }

  Future<void> _simpan() async {
    if (_s1.kosong) return kabar(context, 'Isi hari pertama masuk Semester 1.', galat: true);
    final data = {'s1': _s1.keJson(), if (!_s2.kosong) 's2': _s2.keJson()};
    if (!widget.simpanKeServer) {
      Navigator.pop(context, data);
      return;
    }
    final r = await jalankan(context, () => Api.instance('waAdminTaKaldikSimpan', [Sesi.instance.token, data]), teksProses: 'Menyusun jadwal sesi...');
    if (!r.ok || !mounted) return;
    final d = peta(r.data);
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => _HasilKaldik(d: d)));
    if (mounted) Navigator.pop(context, d);
  }

  Widget _semester(_Smt s, int smt) {
    final cs = Theme.of(context).colorScheme;
    final ujian = <(int, String)>[
      if (widget.uts > 0) (widget.uts, 'UTS'),
      if (widget.uas > 0) (widget.uas, smt == 1 ? 'UAS / ASAS' : 'UAS / ASAT'),
      if (smt == 2 && widget.upk > 0) (widget.upk, 'UPK'),
    ];
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 96), children: [
      // v1.95.0: isi otomatis dari tabel keterangan kaldik dinas
      Card(
        color: cs.secondaryContainer,
        child: ListTile(
          leading: const Icon(Icons.table_rows_outlined),
          title: const Text('Isi dari tabel keterangan kaldik', style: TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text(s.keterangan.isEmpty
              ? 'Tempel tabel Tanggal | Kegiatan di bawah kalender semester ini; hari pertama, libur, UAS, dan rapor terisi otomatis.'
              : '${s.keterangan.length} baris keterangan tersimpan · ketuk untuk memeriksa / menerapkan ulang'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => _dariKeterangan(s, smt),
        ),
      ),
      Card(
        child: Column(children: [
          ListTile(
            leading: const Icon(Icons.flag_outlined),
            title: const Text('Hari pertama masuk'),
            subtitle: Text(_teks(s.mulai)),
            trailing: const Icon(Icons.edit_calendar_outlined),
            onTap: () async {
              final t = await _pilihTgl(s.mulai, 'Hari pertama masuk Semester $smt');
              if (t != null) setState(() => s.mulai = t);
            },
          ),
          ListTile(
            leading: const Icon(Icons.assignment_turned_in_outlined),
            title: const Text('Pembagian rapor'),
            subtitle: Text(_teks(s.rapor)),
            trailing: const Icon(Icons.edit_calendar_outlined),
            onTap: () async {
              final t = await _pilihTgl(s.rapor ?? s.mulai, 'Pembagian rapor Semester $smt');
              if (t != null) setState(() => s.rapor = t);
            },
          ),
        ]),
      ),
      JudulBagian('Sesi ujian bertanggal', sub: 'Kosong = mengikuti urutan minggu efektif'),
      Card(
        child: Column(children: [
          for (final u in ujian)
            ListTile(
              leading: const Icon(Icons.fact_check_outlined),
              title: Text('${u.$2} · Sesi ${u.$1}'),
              subtitle: Text(s.tetap[u.$1] == null ? 'Otomatis' : _rentang(s.tetap[u.$1]!['dari'], s.tetap[u.$1]!['sampai'])),
              trailing: s.tetap[u.$1] == null
                  ? const Icon(Icons.edit_calendar_outlined)
                  : IconButton(tooltip: 'Hapus tanggal', icon: const Icon(Icons.close), onPressed: () => setState(() => s.tetap.remove(u.$1))),
              onTap: () => _aturTetap(s, u.$1, u.$2),
            ),
        ]),
      ),
      JudulBagian('Libur', sub: 'Minggu dengan libur ≥ 3 hari (Senin–Sabtu) dilewati; libur 1–2 hari tidak menggeser sesi',
          aksi: TextButton.icon(onPressed: () => _tambahLibur(s), icon: const Icon(Icons.add), label: const Text('Tambah'))),
      if (s.libur.isEmpty) const Kosong(pesan: 'Belum ada libur.', ikon: Icons.beach_access_outlined),
      for (final e in s.libur.asMap().entries)
        Card(
          child: ListTile(
            dense: true,
            leading: Icon(Icons.beach_access_outlined, color: cs.error),
            title: Text(teks(e.value['nama'])),
            subtitle: Text(_rentang(e.value['dari'], e.value['sampai'])),
            onTap: () => _tambahLibur(s, e.key),
            trailing: IconButton(tooltip: 'Hapus', icon: const Icon(Icons.delete_outline), onPressed: () => setState(() => s.libur.removeAt(e.key))),
          ),
        ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text('Kalender akademik${widget.label.isEmpty ? '' : ' ${widget.label}'}'),
          bottom: const TabBar(tabs: [Tab(text: 'Semester 1'), Tab(text: 'Semester 2')]),
        ),
        body: TabBarView(children: [_semester(_s1, 1), _semester(_s2, 2)]),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _simpan,
          icon: Icon(widget.simpanKeServer ? Icons.save : Icons.check),
          label: Text(widget.simpanKeServer ? 'Simpan & lihat jadwal' : 'Pakai kalender ini'),
        ),
      ),
    );
  }
}

class _HasilKaldik extends StatelessWidget {
  const _HasilKaldik({required this.d});
  final Map<String, dynamic> d;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Jadwal sesi tersusun')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [TabelMinggu(paket: d)]),
    );
  }
}

/// Tabel minggu per semester dari paket tahun ajaran (minggu, peringatan, uts/uas/upk).
class TabelMinggu extends StatelessWidget {
  const TabelMinggu({super.key, required this.paket});
  final Map<String, dynamic> paket;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final minggu = peta(paket['minggu']);
    final uts = angka(paket['uts']), uas = angka(paket['uas']), upk = angka(paket['upk']);
    final peringatan = daftar(paket['peringatan']).map(teks).toList();
    if (minggu.isEmpty) return const Kosong(pesan: 'Kalender akademik belum diisi: sesi dibagi rata dari tanggal mulai.', ikon: Icons.event_note);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final p in peringatan)
        Card(color: cs.errorContainer, child: Padding(padding: const EdgeInsets.all(12), child: Text(p, style: TextStyle(color: cs.onErrorContainer)))),
      for (final smt in ['1', '2'])
        if (daftar(minggu[smt]).isNotEmpty) ...[
          JudulBagian('Semester $smt', sub: '${daftar(minggu[smt]).length} minggu'),
          Card(
            child: Column(children: [
              for (final w in daftar(minggu[smt]).map(peta))
                Builder(builder: (context) {
                  final sesi = daftar(w['sesi']).map((x) => angka(x)).toList();
                  final libur = daftar(w['libur']).map(teks).toList();
                  String label;
                  Color warna;
                  if (sesi.isNotEmpty) {
                    final n = sesi.first;
                    label = n == uas ? 'Sesi $n · UAS' : n == uts ? 'Sesi $n · UTS' : (smt == '2' && n == upk ? 'Sesi $n · UPK' : 'Sesi $n');
                    warna = n == uas || n == uts || (smt == '2' && n == upk) ? Colors.deepPurple : cs.primary;
                  } else if (w['efektif'] != true) {
                    label = 'Libur';
                    warna = cs.error;
                  } else {
                    label = 'Cadangan / jeda';
                    warna = Colors.orange.shade800;
                  }
                  return ListTile(
                    dense: true,
                    title: Text(_rentang(w['senin'], w['minggu'])),
                    subtitle: libur.isEmpty ? null : Text(libur.join(', '), style: TextStyle(color: cs.error, fontSize: 12)),
                    trailing: Lencana(label, warna: warna),
                  );
                }),
            ]),
          ),
        ],
    ]);
  }
}
