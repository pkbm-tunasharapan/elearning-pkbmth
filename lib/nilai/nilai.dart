import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'cover_rapor.dart';

String? get _t => Sesi.instance.token;

double? nilN(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  final s = '$v'.trim().replaceAll(',', '.');
  return s.isEmpty ? null : double.tryParse(s);
}

String nilT(dynamic v) {
  final n = nilN(v);
  if (n == null) return '–';
  return n == n.roundToDouble() ? n.toInt().toString() : n.toStringAsFixed(1);
}

Color warnaSyarat(BuildContext c, String s) => switch (s) {
      'Memenuhi' => Colors.green,
      'Dispensasi' => const Color(0xFF3B82F6),
      'Kurang' => Theme.of(c).colorScheme.error,
      _ => Theme.of(c).colorScheme.outline,
    };

Color warnaPredikat(BuildContext c, String p) => switch (p) {
      'A' => Colors.green,
      'B' => const Color(0xFF3B82F6),
      'C' => const Color(0xFFE9A23B),
      'D' => Theme.of(c).colorScheme.error,
      _ => Theme.of(c).colorScheme.outline,
    };

String namaProgram(String p) => switch (p.toUpperCase()) {
      'PKT-A' => 'Paket A (setara SD)',
      'PKT-B' => 'Paket B (setara SMP)',
      'PKT-C' => 'Paket C (setara SMA)',
      _ => p,
    };

String _periodeTeks(Map<String, dynamic> p) => 'Semester ${teks(p['semester'])} ${teks(p['tahun'])}';

// ───────────────────────── daftar kelas ─────────────────────────

/// Menu "Nilai & Rapor": pilih kelas → rekap nilai; per rombel → leger, rapor, kartu peserta.
class NilaiRaporScreen extends StatefulWidget {
  const NilaiRaporScreen({super.key});

  @override
  State<NilaiRaporScreen> createState() => _NilaiRaporScreenState();
}

/// Daftar semester untuk dipilih: semester berjalan lalu 3 semester sebelumnya.
List<Map<String, String>> daftarSemester(Map<String, dynamic> kini) {
  final m = RegExp(r'(\d{4})\s*/\s*(\d{4})').firstMatch(teks(kini['tahun']));
  var y1 = m == null ? DateTime.now().year : int.parse(m.group(1)!);
  var genap = teks(kini['semester']) == 'Genap';
  final out = <Map<String, String>>[];
  for (var i = 0; i < 4; i++) {
    out.add({'tahun': '$y1/${y1 + 1}', 'semester': genap ? 'Genap' : 'Ganjil'});
    if (genap) {
      genap = false;
    } else {
      genap = true;
      y1--;
    }
  }
  return out;
}

