import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

/// Impor Dapodik (khusus admin): pengganti fitur impor di aplikasi SIM SETARA.
/// Unggah file ekspor "Daftar Peserta Didik" (.xlsx) → pratinjau perbedaan → terapkan ke
/// tab WARGA BELAJAR & ROMBEL (spreadsheet MENU), lalu sheet Siswa e-learning ikut disinkronkan.
class ImporDapodikScreen extends StatefulWidget {
  const ImporDapodikScreen({super.key});

  @override
  State<ImporDapodikScreen> createState() => _ImporDapodikScreenState();
}

class _ImporDapodikScreenState extends State<ImporDapodikScreen> {
  Map<String, dynamic>? _p;
  Map<String, dynamic>? _hasil;
  String _namaFile = '';
  bool _tambahBaru = true, _perbarui = true, _buatRombel = true, _sinkronEl = true, _nonaktif = false, _biodata = true;

  Future<void> _pilih() async {
    final r = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['xlsx'], withData: true);
    if (r == null || r.files.isEmpty || !mounted) return;
    final f = r.files.first;
    if (f.size > 8 * 1048576) return kabar(context, 'File terlalu besar (maksimal 8 MB).', galat: true);
    final Uint8List b = f.bytes ?? (f.path != null ? await File(f.path!).readAsBytes() : Uint8List(0));
    if (b.isEmpty || !mounted) return kabar(context, 'File tidak bisa dibaca.', galat: true);
    final h = await jalankan(
      context,
      () async => peta(await Api.instance('waAdminDapodikPratinjau', [_t, base64Encode(b), f.name], const Duration(minutes: 5))),
      teksProses: 'Membaca file dan membandingkan dengan data induk...',
    );
    if (!h.ok || !mounted) return;
    setState(() {
      _p = h.data;
      _hasil = null;
      _namaFile = f.name;
      _buatRombel = daftar(h.data!['rombelBaru']).isNotEmpty;
      _nonaktif = false;
    });
  }

  Future<void> _terapkan() async {
    final p = _p!;
    final j = peta(p['jumlah']);
    final ringkas = [
      if (_tambahBaru && angka(j['baru']) > 0) '${angka(j['baru'])} warga belajar baru ditambahkan',
      if (_perbarui && angka(j['berubah']) > 0) '${angka(j['berubah'])} data diperbarui',
      if (_buatRombel && daftar(p['rombelBaru']).isNotEmpty) '${daftar(p['rombelBaru']).length} rombel baru dibuat',
      if (_nonaktif && angka(j['hilang']) > 0) '${angka(j['hilang'])} warga belajar DINONAKTIFKAN',
      if (_sinkronEl && angka(j['elearning']) > 0) '${angka(j['elearning'])} siswa e-learning disesuaikan',
      if (_biodata) 'Biodata rapor (agama, alamat, orang tua/wali) disimpan',
    ];
    if (ringkas.isEmpty) return kabar(context, 'Tidak ada perubahan yang dipilih.');
    if (!await konfirmasi(context, 'Terapkan impor Dapodik?', '${ringkas.join('\n')}\n\nPerubahan langsung tersimpan di spreadsheet.', ya: 'Terapkan')) return;
    if (!mounted) return;
    final h = await jalankan(
      context,
      () async => peta(await Api.instance('waAdminDapodikTerapkan', [
            _t,
            teks(p['idPratinjau']),
            {'tambahBaru': _tambahBaru, 'perbarui': _perbarui, 'buatRombel': _buatRombel, 'nonaktifkanHilang': _nonaktif, 'sinkronElearning': _sinkronEl, 'biodata': _biodata}
          ], const Duration(minutes: 6))),
      teksProses: 'Menerapkan perubahan...',
    );
    if (h.ok && mounted) setState(() => _hasil = h.data);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final p = _p;
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
      Card(
        color: cs.primaryContainer,
        child: const Padding(
          padding: EdgeInsets.all(14),
          child: Text('Unduh "Daftar Peserta Didik" dari Dapodik (format .xlsx), lalu pilih file itu di sini. '
              'Sistem menampilkan perbedaannya dulu; data baru berubah setelah Anda menekan Terapkan.'),
        ),
      ),
      FilledButton.icon(
        onPressed: _pilih,
        icon: const Icon(Icons.upload_file_rounded),
        label: Text(p == null ? 'Pilih file Dapodik (.xlsx)' : 'Pilih file lain'),
      ),
      if (_hasil != null) _kartuHasil(cs),
      if (p != null && _hasil == null) ...[
        const SizedBox(height: 12),
        Text(_namaFile, style: TextStyle(color: cs.onSurfaceVariant, fontSize: 12.5)),
        const SizedBox(height: 6),
        Wrap(spacing: 8, runSpacing: 8, children: [
          _angka('Di Dapodik', p['jumlahDapodik'], cs.primary),
          _angka('Aktif di data induk', p['jumlahSim'], cs.primary),
          _angka('Sudah sama', p['sama'], Colors.green),
          _angka('Baru', peta(p['jumlah'])['baru'], const Color(0xFF3B82F6)),
          _angka('Berubah', peta(p['jumlah'])['berubah'], const Color(0xFFE9A23B)),
          _angka('Tidak ada di Dapodik', peta(p['jumlah'])['hilang'], cs.error),
        ]),
        const SizedBox(height: 8),
        _bagian(
          'Warga belajar baru (${angka(peta(p['jumlah'])['baru'])})',
          daftar(p['baru']).map(peta).map((x) => '${teks(x['nama'])} · ${teks(x['rombel'], '-')}${teks(x['nisn']).isEmpty ? ' · tanpa NISN' : ' · NISN ${teks(x['nisn'])}'}').toList(),
        ),
        _bagian(
          'Data yang berubah (${angka(peta(p['jumlah'])['berubah'])})',
          daftar(p['berubah']).map(peta).map((x) {
            final u = daftar(x['ubah']).map(peta).map((c) => '${teks(c['label'])}: ${teks(c['lama'], '(kosong)')} → ${teks(c['baru'])}').join('; ');
            return '${teks(x['nama'])} — $u';
          }).toList(),
        ),
        _bagian(
          'Aktif di data induk tetapi tidak ada di Dapodik (${angka(peta(p['jumlah'])['hilang'])})',
          daftar(p['hilang']).map(peta).map((x) => '${teks(x['nama'])} · ${teks(x['rombel'], '-')}').toList(),
        ),
        if (daftar(p['rombelBaru']).isNotEmpty) _bagian('Rombel belum ada di data induk', daftar(p['rombelBaru']).map((x) => teks(x)).toList()),
        _bagian(
          'Siswa e-learning yang disesuaikan (${angka(peta(p['jumlah'])['elearning'])})',
          daftar(p['elearning']).map(peta).map((x) => [
                teks(x['nama']),
                if (teks(x['rombelBaru']).isNotEmpty) 'rombel ${teks(x['rombelLama'], '-')} → ${teks(x['rombelBaru'])}',
                if (teks(x['nisnBaru']).isNotEmpty) 'NISN diisi ${teks(x['nisnBaru'])}',
              ].join(' · ')).toList(),
        ),
        const JudulBagian('Yang diterapkan'),
        CheckboxListTile(contentPadding: EdgeInsets.zero, value: _tambahBaru, onChanged: (v) => setState(() => _tambahBaru = v ?? false), title: const Text('Tambahkan warga belajar baru')),
        CheckboxListTile(contentPadding: EdgeInsets.zero, value: _biodata, onChanged: (v) => setState(() => _biodata = v ?? false), title: const Text('Simpan biodata untuk cover & halaman biodata rapor')),
        CheckboxListTile(contentPadding: EdgeInsets.zero, value: _perbarui, onChanged: (v) => setState(() => _perbarui = v ?? false), title: const Text('Perbarui data yang berubah (rombel, NISN, NIK, nama, dll.)')),
        if (daftar(p['rombelBaru']).isNotEmpty)
          CheckboxListTile(contentPadding: EdgeInsets.zero, value: _buatRombel, onChanged: (v) => setState(() => _buatRombel = v ?? false), title: const Text('Buat rombel yang belum ada')),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: _sinkronEl,
          onChanged: (v) => setState(() => _sinkronEl = v ?? false),
          title: const Text('Sesuaikan sheet Siswa e-learning (rombel & NISN mengikuti Dapodik)'),
        ),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: _nonaktif,
          onChanged: (v) => setState(() => _nonaktif = v ?? false),
          title: Text('Nonaktifkan yang tidak ada di Dapodik', style: TextStyle(color: cs.error, fontWeight: FontWeight.w700)),
          subtitle: const Text('Hanya bila file berisi SEMUA rombel. Siswa nonaktif tidak bisa diabsen dan tidak dibuatkan kartu.'),
        ),
        const SizedBox(height: 8),
        FilledButton.icon(onPressed: _terapkan, icon: const Icon(Icons.done_all_rounded), label: const Text('Terapkan')),
      ],
    ]);
  }

  Widget _angka(String label, dynamic n, Color warna) => Container(
        width: 150,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: warna.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${angka(n)}', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: warna)),
          Text(label, style: const TextStyle(fontSize: 12)),
        ]),
      );

  Widget _bagian(String judul, List<String> isi) {
    if (isi.isEmpty) return const SizedBox.shrink();
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4),
      child: ExpansionTile(
        title: Text(judul, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        children: [
          for (final s in isi.take(150))
            Padding(padding: const EdgeInsets.symmetric(vertical: 3), child: Align(alignment: Alignment.centerLeft, child: Text(s, style: const TextStyle(fontSize: 13)))),
          if (isi.length > 150) Text('… dan ${isi.length - 150} lainnya', style: const TextStyle(fontStyle: FontStyle.italic)),
        ],
      ),
    );
  }

  Widget _kartuHasil(ColorScheme cs) {
    final h = _hasil!;
    return Card(
      color: cs.primaryContainer,
      margin: const EdgeInsets.only(top: 12),
      child: ListTile(
        leading: const Icon(Icons.task_alt_rounded),
        title: const Text('Impor selesai', style: TextStyle(fontWeight: FontWeight.w800)),
        subtitle: Text('${angka(h['ditambah'])} ditambahkan · ${angka(h['diperbarui'])} diperbarui · ${angka(h['dinonaktifkan'])} dinonaktifkan · '
            '${angka(h['rombelDibuat'])} rombel baru · ${angka(h['elearning'])} siswa e-learning disesuaikan · ${angka(h['biodata'])} biodata'),
      ),
    );
  }
}
