import 'package:flutter/material.dart';

import '../api.dart';
import '../kaldik_parser.dart';
import '../widgets.dart';

/// v1.95.0: isi kalender akademik dari tabel KETERANGAN kaldik dinas (tanpa AI).
/// Admin menempel tabel (Tanggal | Kegiatan) atau mengetik per baris; tiap baris langsung diurai menjadi tanggal +
/// kategori (Hari pertama masuk / Libur / UAS / Rapor / Ujian jenjang / Kegiatan). Kategori bisa diubah sebelum diterapkan.
/// Hasil (pop): {mulai, rapor, uasDari, uasSampai, libur: [...], keterangan: [...], pakai: {mulai, libur, uas, rapor}}
class KeteranganKaldikScreen extends StatefulWidget {
  const KeteranganKaldikScreen({super.key, required this.smt, this.awal = const [], this.sedangBerjalan = false});
  final int smt;
  final List<Map<String, dynamic>> awal;
  final bool sedangBerjalan;

  @override
  State<KeteranganKaldikScreen> createState() => _KeteranganKaldikScreenState();
}

const _bln = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
String _t(DateTime d) => '${d.day} ${_bln[d.month - 1]} ${d.year}';
String _r(DateTime a, DateTime b) => a == b ? _t(a) : '${_t(a)} – ${_t(b)}';

class _KeteranganKaldikScreenState extends State<KeteranganKaldikScreen> {
  final _tempel = TextEditingController();
  late List<BarisKet> _baris = widget.awal.map((m) => BarisKet(teks(m['tanggal']), teks(m['kegiatan']), kategori: teks(m['kategori'], '').isEmpty ? null : teks(m['kategori']))).toList();
  late final Map<String, bool> _pakai = {'mulai': !widget.sedangBerjalan, 'libur': true, 'uas': true, 'rapor': true};

  void _urai() {
    final b = uraiTempel(_tempel.text);
    if (b.isEmpty) return kabar(context, 'Tidak ada baris bertanggal yang terbaca. Pastikan tiap baris berisi tanggal (dengan tahun) dan kegiatan.', galat: true);
    setState(() {
      _baris = [..._baris, ...b];
      _tempel.clear();
    });
    final kosong = b.where((x) => x.kegiatan.isEmpty).length;
    kabar(context, '${b.length} baris terbaca${kosong > 0 ? ', $kosong tanpa kegiatan: periksa pasangannya' : ''}.');
  }

