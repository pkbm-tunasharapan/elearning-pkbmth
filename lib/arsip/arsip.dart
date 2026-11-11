import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

String _namaPer(Map<String, dynamic> p) => 'Semester ${teks(p['semester'])} ${teks(p['tahun'])}';

/// v1.40.0: Arsip Data per semester (Admin & Kepala Sekolah).
/// Arsip dibuat otomatis tiap semester berganti (atau tombol admin), disimpan di Google Drive per tahun pelajaran /
/// semester / rombel (Rapor, Foto, Lainnya). Membuka arsip = hanya baca; mengubah butuh kode akses dari admin.
class ArsipScreen extends StatefulWidget {
  const ArsipScreen({super.key});

  @override
  State<ArsipScreen> createState() => _ArsipScreenState();
}

class _ArsipScreenState extends State<ArsipScreen> {
  int _v = 0;

  void _segar() => setState(() => _v++);

  Future<Map<String, String>?> _pilihSemester(List<Map<String, dynamic>> pilihan, {bool tanpaKini = false, String judul = 'Pilih semester'}) {
    final daftarP = pilihan.where((p) => !tanpaKini || p['kini'] != true).toList();
    return showDialog<Map<String, String>>(
      context: context,
      builder: (c) => SimpleDialog(title: Text(judul), children: [
        for (final p in daftarP)
          SimpleDialogOption(
            onPressed: () => Navigator.pop(c, {'tahun': teks(p['tahun']), 'semester': teks(p['semester'])}),
            child: Text('${_namaPer(p)}${p['kini'] == true ? ' (berjalan)' : ''}'),
          ),
      ]),
    );
  }

