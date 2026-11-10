import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';

/// Sinkron siswa Data Induk <-> Belajar Mandiri (saling melengkapi, tidak menimpa) + analisa data ganda.
class GandaScreen extends StatefulWidget {
  const GandaScreen({super.key});

  @override
  State<GandaScreen> createState() => _GandaScreenState();
}

class _GandaScreenState extends State<GandaScreen> {
  int _versiGanda = 0;
  Map<String, dynamic>? _rencana;
  bool _memuatRencana = false;
  String? _galatRencana;

  String? get _t => Sesi.instance.token;

  Future<void> _cek() async {
    setState(() {
      _memuatRencana = true;
      _galatRencana = null;
    });
    try {
      final r = peta(await Api.instance('waAdminSinkronSiswaPratinjau', [_t], const Duration(seconds: 240)));
      if (mounted) setState(() => _rencana = r);
    } catch (e) {
      if (mounted) setState(() => _galatRencana = e is ApiException ? e.ramah : '$e');
    } finally {
      if (mounted) setState(() => _memuatRencana = false);
    }
  }

  Future<void> _terapkan() async {
    if (!await konfirmasi(context, 'Lengkapi sekarang',
        'Kolom yang masih kosong di Belajar Mandiri dan Data Induk akan dilengkapi, dan tanggal lahir yang mundur 1 hari disamakan dengan Data Induk. Data yang sudah terisi tidak ditimpa. Lanjutkan?',
        ya: 'Lengkapi')) {
      return;
    }
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminSinkronSiswaTerapkan', [_t], const Duration(seconds: 300)), teksProses: 'Melengkapi data di kedua sisi...');
    if (r.ok && mounted) {
      kabar(context, '${angka(peta(r.data)['tercatat'])} isian dilengkapi. Riwayat ada di tab "Sinkron Siswa".');
      _cek();
    }
  }