class _NilaiRaporScreenState extends State<NilaiRaporScreen> {
  String _cari = '';
  Map<String, String>? _per; // null = semester berjalan

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      muat: () async => peta(await Api.instance('waStafNilaiKelas', [_t])),
      bangun: (context, d, segarkan) {
        final kelas = daftar(d['kelas']).map(peta).where((k) => _cari.isEmpty || '${teks(k['namaRombel'])} ${teks(k['namaMapel'])}'.toLowerCase().contains(_cari)).toList();
        final rapor = daftar(d['rombelRapor']).map(peta).toList();
        final peran = peta(d['peran']);
        final at = peta(d['aturan']);
        final semester = daftarSemester(peta(d['periode']));
        final pilihan = _per ?? semester.first;
        final kini = _per == null || (_per!['tahun'] == semester.first['tahun'] && _per!['semester'] == semester.first['semester']);
        final rombel = <String, List<Map<String, dynamic>>>{};
        for (final k in kelas) {
          rombel.putIfAbsent(teks(k['idRombel']), () => []).add(k);
        }
        final ids = rombel.keys.toList()..sort((a, b) => teks(rombel[a]!.first['namaRombel']).compareTo(teks(rombel[b]!.first['namaRombel'])));
        final b = peta(at['bobot']);
        return RefreshIndicator(
          onRefresh: segarkan,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            DropdownButtonFormField<int>(
              initialValue: semester.indexWhere((x) => x['tahun'] == pilihan['tahun'] && x['semester'] == pilihan['semester']).clamp(0, semester.length - 1).toInt(),
              decoration: const InputDecoration(labelText: 'Semester', prefixIcon: Icon(Icons.date_range_rounded)),
              items: [for (var i = 0; i < semester.length; i++) DropdownMenuItem(value: i, child: Text('${semester[i]['semester']} ${semester[i]['tahun']}${i == 0 ? ' (berjalan)' : ''}'))],
              onChanged: (i) => setState(() => _per = i == null || i == 0 ? null : semester[i]),
            ),
            const SizedBox(height: 6),
            Text('Nilai akhir = Diskusi ${nilT(b['diskusi'])}% · UTS ${nilT(b['uts'])}% · UAS ${nilT(b['uas'])}% · KKM ${nilT(at['kkm'])} · syarat hadir ≥ ${nilT(at['syaratHadir'])}%', style: const TextStyle(fontSize: 12.5)),
            if (rapor.isNotEmpty) ...[
              JudulBagian('Rapor', sub: peran['tutor'] == true ? 'Rombel yang Anda walikan' : 'Semua mapel per rombel'),
              Card(
                child: Column(children: [
                  for (final r in rapor)
                    ListTile(
                      leading: const Icon(Icons.assignment_ind_rounded, color: Gaya.ungu),
                      title: Text('Rapor ${teks(r['nama'])}'),
                      subtitle: Text(namaProgram(teks(r['program']))),
                      trailing: peran['kartu'] == true
                          ? IconButton(tooltip: 'Kartu peserta ujian', icon: const Icon(Icons.badge_outlined), onPressed: () => cetakKartuPeserta(context, teks(r['id'])))
                          : const Icon(Icons.chevron_right_rounded),
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => RaporRombelScreen(idRombel: teks(r['id']), nama: teks(r['nama']), per: _per))),
                    ),
                ]),
              ),
            ],
            JudulBagian('Leger nilai mapel', sub: peran['tutor'] == true ? 'Mapel yang Anda ampu' : 'Semua mapel'),
            TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari rombel atau mapel', isDense: true),
              onChanged: (v) => setState(() => _cari = v.trim().toLowerCase()),
            ),
            if (ids.isEmpty) const Kosong(pesan: 'Belum ada mapel yang Anda ampu.', ikon: Icons.grading_rounded),
            for (final id in ids) ...[
              JudulBagian(teks(rombel[id]!.first['namaRombel']), sub: namaProgram(teks(rombel[id]!.first['program']))),
              Card(
                child: Column(children: [
                  for (final k in rombel[id]!)
                    ListTile(
                      dense: true,
                      leading: const Icon(Icons.menu_book_rounded, color: Gaya.ungu),
                      title: Text(teks(k['namaMapel'])),
                      subtitle: teks(k['namaTutor']).isEmpty ? null : Text(teks(k['namaTutor'])),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => RekapNilaiScreen(kelas: k, peran: peran, per: kini ? null : _per))),
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

// ───────────────────────── rekap nilai per kelas ─────────────────────────

class RekapNilaiScreen extends StatefulWidget {
  const RekapNilaiScreen({super.key, required this.kelas, required this.peran, this.per});
  final Map<String, dynamic> kelas;
  final Map<String, dynamic> peran;
  final Map<String, String>? per;

  @override
  State<RekapNilaiScreen> createState() => _RekapNilaiScreenState();
}

class _RekapNilaiScreenState extends State<RekapNilaiScreen> {
  int _v = 0;
  Map<String, dynamic>? _data;

  Future<void> _ekspor(bool excel) async {
    final d = _data;
    if (d == null) return kabar(context, 'Tunggu data selesai dimuat.');
    final k = widget.kelas;
    final nama = 'Leger_${teks(k['namaMapel'])}_${teks(k['namaRombel'])}'.replaceAll(RegExp(r'[^A-Za-z0-9_]+'), '_');
    if (excel) {
      await bagikanExcel(context, legerMapelHtml(d, excel: true), '$nama.xls');
    } else {
      await htmlKePdf(context, nama: '$nama.pdf', args: [_t, legerMapelHtml(d)]);
    }
  }

  Future<void> _input(Map<String, dynamic> d, String jenis) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => InputNilaiScreen(data: d, jenis: jenis)));
    if (ok == true && mounted) setState(() => _v++);
  }

  Future<void> _detail(Map<String, dynamic> d, Map<String, dynamic> w) async {
    final at = peta(d['aturan']);
    final boleh = d['bolehDispensasi'] == true;
    final dis = peta(w['dispensasi']);
    final aksi = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(teks(w['nama']), style: Theme.of(c).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            Text('NISN ${teks(w['nisn'], '-')}${w['terhubung'] == true ? '' : ' · belum terhubung ke akun e-Learning'}', style: const TextStyle(fontSize: 12.5)),
            const SizedBox(height: 10),
            _baris('Kehadiran', '${angka(w['hadir'])} / ${angka(w['totalSesi'])} pertemuan (${w['persen'] == null ? '–' : '${nilT(w['persen'])}%'})'),
            _baris('Syarat ujian', teks(w['syarat']) + (dis.isEmpty ? '' : ' — ${teks(dis['alasan'])} (${teks(dis['oleh'])})')),
            _baris('Rata-rata diskusi', '${nilT(w['diskusi'])} (${angka(w['jmlDiskusi'])} jawaban dinilai)'),
            for (final j in ['uts', 'uas'])
              _baris(j.toUpperCase(), () {
                final x = peta(w[j]);
                final parts = <String>[nilT(x['nilai'])];
                if (x['manual'] != null) parts.add('input tutor');
                if (x['online'] != null) parts.add('online ${nilT(x['online'])}');
                return parts.join(' · ');
              }()),
            _baris('Nilai akhir', '${nilT(w['akhir'])} ${teks(w['predikat'])}${w['lengkap'] == true ? '' : ' (sementara)'} · KKM ${nilT(at['kkm'])}'),
            const SizedBox(height: 12),
            if (boleh && teks(w['syarat']) == 'Kurang')
              FilledButton.icon(onPressed: () => Navigator.pop(c, 'beri'), icon: const Icon(Icons.verified_user_outlined), label: const Text('Beri dispensasi ujian')),
            if (boleh && dis.isNotEmpty)
              OutlinedButton.icon(onPressed: () => Navigator.pop(c, 'cabut'), icon: const Icon(Icons.remove_moderator_outlined), label: const Text('Cabut dispensasi')),
          ]),
        ),
      ),
    );
    if (!mounted || aksi == null) return;
    if (aksi == 'beri') {
      final alasan = await mintaTeks(context, 'Dispensasi ujian ${teks(w['nama'])}', label: 'Alasan (mis. sakit dengan surat dokter)');
      if (alasan == null || !mounted) return;
      final r = await jalankan(context, () => Api.instance('waStafDispensasiBeri', [_t, {'idWb': teks(w['idWb']), 'idRombel': teks(widget.kelas['idRombel']), 'kodeMapel': teks(widget.kelas['kodeMapel']), 'jenis': '', 'alasan': alasan}]), teksProses: 'Menyimpan dispensasi...');
      if (r.ok && mounted) setState(() => _v++);
    } else if (aksi == 'cabut') {
      final r = await jalankan(context, () => Api.instance('waStafDispensasiCabut', [_t, teks(dis['id'])]), teksProses: 'Mencabut...');
      if (r.ok && mounted) setState(() => _v++);
    }
  }

  Widget _baris(String a, String b) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 130, child: Text(a, style: const TextStyle(fontWeight: FontWeight.w600))),
          Expanded(child: Text(b)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final k = widget.kelas;
    return Scaffold(
      appBar: AppBar(title: Text('Leger ${teks(k['namaMapel'])} · ${teks(k['namaRombel'])}'), actions: [
        IconButton(tooltip: 'PDF', icon: const Icon(Icons.picture_as_pdf_outlined), onPressed: () => _ekspor(false)),
        IconButton(tooltip: 'Excel', icon: const Icon(Icons.grid_on_rounded), onPressed: () => _ekspor(true)),
      ]),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_v),
        muat: () async {
          final d = peta(await Api.instance('waStafNilaiRekap', [_t, {'idRombel': teks(k['idRombel']), 'kodeMapel': teks(k['kodeMapel']), ...?widget.per}]));
          _data = d;
          return d;
        },
        bangun: (context, d, segarkan) {
          final wb = daftar(d['wb']).map(peta).toList();
          final at = peta(d['aturan']);
          final cs = Theme.of(context).colorScheme;
          final kurang = wb.where((w) => w['syarat'] == 'Kurang').length;
          return RefreshIndicator(
            onRefresh: segarkan,
            child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 32), children: [
              Text(_periodeTeks(peta(d['periode'])), style: const TextStyle(fontWeight: FontWeight.w700)),
              if (d['terhubungElearning'] != true)
                const Padding(padding: EdgeInsets.only(top: 6), child: Text('Mapel ini belum terhubung ke e-Learning, jadi nilai diskusi dan ujian online belum terbaca.', style: TextStyle(fontSize: 12.5))),
              if (kurang > 0)
                Padding(padding: const EdgeInsets.only(top: 6), child: Text('$kurang warga belajar belum memenuhi syarat kehadiran ${nilT(at['syaratHadir'])}%.', style: TextStyle(color: cs.error, fontSize: 12.5))),
              if (d['bolehInput'] == true && widget.per == null) ...[
                const SizedBox(height: 8),
                Row(children: [
                  Expanded(child: FilledButton.tonalIcon(onPressed: () => _input(d, 'UTS'), icon: const Icon(Icons.edit_note_rounded), label: const Text('Input UTS'))),
                  const SizedBox(width: 8),
                  Expanded(child: FilledButton.tonalIcon(onPressed: () => _input(d, 'UAS'), icon: const Icon(Icons.edit_note_rounded), label: const Text('Input UAS'))),
                ]),
              ],
              const SizedBox(height: 8),
              if (wb.isEmpty) const Kosong(pesan: 'Belum ada warga belajar aktif di rombel ini.'),
              Card(
                child: Column(children: [
                  for (final w in wb)
                    ListTile(
                      onTap: () => _detail(d, w),
                      title: Text(teks(w['nama']), maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Wrap(spacing: 6, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
                        Lencana('${w['persen'] == null ? '–' : '${nilT(w['persen'])}%'} ${teks(w['syarat']) == 'Belum ada sesi' ? '' : teks(w['syarat'])}'.trim(), warna: warnaSyarat(context, teks(w['syarat']))),
                        Text('D ${nilT(w['diskusi'])} · UTS ${nilT(peta(w['uts'])['nilai'])} · UAS ${nilT(peta(w['uas'])['nilai'])}', style: const TextStyle(fontSize: 12)),
                      ]),
                      trailing: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Text(nilT(w['akhir']), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: warnaPredikat(context, teks(w['predikat'])))),
                        Text(w['akhir'] == null ? '' : '${teks(w['predikat'])}${w['lengkap'] == true ? '' : '*'}', style: const TextStyle(fontSize: 11)),
                      ]),
                    ),
                ]),
              ),
              const Padding(padding: EdgeInsets.only(top: 6), child: Text('* nilai sementara (komponen belum lengkap). Ketuk nama untuk rincian.', style: TextStyle(fontSize: 11.5))),
            ]),
          );
        },
      ),
    );
  }
}

// ───────────────────────── input nilai UTS/UAS ─────────────────────────

class InputNilaiScreen extends StatefulWidget {
  const InputNilaiScreen({super.key, required this.data, required this.jenis});
  final Map<String, dynamic> data;
  final String jenis;

  @override
  State<InputNilaiScreen> createState() => _InputNilaiScreenState();
}

class _InputNilaiScreenState extends State<InputNilaiScreen> {
  final _c = <String, TextEditingController>{};
  final _awal = <String, String>{};
  late final List<Map<String, dynamic>> _wb;

