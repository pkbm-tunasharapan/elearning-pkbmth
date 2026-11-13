import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';
import 'laporan_pemetaan.dart';

String? get _t => Sesi.instance.token;

String _rp(int n) {
  final s = n.toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write('.');
    b.write(s[i]);
  }
  return 'Rp$b';
}

/// v1.61.0: Pantauan Unit Belajar (Tahap 2). Koordinator Unit melihat siswa di unitnya: kehadiran gabungan
/// per mapel semester berjalan dan sisa tagihan. Hanya melihat; pemetaan & persetujuan tetap di KS.
/// Admin, Superadmin, KS, dan Koordinator Kurikulum dapat memilih unit mana pun.
class PantauanUnitScreen extends StatefulWidget {
  const PantauanUnitScreen({super.key});

  @override
  State<PantauanUnitScreen> createState() => _PantauanUnitScreenState();
}

class _PantauanUnitScreenState extends State<PantauanUnitScreen> {
  String _unit = '';
  bool _paksa = false;
  int _ulang = 0;
  String _saring = 'semua', _cari = '';

  void _muatUlang({bool paksa = false}) => setState(() {
        _paksa = paksa;
        _ulang++;
      });

  Widget _angka(String label, String nilai, Color warna) => Expanded(
        child: Column(children: [
          Text(nilai, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: warna)),
          const SizedBox(height: 2),
          Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11.5)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pantauan Unit'), actions: [
        // v1.74.0: laporan pemetaan siswa per unit × rombel × layanan
        IconButton(
          tooltip: 'Laporan pemetaan siswa',
          icon: const Icon(Icons.summarize_outlined),
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LaporanPemetaanScreen())),
        ),
        IconButton(tooltip: 'Hitung ulang', icon: const Icon(Icons.refresh_rounded), onPressed: () => _muatUlang(paksa: true)),
      ]),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey('pu$_ulang'),
        muat: () async => peta(await Api.instance('waStafPantauUnit', [_t, _unit, _paksa])),
        bangun: (c, d, segar) {
          final pilihan = daftar(d['daftar']).map(peta).toList();
          final data = peta(d['data']);
          if (data.isEmpty) return ListView(children: [Kosong(pesan: teks(d['pesan'], 'Belum ada unit.'), ikon: Icons.place_outlined)]);
          final cs = Theme.of(context).colorScheme;
          final r = peta(data['ringkas']);
          final syarat = angka(data['syaratHadir'], 80);
          final idUnit = teks(peta(data['unit'])['id']);
          final q = _cari.toLowerCase();
          final siswa = daftar(data['siswa']).map(peta).where((s) {
            if (q.isNotEmpty && !teks(s['nama']).toLowerCase().contains(q)) return false;
            if (_saring == 'hadir') return daftar(s['kurang']).isNotEmpty;
            if (_saring == 'tunggak') return angka(s['sisa']) > 0;
            if (_saring == 'Reguler' || _saring == 'Flexi') return teks(s['layanan']) == _saring;
            return true;
          }).toList();
          return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            if (pilihan.length > 1)
              DropdownButtonFormField<String>(
                isExpanded: true,
                initialValue: idUnit,
                decoration: const InputDecoration(labelText: 'Unit', isDense: true),
                items: [for (final u in pilihan) DropdownMenuItem(value: teks(u['id']), child: Text(teks(u['nama'])))],
                onChanged: (v) {
                  if (v == null || v == idUnit) return;
                  _unit = v;
                  _muatUlang();
                },
              )
            else
              Text(teks(peta(data['unit'])['nama']), style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('Semester ${teks(data['periode'])} · dihitung ${teks(data['waktu']).length >= 16 ? teks(data['waktu']).substring(11, 16) : teks(data['waktu'])}',
                style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
            const SizedBox(height: 10),
            Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6),
                child: Row(children: [
                  _angka('Siswa', '${angka(r['siswa'])}', cs.primary),
                  _angka('Kehadiran\n< $syarat%', '${angka(r['kurangHadir'])}', angka(r['kurangHadir']) > 0 ? Colors.red : Colors.green),
                  _angka('Tunggakan\nlewat tempo', '${angka(r['lewatTempo'])}', angka(r['lewatTempo']) > 0 ? Colors.orange : Colors.green),
                ]),
              ),
            ),
            Wrap(spacing: 6, runSpacing: 6, children: [
              Lencana('Reguler ${angka(r['reguler'])}', warna: Colors.indigo),
              Lencana('Flexi ${angka(r['flexi'])}', warna: Colors.teal),
              if (angka(r['sisa']) > 0) Lencana('Sisa tagihan ${_rp(angka(r['sisa']))}', warna: Colors.orange),
              for (final rb in daftar(data['rombel']).map(peta)) Lencana('${teks(rb['nama'])} · ${angka(rb['jumlah'])}', warna: cs.outline),
            ]),
            const SizedBox(height: 12),
            TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Cari nama siswa', isDense: true),
              onChanged: (v) => setState(() => _cari = v.trim()),
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                for (final e in const [['semua', 'Semua'], ['hadir', 'Kurang hadir'], ['tunggak', 'Ada tunggakan'], ['Reguler', 'Reguler'], ['Flexi', 'Flexi']])
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ChoiceChip(label: Text(e[1]), selected: _saring == e[0], onSelected: (_) => setState(() => _saring = e[0])),
                  ),
              ]),
            ),
            JudulBagian('Siswa', sub: '${siswa.length} ditampilkan'),
            if (siswa.isEmpty) const Kosong(pesan: 'Tidak ada siswa untuk pilihan ini.', ikon: Icons.person_search_outlined),
            for (final s in siswa) _KartuSiswa(s: s, syarat: syarat),
          ]);
        },
      ),
    );
  }
}

class _KartuSiswa extends StatelessWidget {
  const _KartuSiswa({required this.s, required this.syarat});
  final Map<String, dynamic> s;
  final int syarat;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final kurang = daftar(s['kurang']).map(peta).toList();
    final hadir = s['hadir'];
    final sisa = angka(s['sisa']), lewat = angka(s['lewat']);
    final l = teks(s['layanan']);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(teks(s['nama']), style: const TextStyle(fontWeight: FontWeight.w700))),
            if (hadir != null)
              Text('$hadir%', style: TextStyle(fontWeight: FontWeight.w800, color: kurang.isNotEmpty ? Colors.red : Colors.green)),
          ]),
          const SizedBox(height: 4),
          Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
            Text(teks(s['namaRombel']), style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
            if (l.isNotEmpty) Lencana(l, warna: l == 'Flexi' ? Colors.teal : Colors.indigo),
            if (hadir == null) const Lencana('Belum ada data hadir', warna: Colors.grey),
          ]),
          if (kurang.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text('Di bawah $syarat%: ${kurang.map((k) => '${teks(k['mapel'])} ${angka(k['persen'])}%').join(', ')}',
                style: const TextStyle(fontSize: 12.5, color: Colors.red)),
          ],
          if (sisa > 0) ...[
            const SizedBox(height: 4),
            Text('Sisa tagihan ${_rp(sisa)}${lewat > 0 ? ' · ${_rp(lewat)} lewat jatuh tempo' : ''}',
                style: TextStyle(fontSize: 12.5, color: lewat > 0 ? Colors.orange.shade800 : cs.onSurfaceVariant)),
          ],
        ]),
      ),
    );
  }
}