  Future<void> _kirim(Map<String, dynamic> c) async {
    if (!await konfirmasi(context, 'Kirim ke Data Induk', 'Kirim ${teks(c['nama'])} (${teks(c['rombel'])}, lahir ${teks(c['tgl'])}) ke tab WARGA BELAJAR di Data Induk?', ya: 'Kirim')) return;
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminKirimKeMenu', [_t, teks(c['kunci'])]), teksProses: 'Mengirim ke Data Induk...');
    if (r.ok && mounted) {
      kabar(context, '${teks(c['nama'])} ditambahkan ke Data Induk.');
      _cek();
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        const _KartuSinkronOtomatis(),
        const SizedBox(height: 12),
        _kartuSinkron(context),
        const SizedBox(height: 12),
        _GandaDaftar(key: ValueKey(_versiGanda), onBerubah: () => setState(() => _versiGanda++)),
      ],
    );
  }

  Widget _kartuSinkron(BuildContext context) {
    final r = _rencana;
    final cs = Theme.of(context).colorScheme;
    Widget tabel(List<String> kepala, List<List<String>> baris) => Column(
          children: [
            for (final b in baris)
              ListTile(
                dense: true,
                title: Text(b.first),
                subtitle: Text([for (var i = 1; i < b.length; i++) if (b[i].isNotEmpty) '${kepala[i]}: ${b[i]}'].join(' · ')),
              ),
          ],
        );
    Widget lipat(String judul, Widget isi, {bool buka = false}) => ExpansionTile(initiallyExpanded: buka, title: Text(judul, style: const TextStyle(fontWeight: FontWeight.w600)), children: [isi]);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('🔄 Sinkron Siswa: Data Induk ⇄ Belajar Mandiri', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text('Kedua data saling dicek dan saling melengkapi kolom yang masih kosong. Data yang sudah terisi tidak ditimpa; bila berbeda, masuk daftar "Perlu dicek".'),
          const SizedBox(height: 10),
          Wrap(spacing: 8, runSpacing: 8, children: [
            OutlinedButton.icon(onPressed: _memuatRencana ? null : _cek, icon: const Icon(Icons.search), label: const Text('Cek perbedaan')),
            FilledButton.icon(onPressed: _memuatRencana ? null : _terapkan, icon: const Icon(Icons.done_all), label: const Text('Lengkapi sekarang')),
          ]),
          if (_memuatRencana) const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator())),
          if (_galatRencana != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_galatRencana!, style: TextStyle(color: cs.error))),
          if (r != null && !_memuatRencana) ...[
            const SizedBox(height: 10),
            Wrap(spacing: 6, runSpacing: 6, children: [
              Lencana('${daftar(r['keBm']).length} dilengkapi di BM', warna: Colors.green),
              Lencana('${daftar(r['keMenu']).length} dilengkapi di Data Induk', warna: Colors.green),
              Lencana('${daftar(r['tglDibetulkan']).length} tgl lahir dibetulkan', warna: Colors.orange),
              Lencana('${daftar(r['perluCek']).length} perlu dicek', warna: cs.error),
              Lencana('${daftar(r['calonKeMenu']).length} hanya di BM', warna: Colors.orange),
            ]),
            if (teks(r['terakhir']).isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Pelengkapan terakhir: ${teks(r['terakhir'])}', style: Theme.of(context).textTheme.bodySmall)),
            if (daftar(r['keBm']).isNotEmpty)
              lipat('Akan dilengkapi di Belajar Mandiri (${daftar(r['keBm']).length})',
                  tabel(['Nama', 'Kolom', 'Isi'], daftar(r['keBm']).map(peta).map((x) => [teks(x['nama']), teks(x['kolom']), teks(x['nilai'])]).toList())),
            if (daftar(r['keMenu']).isNotEmpty)
              lipat('Akan dilengkapi di Data Induk (${daftar(r['keMenu']).length})',
                  tabel(['Nama', 'Kolom', 'Isi'], daftar(r['keMenu']).map(peta).map((x) => [teks(x['nama']), teks(x['kolom']), teks(x['nilai'])]).toList())),
            if (daftar(r['tglDibetulkan']).isNotEmpty)
              lipat('Tanggal lahir disamakan dengan Data Induk (${daftar(r['tglDibetulkan']).length})',
                  tabel(['Nama', 'Di BM', 'Di Data Induk'], daftar(r['tglDibetulkan']).map(peta).map((x) => [teks(x['nama']), teks(x['lama']), teks(x['baru'])]).toList())),
            if (daftar(r['perluCek']).isNotEmpty)
              lipat('Perlu dicek admin (${daftar(r['perluCek']).length})',
                  tabel(['Nama', 'Kolom', 'Di BM', 'Di Data Induk', 'Ket'],
                      daftar(r['perluCek']).map(peta).map((x) => [teks(x['nama']), teks(x['kolom']), teks(x['bm']), teks(x['menu']), teks(x['ket'])]).toList()),
                  buka: true),
            if (daftar(r['calonKeMenu']).isNotEmpty)
              lipat(
                'Hanya ada di Belajar Mandiri (${daftar(r['calonKeMenu']).length})',
                Column(children: [
                  for (final c in daftar(r['calonKeMenu']).map(peta))
                    ListTile(
                      title: Text(teks(c['nama'])),
                      subtitle: Text([teks(c['rombel']), 'lahir ${teks(c['tgl'])}', if (c['curigaGanda'] == true) '⚠ mirip siswa lain'].join(' · ')),
                      trailing: TextButton(onPressed: () => _kirim(c), child: const Text('Kirim ke Data Induk')),
                    ),
                ]),
                buka: true,
              ),
          ],
        ]),
      ),
    );
  }
}