  @override
  void initState() {
    super.initState();
    _wb = daftar(widget.data['wb']).map(peta).toList();
    for (final w in _wb) {
      final x = peta(w[widget.jenis.toLowerCase()]);
      final v = x['manual'] == null ? '' : nilT(x['manual']);
      _awal[teks(w['idWb'])] = v;
      _c[teks(w['idWb'])] = TextEditingController(text: v);
    }
  }

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _simpan() async {
    final ubah = [
      for (final w in _wb)
        if (_c[teks(w['idWb'])]!.text.trim() != _awal[teks(w['idWb'])]) {'idWb': teks(w['idWb']), 'nilai': _c[teks(w['idWb'])]!.text.trim()}
    ];
    if (ubah.isEmpty) return kabar(context, 'Tidak ada perubahan.');
    final k = peta(widget.data['kelas']);
    final r = await jalankan(context, () => Api.instance('waStafNilaiInput', [_t, {'idRombel': teks(k['idRombel']), 'kodeMapel': teks(k['kodeMapel']), 'jenis': widget.jenis, 'nilai': ubah}]), teksProses: 'Menyimpan nilai...');
    if (!r.ok || !mounted) return;
    final x = peta(r.data);
    final tolak = daftar(x['ditolak']).map((e) => teks(e)).toList();
    if (tolak.isNotEmpty) {
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text('${angka(x['tersimpan'])} nilai tersimpan'),
          content: Text('Tidak disimpan:\n• ${tolak.join('\n• ')}'),
          actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('OK'))],
        ),
      );
    } else {
      kabar(context, '${angka(x['tersimpan'])} nilai ${widget.jenis} tersimpan.');
    }
    if (mounted) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text('Input nilai ${widget.jenis}'), actions: [TextButton(onPressed: _simpan, child: const Text('Simpan'))]),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
        Text('Isi untuk ujian kertas / tatap muka (0–100). Nilai yang diisi di sini menggantikan nilai ujian online. Kosongkan untuk memakai nilai online.', style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
        const SizedBox(height: 8),
        for (final w in _wb)
          Builder(builder: (context) {
            final x = peta(w[widget.jenis.toLowerCase()]);
            final boleh = x['boleh'] != false;
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(teks(w['nama']), style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text(
                      [if (x['online'] != null) 'online ${nilT(x['online'])}', if (!boleh) 'kehadiran ${nilT(w['persen'])}% — belum memenuhi syarat'].join(' · '),
                      style: TextStyle(fontSize: 11.5, color: boleh ? cs.onSurfaceVariant : cs.error),
                    ),
                  ]),
                ),
                SizedBox(
                  width: 84,
                  child: TextField(
                    controller: _c[teks(w['idWb'])],
                    enabled: boleh,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    textAlign: TextAlign.center,
                    decoration: InputDecoration(isDense: true, hintText: x['online'] == null ? '' : nilT(x['online'])),
                  ),
                ),
              ]),
            );
          }),
        const SizedBox(height: 16),
        FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: _simpan, child: const Text('Simpan nilai')),
      ]),
    );
  }
}

// ───────────────────────── leger & rapor ─────────────────────────

/// Pilihan cetak untuk satu warga belajar: rapor nilai atau cover & biodata.
Future<void> _pilihCetakWb(BuildContext context, String idRombel, String namaRombel, Map<String, dynamic> d, Map<String, dynamic> w) async {
  final nm = teks(w['nama']);
  final p = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (c) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 8), child: Text(nm, style: const TextStyle(fontWeight: FontWeight.w800))),
        ListTile(leading: const Icon(Icons.print_rounded), title: const Text('Rapor nilai'), onTap: () => Navigator.pop(c, 'rapor')),
        ListTile(leading: const Icon(Icons.badge_outlined), title: const Text('Cover & biodata'), onTap: () => Navigator.pop(c, 'cover')),
        const SizedBox(height: 8),
      ]),
    ),
  );
  if (p == null || !context.mounted) return;
  if (p == 'rapor') {
    await htmlKePdf(context, nama: 'Rapor_$nm.pdf', args: [_t, raporHtml(d, [w])]);
  } else {
    await cetakCoverBiodata(context, idRombel: idRombel, namaRombel: namaRombel, idWb: teks(w['idWb']), nisn: teks(w['nisn']), namaWb: nm);
  }
}

class RaporRombelScreen extends StatelessWidget {
  const RaporRombelScreen({super.key, required this.idRombel, required this.nama, this.per});
  final String idRombel;
  final String nama;
  final Map<String, String>? per;

  void _pilihCetak(BuildContext context, Map<String, dynamic> d, Map<String, dynamic> w) => _pilihCetakWb(context, idRombel, nama, d, w);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Rapor $nama')),
      body: Muatan<Map<String, dynamic>>(
        muat: () async {
          final d = peta(await Api.instance('waStafLeger', [_t, {'idRombel': idRombel, ...?per}], const Duration(minutes: 3)));
          final pr = peta(d['periode']);
          if (teks(pr['semester']) == 'Genap') {
            try {
              d['kenaikan'] = peta(await Api.instance('waStafKenaikanDaftar', [_t, {'idRombel': idRombel, 'tahun': teks(pr['tahun'])}]));
            } catch (_) {}
          }
          return d;
        },
        bangun: (context, d, segarkan) {
          final mapel = daftar(d['mapel']).map(peta).toList();
          final wb = daftar(d['wb']).map(peta).toList();
          final at = peta(d['aturan']);
          final wali = teks(peta(d['wali'])['nama']);
          return ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 32), children: [
            Text('${_periodeTeks(peta(d['periode']))} · ${namaProgram(teks(peta(d['rombel'])['program']))} · KKM ${nilT(at['kkm'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
            Text('Wali kelas: ${wali.isEmpty ? 'belum ditetapkan' : wali}', style: const TextStyle(fontSize: 12.5)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 6, children: [
              FilledButton.icon(onPressed: () => htmlKePdf(context, nama: 'Rapor_${nama}_${tanggalBerkas()}.pdf', args: [_t, raporHtml(d, wb)]), icon: const Icon(Icons.print_rounded), label: const Text('Cetak rapor semua')),
              FilledButton.tonalIcon(onPressed: () => htmlKePdf(context, nama: 'Rekap_Nilai_${nama}_${tanggalBerkas()}.pdf', args: [_t, legerHtml(d)]), icon: const Icon(Icons.picture_as_pdf_outlined), label: const Text('Rekap PDF')),
              FilledButton.tonalIcon(onPressed: () => bagikanExcel(context, legerHtml(d, excel: true), 'Rekap_Nilai_${nama}_${tanggalBerkas()}.xls'), icon: const Icon(Icons.grid_on_rounded), label: const Text('Rekap Excel')),
              FilledButton.tonalIcon(onPressed: () => cetakCoverBiodata(context, idRombel: idRombel, namaRombel: nama), icon: const Icon(Icons.badge_outlined), label: const Text('Cover & biodata')),
              if (d['kenaikan'] != null)
                FilledButton.tonalIcon(
                  onPressed: () async {
                    final ubah = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => KenaikanScreen(idRombel: idRombel, namaRombel: nama, leger: d)));
                    if (ubah == true) await segarkan();
                  },
                  icon: Icon(peta(peta(d['kenaikan'])['info'])['akhir'] == true ? Icons.school_rounded : Icons.trending_up_rounded),
                  label: Text(peta(peta(d['kenaikan'])['info'])['akhir'] == true ? 'Kelulusan' : 'Kenaikan kelas'),
                ),
            ]),
            const SizedBox(height: 10),
            Card(
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: DataTable(
                  showCheckboxColumn: false,
                  columnSpacing: 14,
                  headingRowHeight: 40,
                  dataRowMinHeight: 36,
                  dataRowMaxHeight: 44,
                  columns: [
                    const DataColumn(label: Text('Nama')),
                    for (final m in mapel) DataColumn(numeric: true, label: Tooltip(message: teks(m['nama']), child: Text(teks(m['kode'])))),
                    const DataColumn(numeric: true, label: Text('Rata')),
                    const DataColumn(numeric: true, label: Text('Rank')),
                  ],
                  rows: [
                    for (final w in wb)
                      DataRow(
                        onSelectChanged: (_) => _pilihCetak(context, d, w),
                        cells: [
                          DataCell(SizedBox(width: 150, child: Text(teks(w['nama']), overflow: TextOverflow.ellipsis))),
                          for (final m in mapel)
                            DataCell(Text(nilT(peta(w['nilai'])[teks(m['kode'])]),
                                style: TextStyle(color: (nilN(peta(w['nilai'])[teks(m['kode'])]) ?? 100) < (nilN(at['kkm']) ?? 0) ? Theme.of(context).colorScheme.error : null))),
                          DataCell(Text(nilT(w['rata']), style: const TextStyle(fontWeight: FontWeight.w700))),
                          DataCell(Text(w['peringkat'] == null ? '–' : '${w['peringkat']}')),
                        ],
                      ),
                  ],
                ),
              ),
            ),
            const Padding(padding: EdgeInsets.only(top: 6), child: Text('Ketuk baris untuk mencetak rapor satu warga belajar.', style: TextStyle(fontSize: 11.5))),
          ]);
        },
      ),
    );
  }
}