  Future<void> _arsipkan(Map<String, dynamic> d) async {
    final per = await _pilihSemester(daftar(d['pilihan']).map(peta).toList(), judul: 'Arsipkan semester');
    if (per == null || !mounted) return;
    final ok = await konfirmasi(
      context,
      'Arsipkan ${_namaPer(per)}?',
      'Folder Drive (tahun pelajaran / semester / rombel), salinan data, dan rapor PDF setiap warga belajar dibuat bertahap di latar belakang. '
          'Setelah semester itu lewat, datanya dipindahkan dari database utama ke arsip agar aplikasi tetap ringan.',
      ya: 'Arsipkan',
    );
    if (!ok || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waAdminArsipMulai', [_t, per]), teksProses: 'Memulai arsip...');
    if (r.ok && mounted) {
      kabar(context, 'Arsip dimulai. Proses berjalan di latar belakang; muat ulang untuk melihat progres.');
      _segar();
    }
  }

  Future<void> _lanjut() async {
    final r = await jalankan(context, () => Api.instance('waAdminArsipLanjut', [_t]), teksProses: 'Melanjutkan...');
    if (r.ok && mounted) {
      kabar(context, teks(peta(r.data)['pesan'], 'Proses arsip dilanjutkan.'));
      _segar();
    }
  }

  Future<void> _offline(Map<String, dynamic> d) async {
    final rombel = daftar(d['rombel']).map(peta).toList();
    final pilihan = daftar(d['pilihan']).map(peta).where((p) => p['kini'] != true).toList();
    String? idR = rombel.isEmpty ? null : teks(rombel.first['id']);
    var smt = 0;
    final aksi = await showDialog<String>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, atur) => AlertDialog(
          title: const Text('Data offline (hardcopy)'),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Untuk semester sebelum sistem diterapkan. Tutor mengisi NILAI AKHIR dari berkas kertas, rekap kehadiran, dan keputusan kenaikan.',
                style: TextStyle(fontSize: 12.5)),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: idR,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Rombel SEKARANG'),
              items: [for (final r in rombel) DropdownMenuItem(value: teks(r['id']), child: Text(teks(r['nama'])))],
              onChanged: (v) => atur(() => idR = v),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<int>(
              initialValue: smt,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Semester lampau'),
              items: [for (var i = 0; i < pilihan.length; i++) DropdownMenuItem(value: i, child: Text(_namaPer(pilihan[i])))],
              onChanged: (v) => atur(() => smt = v ?? 0),
            ),
            const SizedBox(height: 6),
            const Text('Kelas pada semester itu dihitung otomatis (mis. sekarang C12 → Genap 2025/2026 = C11).', style: TextStyle(fontSize: 12)),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c), child: const Text('Batal')),
            OutlinedButton.icon(onPressed: idR == null ? null : () => Navigator.pop(c, 'unggah'), icon: const Icon(Icons.upload_file_rounded), label: const Text('Unggah')),
            FilledButton.icon(onPressed: idR == null ? null : () => Navigator.pop(c, 'unduh'), icon: const Icon(Icons.download_rounded), label: const Text('Unduh template')),
          ],
        ),
      ),
    );
    if (aksi == null || idR == null || pilihan.isEmpty || !mounted) return;
    final p = pilihan[smt];
    final q = {'idRombel': idR, 'tahun': teks(p['tahun']), 'semester': teks(p['semester'])};
    if (aksi == 'unduh') {
      final r = await jalankan(context, () async => peta(await Api.instance('waAdminOfflineFormat', [_t, q], const Duration(minutes: 3))), teksProses: 'Menyiapkan template...');
      if (!r.ok || r.data == null || !mounted) return;
      await bagikanXlsx(context, base64Decode(teks(r.data!['b64'])), teks(r.data!['nama'], 'Data_Offline.xlsx'));
      return;
    }
    await unggahDataOffline(context);
    if (mounted) _segar();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waStafArsipDaftar', [_t], const Duration(minutes: 2))),
      bangun: (context, d, segarkan) {
        final admin = d['admin'] == true;
        final arsip = daftar(d['arsip']).map(peta).toList();
        final kode = daftar(d['kode']).map(peta).toList();
        final adaGagal = arsip.any((a) => teks(a['status']) == 'Gagal');
        return RefreshIndicator(
          onRefresh: segarkan,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Card(
              color: cs.primaryContainer,
              child: ListTile(
                leading: const Icon(Icons.inventory_2_rounded),
                title: Text('Semester berjalan: ${_namaPer(peta(d['periodeKini']))}', style: const TextStyle(fontWeight: FontWeight.w800)),
                subtitle: const Text('Aplikasi hanya membaca semester berjalan. Semester lain dibuka dari arsip: hanya baca; perubahan butuh kode akses dari admin dan tercatat di Log Arsip.'),
              ),
            ),
            if (admin)
              Wrap(spacing: 8, runSpacing: 6, children: [
                FilledButton.icon(onPressed: () => _arsipkan(d), icon: const Icon(Icons.archive_rounded), label: const Text('Arsipkan semester')),
                FilledButton.tonalIcon(onPressed: () => _offline(d), icon: const Icon(Icons.description_rounded), label: const Text('Data offline (hardcopy)')),
                if (adaGagal) OutlinedButton.icon(onPressed: _lanjut, icon: const Icon(Icons.replay_rounded), label: const Text('Lanjutkan proses')),
              ]),
            const JudulBagian('Arsip semester'),
            if (arsip.isEmpty) const Kosong(pesan: 'Belum ada arsip. Arsip pertama dibuat otomatis saat Semester Ganjil 2026/2027 berakhir.', ikon: Icons.inventory_2_outlined),
            for (final a in arsip)
              Card(
                margin: const EdgeInsets.symmetric(vertical: 5),
                child: ListTile(
                  leading: Icon(teks(a['jenis']) == 'Offline' ? Icons.description_rounded : Icons.inventory_2_rounded, color: cs.primary),
                  title: Text(_namaPer(a), style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text([
                    teks(a['jenis']) == 'Offline' ? 'Data offline (hardcopy)' : 'Arsip reguler',
                    teks(a['status']),
                    if (teks(a['progres']).isNotEmpty) teks(a['progres']),
                    if (teks(a['catatan']).isNotEmpty) teks(a['catatan']),
                    if (teks(a['bersih']).isNotEmpty) 'dipindah dari database utama ${teks(a['bersih'])}',
                  ].join(' · ')),
                  trailing: Lencana(teks(a['status']),
                      warna: switch (teks(a['status'])) { 'Selesai' => Colors.green, 'Gagal' => cs.error, _ => const Color(0xFFE9A23B) }),
                  onTap: teks(a['status']) == 'Proses' && teks(a['progres']).contains('Menyiapkan')
                      ? null
                      : () async {
                          await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ArsipDetailScreen(arsip: a, admin: admin, pengguna: daftar(d['pengguna']).map(peta).toList())));
                          _segar();
                        },
                ),
              ),
            if (admin && kode.isNotEmpty) ...[
              const JudulBagian('Kode akses arsip'),
              Card(
                child: Column(children: [
                  for (final k in kode)
                    ListTile(
                      dense: true,
                      leading: Icon(Icons.key_rounded, color: teks(k['status']) == 'Aktif' ? Colors.green : cs.outline),
                      title: Text('${teks(k['arsip'])} · ${teks(k['status'])}'),
                      subtitle: Text('berlaku sampai ${teks(k['berlaku'])} · ${teks(k['untuk'])} · dibuat ${teks(k['oleh'])}'),
                      trailing: teks(k['status']) == 'Aktif'
                          ? TextButton(
                              onPressed: () async {
                                final r = await jalankan(context, () => Api.instance('waAdminArsipKodeCabut', [_t, teks(k['id'])]), teksProses: 'Mencabut...');
                                if (r.ok && mounted) _segar();
                              },
                              child: const Text('Cabut'),
                            )
                          : null,
                    ),
                ]),
              ),
            ],
          ]),
        );
      },
    );
  }
}