  Future<void> _ubah([int? i]) async {
    final lama = i == null ? null : _baris[i];
    final ct = TextEditingController(text: lama?.tanggal ?? ''), ck = TextEditingController(text: lama?.kegiatan ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(i == null ? 'Tambah baris' : 'Ubah baris'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: ct, decoration: const InputDecoration(labelText: 'Tanggal', hintText: 'mis. 8–12 Februari 2027')),
          const SizedBox(height: 8),
          TextField(controller: ck, decoration: const InputDecoration(labelText: 'Kegiatan', hintText: 'mis. Libur awal Ramadan')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Simpan')),
        ],
      ),
    );
    if (ok != true) return;
    final b = BarisKet(ct.text.trim(), ck.text.trim());
    setState(() {
      if (i == null) {
        _baris.add(b);
      } else {
        _baris[i] = b;
      }
    });
  }

  void _terapkan() {
    final r = ringkasKet(_baris);
    if (_pakai['mulai'] == true && r.mulai == null) return kabar(context, 'Belum ada baris "Hari pertama masuk".', galat: true);
    Navigator.pop(context, <String, dynamic>{
      'mulai': r.mulai == null ? null : isoTgl(r.mulai!),
      'rapor': r.rapor == null ? null : isoTgl(r.rapor!),
      'uasDari': r.uasDari == null ? null : isoTgl(r.uasDari!),
      'uasSampai': r.uasSampai == null ? null : isoTgl(r.uasSampai!),
      'libur': r.libur,
      'keterangan': _baris.map((b) => b.keJson()).toList(),
      'pakai': _pakai,
    });
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final r = ringkasKet(_baris);
    return Scaffold(
      appBar: AppBar(title: Text('Keterangan kaldik · Semester ${widget.smt}')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 96), children: [
        Text(
            'Salin tabel KETERANGAN di bawah kalender semester ini (kolom Tanggal dan Kegiatan) dari PDF/Word/Excel, lalu tempel di sini. '
            'Tiap baris diurai otomatis: hari pertama masuk, libur, asesmen akhir (UAS), pembagian rapor. Periksa kategorinya sebelum diterapkan.',
            style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
        const SizedBox(height: 8),
        TextField(
          controller: _tempel,
          minLines: 4,
          maxLines: 10,
          decoration: const InputDecoration(labelText: 'Tempel tabel keterangan', hintText: '15 Juli 2026    Hari pertama masuk sekolah\n28 Desember 2026-8 Januari 2027    Libur semester 1'),
        ),
        const SizedBox(height: 6),
        Row(children: [
          FilledButton.tonalIcon(onPressed: _urai, icon: const Icon(Icons.auto_fix_high_outlined), label: const Text('Urai')),
          const SizedBox(width: 8),
          OutlinedButton.icon(onPressed: () => _ubah(), icon: const Icon(Icons.add), label: const Text('Tambah baris')),
          const Spacer(),
          if (_baris.isNotEmpty) TextButton(onPressed: () => setState(() => _baris = []), child: const Text('Kosongkan')),
        ]),
        if (_baris.isNotEmpty) ...[
          JudulBagian('Hasil', sub: '${_baris.length} baris'),
          Card(
            color: cs.primaryContainer.withValues(alpha: 0.5),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                CheckboxListTile(
                    dense: true, contentPadding: EdgeInsets.zero, value: _pakai['mulai'], onChanged: (v) => setState(() => _pakai['mulai'] = v == true),
                    title: Text('Hari pertama masuk: ${r.mulai == null ? '-' : _t(r.mulai!)}'),
                    subtitle: widget.sedangBerjalan ? const Text('Semester ini sudah berjalan: mengubah hari pertama menggeser sesi yang sudah lewat.') : null),
                CheckboxListTile(
                    dense: true, contentPadding: EdgeInsets.zero, value: _pakai['libur'], onChanged: (v) => setState(() => _pakai['libur'] = v == true),
                    title: Text('Libur: ${r.libur.length} rentang (menggantikan daftar libur semester ini)')),
                CheckboxListTile(
                    dense: true, contentPadding: EdgeInsets.zero, value: _pakai['uas'], onChanged: (v) => setState(() => _pakai['uas'] = v == true),
                    title: Text('UAS: ${r.uasDari == null ? '-' : _r(r.uasDari!, r.uasSampai!)} (dibulatkan Senin–Minggu)')),
                CheckboxListTile(
                    dense: true, contentPadding: EdgeInsets.zero, value: _pakai['rapor'], onChanged: (v) => setState(() => _pakai['rapor'] = v == true),
                    title: Text('Pembagian rapor: ${r.rapor == null ? '-' : _t(r.rapor!)}')),
                if (r.jenjang.isNotEmpty)
                  Text('Ujian jenjang (atur pelaksanaannya di Masa Ujian): ${r.jenjang.join('; ')}', style: const TextStyle(fontSize: 12)),
              ]),
            ),
          ),
          for (final e in _baris.asMap().entries)
            Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(e.value.kegiatan.isEmpty ? '(kegiatan kosong)' : e.value.kegiatan,
                          style: TextStyle(fontWeight: FontWeight.w600, color: e.value.kegiatan.isEmpty ? cs.error : null)),
                      Text(
                          e.value.hasil == null
                              ? 'Tanggal tidak terbaca: "${e.value.tanggal}"'
                              : '${e.value.hasil!.rentang.map((x) => _r(x.$1, x.$2)).join(', ')}${e.value.hasil!.bulanSaja ? ' (bulan saja)' : ''}${e.value.perkiraan ? ' · perkiraan' : ''}',
                          style: TextStyle(fontSize: 12.5, color: e.value.hasil == null ? cs.error : cs.onSurfaceVariant)),
                      const SizedBox(height: 4),
                      DropdownButton<String>(
                        isDense: true,
                        value: e.value.kategori,
                        items: [for (final k in kategoriLabel.entries) DropdownMenuItem(value: k.key, child: Text(k.value, style: const TextStyle(fontSize: 13)))],
                        onChanged: e.value.hasil == null ? null : (v) => setState(() => e.value.kategori = v ?? katKegiatan),
                      ),
                    ]),
                  ),
                  IconButton(tooltip: 'Ubah', icon: const Icon(Icons.edit_outlined, size: 20), onPressed: () => _ubah(e.key)),
                  IconButton(tooltip: 'Hapus', icon: const Icon(Icons.delete_outline, size: 20), onPressed: () => setState(() => _baris.removeAt(e.key))),
                ]),
              ),
            ),
        ],
      ]),
      floatingActionButton: _baris.isEmpty
          ? null
          : FloatingActionButton.extended(onPressed: _terapkan, icon: const Icon(Icons.check), label: const Text('Terapkan ke kalender')),
    );
  }
}