String _kotaDari(String alamat) {
  final bag = alamat.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
  if (bag.isEmpty) return '';
  return bag.last.replaceFirst(RegExp(r'^(Kab\.?|Kabupaten|Kota)\s*', caseSensitive: false), '');
}

String _kop(Map<String, dynamic> l, String judul) =>
    '<div class="kop"><div class="lb">${escHtml(teks(l['nama'], 'PKBM'))}</div><div>NPSN ${escHtml(teks(l['npsn']))} · ${escHtml(teks(l['alamat']))}</div></div><h2>$judul</h2>';

const _cssDok = '.kop{text-align:center;border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:8px}.lb{font-size:15pt;font-weight:bold}'
    'h2{text-align:center;font-size:12pt;margin:6px 0 10px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:4px 5px;font-size:9.5pt}'
    'th{background:#eee}.c{text-align:center}.id td{border:none;padding:1px 4px}.ttd{width:100%;margin-top:24px}.ttd td{border:none;text-align:center;vertical-align:top;font-size:10pt}'
    '.hal{page-break-after:always}.hal:last-child{page-break-after:auto}.kecil{font-size:8.5pt;color:#444}';

String legerHtml(Map<String, dynamic> d, {bool excel = false}) {
  final mapel = daftar(d['mapel']).map(peta).toList();
  final wb = daftar(d['wb']).map(peta).toList();
  final rb = peta(d['rombel']);
  final per = peta(d['periode']);
  final b = StringBuffer();
  if (!excel) b.write(_kop(peta(d['lembaga']), 'LEGER NILAI ${escHtml(teks(rb['nama']).toUpperCase())}'));
  b.write('<p>${escHtml(namaProgram(teks(rb['program'])))} · ${escHtml(_periodeTeks(per))} · KKM ${nilT(peta(d['aturan'])['kkm'])}</p>');
  b.write('<table><tr><th>No</th><th>NISN</th><th>Nama</th>');
  for (final m in mapel) {
    b.write('<th title="${escHtml(teks(m['nama']))}">${escHtml(teks(m['kode']))}</th>');
  }
  b.write('<th>Jumlah</th><th>Rata-rata</th><th>Peringkat</th></tr>');
  var i = 0;
  for (final w in wb) {
    i++;
    b.write('<tr><td class="c">$i</td><td>${excel ? '&#39;' : ''}${escHtml(teks(w['nisn']))}</td><td>${escHtml(teks(w['nama']))}</td>');
    for (final m in mapel) {
      b.write('<td class="c">${nilT(peta(w['nilai'])[teks(m['kode'])])}</td>');
    }
    b.write('<td class="c">${angka(w['n']) > 0 ? nilT(w['jumlah']) : '–'}</td><td class="c">${nilT(w['rata'])}</td><td class="c">${w['peringkat'] ?? '–'}</td></tr>');
  }
  b.write('</table><p class="kecil">Keterangan mapel: ${mapel.map((m) => '${escHtml(teks(m['kode']))} = ${escHtml(teks(m['nama']))}').join('; ')}</p>');
  if (excel) return '<html><head><meta charset="utf-8"></head><body>$b</body></html>';
  return dokumenA4(b.toString(), _cssDok, lanskap: true);
}

/// Leger satu mapel (untuk tutor pengampu): komponen nilai tiap warga belajar.
String legerMapelHtml(Map<String, dynamic> d, {bool excel = false}) {
  final k = peta(d['kelas']);
  final per = peta(d['periode']);
  final at = peta(d['aturan']);
  final bb = peta(at['bobot']);
  final wb = daftar(d['wb']).map(peta).toList();
  final b = StringBuffer();
  if (!excel) b.write('<h2>LEGER NILAI ${escHtml(teks(k['namaMapel']).toUpperCase())}</h2>');
  b.write('<p>Rombel ${escHtml(teks(k['namaRombel']))} · ${escHtml(namaProgram(teks(k['program'])))} · ${escHtml(_periodeTeks(per))}<br>'
      'Tutor: ${escHtml(teks(k['namaTutor'], '-'))} · Bobot Diskusi ${nilT(bb['diskusi'])}%, UTS ${nilT(bb['uts'])}%, UAS ${nilT(bb['uas'])}% · KKM ${nilT(at['kkm'])}</p>');
  b.write('<table><tr><th>No</th><th>NISN</th><th>Nama</th><th>Hadir</th><th>Diskusi</th><th>UTS</th><th>UAS</th><th>Nilai Akhir</th><th>Predikat</th><th>Keterangan</th></tr>');
  var i = 0;
  for (final w in wb) {
    i++;
    final ket = w['akhir'] == null ? 'Belum ada nilai' : (w['lengkap'] != true ? 'Sementara' : (w['tuntas'] == true ? 'Tuntas' : 'Belum tuntas'));
    b.write('<tr><td class="c">$i</td><td>${excel ? '&#39;' : ''}${escHtml(teks(w['nisn']))}</td><td>${escHtml(teks(w['nama']))}</td>'
        '<td class="c">${w['persen'] == null ? '–' : '${nilT(w['persen'])}%'}</td><td class="c">${nilT(w['diskusi'])}</td><td class="c">${nilT(peta(w['uts'])['nilai'])}</td>'
        '<td class="c">${nilT(peta(w['uas'])['nilai'])}</td><td class="c"><b>${nilT(w['akhir'])}</b></td><td class="c">${escHtml(teks(w['predikat']))}</td><td>${escHtml(ket)}</td></tr>');
  }
  b.write('</table>');
  if (excel) return '<html><head><meta charset="utf-8"></head><body>$b</body></html>';
  b.write('<table class="ttd"><tr><td></td><td>${tanggalIni()}<br>Tutor Mata Pelajaran<br><br><br><br><b><u>${escHtml(teks(k['namaTutor'], '..............................'))}</u></b></td></tr></table>');
  return dokumenA4(b.toString(), _cssDok);
}

String _deskripsi(String nama, String p) => switch (p) {
      'A' => 'Menunjukkan penguasaan kompetensi $nama dengan sangat baik.',
      'B' => 'Menunjukkan penguasaan kompetensi $nama dengan baik.',
      'C' => 'Menunjukkan penguasaan kompetensi $nama dengan cukup.',
      'D' => 'Perlu bimbingan lebih lanjut dalam mencapai kompetensi $nama.',
      _ => 'Nilai belum lengkap.',
    };

/// Rapor (satu halaman per WB) dari data leger.
String raporHtml(Map<String, dynamic> d, List<Map<String, dynamic>> wbs) {
  final mapel = daftar(d['mapel']).map(peta).toList();
  final rb = peta(d['rombel']);
  final per = peta(d['periode']);
  final l = peta(d['lembaga']);
  final at = peta(d['aturan']);
  final kota = _kotaDari(teks(l['alamat']));
  final kn = teks(per['semester']) == 'Genap' ? peta(d['kenaikan']) : <String, dynamic>{};
  final b = StringBuffer();
  for (final w in wbs) {
    final h = peta(w['kehadiran']);
    b.write('<div class="hal">${_kop(l, 'LAPORAN HASIL BELAJAR')}');
    b.write('<table class="id"><tr><td>Nama</td><td>: <b>${escHtml(teks(w['nama']))}</b></td><td>Program</td><td>: ${escHtml(namaProgram(teks(rb['program'])))}</td></tr>'
        '<tr><td>NISN</td><td>: ${escHtml(teks(w['nisn'], '-'))}</td><td>Rombel</td><td>: ${escHtml(teks(rb['nama']))}</td></tr>'
        '<tr><td>Lembaga</td><td>: ${escHtml(teks(l['nama']))}</td><td>Semester</td><td>: ${escHtml(teks(per['semester']))} ${escHtml(teks(per['tahun']))}</td></tr></table><br>');
    b.write('<table><tr><th>No</th><th>Mata Pelajaran</th><th>KKM</th><th>Nilai</th><th>Predikat</th><th>Deskripsi</th></tr>');
    var i = 0;
    for (final m in mapel) {
      i++;
      final n = peta(w['nilai'])[teks(m['kode'])];
      final p = teks(peta(w['predikat'])[teks(m['kode'])]);
      b.write('<tr><td class="c">$i</td><td>${escHtml(teks(m['nama']))}</td><td class="c">${nilT(at['kkm'])}</td><td class="c"><b>${nilT(n)}</b></td><td class="c">${escHtml(p)}</td><td>${escHtml(_deskripsi(teks(m['nama']), p))}</td></tr>');
    }
    b.write('<tr><td colspan="3" class="c"><b>Rata-rata</b></td><td class="c"><b>${nilT(w['rata'])}</b></td><td colspan="2">Peringkat ${w['peringkat'] ?? '–'} dari ${daftar(d['wb']).length}</td></tr></table><br>');
    b.write('<table style="width:55%"><tr><th colspan="2">Ketidakhadiran tatap muka</th></tr><tr><td>Sakit</td><td class="c">${angka(h['Sakit'])} hari</td></tr>'
        '<tr><td>Izin</td><td class="c">${angka(h['Izin'])} hari</td></tr><tr><td>Tanpa keterangan</td><td class="c">${angka(h['Alpa'])} hari</td></tr></table>');
    if (kn.isNotEmpty) b.write(_kotakKeputusan(peta(kn['info']), teks(peta(kn['keputusan'])[teks(w['idWb'])])));
    b.write('<table class="ttd"><tr><td>Orang Tua/Wali<br><br><br><br><br>(..............................)</td>'
        '<td>${escHtml(kota)}${kota.isEmpty ? '' : ', '}${tanggalIni()}<br>Wali Kelas<br><br><br><br><b><u>${escHtml(teks(peta(d['wali'])['nama'], '..............................'))}</u></b></td></tr>'
        '<tr><td colspan="2" style="padding-top:14px">Mengetahui,<br>Kepala ${escHtml(teks(l['nama'], 'PKBM'))}<br><br><br><br><b><u>${escHtml(teks(l['kepala']))}</u></b></td></tr></table></div>');
  }
  return dokumenA4(b.toString(), _cssDok);
}

const _angkaKata = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas', 'dua belas'];

/// "Kelas 8 (delapan) - Tingkatan III"
String teksKelas(dynamic kelas, dynamic tingkatRomawi) {
  final k = angka(kelas);
  if (k <= 0) return '.........';
  final kata = k < _angkaKata.length ? ' (${_angkaKata[k]})' : '';
  final t = teks(tingkatRomawi);
  return 'kelas $k$kata${t.isEmpty ? '' : ' (Tingkatan $t)'}';
}

/// Kotak keputusan rapor semester Genap: naik/tinggal kelas, atau lulus/tidak lulus untuk kelas akhir.
String _kotakKeputusan(Map<String, dynamic> info, String keputusan) {
  final akhir = info['akhir'] == true;
  final ini = teksKelas(info['kelas'], info['tingkatRomawi']);
  final lanjut = teksKelas(info['kelasBerikut'], info['tingkatBerikutRomawi']);
  final String isi;
  if (akhir) {
    isi = switch (keputusan) {
      'Lulus' => '<b>LULUS</b>',
      'Tidak Lulus' => '<b>TIDAK LULUS</b>',
      _ => '<b>LULUS / TIDAK LULUS</b>*',
    };
  } else {
    isi = switch (keputusan) {
      'Naik' => '<b>NAIK</b> ke ${escHtml(lanjut)}',
      'Tinggal' => '<b>TINGGAL</b> di ${escHtml(ini)}',
      _ => '<b>NAIK</b> ke ${escHtml(lanjut)} / <b>TINGGAL</b> di ${escHtml(ini)}*',
    };
  }
  final belum = keputusan.isEmpty;
  return '<table style="width:100%;margin-top:8px"><tr><th style="text-align:left">Keputusan</th></tr><tr><td style="padding:6px 8px">'
      'Berdasarkan pencapaian seluruh kompetensi, peserta didik dinyatakan:<br><span style="font-size:11.5pt">$isi</span>'
      '${belum ? '<br><span style="font-size:8pt">*coret yang tidak perlu</span>' : ''}</td></tr></table>';
}

/// Wali kelas mencentang siapa yang naik kelas (kelas akhir: lulus). Yang tidak dicentang = tinggal / tidak lulus.
class KenaikanScreen extends StatefulWidget {
  const KenaikanScreen({super.key, required this.idRombel, required this.namaRombel, required this.leger});
  final String idRombel;
  final String namaRombel;
  final Map<String, dynamic> leger;

  @override
  State<KenaikanScreen> createState() => _KenaikanScreenState();
}

class _KenaikanScreenState extends State<KenaikanScreen> {
  late final Map<String, dynamic> _kn = peta(widget.leger['kenaikan']);
  late final Map<String, dynamic> _info = peta(_kn['info']);
  late final List<Map<String, dynamic>> _wb = daftar(widget.leger['wb']).map(peta).where((w) => teks(w['idWb']).isNotEmpty).toList()
    ..sort((a, b) => teks(a['nama']).compareTo(teks(b['nama'])));
  late final Set<String> _naik;
  late final bool _baru;

  bool get _akhir => _info['akhir'] == true;
  String get _ya => _akhir ? 'Lulus' : 'Naik';

  @override
  void initState() {
    super.initState();
    final kep = peta(_kn['keputusan']);
    _baru = kep.isEmpty;
    // Belum pernah disimpan: semua dicentang dulu, wali kelas tinggal menghapus centang yang tidak naik.
    _naik = {for (final w in _wb) if (_baru || teks(kep[teks(w['idWb'])]) == _ya) teks(w['idWb'])};
  }

  Future<void> _simpan() async {
    final n = _naik.length, t = _wb.length - n;
    final ok = await konfirmasi(
      context,
      _akhir ? 'Simpan kelulusan?' : 'Simpan kenaikan kelas?',
      _akhir ? '$n lulus, $t tidak lulus.' : '$n naik ke ${teksKelas(_info['kelasBerikut'], _info['tingkatBerikutRomawi'])}, $t tinggal di ${teksKelas(_info['kelas'], _info['tingkatRomawi'])}.',
      ya: 'Simpan',
    );
    if (!ok || !mounted) return;
    final r = await jalankan(
      context,
      () => Api.instance('waStafKenaikanSimpan', [_t, {
        'idRombel': widget.idRombel,
        'tahun': teks(_kn['tahun']),
        'daftar': [for (final w in _wb) {'idWb': teks(w['idWb']), 'nama': teks(w['nama']), 'naik': _naik.contains(teks(w['idWb']))}],
      }]),
      teksProses: 'Menyimpan...',
    );
    if (r.ok && mounted) {
      kabar(context, 'Keputusan tersimpan. Rapor semester Genap kini mencetaknya.');
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final semua = _naik.length == _wb.length;
    return Scaffold(
      appBar: AppBar(title: Text('${_akhir ? 'Kelulusan' : 'Kenaikan kelas'} ${widget.namaRombel}')),
      body: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 100), children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Tahun pelajaran ${teks(_kn['tahun'])} · ${teksKelas(_info['kelas'], _info['tingkatRomawi'])}', style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(
                _akhir
                    ? 'Kelas akhir. Centang warga belajar yang LULUS; yang tidak dicentang dicetak TIDAK LULUS.'
                    : 'Centang warga belajar yang NAIK ke ${teksKelas(_info['kelasBerikut'], _info['tingkatBerikutRomawi'])}; yang tidak dicentang dicetak TINGGAL di kelas.',
                style: const TextStyle(fontSize: 12.5),
              ),
              if (angka(_info['kelas']) == 0)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('Nama rombel tidak memuat kelas (mis. B8). Kelas di rapor dicetak bertitik.', style: TextStyle(fontSize: 12, color: cs.error)),
                ),
              if (_baru)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('Belum pernah disimpan: semua dicentang sebagai awal.', style: TextStyle(fontSize: 12, color: cs.primary)),
                )
              else if (teks(_kn['oleh']).isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text('Terakhir disimpan oleh ${teks(_kn['oleh'])}', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                ),
            ]),
          ),
        ),
        Row(children: [
          Expanded(child: Text('$_ya: ${_naik.length} dari ${_wb.length}', style: const TextStyle(fontWeight: FontWeight.w700))),
          TextButton.icon(
            onPressed: () => setState(() {
              if (semua) {
                _naik.clear();
              } else {
                _naik.addAll(_wb.map((w) => teks(w['idWb'])));
              }
            }),
            icon: Icon(semua ? Icons.remove_done_rounded : Icons.done_all_rounded),
            label: Text(semua ? 'Hapus semua centang' : 'Centang semua'),
          ),
        ]),
        if (_wb.isEmpty) const Kosong(pesan: 'Belum ada warga belajar di rombel ini.'),
        Card(
          child: Column(children: [
            for (final w in _wb)
              CheckboxListTile(
                value: _naik.contains(teks(w['idWb'])),
                onChanged: (v) => setState(() {
                  if (v == true) {
                    _naik.add(teks(w['idWb']));
                  } else {
                    _naik.remove(teks(w['idWb']));
                  }
                }),
                title: Text(teks(w['nama']), maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: Text('Rata-rata ${nilT(w['rata'])} · ${_naik.contains(teks(w['idWb'])) ? _ya : (_akhir ? 'Tidak lulus' : 'Tinggal')}',
                    style: TextStyle(fontSize: 12, color: _naik.contains(teks(w['idWb'])) ? null : cs.error)),
              ),
          ]),
        ),
      ]),
      floatingActionButton: _wb.isEmpty
          ? null
          : FloatingActionButton.extended(onPressed: _simpan, icon: const Icon(Icons.save_rounded), label: const Text('Simpan')),
    );
  }
}