/// Unggah template data offline: pratinjau -> konfirmasi -> terapkan (lalu arsip dibuat/diperbarui otomatis).
Future<void> unggahDataOffline(BuildContext context) async {
  final f = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['xlsx'], withData: true);
  if (f == null || f.files.isEmpty || !context.mounted) return;
  final x = f.files.first;
  if (x.size > 4 * 1048576) {
    kabar(context, 'File terlalu besar (maksimal 4 MB).', galat: true);
    return;
  }
  final Uint8List b = x.bytes ?? (x.path != null ? await File(x.path!).readAsBytes() : Uint8List(0));
  if (!context.mounted) return;
  final h = await jalankan(context, () async => peta(await Api.instance('waAdminOfflinePratinjau', [_t, {'b64': base64Encode(b)}], const Duration(minutes: 3))),
      teksProses: 'Memeriksa file...');
  if (!h.ok || h.data == null || !context.mounted) return;
  final p = h.data!;
  final ditolak = daftar(p['ditolak']).map(teks).toList();
  final contoh = daftar(p['contoh']).map(teks).toList();
  var yakin = false;
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => StatefulBuilder(
      builder: (c, atur) => AlertDialog(
        title: Text('Data offline · ${teks(p['periode'])}'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView(shrinkWrap: true, children: [
            Text('Rombel saat itu: ${teks(p['rombel'])} · ${angka(p['wb'])} warga belajar'),
            const SizedBox(height: 6),
            Text('${angka(p['nilai'])} nilai · ${angka(p['hadir'])} rekap kehadiran · ${angka(p['naik'])} keputusan kenaikan akan disimpan.',
                style: const TextStyle(fontWeight: FontWeight.w700)),
            if (contoh.isNotEmpty) ...[const SizedBox(height: 6), for (final t in contoh) Text('• $t', style: const TextStyle(fontSize: 12))],
            if (ditolak.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('Tidak disimpan (${ditolak.length}):', style: TextStyle(color: Theme.of(c).colorScheme.error, fontWeight: FontWeight.w700)),
              for (final t in ditolak) Text('• $t', style: const TextStyle(fontSize: 12)),
            ],
            const SizedBox(height: 8),
            const Text('Nilai dicatat sebagai data offline (hardcopy) sebelum sistem diterapkan. Arsip semester ini (folder Drive + rapor PDF) dibuat/diperbarui otomatis.',
                style: TextStyle(fontSize: 12)),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: yakin,
              onChanged: (v) => atur(() => yakin = v ?? false),
              title: const Text('Data ini sesuai berkas hardcopy', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: yakin && angka(p['nilai']) + angka(p['hadir']) + angka(p['naik']) > 0 ? () => Navigator.pop(c, true) : null, child: const Text('Simpan')),
        ],
      ),
    ),
  );
  if (ok != true || !context.mounted) return;
  final s = await jalankan(context, () async => peta(await Api.instance('waAdminOfflineTerapkan', [_t, teks(p['kunci'])], const Duration(minutes: 3))), teksProses: 'Menyimpan...');
  if (!s.ok || s.data == null || !context.mounted) return;
  kabar(context, '${angka(s.data!['nilai'])} nilai, ${angka(s.data!['hadir'])} rekap kehadiran tersimpan. Arsip semester ini sedang dibuat di latar belakang.');
}