class _GandaDaftar extends StatelessWidget {
  const _GandaDaftar({super.key, required this.onBerubah});
  final VoidCallback onBerubah;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Muatan<Map<String, dynamic>>(
          muat: () async => peta(await Api.instance('waAdminGandaDaftar', [Sesi.instance.token], const Duration(seconds: 240))),
          bangun: (context, d, segarkan) {
            final pasangan = daftar(d['pasangan']).map(peta).toList();
            final rombel = daftar(d['rombel']).map(peta).toList();
            return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text('🧬 Analisa Data Siswa Ganda', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
                IconButton(tooltip: 'Analisa ulang', onPressed: onBerubah, icon: const Icon(Icons.refresh)),
              ]),
              Text('${pasangan.length} indikasi · dianalisa ${teks(d['waktu'])}', style: Theme.of(context).textTheme.bodySmall),
              if (pasangan.isEmpty) const Kosong(pesan: 'Tidak ditemukan indikasi data ganda.', ikon: Icons.verified_outlined),
              for (final p in pasangan) _KartuPasangan(p: p, rombel: rombel, onBerubah: onBerubah),
            ]);
          },
        ),
      ),
    );
  }
}

class _KartuPasangan extends StatelessWidget {
  const _KartuPasangan({required this.p, required this.rombel, required this.onBerubah});
  final Map<String, dynamic> p;
  final List<Map<String, dynamic>> rombel;
  final VoidCallback onBerubah;

  Widget _sisi(BuildContext context, String judul, Map<String, dynamic> r) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(10)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('$judul · ${r['terdaftar'] == true ? '✅ sudah dipakai login' : 'belum pernah login'}', style: Theme.of(context).textTheme.bodySmall),
        Text(teks(r['nama']), style: const TextStyle(fontWeight: FontWeight.w700)),
        Text('${teks(r['namaRombel'])} · lahir ${teks(r['tgl'])}'),
        if (teks(r['nisn']).isNotEmpty) Text('NISN ${teks(r['nisn'])}'),
        if (teks(r['kontak']).isNotEmpty) Text(teks(r['kontak'])),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final a = peta(p['a']), b = peta(p['b']), menu = peta(p['menu']);
    return Card(
      margin: const EdgeInsets.only(top: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrap(spacing: 6, runSpacing: 6, children: [for (final x in daftar(p['alasan'])) Lencana('$x', warna: Colors.orange)]),
          const SizedBox(height: 8),
          LayoutBuilder(builder: (context, c) {
            final dua = c.maxWidth >= 520;
            final kiri = _sisi(context, 'Data A', a), kanan = _sisi(context, 'Data B', b);
            return dua
                ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: kiri), const SizedBox(width: 8), Expanded(child: kanan)])
                : Column(children: [kiri, const SizedBox(height: 8), kanan]);
          }),
          const SizedBox(height: 8),
          Text(menu.isEmpty ? 'Tidak ditemukan di Data Induk (kemungkinan belum ada di Dapodik).' : 'Di Data Induk: ${teks(menu['nama'])} · ${teks(menu['namaRombel'])} · lahir ${teks(menu['tgl'])}${teks(menu['nisn']).isNotEmpty ? ' · NISN ${teks(menu['nisn'])}' : ''}',
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 6),
          Wrap(spacing: 8, children: [
            FilledButton.tonal(
              onPressed: () async {
                final pilihan = await Navigator.of(context).push<Map<String, dynamic>>(MaterialPageRoute(builder: (_) => _GabungScreen(p: p, rombel: rombel)));
                if (pilihan == null || !context.mounted) return;
                final r = await jalankan(context, () => Api.instance('waAdminGandaGabung', [Sesi.instance.token, pilihan]), teksProses: 'Menggabungkan...');
                if (r.ok && context.mounted) {
                  kabar(context, 'Berhasil: ${teks(peta(r.data)['ket'])}');
                  onBerubah();
                }
              },
              child: const Text('Gabungkan…'),
            ),
            TextButton(
              onPressed: () async {
                if (!await konfirmasi(context, 'Bukan ganda', 'Tandai pasangan ini bukan data ganda? Pasangan ini tidak akan muncul lagi di analisa.')) return;
                if (!context.mounted) return;
                final r = await jalankan(context, () => Api.instance('waAdminGandaAbaikan', [Sesi.instance.token, teks(p['kunciPasangan'])]));
                if (r.ok && context.mounted) {
                  kabar(context, 'Ditandai bukan data ganda.');
                  onBerubah();
                }
              },
              child: const Text('Bukan ganda'),
            ),
          ]),
        ]),
      ),
    );
  }
}