// ───────────────────────── kartu peserta ujian ─────────────────────────

Future<String> qrPngB64(String data) async {
  final p = QrPainter(
    data: data,
    version: QrVersions.auto,
    gapless: true,
    eyeStyle: const QrEyeStyle(eyeShape: QrEyeShape.square, color: Colors.black),
    dataModuleStyle: const QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: Colors.black),
  );
  final bd = await p.toImageData(220, format: ui.ImageByteFormat.png);
  return bd == null ? '' : base64Encode(bd.buffer.asUint8List());
}

Future<void> cetakKartuPeserta(BuildContext context, String idRombel) async {
  final r = await jalankan(context, () async => peta(await Api.instance('waStafKartuPeserta', [_t, idRombel])), teksProses: 'Menyiapkan kartu peserta...');
  if (!r.ok || !context.mounted) return;
  final d = r.data!;
  final rb = peta(d['rombel']);
  final per = peta(d['periode']);
  final l = peta(d['lembaga']);
  final jadwal = daftar(d['jadwal']).map(peta).toList();
  final wb = daftar(d['wb']).map(peta).toList();
  if (wb.isEmpty) return kabar(context, 'Rombel ini belum punya warga belajar aktif.', galat: true);
  final b = StringBuffer();
  final jt = StringBuffer('<table class="jd"><tr><th>Tanggal</th><th>Jam</th><th>Ujian</th><th>Tempat</th></tr>');
  for (final j in jadwal.take(12)) {
    jt.write('<tr><td>${escHtml(tglIndo(teks(j['tanggal'])))}</td><td>${escHtml(teks(j['jam']))}</td><td>${escHtml(teks(j['jenis']))} ${escHtml(teks(j['mapel']))}</td><td>${escHtml(teks(j['ruang']))}</td></tr>');
  }
  jt.write('</table>');
  for (final w in wb) {
    final qr = await qrPngB64(teks(w['kode']));
    b.write('<div class="kartu"><div class="kh">KARTU PESERTA UJIAN<br><span>${escHtml(teks(l['nama']))} · ${escHtml(_periodeTeks(per))}</span></div>'
        '<table class="ki"><tr><td class="qr"><img src="data:image/png;base64,$qr"></td><td>'
        '<div class="nm">${escHtml(teks(w['nama']))}</div><div>NISN: ${escHtml(teks(w['nisn'], '-'))}</div><div>No. Peserta: ${escHtml(teks(w['idWb']))}</div>'
        '<div>Rombel: ${escHtml(teks(rb['nama']))} · ${escHtml(namaProgram(teks(rb['program'])))}</div></td></tr></table>'
        '${jadwal.isEmpty ? '<p class="kecil">Jadwal ujian diumumkan kemudian.</p>' : jt}'
        '<div class="ft">Tunjukkan kartu ini (QR) kepada pengawas saat ujian.</div></div>');
  }
  const css = '.kartu{border:1.5px solid #333;border-radius:6px;padding:7px;margin:0 0 8px;page-break-inside:avoid;width:48%;display:inline-block;vertical-align:top;margin-right:1.5%;box-sizing:border-box}'
      '.kh{text-align:center;font-weight:bold;font-size:10.5pt;border-bottom:1px solid #999;padding-bottom:3px;margin-bottom:4px}.kh span{font-weight:normal;font-size:8pt}'
      '.ki td{border:none;vertical-align:top;font-size:9pt}.qr img{width:80px;height:80px}.nm{font-weight:bold;font-size:10.5pt}'
      '.jd{border-collapse:collapse;width:100%;margin-top:4px}.jd th,.jd td{border:1px solid #888;font-size:7.5pt;padding:1px 3px}.jd th{background:#eee}'
      '.ft{font-size:7.5pt;color:#444;margin-top:3px;text-align:center}.kecil{font-size:8pt}';
  if (!context.mounted) return;
  await htmlKePdf(context, nama: 'Kartu_Peserta_${teks(rb['nama'])}.pdf', args: [_t, dokumenA4(b.toString(), css)]);
}