// ───────────────────────── isi arsip ─────────────────────────

class ArsipDetailScreen extends StatefulWidget {
  const ArsipDetailScreen({super.key, required this.arsip, required this.admin, required this.pengguna});
  final Map<String, dynamic> arsip;
  final bool admin;
  final List<Map<String, dynamic>> pengguna;

  @override
  State<ArsipDetailScreen> createState() => _ArsipDetailScreenState();
}

class _ArsipDetailScreenState extends State<ArsipDetailScreen> {
  int _v = 0;
  String get _id => teks(widget.arsip['id']);

  Future<void> _bukaUbah() async {
    final c = TextEditingController();
    final kode = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: const Text('Kode akses arsip'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Arsip hanya baca. Masukkan kode akses dari admin untuk mengubah data. Setiap perubahan tercatat (nilai sebelum & sesudah).', style: TextStyle(fontSize: 12.5)),
          TextField(controller: c, autofocus: true, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Kode akses')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(d, c.text.trim()), child: const Text('Buka mode ubah')),
        ],
      ),
    );
    if (kode == null || kode.isEmpty || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafArsipBukaUbah', [_t, _id, kode]), teksProses: 'Memeriksa kode...');
    if (r.ok && mounted) {
      kabar(context, 'Mode ubah aktif ${angka(peta(r.data)['menit'])} menit.');
      setState(() => _v++);
    }
  }

  Future<void> _tutupUbah() async {
    final r = await jalankan(context, () => Api.instance('waStafArsipTutupUbah', [_t, _id]), teksProses: 'Menutup...');
    if (r.ok && mounted) setState(() => _v++);
  }