class _GabungScreen extends StatefulWidget {
  const _GabungScreen({required this.p, required this.rombel});
  final Map<String, dynamic> p;
  final List<Map<String, dynamic>> rombel;

  @override
  State<_GabungScreen> createState() => _GabungScreenState();
}

class _GabungScreenState extends State<_GabungScreen> {
  late final Map<String, dynamic> a = peta(widget.p['a']);
  late final Map<String, dynamic> b = peta(widget.p['b']);
  late final Map<String, dynamic> menu = peta(widget.p['menu']);
  late String simpan = teks(widget.p['saran'], 'a');
  late String nama;
  late String tgl;
  late String rombel;

  Map<String, dynamic> get _s => simpan == 'a' ? a : b;

  String _kunciKelas(String n) => n.toLowerCase().replaceFirst(RegExp(r'^\s*kelas\s+'), '').replaceAll(RegExp(r'[^a-z0-9]'), '');

  String get _idRombelMenu {
    if (menu.isEmpty) return '';
    final k = _kunciKelas(teks(menu['namaRombel']));
    final f = widget.rombel.where((r) => _kunciKelas(teks(r['nama'])) == k).toList();
    return f.length == 1 ? teks(f.first['id']) : '';
  }

  @override
  void initState() {
    super.initState();
    final s = _s;
    final terdaftar = s['terdaftar'] == true;
    nama = terdaftar ? teks(s['nama']) : teks(menu['nama'], teks(s['nama']));
    tgl = terdaftar ? teks(s['tgl']) : teks(menu['tgl'], teks(s['tgl']));
    rombel = _idRombelMenu.isNotEmpty ? _idRombelMenu : teks(s['rombel']);
  }