// ───────────────────────── asesmen tatap muka ─────────────────────────

class AsesmenScreen extends StatefulWidget {
  const AsesmenScreen({super.key});

  @override
  State<AsesmenScreen> createState() => _AsesmenScreenState();
}

class _AsesmenScreenState extends State<AsesmenScreen> {
  int _v = 0;

  Future<void> _ubah(Map<String, dynamic> d, [Map<String, dynamic>? a]) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => FormAsesmen(data: d, a: a)));
    if (ok == true && mounted) setState(() => _v++);
  }

  Future<void> _hapus(Map<String, dynamic> a) async {
    if (!await konfirmasi(context, 'Hapus asesmen?', '${teks(a['jenis'])} ${teks(a['namaMapel'])} · ${teks(a['namaRombel'])} ${tglIndo(teks(a['tanggal']))}', ya: 'Hapus')) return;
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafAsesmenHapus', [_t, teks(a['id'])]), teksProses: 'Menghapus...');
    if (r.ok && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waStafAsesmenDaftar', [_t, {}])),
      bangun: (context, d, segarkan) {
        final as = daftar(d['asesmen']).map(peta).toList();
        final kelola = d['kelola'] == true;
        final hari = tglIso(DateTime.now());
        return Stack(children: [
          RefreshIndicator(
            onRefresh: segarkan,
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 100), children: [
              Text('Asesmen tatap muka (kertas) · ${_periodeTeks(peta(d['periode']))}', style: const TextStyle(fontWeight: FontWeight.w700)),
              const Text('Ujian online tetap dijadwalkan tutor di menu mapel. Di sini untuk ujian di sekretariat: jadwal, ruang, pengawas dan presensi peserta (pindai kartu).', style: TextStyle(fontSize: 12.5)),
              if (d['kartu'] == true && daftar(d['rombel']).isNotEmpty)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () async {
                      final rb = daftar(d['rombel']).map(peta).toList();
                      final id = await showModalBottomSheet<String>(
                        context: context,
                        showDragHandle: true,
                        builder: (c) => SafeArea(child: ListView(shrinkWrap: true, children: [
                          const ListTile(title: Text('Cetak kartu peserta untuk rombel', style: TextStyle(fontWeight: FontWeight.w800))),
                          for (final r in rb) ListTile(title: Text(teks(r['nama'])), onTap: () => Navigator.pop(c, teks(r['id']))),
                        ])),
                      );
                      if (id != null && context.mounted) await cetakKartuPeserta(context, id);
                    },
                    icon: const Icon(Icons.badge_outlined),
                    label: const Text('Cetak kartu peserta ujian'),
                  ),
                ),
              const SizedBox(height: 8),
              if (as.isEmpty) Kosong(pesan: kelola ? 'Belum ada asesmen. Ketuk "Tambah asesmen".' : 'Belum ada asesmen tatap muka.', ikon: Icons.assignment_outlined),
              for (final a in as)
                Card(
                  child: ListTile(
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => PesertaAsesmenScreen(id: teks(a['id'])))).then((_) { if (mounted) setState(() => _v++); }),
                    leading: CircleAvatar(
                      backgroundColor: (teks(a['tanggal']) == hari ? Colors.green : Gaya.ungu).withValues(alpha: 0.12),
                      child: Text(teks(a['jenis']).length > 3 ? teks(a['jenis']).substring(0, 3) : teks(a['jenis']), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                    ),
                    title: Text('${teks(a['namaMapel'])} · ${teks(a['namaRombel'])}'),
                    subtitle: Text('${tglIndo(teks(a['tanggal']))} ${teks(a['mulai'])}–${teks(a['selesai'])}${teks(a['ruang']).isEmpty ? '' : ' · ${teks(a['ruang'])}'}${teks(a['pengawas']).isEmpty ? '' : '\nPengawas: ${teks(a['pengawas'])}'} · hadir ${angka(a['jumlahHadir'])}'),
                    isThreeLine: teks(a['pengawas']).isNotEmpty,
                    trailing: kelola
                        ? PopupMenuButton<String>(
                            onSelected: (v) => v == 'ubah' ? _ubah(d, a) : _hapus(a),
                            itemBuilder: (_) => const [PopupMenuItem(value: 'ubah', child: Text('Ubah')), PopupMenuItem(value: 'hapus', child: Text('Hapus'))],
                          )
                        : const Icon(Icons.chevron_right_rounded),
                  ),
                ),
            ]),
          ),
          if (kelola)
            Positioned(right: 16, bottom: 16, child: FloatingActionButton.extended(heroTag: 'tambahAsesmen', onPressed: () => _ubah(d), icon: const Icon(Icons.add_rounded), label: const Text('Tambah asesmen'))),
        ]);
      },
    );
  }
}

