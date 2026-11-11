import 'package:flutter/material.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

/// v1.55.0: aturan sanksi bertingkat (Admin / Superadmin mengubah; pengelola ujian melihat).
class AturanSanksiScreen extends StatefulWidget {
  const AturanSanksiScreen({super.key});

  @override
  State<AturanSanksiScreen> createState() => _AturanSanksiScreenState();
}

class _AturanSanksiScreenState extends State<AturanSanksiScreen> {
  int _pimpinan = 2, _berat = 3, _batas = 3;
  bool _bisaUbah = false, _siap = false;
  String? _galat;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat() async {
    try {
      final d = peta(await Api.instance('waStafMasaSanksi', [_t]));
      final s = peta(d['sanksi']);
      if (!mounted) return;
      setState(() {
        _pimpinan = angka(s['pimpinanMulai'], 2);
        _berat = angka(s['beratMulai'], 3);
        _batas = angka(s['batasKeluar'], 3);
        _bisaUbah = d['bisaUbah'] == true;
        _siap = true;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  Future<void> _simpan() async {
    final r = await jalankan(context, () => Api.instance('waStafMasaSanksiSimpan', [_t, {'pimpinanMulai': _pimpinan, 'beratMulai': _berat}]), teksProses: 'Menyimpan...');
    if (r.ok && mounted) {
      kabar(context, 'Aturan sanksi disimpan.');
      Navigator.pop(context);
    }
  }

  Widget _baris(String judul, String sub, int nilai, ValueChanged<int> ubah) => Card(
        child: ListTile(
          title: Text(judul, style: const TextStyle(fontWeight: FontWeight.w700)),
          subtitle: Text(sub),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            IconButton(onPressed: _bisaUbah && nilai > 1 ? () => setState(() => ubah(nilai - 1)) : null, icon: const Icon(Icons.remove_circle_outline)),
            Text('$nilai', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            IconButton(onPressed: _bisaUbah && nilai < 9 ? () => setState(() => ubah(nilai + 1)) : null, icon: const Icon(Icons.add_circle_outline)),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Aturan sanksi ujian')),
      body: _galat != null
          ? PesanGalat(pesan: _galat!, ulangi: _muat)
          : !_siap
              ? const Center(child: CircularProgressIndicator())
              : ListView(padding: const EdgeInsets.all(16), children: [
                  Text('Ujian terkunci setiap kali siswa keluar aplikasi / memakai layar terbagi $_batas kali. Hitungan "kunci ke-" di bawah dihitung per siswa per ujian '
                      'dan dimulai lagi setelah ada keputusan pimpinan. Pada Tryout sanksi hanya dicatat.', style: const TextStyle(fontSize: 13)),
                  const SizedBox(height: 12),
                  _baris('Dibuka pimpinan mulai kunci ke-', 'Sebelumnya pengawas boleh membuka (alasan wajib). Mulai kunci ini hanya Koordinator Kurikulum, Kepala Sekolah, atau Admin.',
                      _pimpinan, (v) { _pimpinan = v; if (_berat < v) _berat = v; }),
                  _baris('Pelanggaran berat mulai kunci ke-', 'Jawaban dikirim otomatis apa adanya dan ditandai "perlu ditinjau". Kepala Sekolah memutuskan: nilai tetap, susulan, atau dibatalkan.',
                      _berat, (v) { _berat = v < _pimpinan ? _pimpinan : v; }),
                  const SizedBox(height: 16),
                  if (_bisaUbah) FilledButton.icon(onPressed: _simpan, icon: const Icon(Icons.save_rounded), label: const Text('Simpan'))
                  else const Text('Hanya Admin atau Superadmin yang dapat mengubah aturan ini.', style: TextStyle(fontStyle: FontStyle.italic)),
                ]),
    );
  }
}

/// v1.55.0: tinjauan pelanggaran berat. Kepala Sekolah / Admin memutuskan: nilai tetap, susulan, atau dibatalkan.
class TinjauanPelanggaranScreen extends StatefulWidget {
  const TinjauanPelanggaranScreen({super.key});

  @override
  State<TinjauanPelanggaranScreen> createState() => _TinjauanPelanggaranScreenState();
}

class _TinjauanPelanggaranScreenState extends State<TinjauanPelanggaranScreen> {
  int _v = 0;

  Future<void> _putus(Map<String, dynamic> x) async {
    final hasil = await showDialog<Map<String, dynamic>>(context: context, builder: (_) => _DialogPutus(x: x));
    if (hasil == null || !mounted) return;
    final r = await jalankan(
        context,
        () => Api.instance('waStafMasaTinjauPutus', [_t, x['idUjian'], x['idRombel'], x['nama'], hasil['keputusan'], hasil['catatan'], {'tanggal': hasil['tanggal'], 'jam': hasil['jam']}]),
        teksProses: 'Menyimpan keputusan...');
    if (r.ok && mounted) {
      kabar(context, 'Keputusan disimpan: ${teks(peta(r.data)['keputusan'])}.');
      setState(() => _v++);
    }
  }

  Widget _kartu(Map<String, dynamic> x, bool bisa, {required bool menunggu}) {
    final log = daftar(x['log']).map(peta).toList();
    final kp = peta(x['keputusan']);
    return Card(
      child: ExpansionTile(
        title: Text('${teks(x['nama'])} · ${teks(x['rombel'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text('${teks(x['mapel'])} · ${teks(x['masa'], teks(x['jenis']))} · ${teks(x['tanggal'])} ${teks(x['jam'])}\n'
            '${menunggu ? 'Nilai sementara: ${x['nilai'] ?? '-'} · menunggu keputusan' : '${teks(kp['jenis'])} (${teks(kp['oleh'])})'}'),
        isThreeLine: true,
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        children: [
          for (final l in log)
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: Text(teks(l['waktu']).length >= 16 ? teks(l['waktu']).substring(11, 16) : teks(l['waktu']), style: const TextStyle(fontWeight: FontWeight.w700)),
              title: Text(teks(l['jenis'])),
              subtitle: Text('${teks(l['detail'])}${teks(l['oleh']) == 'Sistem' ? '' : ' · ${teks(l['oleh'])}'}'),
            ),
          if (menunggu && bisa)
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(onPressed: () => _putus(x), icon: const Icon(Icons.gavel_rounded), label: const Text('Putuskan')),
            ),
          if (menunggu && !bisa) const Text('Keputusan diambil Kepala Sekolah atau Admin.', style: TextStyle(fontStyle: FontStyle.italic)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tinjauan pelanggaran berat')),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey('tj$_v'),
        muat: () async => peta(await Api.instance('waStafMasaTinjau', [_t], const Duration(seconds: 90))),
        bangun: (c, d, segar) {
          final mn = daftar(d['menunggu']).map(peta).toList();
          final rw = daftar(d['riwayat']).map(peta).toList();
          final bisa = d['bisaPutus'] == true;
          return RefreshIndicator(
            onRefresh: segar,
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
              const Text('Siswa yang terkena pelanggaran berat: jawabannya sudah dikirim otomatis apa adanya. Periksa riwayat kejadiannya, lalu putuskan.',
                  style: TextStyle(fontSize: 12.5)),
              const SizedBox(height: 8),
              JudulBagian('Menunggu keputusan (${mn.length})'),
              if (mn.isEmpty) const Kosong(pesan: 'Tidak ada pelanggaran berat yang menunggu.', ikon: Icons.verified_user_outlined),
              for (final x in mn) _kartu(x, bisa, menunggu: true),
              if (rw.isNotEmpty) ...[
                const SizedBox(height: 12),
                JudulBagian('Sudah diputuskan (${rw.length})'),
                for (final x in rw) _kartu(x, bisa, menunggu: false),
              ],
            ]),
          );
        },
      ),
    );
  }
}

class _DialogPutus extends StatefulWidget {
  const _DialogPutus({required this.x});
  final Map<String, dynamic> x;

  @override
  State<_DialogPutus> createState() => _DialogPutusState();
}

class _DialogPutusState extends State<_DialogPutus> {
  String _k = 'tetap';
  String _tgl = '', _jam = '08:00';
  final _cat = TextEditingController();

  @override
  void dispose() {
    _cat.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Keputusan untuk ${teks(widget.x['nama'])}'),
      content: SizedBox(
        width: 460,
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${teks(widget.x['mapel'])} · nilai sementara ${widget.x['nilai'] ?? '-'}', style: const TextStyle(fontSize: 13)),
            RadioGroup<String>(
              groupValue: _k,
              onChanged: (v) => setState(() => _k = v ?? 'tetap'),
              child: Column(children: [
                RadioListTile<String>(value: 'tetap', title: Text('Nilai tetap'), subtitle: Text('Pelanggaran tidak terbukti disengaja (mis. telepon masuk, ponsel bermasalah).')),
                RadioListTile<String>(value: 'susulan', title: Text('Ulang lewat susulan'), subtitle: Text('Nilai lama dibatalkan; siswa mengerjakan ulang pada jadwal susulan.')),
                RadioListTile<String>(value: 'batal', title: Text('Batalkan nilai'), subtitle: Text('Nilai ujian ini menjadi 0.')),
              ]),
            ),
            if (_k == 'susulan')
              Row(children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () async {
                      final n = DateTime.now();
                      final d = await showDatePicker(context: context, firstDate: n, lastDate: DateTime(n.year + 1), initialDate: n);
                      if (d != null) setState(() => _tgl = tglIso(d));
                    },
                    child: Text(_tgl.isEmpty ? 'Tanggal susulan' : _tgl),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () async {
                    final p = _jam.split(':');
                    final t = await showTimePicker(
                      context: context,
                      initialTime: TimeOfDay(hour: int.tryParse(p.first) ?? 8, minute: int.tryParse(p.last) ?? 0),
                      builder: (c, w) => MediaQuery(data: MediaQuery.of(c).copyWith(alwaysUse24HourFormat: true), child: w!),
                    );
                    if (t != null) setState(() => _jam = '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}');
                  },
                  child: Text(_jam),
                ),
              ]),
            const SizedBox(height: 8),
            TextField(controller: _cat, maxLines: 3, decoration: const InputDecoration(labelText: 'Pertimbangan (wajib, dicatat)', border: OutlineInputBorder())),
          ]),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
        FilledButton(
          onPressed: () {
            if (_cat.text.trim().length < 5) return kabar(context, 'Tulis pertimbangan minimal 5 huruf.', galat: true);
            if (_k == 'susulan' && _tgl.isEmpty) return kabar(context, 'Pilih tanggal susulan.', galat: true);
            Navigator.pop(context, {'keputusan': _k, 'catatan': _cat.text.trim(), 'tanggal': _tgl, 'jam': _jam});
          },
          child: const Text('Simpan keputusan'),
        ),
      ],
    );
  }
}