  Widget _grup(String judul, List<MapEntry<String, String>> opsi, String nilai, ValueChanged<String> ubah) {
    final unik = <String, String>{};
    for (final o in opsi) {
      if (o.key.isNotEmpty && !unik.containsKey(o.key)) unik[o.key] = o.value;
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      JudulBagian(judul),
      RadioGroup<String>(
        groupValue: unik.containsKey(nilai) ? nilai : (unik.keys.isEmpty ? null : unik.keys.first),
        onChanged: (v) => ubah(v ?? nilai),
        child: Column(children: [for (final e in unik.entries) RadioListTile<String>(value: e.key, title: Text(e.value))]),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final namaRombel = {for (final r in widget.rombel) teks(r['id']): teks(r['nama'])};
    final s = _s;
    final peringatan = <String>[];
    if (s['terdaftar'] == true && nama != teks(s['nama'])) peringatan.add('Nama untuk masuk berubah menjadi "$nama". Beri tahu siswa.');
    if (s['terdaftar'] == true && tgl != teks(s['tgl']) && tgl.length == 10) {
      peringatan.add('Kata sandi siswa berubah menjadi TH-${tgl.substring(8, 10)}${tgl.substring(5, 7)}${tgl.substring(0, 4)}. Beri tahu siswa.');
    }
    if (rombel != teks(s['rombel'])) peringatan.add('Siswa dipindah rombel. Riwayat belajar di rombel lama tidak ikut pindah.');

    return Scaffold(
      appBar: AppBar(title: const Text('Gabungkan data ganda')),
      body: ListView(padding: const EdgeInsets.only(bottom: 24), children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Text('Satu baris dipertahankan, baris lainnya dihapus (salinannya disimpan di tab "Cadangan_Hapus_Siswa"). Kolom kosong pada baris yang dipertahankan diisi dari baris yang dihapus.'),
        ),
        _grup('Baris yang dipertahankan', [
          MapEntry('a', 'A: ${teks(a['nama'])} (${teks(a['namaRombel'])}, ${teks(a['tgl'])})${a['terdaftar'] == true ? ' — sudah dipakai login' : ''}'),
          MapEntry('b', 'B: ${teks(b['nama'])} (${teks(b['namaRombel'])}, ${teks(b['tgl'])})${b['terdaftar'] == true ? ' — sudah dipakai login' : ''}'),
        ], simpan, (v) => setState(() => simpan = v)),
        _grup('Nama (dipakai untuk masuk)', [
          MapEntry(teks(a['nama']), '${teks(a['nama'])} (A)'),
          MapEntry(teks(b['nama']), '${teks(b['nama'])} (B)'),
          MapEntry(teks(menu['nama']), '${teks(menu['nama'])} (Data Induk)'),
        ], nama, (v) => setState(() => nama = v)),
        _grup('Tanggal lahir (kata sandi = TH-ddmmyyyy)', [
          MapEntry(teks(a['tgl']), '${teks(a['tgl'])} (A)'),
          MapEntry(teks(b['tgl']), '${teks(b['tgl'])} (B)'),
          MapEntry(teks(menu['tgl']), '${teks(menu['tgl'])} (Data Induk)'),
        ], tgl, (v) => setState(() => tgl = v)),
        _grup('Rombel', [
          MapEntry(teks(a['rombel']), '${teks(a['namaRombel'])} (A)'),
          MapEntry(teks(b['rombel']), '${teks(b['namaRombel'])} (B)'),
          MapEntry(_idRombelMenu, '${namaRombel[_idRombelMenu] ?? teks(menu['namaRombel'])} (Data Induk)'),
        ], rombel, (v) => setState(() => rombel = v)),
        if (peringatan.isNotEmpty)
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Colors.orange.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(12)),
            child: Text(peringatan.join('\n')),
          ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            onPressed: () {
              final hapus = simpan == 'a' ? b : a;
              Navigator.pop(context, <String, dynamic>{
                'simpan': teks(_s['kunci']),
                'hapus': teks(hapus['kunci']),
                'nama': nama,
                'tgl': tgl,
                'idRombel': rombel,
              });
            },
            child: const Text('Gabungkan'),
          ),
        ),
      ]),
    );
  }
}

/// Sinkron otomatis Data Induk tiap 15 menit (pengganti menjalankan pasangSinkronOtomatis di editor).
class _KartuSinkronOtomatis extends StatefulWidget {
  const _KartuSinkronOtomatis();

  @override
  State<_KartuSinkronOtomatis> createState() => _KartuSinkronOtomatisState();
}

class _KartuSinkronOtomatisState extends State<_KartuSinkronOtomatis> {
  bool? _aktif;
  bool _sibuk = false;
  String? _galat;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat() async {
    try {
      final r = peta(await Api.instance('waAdminSinkronOtomatis', [Sesi.instance.token]));
      if (mounted) setState(() => _aktif = r['aktif'] == true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  Future<void> _atur(bool v) async {
    setState(() => _sibuk = true);
    try {
      final r = peta(await Api.instance('waAdminSinkronOtomatisAtur', [Sesi.instance.token, v]));
      if (!mounted) return;
      setState(() => _aktif = r['aktif'] == true);
      kabar(context, _aktif == true ? 'Sinkron otomatis aktif (tiap 15 menit).' : 'Sinkron otomatis dimatikan.');
    } on ApiException catch (e) {
      if (mounted) kabar(context, e.ramah, galat: true);
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: SwitchListTile(
        secondary: const Icon(Icons.autorenew_rounded),
        title: const Text('Sinkron otomatis Data Induk', style: TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(_galat ?? (_aktif == null ? 'Memeriksa...' : (_aktif! ? 'Aktif: data rombel, mapel, tutor, dan siswa disinkronkan tiap 15 menit.' : 'Mati: sinkron hanya saat tombol "Sinkron sekarang" ditekan.'))),
        value: _aktif ?? false,
        onChanged: _aktif == null || _sibuk ? null : _atur,
      ),
    );
  }
}