class FormAsesmen extends StatefulWidget {
  const FormAsesmen({super.key, required this.data, this.a});
  final Map<String, dynamic> data;
  final Map<String, dynamic>? a;

  @override
  State<FormAsesmen> createState() => _FormAsesmenState();
}

class _FormAsesmenState extends State<FormAsesmen> {
  String? _kelas;
  String _jenis = 'UTS';
  late String _tgl;
  final _mulai = TextEditingController(text: '08:00');
  final _selesai = TextEditingController(text: '09:30');
  final _ruang = TextEditingController(text: 'Sekretariat');
  final _pengawas = TextEditingController();
  final _catatan = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tgl = tglIso(DateTime.now());
    final a = widget.a;
    if (a != null) {
      _kelas = '${teks(a['idRombel'])}|${teks(a['kodeMapel'])}';
      _jenis = teks(a['jenis'], 'UTS');
      _tgl = teks(a['tanggal'], _tgl);
      _mulai.text = teks(a['mulai']);
      _selesai.text = teks(a['selesai']);
      _ruang.text = teks(a['ruang']);
      _pengawas.text = teks(a['pengawas']);
      _catatan.text = teks(a['catatan']);
    }
  }

  @override
  void dispose() {
    for (final c in [_mulai, _selesai, _ruang, _pengawas, _catatan]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final kelas = <String, Map<String, dynamic>>{};
    for (final k in daftar(widget.data['kelas']).map(peta)) {
      kelas.putIfAbsent('${teks(k['idRombel'])}|${teks(k['kodeMapel'])}', () => k);
    }
    final kunci = kelas.keys.toList()..sort((a, b) => '${teks(kelas[a]!['namaRombel'])}${teks(kelas[a]!['namaMapel'])}'.compareTo('${teks(kelas[b]!['namaRombel'])}${teks(kelas[b]!['namaMapel'])}'));
    final jenis = daftar(widget.data['jenis']).map((e) => teks(e)).toList();
    return Scaffold(
      appBar: AppBar(title: Text(widget.a == null ? 'Tambah asesmen' : 'Ubah asesmen')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        DropdownButtonFormField<String>(
          initialValue: jenis.contains(_jenis) ? _jenis : null,
          decoration: const InputDecoration(labelText: 'Jenis asesmen'),
          items: [for (final j in jenis) DropdownMenuItem(value: j, child: Text(j))],
          onChanged: (v) => setState(() => _jenis = v ?? _jenis),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: kelas.containsKey(_kelas) ? _kelas : null,
          decoration: const InputDecoration(labelText: 'Rombel · Mapel'),
          items: [for (final k in kunci) DropdownMenuItem(value: k, child: Text('${teks(kelas[k]!['namaRombel'])} · ${teks(kelas[k]!['namaMapel'])}', overflow: TextOverflow.ellipsis))],
          onChanged: (v) => setState(() => _kelas = v),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () async {
            final n = DateTime.now();
            final p = await showDatePicker(context: context, firstDate: DateTime(n.year - 1), lastDate: DateTime(n.year + 1), initialDate: DateTime.tryParse(_tgl) ?? n);
            if (p != null) setState(() => _tgl = tglIso(p));
          },
          icon: const Icon(Icons.event_rounded),
          label: Text(tglIndo(_tgl)),
        ),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: TextField(controller: _mulai, decoration: const InputDecoration(labelText: 'Jam mulai', hintText: '08:00'))),
          const SizedBox(width: 8),
          Expanded(child: TextField(controller: _selesai, decoration: const InputDecoration(labelText: 'Jam selesai', hintText: '09:30'))),
        ]),
        const SizedBox(height: 12),
        TextField(controller: _ruang, decoration: const InputDecoration(labelText: 'Ruang')),
        const SizedBox(height: 12),
        TextField(controller: _pengawas, decoration: const InputDecoration(labelText: 'Pengawas')),
        const SizedBox(height: 12),
        TextField(controller: _catatan, decoration: const InputDecoration(labelText: 'Catatan (opsional)')),
        const SizedBox(height: 20),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          onPressed: () async {
            if (_kelas == null) return kabar(context, 'Pilih rombel dan mapel.', galat: true);
            final p = _kelas!.split('|');
            final r = await jalankan(context, () => Api.instance('waStafAsesmenSimpan', [
                  _t,
                  {if (widget.a != null) 'id': teks(widget.a!['id']), 'jenis': _jenis, 'tanggal': _tgl, 'mulai': _mulai.text.trim(), 'selesai': _selesai.text.trim(), 'idRombel': p[0], 'kodeMapel': p[1], 'ruang': _ruang.text, 'pengawas': _pengawas.text, 'catatan': _catatan.text}
                ]), teksProses: 'Menyimpan...');
            if (r.ok && context.mounted) Navigator.pop(context, true);
          },
          child: const Text('Simpan'),
        ),
      ]),
    );
  }
}

class PesertaAsesmenScreen extends StatefulWidget {
  const PesertaAsesmenScreen({super.key, required this.id});
  final String id;

  @override
  State<PesertaAsesmenScreen> createState() => _PesertaAsesmenScreenState();
}

class _PesertaAsesmenScreenState extends State<PesertaAsesmenScreen> {
  int _v = 0;

  Future<void> _pindai() async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PemindaiQr(
        judul: 'Presensi ujian',
        petunjuk: 'Pindai QR kartu peserta / kartu siswa',
        onKode: (kode) async {
          final x = peta(await Api.instance('waStafAsesmenHadir', [_t, widget.id, kode]));
          if (x['sudah'] == true) return teks(x['pesan']);
          return '${teks(x['nama'])} hadir${teks(x['syarat']) == 'Memenuhi' ? '' : ' (${teks(x['syarat'])})'}';
        },
      ),
    ));
    if (mounted) setState(() => _v++);
  }

  Future<void> _catat(Map<String, dynamic> p) async {
    final r = await jalankan(context, () => Api.instance('waStafAsesmenHadir', [_t, widget.id, teks(p['idWb'])]), teksProses: 'Mencatat...');
    if (r.ok && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Peserta asesmen')),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_v),
        muat: () async => peta(await Api.instance('waStafAsesmenPeserta', [_t, widget.id])),
        bangun: (context, d, segarkan) {
          final a = peta(d['asesmen']);
          final ps = daftar(d['peserta']).map(peta).toList();
          final boleh = d['presensi'] == true;
          final hadir = ps.where((p) => p['hadir'] == true).length;
          return RefreshIndicator(
            onRefresh: segarkan,
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
              Text('${teks(a['jenis'])} ${teks(a['namaMapel'])} · ${teks(a['namaRombel'])}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              Text('${tglIndo(teks(a['tanggal']))} ${teks(a['mulai'])}–${teks(a['selesai'])} · ${teks(a['ruang'])} · hadir $hadir/${ps.length}'),
              const SizedBox(height: 10),
              if (boleh) FilledButton.icon(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: _pindai, icon: const Icon(Icons.qr_code_scanner_rounded), label: const Text('Pindai kartu peserta')),
              const SizedBox(height: 8),
              Card(
                child: Column(children: [
                  for (final p in ps)
                    ListTile(
                      dense: true,
                      leading: Icon(p['hadir'] == true ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded, color: p['hadir'] == true ? Colors.green : Theme.of(context).colorScheme.outline),
                      title: Text(teks(p['nama'])),
                      subtitle: Text('${p['persen'] == null ? 'Belum ada sesi tatap muka' : 'Kehadiran ${nilT(p['persen'])}%'} · ${teks(p['syarat'])}${p['hadir'] == true ? ' · ${teks(p['jam'])}' : ''}',
                          style: TextStyle(color: p['boleh'] == true ? null : Theme.of(context).colorScheme.error)),
                      trailing: boleh && p['hadir'] != true && p['boleh'] == true ? TextButton(onPressed: () => _catat(p), child: const Text('Hadir')) : null,
                    ),
                ]),
              ),
            ]),
          );
        },
      ),
    );
  }
}