  Future<void> _buatKode() async {
    var jam = 24;
    String? untuk;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, atur) => AlertDialog(
          title: const Text('Buat kode akses'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('Untuk mengubah data ${_namaPer(widget.arsip)}.', style: const TextStyle(fontSize: 12.5)),
            DropdownButtonFormField<int>(
              initialValue: jam,
              decoration: const InputDecoration(labelText: 'Berlaku'),
              items: const [
                DropdownMenuItem(value: 2, child: Text('2 jam')),
                DropdownMenuItem(value: 24, child: Text('24 jam')),
                DropdownMenuItem(value: 72, child: Text('3 hari')),
                DropdownMenuItem(value: 168, child: Text('7 hari')),
              ],
              onChanged: (v) => atur(() => jam = v ?? 24),
            ),
            DropdownButtonFormField<String?>(
              initialValue: untuk,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Untuk'),
              items: [
                const DropdownMenuItem<String?>(value: null, child: Text('Semua Admin & Kepala Sekolah')),
                for (final u in widget.pengguna) DropdownMenuItem<String?>(value: teks(u['id']), child: Text('${teks(u['nama'])} (${teks(u['peran'])})')),
              ],
              onChanged: (v) => atur(() => untuk = v),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Buat')),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    final r = await jalankan(context, () async => peta(await Api.instance('waAdminArsipKodeBuat', [_t, _id, {'jam': jam, 'untuk': untuk ?? ''}])), teksProses: 'Membuat kode...');
    if (!r.ok || r.data == null || !mounted) return;
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Kode akses arsip'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          SelectableText(teks(r.data!['kode']), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 4)),
          const SizedBox(height: 8),
          Text('Berlaku sampai ${teks(r.data!['berlaku'])} · ${teks(r.data!['untuk'])}.\nKode hanya ditampilkan sekali; sampaikan langsung kepada yang berhak.',
              textAlign: TextAlign.center, style: const TextStyle(fontSize: 12.5)),
        ]),
        actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Tutup'))],
      ),
    );
  }

  Future<void> _bukaBerkas(Map<String, dynamic> b) async {
    final r = await jalankan(context, () async => peta(await Api.instance('waStafArsipBerkas', [_t, _id, teks(b['id'])], const Duration(minutes: 2))), teksProses: 'Membuka berkas...');
    if (!r.ok || r.data == null || !mounted) return;
    final mime = teks(r.data!['mime']);
    if (mime.startsWith('image/')) {
      await showDialog<void>(context: context, builder: (c) => Dialog(child: Image.memory(base64Decode(teks(r.data!['b64'])))));
      return;
    }
    await bukaPdfB64(context, teks(r.data!['b64']), teks(r.data!['nama'], 'arsip.pdf'));
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text('Arsip ${_namaPer(widget.arsip)}'), actions: [
        IconButton(
          tooltip: 'Log arsip',
          icon: const Icon(Icons.history_rounded),
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => _ArsipLogScreen(id: _id, judul: _namaPer(widget.arsip)))),
        ),
      ]),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_v),
        muat: () async => peta(await Api.instance('waStafArsipIsi', [_t, _id], const Duration(minutes: 2))),
        bangun: (context, d, segarkan) {
          final ubah = d['bolehUbah'] == true;
          final tab = daftar(d['tab']).map(peta).toList();
          final rombel = daftar(d['rombel']).map(peta).toList();
          return ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
            Container(
              margin: const EdgeInsets.only(top: 12, bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: ubah ? const Color(0xFFFFE4C7) : cs.secondaryContainer, borderRadius: BorderRadius.circular(14)),
              child: Row(children: [
                Icon(ubah ? Icons.edit_note_rounded : Icons.lock_rounded),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(ubah ? 'MODE UBAH AKTIF · setiap perubahan tercatat di Log Arsip' : 'MODE ARSIP · ${_namaPer(widget.arsip)} · hanya baca',
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
                if (ubah) TextButton(onPressed: _tutupUbah, child: const Text('Tutup')) else TextButton(onPressed: _bukaUbah, child: const Text('Ubah data')),
              ]),
            ),
            if (teks(d['catatanOffline']).isNotEmpty)
              Card(child: ListTile(leading: const Icon(Icons.info_outline_rounded), title: Text(teks(d['catatanOffline']), style: const TextStyle(fontSize: 13)))),
            if (widget.admin) Align(alignment: Alignment.centerLeft, child: TextButton.icon(onPressed: _buatKode, icon: const Icon(Icons.key_rounded), label: const Text('Buat kode akses'))),
            const JudulBagian('Rombel', sub: 'Rapor PDF, foto, leger'),
            if (rombel.isEmpty) const Kosong(pesan: 'Belum ada berkas rombel.'),
            for (final r in rombel)
              Card(
                child: ExpansionTile(
                  title: Text(teks(r['nama']), style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text('${daftar(r['berkas']).length} berkas'),
                  children: [
                    for (final b in daftar(r['berkas']).map(peta))
                      ListTile(
                        dense: true,
                        leading: Icon(teks(b['jenis']) == 'Foto' ? Icons.photo_rounded : Icons.picture_as_pdf_rounded),
                        title: Text(teks(b['nama']), maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text(teks(b['jenis'])),
                        onTap: () => _bukaBerkas(b),
                      ),
                  ],
                ),
              ),
            const JudulBagian('Data', sub: 'Salinan tab database semester ini'),
            Card(
              child: Column(children: [
                for (final x in tab)
                  ListTile(
                    dense: true,
                    leading: const Icon(Icons.table_chart_rounded),
                    title: Text(teks(x['nama'])),
                    trailing: Text('${angka(x['baris'])} baris'),
                    onTap: () async {
                      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => _ArsipTabScreen(id: _id, tab: teks(x['nama']), judul: _namaPer(widget.arsip))));
                      setState(() => _v++);
                    },
                  ),
              ]),
            ),
          ]);
        },
      ),
    );
  }
}

class _ArsipTabScreen extends StatefulWidget {
  const _ArsipTabScreen({required this.id, required this.tab, required this.judul});
  final String id;
  final String tab;
  final String judul;

  @override
  State<_ArsipTabScreen> createState() => _ArsipTabScreenState();
}