// ───────────────────────── dispensasi & aturan ─────────────────────────

class DispensasiScreen extends StatefulWidget {
  const DispensasiScreen({super.key});

  @override
  State<DispensasiScreen> createState() => _DispensasiScreenState();
}

class _DispensasiScreenState extends State<DispensasiScreen> {
  int _v = 0;

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waStafDispensasiDaftar', [_t])),
      bangun: (context, d, segarkan) {
        final ds = daftar(d['dispensasi']).map(peta).toList();
        final boleh = d['boleh'] == true;
        return RefreshIndicator(
          onRefresh: segarkan,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Text('Dispensasi ujian · ${_periodeTeks(peta(d['periode']))}', style: const TextStyle(fontWeight: FontWeight.w700)),
            const Text('Untuk memberi dispensasi, buka Nilai & Rapor → kelas → ketuk nama warga belajar yang kehadirannya kurang.', style: TextStyle(fontSize: 12.5)),
            const SizedBox(height: 8),
            if (ds.isEmpty) const Kosong(pesan: 'Belum ada dispensasi pada semester ini.', ikon: Icons.verified_user_outlined),
            for (final x in ds)
              Card(
                child: ListTile(
                  title: Text('${teks(x['nama'])} · ${teks(x['namaRombel'])}'),
                  subtitle: Text('${teks(x['namaMapel'])} · ${teks(x['jenis']) == '*' ? 'UTS & UAS' : teks(x['jenis'])}\n${teks(x['alasan'])} — ${teks(x['oleh'])}'),
                  isThreeLine: true,
                  trailing: boleh
                      ? IconButton(
                          tooltip: 'Cabut',
                          icon: const Icon(Icons.remove_moderator_outlined),
                          onPressed: () async {
                            if (!await konfirmasi(context, 'Cabut dispensasi?', teks(x['nama']), ya: 'Cabut')) return;
                            if (!context.mounted) return;
                            final r = await jalankan(context, () => Api.instance('waStafDispensasiCabut', [_t, teks(x['id'])]), teksProses: 'Mencabut...');
                            if (r.ok && mounted) setState(() => _v++);
                          },
                        )
                      : null,
                ),
              ),
          ]),
        );
      },
    );
  }
}

class AturNilaiScreen extends StatefulWidget {
  const AturNilaiScreen({super.key});

  @override
  State<AturNilaiScreen> createState() => _AturNilaiScreenState();
}

class _AturNilaiScreenState extends State<AturNilaiScreen> {
  final _c = {for (final k in ['diskusi', 'uts', 'uas', 'kkm', 'syaratHadir', 'predikatA', 'predikatB']) k: TextEditingController()};
  bool _blokir = true;
  bool _siap = false;
  String? _galat;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _muat() async {
    try {
      final a = peta(peta(await Api.instance('waStafNilaiAturan', [_t]))['aturan']);
      final b = peta(a['bobot']);
      if (!mounted) return;
      setState(() {
        for (final k in ['diskusi', 'uts', 'uas']) {
          _c[k]!.text = nilT(b[k]);
        }
        for (final k in ['kkm', 'syaratHadir', 'predikatA', 'predikatB']) {
          _c[k]!.text = nilT(a[k]);
        }
        _blokir = a['blokir'] != false;
        _siap = true;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  Widget _f(String k, String label, {String akhiran = ''}) => Expanded(
        child: TextField(controller: _c[k], keyboardType: TextInputType.number, decoration: InputDecoration(labelText: label, suffixText: akhiran, isDense: true)),
      );

  @override
  Widget build(BuildContext context) {
    if (_galat != null) return PesanGalat(pesan: _galat!, ulangi: _muat);
    if (!_siap) return const Center(child: CircularProgressIndicator());
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
      const JudulBagian('Bobot nilai akhir', sub: 'Dalam persen; tidak harus berjumlah 100 (dinormalkan otomatis).'),
      Row(children: [_f('diskusi', 'Diskusi', akhiran: '%'), const SizedBox(width: 8), _f('uts', 'UTS', akhiran: '%'), const SizedBox(width: 8), _f('uas', 'UAS', akhiran: '%')]),
      const JudulBagian('Ketuntasan & predikat'),
      Row(children: [_f('kkm', 'KKM'), const SizedBox(width: 8), _f('predikatB', 'B mulai'), const SizedBox(width: 8), _f('predikatA', 'A mulai')]),
      const Padding(padding: EdgeInsets.only(top: 4), child: Text('C = KKM s.d. di bawah B; D = di bawah KKM.', style: TextStyle(fontSize: 12))),
      const JudulBagian('Syarat ujian'),
      Row(children: [_f('syaratHadir', 'Minimal kehadiran', akhiran: '%'), const Spacer()]),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        value: _blokir,
        onChanged: (v) => setState(() => _blokir = v),
        title: const Text('Blokir ujian bila kehadiran kurang'),
        subtitle: const Text('Ujian online, presensi ujian kertas dan input nilai UTS/UAS ditolak kecuali ada dispensasi Kepala Sekolah.'),
      ),
      const SizedBox(height: 16),
      FilledButton(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
        onPressed: () async {
          double v(String k) => nilN(_c[k]!.text) ?? 0;
          final r = await jalankan(context, () => Api.instance('waAdminNilaiAturanSimpan', [
                _t,
                {'bobot': {'diskusi': v('diskusi'), 'uts': v('uts'), 'uas': v('uas')}, 'kkm': v('kkm'), 'syaratHadir': v('syaratHadir'), 'predikatA': v('predikatA'), 'predikatB': v('predikatB'), 'blokir': _blokir}
              ]), teksProses: 'Menyimpan...');
          if (r.ok && context.mounted) kabar(context, 'Aturan nilai tersimpan.');
        },
        child: const Text('Simpan'),
      ),
    ]);
  }
}

// ───────────────────────── wali kelas ─────────────────────────

class WaliKelasScreen extends StatefulWidget {
  const WaliKelasScreen({super.key});

  @override
  State<WaliKelasScreen> createState() => _WaliKelasScreenState();
}

class _WaliKelasScreenState extends State<WaliKelasScreen> {
  int _v = 0;

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waStafWaliDaftar', [_t])),
      bangun: (context, d, segarkan) {
        final rb = daftar(d['rombel']).map(peta).toList();
        final tutor = daftar(d['tutor']).map(peta).toList();
        return RefreshIndicator(
          onRefresh: segarkan,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            const Text('Wali kelas dapat membuka dan mencetak rapor rombelnya. Tutor biasa hanya melihat leger mapel yang diampu.', style: TextStyle(fontSize: 12.5)),
            const SizedBox(height: 8),
            if (rb.isEmpty) const Kosong(pesan: 'Belum ada rombel aktif.'),
            for (final r in rb)
              Card(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${teks(r['nama'])} · ${namaProgram(teks(r['program']))}', style: const TextStyle(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 6),
                    DropdownButtonFormField<String>(
                      isExpanded: true,
                      initialValue: teks(r['idWali']),
                      decoration: const InputDecoration(labelText: 'Wali kelas', isDense: true),
                      items: [
                        const DropdownMenuItem(value: '', child: Text('— belum ditetapkan —')),
                        for (final t in tutor) DropdownMenuItem(value: teks(t['id']), child: Text(teks(t['nama']))),
                        if (teks(r['idWali']).isNotEmpty && !tutor.any((t) => teks(t['id']) == teks(r['idWali'])))
                          DropdownMenuItem(value: teks(r['idWali']), child: Text(teks(r['namaWali'], teks(r['idWali'])))),
                      ],
                      onChanged: (v) async {
                        final res = await jalankan(context, () => Api.instance('waStafWaliSimpan', [_t, teks(r['id']), v ?? '']), teksProses: 'Menyimpan...');
                        if (!mounted) return;
                        if (res.ok) {
                          kabar(context, 'Wali kelas ${teks(r['nama'])} tersimpan.');
                        } else {
                          setState(() => _v++);
                        }
                      },
                    ),
                  ]),
                ),
              ),
          ]),
        );
      },
    );
  }
}