class _ArsipTabScreenState extends State<_ArsipTabScreen> {
  int _v = 0;
  int _mulai = 0;
  String _cari = '';
  final _c = TextEditingController();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Future<void> _ubahSel(int baris, int kolom, String judulKolom, String lama) async {
    final c = TextEditingController(text: lama);
    final baru = await showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('Ubah $judulKolom'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('${widget.tab} · baris $baris', style: const TextStyle(fontSize: 12.5)),
          TextField(controller: c, autofocus: true, maxLines: null),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(d, c.text), child: const Text('Simpan')),
        ],
      ),
    );
    if (baru == null || baru == lama || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafArsipUbah', [_t, widget.id, widget.tab, baris, kolom, baru]), teksProses: 'Menyimpan...');
    if (r.ok && mounted) {
      kabar(context, 'Tersimpan dan tercatat di Log Arsip.');
      setState(() => _v++);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.tab), bottom: PreferredSize(preferredSize: const Size.fromHeight(20), child: Text(widget.judul, style: const TextStyle(fontSize: 12)))),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey('$_v|$_mulai|$_cari'),
        muat: () async => peta(await Api.instance('waStafArsipTab', [_t, widget.id, {'tab': widget.tab, 'mulai': _mulai, 'jumlah': 100, 'cari': _cari}], const Duration(minutes: 2))),
        bangun: (context, d, segarkan) {
          final kepala = daftar(d['kepala']).map(teks).toList();
          final baris = daftar(d['baris']).map(peta).toList();
          final total = angka(d['total']);
          final ubah = d['bolehUbah'] == true;
          return Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
              child: TextField(
                controller: _c,
                textInputAction: TextInputAction.search,
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari di tab ini', isDense: true),
                onSubmitted: (v) => setState(() {
                  _cari = v.trim();
                  _mulai = 0;
                }),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(children: [
                Expanded(child: Text('${total == 0 ? 0 : _mulai + 1}–${_mulai + baris.length} dari $total${ubah ? ' · ketuk sel untuk mengubah' : ' · hanya baca'}', style: const TextStyle(fontSize: 12))),
                IconButton(onPressed: _mulai > 0 ? () => setState(() => _mulai = _mulai < 100 ? 0 : _mulai - 100) : null, icon: const Icon(Icons.chevron_left_rounded)),
                IconButton(onPressed: _mulai + baris.length < total ? () => setState(() => _mulai += 100) : null, icon: const Icon(Icons.chevron_right_rounded)),
              ]),
            ),
            Expanded(
              child: SingleChildScrollView(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: DataTable(
                    columnSpacing: 16,
                    headingRowHeight: 36,
                    dataRowMinHeight: 32,
                    dataRowMaxHeight: 56,
                    columns: [const DataColumn(label: Text('#')), for (final k in kepala) DataColumn(label: Text(k, style: const TextStyle(fontWeight: FontWeight.w800)))],
                    rows: [
                      for (final b in baris)
                        DataRow(cells: [
                          DataCell(Text('${angka(b['no'])}')),
                          for (var i = 0; i < kepala.length; i++)
                            DataCell(
                              ConstrainedBox(
                                constraints: const BoxConstraints(maxWidth: 260),
                                child: Text(i < daftar(b['isi']).length ? teks(daftar(b['isi'])[i]) : '', maxLines: 3, overflow: TextOverflow.ellipsis),
                              ),
                              onTap: ubah
                                  ? () => _ubahSel(angka(b['no']), i, kepala[i], i < daftar(b['isi']).length ? teks(daftar(b['isi'])[i]) : '')
                                  : null,
                            ),
                        ]),
                    ],
                  ),
                ),
              ),
            ),
          ]);
        },
      ),
    );
  }
}

class _ArsipLogScreen extends StatelessWidget {
  const _ArsipLogScreen({required this.id, required this.judul});
  final String id;
  final String judul;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Log arsip · $judul')),
      body: Muatan<Map<String, dynamic>>(
        muat: () async => peta(await Api.instance('waStafArsipLog', [_t, id])),
        bangun: (context, d, segarkan) {
          final log = daftar(d['log']).map(peta).toList();
          if (log.isEmpty) return const Kosong(pesan: 'Belum ada catatan.');
          return ListView(padding: const EdgeInsets.all(12), children: [
            for (final x in log)
              Card(
                child: ListTile(
                  dense: true,
                  title: Text('${teks(x['aksi'])} · ${teks(x['pengguna'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text([
                    teks(x['waktu']),
                    if (teks(x['detail']).isNotEmpty) teks(x['detail']),
                    if (teks(x['sebelum']).isNotEmpty || teks(x['sesudah']).isNotEmpty) '"${teks(x['sebelum'])}" → "${teks(x['sesudah'])}"',
                  ].join('\n')),
                ),
              ),
          ]);
        },
      ),
    );
  }
}
