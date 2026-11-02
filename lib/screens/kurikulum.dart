import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../berkas.dart';
import '../session.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

String _namaSesi(Map<String, dynamic> x) => angka(x['n']) > 0 ? 'Sesi ${angka(x['n'])}' : 'Minggu ${angka(x['minggu'])}';

/// Tab Kurikulum: rencana sesi per mapel dari PDF (sama dengan renderKur_ di web).
class KurikulumTab extends StatefulWidget {
  const KurikulumTab({super.key, required this.idMapel, required this.judul});
  final String idMapel;
  final String judul;

  @override
  State<KurikulumTab> createState() => _KurikulumTabState();
}

class _KurikulumTabState extends State<KurikulumTab> with AutomaticKeepAliveClientMixin {
  int _v = 0;
  @override
  bool get wantKeepAlive => true;

  void _muatUlang() => setState(() => _v++);

  Future<void> _terbit(dynamic daftarSesi) async {
    final r = await jalankan(context, () => Api.instance('waStafKurikulumTerbit', [_t, widget.idMapel, daftarSesi], const Duration(minutes: 5)),
        teksProses: 'Membuat Draft...');
    if (!r.ok || !mounted) return;
    final d = peta(r.data);
    var t = '${angka(d['materi'])} materi dan ${angka(d['diskusi'])} diskusi dibuat sebagai Draft. Tinjau di tab Konten lalu klik Post.';
    if (angka(d['tanpaBacaan']) > 0) t += ' ${angka(d['tanpaBacaan'])} materi belum memuat bacaan lengkap.';
    if (angka(d['tanpaSesi']) > 0) t += ' ${angka(d['tanpaSesi'])} sesi dilewati karena tidak ada jatah sesi.';
    kabar(context, t);
    _muatUlang();
  }

  Future<void> _buka(Widget layar) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => layar));
    if (mounted) _muatUlang();
  }

  Future<void> _hapus(int n) async {
    if (!await konfirmasi(context, 'Hapus rencana kurikulum?',
        'Seluruh rencana ($n sesi) untuk mapel ini dihapus. Materi dan Diskusi yang sudah dibuat di tab Konten TIDAK ikut terhapus.',
        ya: 'Ya, hapus rencana')) {
      return;
    }
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafKurikulumHapus', [_t, widget.idMapel]));
    if (r.ok && mounted) {
      kabar(context, 'Rencana dihapus.');
      _muatUlang();
    }
  }

  Widget _status(String label, String st) {
    final (teksSt, w) = switch (st) {
      '' => ('belum dibuat', Colors.grey),
      'Aktif' => ('aktif', Colors.green),
      'Selesai' => ('selesai', Colors.grey),
      _ => ('draft', const Color(0xFFE9A23B)),
    };
    return Lencana('$label: $teksSt', warna: w);
  }

  Widget _baris(Map<String, dynamic> x) {
    final cs = Theme.of(context).colorScheme;
    final soal = daftar(x['soal']).map(peta).toList();
    final perluDraft = teks(x['statusMateri']).isEmpty || (teks(x['tanya']).isNotEmpty && teks(x['statusDiskusi']).isEmpty);
    final st = teks(x['statusSesi']);
    Widget bagian(String label, String isi) => isi.isEmpty
        ? const SizedBox()
        : Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: cs.primary)),
              const SizedBox(height: 2),
              SelectableText(isi, style: const TextStyle(fontSize: 13.5, height: 1.4)),
            ]),
          );
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ExpansionTile(
        shape: const Border(),
        tilePadding: const EdgeInsets.fromLTRB(14, 4, 8, 4),
        childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
        title: Text('${_namaSesi(x)} · ${teks(x['topik'])}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (teks(x['halaman']).isNotEmpty || teks(x['label']).isNotEmpty)
              Text([if (teks(x['halaman']).isNotEmpty) 'hlm ${teks(x['halaman'])}', if (teks(x['label']).isNotEmpty) teks(x['label'])].join(' · '),
                  style: const TextStyle(fontSize: 12)),
            const SizedBox(height: 4),
            Wrap(spacing: 4, runSpacing: 4, children: [
              if (st.isNotEmpty)
                Lencana(st == 'berjalan' ? 'berjalan' : (st == 'lewat' ? 'berakhir' : 'belum dimulai'), warna: st == 'berjalan' ? Colors.green : cs.outline),
              Lencana(x['adaBacaan'] == true ? 'Bacaan lengkap' : 'Bacaan belum ada', warna: x['adaBacaan'] == true ? Colors.green : const Color(0xFFE9A23B)),
              if (x['adaBacaan'] == true)
                Lencana(x['adaSoal'] == true ? 'Soal: ${soal.length}' : 'Soal belum ada', warna: x['adaSoal'] == true ? Colors.green : const Color(0xFFE9A23B)),
              _status('Materi', teks(x['statusMateri'])),
              if (teks(x['tanya']).isNotEmpty) _status('Diskusi', teks(x['statusDiskusi'])),
            ]),
          ]),
        ),
        children: [
          Row(children: [
            OutlinedButton.icon(onPressed: () => _buka(UbahKurScreen(idMapel: widget.idMapel, x: x)), icon: const Icon(Icons.edit_rounded, size: 18), label: const Text('Ubah')),
            const SizedBox(width: 8),
            if (perluDraft)
              FilledButton.tonal(
                onPressed: () => _terbit([
                  {'smt': angka(x['smt']), 'minggu': angka(x['minggu'])}
                ]),
                child: const Text('Buat Draft'),
              ),
          ]),
          bagian('Narasi pengantar', teks(x['narasi'])),
          bagian('Tujuan pembelajaran', teks(x['tp'])),
          bagian('Pertanyaan diskusi', teks(x['tanya'])),
          bagian('Bacaan lengkap', teks(x['bacaan'])),
          if (soal.isNotEmpty)
            bagian(
              'Bank soal (${soal.length})',
              [
                for (var i = 0; i < soal.length; i++)
                  '${i + 1}. [${teks(soal[i]['tingkat'])}] ${teks(soal[i]['pertanyaan'])}\n'
                      '${peta(soal[i]['opsi']).entries.map((e) => '  ${e.key == teks(soal[i]['kunci']) ? '✔' : ' '} ${e.key}. ${e.value}').join('\n')}'
              ].join('\n\n'),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waStafKurikulumBaca', [_t, widget.idMapel])),
      bangun: (context, d, _) {
        final cs = Theme.of(context).colorScheme;
        final rows = daftar(d['rows']).map(peta).toList();
        final siapAi = d['siapAi'] == true;
        final kosongBacaan = rows.where((x) => x['adaBacaan'] != true).length;
        final kosongSoal = rows.where((x) => x['adaBacaan'] == true && x['adaSoal'] != true).length;
        final adaBank = rows.where((x) => x['adaSoal'] == true).length;
        final tanpaDraft = rows.where((x) => teks(x['statusMateri']).isEmpty || (teks(x['tanya']).isNotEmpty && teks(x['statusDiskusi']).isEmpty)).length;
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                const Text('Rencana Kurikulum per Sesi', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                const SizedBox(height: 4),
                Text(
                  'Susun sekali dari buku siswa (PDF): tiap sesi mendapat judul, narasi pengantar, rujukan halaman, tujuan pembelajaran, bacaan lengkap khusus sesi itu, '
                  'pertanyaan diskusi, dan bank soal ujian, persis seperti SIM SETARA. Satu semester berisi ${angka(d['jumlahMinggu'])} sesi materi '
                  '(Sesi ${angka(d['uts'])} = UTS dan Sesi ${angka(d['uas'])} = UAS tidak berisi materi). Hasilnya bisa Anda ubah, lalu dijadikan Draft Materi dan '
                  'Diskusi untuk diperiksa sebelum di-Post. Bank soal tiap sesi dipakai untuk UTS dan UAS: setiap siswa mendapat soal acak dari bank ini, dan jadwalnya diatur di tab Jadwal Ujian.',
                  style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
                ),
                if (!siapAi)
                  Container(
                    margin: const EdgeInsets.only(top: 10),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: cs.primaryContainer, borderRadius: BorderRadius.circular(12)),
                    child: Text(Sesi.instance.isAdmin
                        ? 'Fitur AI belum diaktifkan. Isi kunci Gemini di menu "Pengaturan AI" (atau pakai "Lewat Gemini langsung" di bawah).'
                        : 'Fitur susun otomatis belum tersedia. Silakan hubungi admin, atau pakai "Lewat Gemini langsung" di bawah.'),
                  ),
                const SizedBox(height: 12),
                Wrap(spacing: 8, runSpacing: 8, children: [
                  if (rows.isEmpty)
                    FilledButton.icon(
                      onPressed: siapAi ? () => _buka(SusunKurScreen(idMapel: widget.idMapel, judul: widget.judul, mode: 'penuh', d: d)) : null,
                      icon: const Icon(Icons.auto_awesome_rounded, size: 18),
                      label: const Text('Susun dari PDF'),
                    )
                  else
                    OutlinedButton.icon(
                      onPressed: siapAi ? () => _buka(SusunKurScreen(idMapel: widget.idMapel, judul: widget.judul, mode: 'penuh', d: d)) : null,
                      icon: const Icon(Icons.auto_awesome_rounded, size: 18),
                      label: const Text('Susun ulang dari PDF'),
                    ),
                  if (rows.isNotEmpty && kosongBacaan > 0)
                    FilledButton.tonal(
                      onPressed: siapAi ? () => _buka(SusunKurScreen(idMapel: widget.idMapel, judul: widget.judul, mode: 'bacaan', d: d)) : null,
                      child: Text('Lengkapi bacaan ($kosongBacaan sesi)'),
                    ),
                  if (rows.isNotEmpty && kosongSoal > 0)
                    FilledButton.tonal(
                      onPressed: siapAi ? () => _buka(SusunKurScreen(idMapel: widget.idMapel, judul: widget.judul, mode: 'soal', d: d)) : null,
                      child: Text('Lengkapi soal ($kosongSoal sesi)'),
                    ),
                  if (rows.isNotEmpty && tanpaDraft > 0) FilledButton.tonal(onPressed: () => _terbit('semua'), child: Text('Buat Draft semua ($tanpaDraft sesi)')),
                  OutlinedButton.icon(
                    onPressed: () => _buka(ManualKurScreen(idMapel: widget.idMapel, judul: widget.judul, d: d)),
                    icon: const Icon(Icons.swap_horiz_rounded, size: 18),
                    label: const Text('Lewat Gemini langsung'),
                  ),
                  if (rows.isNotEmpty) TextButton(onPressed: () => _hapus(rows.length), child: Text('Hapus rencana', style: TextStyle(color: cs.error))),
                ]),
                const SizedBox(height: 8),
                Text('Kuota AI gratis habis? "Lewat Gemini langsung" memakai aplikasi Gemini (salin prompt, tempel hasilnya di sini) tanpa kuota aplikasi.',
                    style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
              ]),
            ),
          ),
          if (rows.isEmpty)
            Padding(
              padding: const EdgeInsets.all(8),
              child: Text('Belum ada rencana untuk mapel ini. Ketuk "Susun dari PDF", unggah buku siswa (dan Panduan Mata Pelajaran bila ada), lalu tunggu AI menyusun dua semester.',
                  style: TextStyle(color: cs.onSurfaceVariant)),
            )
          else ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 10, 4, 0),
              child: Text(
                '${rows.length} sesi · bacaan lengkap ${rows.length - kosongBacaan} dari ${rows.length} · bank soal $adaBank dari ${rows.length}'
                '${teks(rows.first['buku']).isNotEmpty ? ' · acuan: ${teks(rows.first['buku'])}' : ''}',
                style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant),
              ),
            ),
            for (final smt in [1, 2])
              if (rows.any((x) => angka(x['smt']) == smt)) ...[
                JudulBagian('Semester $smt', sub: '${rows.where((x) => angka(x['smt']) == smt).length} sesi'),
                for (final e in () {
                  final out = <Widget>[];
                  dynamic bab;
                  for (final x in rows.where((x) => angka(x['smt']) == smt)) {
                    if ('${x['bab']}' != '$bab') {
                      bab = x['bab'];
                      out.add(Padding(
                        padding: const EdgeInsets.fromLTRB(4, 6, 4, 6),
                        child: Text('Bab ${teks(x['bab'])}${teks(x['judulBab']).isNotEmpty ? ' · ${teks(x['judulBab'])}' : ''}',
                            style: TextStyle(fontWeight: FontWeight.w700, color: cs.primary)),
                      ));
                    }
                    out.add(_baris(x));
                  }
                  return out;
                }())
                  e,
              ],
          ],
        ]);
      },
    );
  }
}

// ───────────────────────── UBAH SATU SESI ─────────────────────────

class UbahKurScreen extends StatefulWidget {
  const UbahKurScreen({super.key, required this.idMapel, required this.x});
  final String idMapel;
  final Map<String, dynamic> x;

  @override
  State<UbahKurScreen> createState() => _UbahKurScreenState();
}

class _UbahKurScreenState extends State<UbahKurScreen> {
  late final _topik = TextEditingController(text: teks(widget.x['topik']));
  late final _hal = TextEditingController(text: teks(widget.x['halaman']));
  late final _tp = TextEditingController(text: teks(widget.x['tp']));
  late final _narasi = TextEditingController(text: teks(widget.x['narasi']));
  late final _tanya = TextEditingController(text: teks(widget.x['tanya']));
  late final _bacaan = TextEditingController(text: teks(widget.x['bacaan']));

  Future<void> _simpan() async {
    final x = widget.x;
    final r = await jalankan(
        context,
        () => Api.instance('waStafKurikulumUbah', [
              _t,
              widget.idMapel,
              x['smt'],
              x['minggu'],
              {'topik': _topik.text, 'halaman': _hal.text, 'tp': _tp.text, 'narasi': _narasi.text, 'tanya': _tanya.text, 'bacaan': _bacaan.text}
            ]),
        teksProses: 'Menyimpan...');
    if (r.ok && mounted) {
      kabar(context, 'Rencana sesi disimpan.');
      Navigator.pop(context, true);
    }
  }

  /// Pemilih TP resmi (kfPasangPemilih_ di web).
  Future<void> _pilihTp() async {
    final r = await jalankan(context, () => Api.instance('waStafKerangka', [_t, widget.idMapel]), teksProses: 'Memuat TP resmi...');
    if (!r.ok || !mounted) return;
    final d = peta(r.data);
    if (d['ada'] != true) {
      return kabar(context, 'Admin belum menyetujui kerangka CP · TP · ATP untuk mapel ini. Tujuan pembelajaran masih diketik sendiri.');
    }
    final kf = peta(d['kerangka']);
    final tp = daftar(kf['tp']).map(peta).toList();
    String label(Map<String, dynamic> x) => '${RegExp(r'^\d').hasMatch(teks(x['nomor'])) ? 'TP ' : ''}${teks(x['nomor'])}';
    final teksLama = _tp.text.split('\n').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
    final pilih = <String, bool>{for (final x in tp) label(x): teksLama.any((l) => l.startsWith('${label(x)}:'))};
    var semua = false;
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (c) => StatefulBuilder(
        builder: (c, setL) {
          final tampil = tp.where((x) => semua || x['untukKelas'] == true).toList();
          return SafeArea(
            child: SizedBox(
              height: MediaQuery.of(c).size.height * 0.8,
              child: Column(children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: Text('Centang TP yang dicakup sesi ini (disarankan 1 sampai 3). Baris TP diganti sesuai centangan; tujuan yang Anda ketik sendiri tetap dipertahankan.'),
                ),
                Expanded(
                  child: tampil.isEmpty
                      ? const Center(child: Text('Tidak ada TP untuk kelas ini.'))
                      : ListView(children: [
                          for (final x in tampil)
                            CheckboxListTile(
                              value: pilih[label(x)] ?? false,
                              onChanged: (v) => setL(() => pilih[label(x)] = v == true),
                              title: Text('${label(x)}: ${teks(x['teks'])}', style: TextStyle(color: x['untukKelas'] == true ? null : Colors.grey)),
                              subtitle: Text([
                                teks(x['elemen']),
                                if (teks(x['smt']).isNotEmpty) 'smt ${teks(x['smt'])}',
                                if (x['untukKelas'] != true) 'kelas ${teks(x['kelas'])}',
                              ].where((e) => e.isNotEmpty).join(' · ')),
                            ),
                        ]),
                ),
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(children: [
                    TextButton(onPressed: () => setL(() => semua = !semua), child: Text(semua ? 'Hanya TP kelas ini' : 'Tampilkan TP kelas lain')),
                    const Spacer(),
                    FilledButton(
                      onPressed: () {
                        if (pilih.values.where((v) => v).length > 6) {
                          kabar(c, 'Pilih paling banyak 6 TP.');
                          return;
                        }
                        Navigator.pop(c, true);
                      },
                      child: const Text('Terapkan'),
                    ),
                  ]),
                ),
              ]),
            ),
          );
        },
      ),
    );
    if (ok != true) return;
    final tahu = tp.map((x) => '${label(x)}:').toList();
    final tertinggal = teksLama.where((l) => !tahu.any((a) => l.startsWith(a))).toList();
    final baru = [
      for (final x in tp)
        if (pilih[label(x)] == true) '${label(x)}: ${teks(x['teks'])}'
    ];
    setState(() => _tp.text = [...baru, ...tertinggal].join('\n'));
  }

  @override
  Widget build(BuildContext context) {
    final x = widget.x;
    Widget isian(String label, TextEditingController c, {int baris = 1, int? maks}) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: TextField(controller: c, minLines: baris, maxLines: baris == 1 ? 1 : baris + 6, maxLength: maks, decoration: InputDecoration(labelText: label, alignLabelWithHint: true)),
        );
    return Scaffold(
      appBar: AppBar(title: Text('Ubah ${_namaSesi(x)} (Semester ${angka(x['smt'])})')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
        Text('Perubahan hanya berlaku pada rencana ini. Draft Materi/Diskusi yang sudah dibuat tidak berubah; ubah juga di tab Konten bila perlu.',
            style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant)),
        const SizedBox(height: 12),
        isian('Judul sesi', _topik, maks: 160),
        isian('Halaman buku (mis. 12-25)', _hal, maks: 40),
        isian('Tujuan pembelajaran (satu per baris)', _tp, baris: 3),
        Align(
          alignment: Alignment.centerLeft,
          child: Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: OutlinedButton.icon(onPressed: _pilihTp, icon: const Icon(Icons.push_pin_rounded, size: 18), label: const Text('Pilih dari TP resmi')),
          ),
        ),
        isian('Narasi pengantar', _narasi, baris: 3, maks: 700),
        isian('Pertanyaan diskusi', _tanya, baris: 3, maks: 1500),
        isian('Bacaan lengkap (dibaca siswa)', _bacaan, baris: 12),
        FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: _simpan, child: const Text('Simpan')),
      ]),
    );
  }
}

// ───────────────────────── SUSUN DENGAN AI ─────────────────────────

class SusunKurScreen extends StatefulWidget {
  const SusunKurScreen({super.key, required this.idMapel, required this.judul, required this.mode, required this.d});
  final String idMapel;
  final String judul;
  final String mode; // penuh | bacaan | soal
  final Map<String, dynamic> d;

  @override
  State<SusunKurScreen> createState() => _SusunKurScreenState();
}

/// PDF buku yang sudah diunggah, dipakai ulang per mapel selama aplikasi terbuka (S.kurRef di web).
class _RefKur {
  String idMapel = '';
  List<Map<String, dynamic>> buku = [];
  Map<String, dynamic>? panduan;
  bool lengkap = false;
}

final _refKur = _RefKur();

void _bersihkanRefKur() {
  for (final r in [..._refKur.buku, if (_refKur.panduan != null) _refKur.panduan!]) {
    bersihkanRef(r);
  }
  _refKur
    ..idMapel = ''
    ..buku = []
    ..panduan = null
    ..lengkap = false;
}

class _SusunKurScreenState extends State<SusunKurScreen> {
  BerkasPdf? _buku;
  BerkasPdf? _pan;
  List<BerkasPdf>? _bagian;
  final _judulBuku = TextEditingController();
  final _catatan = TextEditingController();
  List<Langkah> _langkah = [];
  bool _jalan = false;
  bool _mulai = false;
  bool? _hasilGagal;
  bool _kuotaHabis = false;
  DateTime? _tMulai;
  Timer? _jam;

  Map<String, dynamic> get d => widget.d;
  bool get _penuh => widget.mode == 'penuh';
  bool get _soalSaja => widget.mode == 'soal';
  bool get _pakaiRef => !_penuh && !_soalSaja && _refKur.idMapel == widget.idMapel && _refKur.lengkap && _refKur.buku.isNotEmpty;
  List<Map<String, dynamic>> get _rows => daftar(d['rows']).map(peta).toList();

  // ukuran kerja per panggilan AI; dikecilkan bila waktu habis (sama dengan web)
  late int _ukPeta = angka(d['perPeta'], 8), _ukBaca = angka(d['perBacaan'], 4), _ukSoal = angka(d['perSoal'], 8);
  final _sudahSmt = {1: 0, 2: 0};

  @override
  void dispose() {
    _jam?.cancel();
    super.dispose();
  }

  void _atur(Langkah l, String st, [String? ket]) {
    if (!mounted) return;
    setState(() {
      l.status = st;
      if (ket != null) l.ket = ket;
      if (st == 'ok') l.frak = 1;
    });
  }

  Future<void> Function(String, int) _tunggu(Langkah l) => (alasan, detik) async {
        final asal = l.ket;
        for (var s = detik; s > 0; s--) {
          if (!mounted) return;
          setState(() => l.ket = '$alasan. Mencoba lagi otomatis dalam $s dtk...');
          await Future.delayed(const Duration(seconds: 1));
        }
        if (mounted) setState(() => l.ket = asal);
      };

  Future<void> _unggahBuku(Langkah l) async {
    final f = _buku!;
    if (_bagian == null) {
      if (f.ukuran <= angka(d['bagianMB'], 40) * 1048576) {
        _bagian = [f];
      } else {
        final hasil = await pecahPdf(f, angka(d['bagianMB'], 40) * 1048576, angka(d['bagianHalaman'], 500), (t, fr) {
          if (mounted) setState(() => l..frak = 0.3 * fr..ket = t);
        });
        if (hasil.length > 8) throw GalatAi('Buku terlalu besar (menjadi ${hasil.length} bagian, maksimal 8). Gunakan PDF yang lebih ringkas.');
        _bagian = hasil;
      }
    }
    final bag = _bagian!;
    final n = bag.length;
    final awal = n > 1 ? 0.3 : 0.0;
    while (_refKur.buku.length < n) {
      final i = _refKur.buku.length;
      final b = bag[i];
      final judul = n > 1 ? 'Bagian ${i + 1} dari $n · ' : '';
      _atur(l, 'jalan', '${judul}menyiapkan unggahan...');
      final ref = await unggahPdf(b, () => Api.instance('waStafAiMulaiUnggah', [_t, widget.idMapel, b.nama, b.ukuran, 'application/pdf']), onProg: (p) {
        if (mounted) setState(() => l..frak = awal + (1 - awal) * (i + p / 100) / n..ket = '${judul}mengunggah $p%');
      });
      _refKur.buku.add(ref);
    }
    _refKur.lengkap = true;
    _atur(l, 'ok', '${f.nama}${n > 1 ? ' · dipecah menjadi $n bagian' : ''}');
  }

  Future<void> _peta(Langkah l, int smt) async {
    final target = angka(d['jumlahMinggu']);
    while (_sudahSmt[smt]! < target) {
      final dari = _sudahSmt[smt]! + 1;
      final sampai = (_sudahSmt[smt]! + _ukPeta).clamp(1, target);
      _atur(l, 'jalan', 'Sesi $dari–$sampai dari $target...');
      final r = peta(await panggilAi(
        'waStafKurikulumPeta',
        () => [
          _t,
          widget.idMapel,
          {'buku': _refKur.buku, 'panduan': _refKur.panduan},
          {'smt': smt, 'judulBuku': _judulBuku.text.trim(), 'catatan': _catatan.text, 'dari': _sudahSmt[smt]! + 1, 'sampai': (_sudahSmt[smt]! + _ukPeta).clamp(1, target)}
        ],
        tunggu: _tunggu(l),
        kecilkan: () {
          if (_ukPeta > 2) {
            _ukPeta = (_ukPeta / 2).floor().clamp(2, 99);
            return 'Waktu habis; mencoba lagi dengan $_ukPeta sesi per panggilan';
          }
          return '';
        },
      ));
      final sudah = r['sudah'] != null ? angka(r['sudah']) : dari - 1 + angka(r['jumlah']);
      if (sudah <= _sudahSmt[smt]!) throw GalatAi('AI tidak menghasilkan sesi baru. Coba lagi.');
      _sudahSmt[smt] = sudah;
      if (mounted) setState(() => l.frak = (sudah / target).clamp(0, 0.99));
      if (sudah < target) _atur(l, 'jalan', '$sudah dari $target sesi tersusun...');
    }
    _atur(l, 'ok', '${_sudahSmt[smt]} sesi');
  }

  Future<void> _bacaan(Langkah l) async {
    var terisi = 0;
    while (true) {
      final r = peta(await panggilAi(
        'waStafKurikulumBacaan',
        () => [_t, widget.idMapel, _refKur.buku, _ukBaca],
        tunggu: _tunggu(l),
        kecilkan: () {
          if (_ukBaca > 1) {
            _ukBaca = (_ukBaca / 2).floor().clamp(1, 99);
            return 'Waktu habis; mencoba lagi dengan $_ukBaca sesi per panggilan';
          }
          return '';
        },
      ));
      terisi += angka(r['terisi']);
      if (angka(r['sisa']) > 0) {
        final total = terisi + angka(r['sisa']);
        if (mounted) setState(() => l.frak = terisi / total);
        _atur(l, 'jalan', '$terisi dari $total sesi selesai...');
        continue;
      }
      _atur(l, 'ok', terisi > 0 ? '$terisi sesi ditulis' : 'Semua sesi sudah punya bacaan');
      return;
    }
  }

  Future<void> _soal(Langkah l) async {
    var terisi = 0;
    while (true) {
      final r = peta(await panggilAi(
        'waStafKurikulumSoal',
        () => [_t, widget.idMapel, _ukSoal],
        tunggu: _tunggu(l),
        kecilkan: () {
          if (_ukSoal > 1) {
            _ukSoal = (_ukSoal / 2).floor().clamp(1, 99);
            return 'Waktu habis; mencoba lagi dengan $_ukSoal sesi per panggilan';
          }
          return '';
        },
      ));
      terisi += angka(r['terisi']);
      if (angka(r['sisa']) > 0) {
        final total = terisi + angka(r['sisa']);
        if (mounted) setState(() => l.frak = terisi / total);
        _atur(l, 'jalan', '$terisi dari $total sesi selesai...');
        continue;
      }
      _atur(l, 'ok', terisi > 0 ? '$terisi sesi disusun' : 'Semua sesi sudah punya bank soal');
      return;
    }
  }

  Future<void> _mulaiProses() async {
    if (!_pakaiRef && !_soalSaja) {
      if (_buku == null) return kabar(context, 'Pilih PDF Buku Siswa dulu.', galat: true);
      if (_buku!.ukuran > angka(d['maksTotalMB'], 200) * 1048576) return kabar(context, 'Buku Siswa melebihi ${angka(d['maksTotalMB'], 200)} MB.', galat: true);
    }
    if (_pan != null && _pan!.ukuran > angka(d['maksMB'], 50) * 1048576) return kabar(context, 'Panduan melebihi ${angka(d['maksMB'], 50)} MB.', galat: true);
    if (!_pakaiRef && !_soalSaja) {
      _bersihkanRefKur();
      _refKur.idMapel = widget.idMapel;
    }
    final l = <Langkah>[];
    if (!_pakaiRef && !_soalSaja) l.add(Langkah('Menyiapkan & mengunggah Buku Siswa', ket: _buku!.nama, bobot: 15, run: _unggahBuku));
    if (_pan != null) {
      final p = _pan!;
      l.add(Langkah('Mengunggah Panduan', ket: p.nama, bobot: 5, run: (x) async {
        _refKur.panduan = await unggahPdf(p, () => Api.instance('waStafAiMulaiUnggah', [_t, widget.idMapel, p.nama, p.ukuran, 'application/pdf']), onProg: (pr) {
          if (mounted) setState(() => x..frak = pr / 100..ket = 'Mengunggah $pr%');
        });
        _atur(x, 'ok', p.nama);
      }));
    }
    if (_penuh) {
      for (final smt in [1, 2]) {
        l.add(Langkah('Menyusun rencana Semester $smt', bobot: 20, run: (x) => _peta(x, smt)));
      }
    }
    if (!_soalSaja) l.add(Langkah('Menulis bacaan dan bank soal tiap sesi', bobot: _penuh ? 40 : 60, run: _bacaan));
    l.add(Langkah('Menyusun bank soal ujian', bobot: _soalSaja ? 100 : 6, run: _soal));
    setState(() {
      _langkah = l;
      _mulai = true;
    });
    await _jalankan(l);
  }

  Future<void> _jalankan(List<Langkah> daftarL) async {
    setState(() {
      _jalan = true;
      _hasilGagal = null;
      _kuotaHabis = false;
    });
    _tMulai ??= DateTime.now();
    _jam ??= Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
    var gagal = false;
    for (final l in daftarL) {
      if (l.status == 'ok') continue;
      _atur(l, 'jalan', 'Sedang diproses...');
      try {
        await l.run!(l);
        if (l.status != 'ok') _atur(l, 'ok');
      } catch (e) {
        gagal = true;
        if (e is GalatAi && e.kuotaHabis) _kuotaHabis = true;
        final pesan = e is GalatAi ? e.pesan : (e is ApiException ? bersihTanda(e.pesan) : '$e');
        _atur(l, 'gagal', pesan);
        break;
      }
    }
    _jam?.cancel();
    _jam = null;
    if (!gagal && !_soalSaja) _bersihkanRefKur();
    if (mounted) {
      setState(() {
        _jalan = false;
        _hasilGagal = gagal;
      });
    }
  }

  String _waktu() {
    if (_tMulai == null) return '';
    final dt = DateTime.now().difference(_tMulai!).inSeconds;
    return 'Total waktu ${dt ~/ 60}:${(dt % 60).toString().padLeft(2, '0')}${_jalan ? ' · jangan tutup layar ini' : ''}';
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final judulLayar = _penuh ? 'Susun Kurikulum dari PDF' : (_soalSaja ? 'Lengkapi Soal Ujian' : 'Lengkapi Bacaan dan Soal Sesi');
    return PopScope(
      canPop: !_jalan,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) kabar(context, 'Tunggu sampai proses selesai, atau biarkan layar ini terbuka.');
      },
      child: Scaffold(
        appBar: AppBar(title: Text(judulLayar)),
        body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
          Text(
            '${widget.judul}. ${_penuh ? 'AI membaca buku sekali, membagi isinya ke ${angka(d['jumlahMinggu'])} sesi per semester (Semester 1 dan 2), lalu menulis bacaan lengkap dan bank soal ujian tiap sesi. Rencana lama mapel ini akan diganti.' : (_soalSaja ? 'Menyusun bank soal ujian (${angka(d['soalPerSesi'], 10)} soal per sesi: mudah, sedang, sulit) dari bacaan yang sudah tersimpan. Tidak perlu mengunggah PDF.' : 'Menulis bacaan lengkap dan bank soal ujian untuk sesi yang masih kosong.')}',
            style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 14),
          if (!_mulai) ...[
            if (_soalSaja)
              const Text('Bahan soal adalah bacaan yang sudah tersimpan di rencana, jadi tidak ada berkas yang perlu diunggah.')
            else if (!_pakaiRef) ...[
              const Text('Buku Siswa (PDF)', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              _PilihPdf(berkas: _buku, onPilih: (f) => setState(() {
                    _buku = f;
                    _bagian = null;
                  })),
              Text(
                'Maksimal ${angka(d['maksTotalMB'], 200)} MB. Buku di atas ${angka(d['bagianMB'], 40)} MB dipecah otomatis menjadi beberapa bagian di HP ini (isi halaman tidak diubah). Pakai buku untuk SATU tahun ajaran (dua semester).',
                style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant),
              ),
            ] else
              const Text('PDF yang diunggah tadi masih bisa dipakai, jadi tidak perlu mengunggah ulang.'),
            if (_penuh) ...[
              const SizedBox(height: 14),
              const Text('Panduan Mata Pelajaran (PDF, opsional)', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              _PilihPdf(berkas: _pan, onPilih: (f) => setState(() => _pan = f)),
              Text('Bila ada, tujuan pembelajaran mengikuti Alur Tujuan Pembelajaran resmi di panduan.', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
              const SizedBox(height: 14),
              TextField(controller: _judulBuku, maxLength: 160, decoration: const InputDecoration(labelText: 'Judul buku (opsional, dicantumkan sebagai rujukan)', hintText: 'mis. Matematika untuk SD Kelas V')),
              TextField(
                controller: _catatan,
                maxLength: 500,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(labelText: 'Catatan untuk AI (opsional)', hintText: 'mis. Banyak contoh dari pertanian dan perdagangan; bahasa sederhana.'),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: _mulaiProses, child: Text(_penuh ? 'Mulai' : 'Lengkapi')),
          ] else ...[
            Card(child: Padding(padding: const EdgeInsets.all(14), child: DaftarLangkah(langkah: _langkah))),
            Text(_waktu(), style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
            if (_hasilGagal != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: _hasilGagal! ? cs.primaryContainer : Colors.green.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
                child: Text(_hasilGagal!
                    ? (_kuotaHabis
                        ? 'Kuota AI gratis sedang habis. Bagian yang sudah selesai tetap tersimpan. Pilihan: (1) lanjutkan sekarang lewat Gemini langsung tanpa kuota aplikasi (tombol di bawah), '
                            'atau (2) tunggu kuota pulih (umumnya sekitar pukul 14.00-15.00 WIB) lalu ketuk Lanjutkan selama layar ini belum ditutup.'
                            '${Sesi.instance.isAdmin ? ' Admin: model lain (mis. gemini-3.5-flash-lite) punya kuota terpisah; ganti di menu "Pengaturan AI".' : ''}'
                        : 'Proses terhenti. Bagian yang sudah selesai tetap tersimpan; Anda bisa melanjutkan tanpa mengunggah ulang PDF selama layar ini belum ditutup.')
                    : (_soalSaja
                        ? 'Selesai. Bank soal tersimpan. Langkah berikutnya: atur jadwal UTS/UAS di tab Jadwal Ujian.'
                        : 'Selesai. Periksa rencana, ubah bila perlu, lalu ketuk "Buat Draft semua" untuk membuat Materi dan Diskusi. Bank soal sudah tersimpan; atur jadwal UTS/UAS di tab Jadwal Ujian.')),
              ),
              const SizedBox(height: 12),
              if (_hasilGagal!) ...[
                FilledButton(
                  onPressed: () {
                    final sisa = _langkah.where((l) => l.status != 'ok').toList();
                    for (final l in sisa) {
                      l.status = 'tunggu';
                      l.ket = 'Menunggu';
                    }
                    _jalankan(sisa);
                  },
                  child: const Text('Lanjutkan'),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () async {
                    final nav = Navigator.of(context);
                    final r = await jalankan(context, () => Api.instance('waStafKurikulumBaca', [_t, widget.idMapel]));
                    if (!r.ok) return;
                    nav.pushReplacement(MaterialPageRoute(
                      builder: (_) => ManualKurScreen(idMapel: widget.idMapel, judul: widget.judul, d: peta(r.data), kuota: _kuotaHabis),
                    ));
                  },
                  child: const Text('Lewat Gemini langsung'),
                ),
                TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Tutup')),
              ] else
                FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Tinjau rencana')),
            ],
          ],
        ]),
      ),
    );
  }
}

class _PilihPdf extends StatelessWidget {
  const _PilihPdf({required this.berkas, required this.onPilih});
  final BerkasPdf? berkas;
  final void Function(BerkasPdf f) onPilih;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48), alignment: Alignment.centerLeft),
      onPressed: () async {
        try {
          final f = await pilihPdf();
          if (f.isNotEmpty) onPilih(f.first);
        } catch (e) {
          if (context.mounted) kabar(context, '$e', galat: true);
        }
      },
      icon: const Icon(Icons.picture_as_pdf_rounded),
      label: Text(berkas == null ? 'Pilih PDF' : '${berkas!.nama} (${berkas!.ukuranMb} MB)', overflow: TextOverflow.ellipsis),
    );
  }
}

// ───────────────────────── MODE MANUAL (Gemini langsung) ─────────────────────────

class ManualKurScreen extends StatefulWidget {
  const ManualKurScreen({super.key, required this.idMapel, required this.judul, required this.d, this.kuota = false});
  final String idMapel;
  final String judul;
  final Map<String, dynamic> d;
  final bool kuota;

  @override
  State<ManualKurScreen> createState() => _ManualKurScreenState();
}

class _ManualKurScreenState extends State<ManualKurScreen> {
  late Map<String, dynamic> d = widget.d;
  String _pilih = '';
  final _judulBuku = TextEditingController();
  final _catatan = TextEditingController();
  final _hasil = TextEditingController();
  bool _panduan = false;
  Map<String, dynamic>? _prompt;
  String _ketSalin = '';
  List<({String nama, String teks})> _berkas = [];
  Map<String, dynamic>? _ringkas;
  bool _sibuk = false;
  String? _galat;
  String _info = '';
  Timer? _oto;
  bool _lanjutOto = false;

  List<Map<String, dynamic>> get _rows => daftar(d['rows']).map(peta).toList();

  @override
  void initState() {
    super.initState();
    _isiPilihan(null);
    _hasil.addListener(() {
      if (_ringkas != null) setState(() => _ringkas = null);
      _oto?.cancel();
      _oto = Timer(const Duration(milliseconds: 900), () {
        if (_hasil.text.trim().length >= 200 && !_sibuk) _periksa(oto: true);
      });
    });
  }

  @override
  void dispose() {
    _oto?.cancel();
    super.dispose();
  }

  List<(String, String)> get _opsi {
    final adaS1 = _rows.any((x) => angka(x['smt']) == 1);
    final kb = _rows.where((x) => x['adaBacaan'] != true).length;
    final ks = _rows.where((x) => x['adaBacaan'] == true && x['adaSoal'] != true).length;
    return [
      ('peta0', 'Rencana Semester 1 dan 2 sekaligus'),
      ('peta1', 'Rencana Semester 1 saja'),
      if (adaS1) ('peta2', 'Rencana Semester 2 saja (melanjutkan Semester 1 yang tersimpan)'),
      if (_rows.isNotEmpty && kb > 0) ('bacaan', 'Bacaan lengkap + bank soal untuk sesi yang masih kosong ($kb sesi)'),
      if (_rows.isNotEmpty && ks > 0) ('soal', 'Bank soal untuk sesi yang sudah punya bacaan ($ks sesi, tanpa PDF)'),
    ];
  }

  void _isiPilihan(String? pilih) {
    final kb = _rows.where((x) => x['adaBacaan'] != true).length;
    final ks = _rows.where((x) => x['adaBacaan'] == true && x['adaSoal'] != true).length;
    final awal = pilih ?? (_rows.isNotEmpty && kb > 0 ? 'bacaan' : (_rows.isNotEmpty && ks > 0 ? 'soal' : 'peta0'));
    _pilih = _opsi.any((o) => o.$1 == awal) ? awal : 'peta0';
  }

  String get _infoPilihan => _pilih == 'bacaan'
      ? 'Prompt memuat paling banyak ${angka(d['perBacaanManual'], 5)} sesi sekali jalan agar jawaban Gemini tidak terpotong. Tiap sesi dibuat bacaan lengkap dan ${angka(d['soalPerSesi'], 10)} soal ujian. Ulangi sampai semua sesi terisi.'
      : _pilih == 'soal'
          ? 'Bacaan sesi disertakan di dalam prompt, jadi PDF tidak perlu dilampirkan. Paling banyak ${angka(d['perSoalManual'], 6)} sesi sekali jalan; ulangi sampai semua sesi punya bank soal.'
          : _pilih == 'peta0'
              ? 'Satu prompt untuk dua semester. Bila jawaban Gemini terpotong, buat prompt Semester 1 dan Semester 2 secara terpisah.'
              : 'Mengganti rencana semester ini dengan hasil dari Gemini.';

  Future<void> _buatPrompt({bool salinOto = false}) async {
    setState(() {
      _sibuk = true;
      _galat = null;
    });
    final v = _pilih;
    final opsi = <String, dynamic>{'judulBuku': _judulBuku.text, 'catatan': _catatan.text, 'panduan': _panduan && v != 'bacaan' && v != 'soal'};
    if (v == 'bacaan' || v == 'soal') {
      opsi['jenis'] = v;
    } else {
      opsi['jenis'] = 'peta';
      opsi['smt'] = int.parse(v.replaceFirst('peta', ''));
    }
    try {
      final r = peta(await Api.instance('waStafKurikulumPromptManual', [_t, widget.idMapel, opsi]));
      if (!mounted) return;
      setState(() {
        _prompt = r;
        _prompt!['panduanDipakai'] = opsi['panduan'];
        _ketSalin = '${angka(r['panjang'])} karakter';
        _ringkas = null;
      });
      if (salinOto) {
        await Clipboard.setData(ClipboardData(text: teks(r['prompt'])));
        if (mounted) setState(() => _ketSalin = 'Prompt berikutnya sudah otomatis tersalin. Tinggal tempel di Gemini.');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = bersihTanda(e.pesan));
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  List<String> get _semuaTeks => [..._berkas.map((b) => b.teks), if (_hasil.text.trim().isNotEmpty) _hasil.text];

  Future<void> _periksa({bool oto = false}) async {
    final t = _semuaTeks;
    if (t.isEmpty) return kabar(context, 'Tempel hasil dari Gemini atau pilih berkas dulu.', galat: true);
    setState(() {
      _sibuk = true;
      _galat = null;
      _ringkas = null;
    });
    try {
      final r = peta(await Api.instance('waStafKurikulumImporManual', [_t, widget.idMapel, t, {'simpan': false, 'judulBuku': _judulBuku.text}], const Duration(minutes: 4)));
      if (!mounted) return;
      setState(() => _ringkas = r);
      if (oto && _bisa(r) && !_ganti(r)) {
        _lanjutOto = true;
        await _simpan();
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = bersihTanda(e.pesan));
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  bool _ganti(Map<String, dynamic> r) => [1, 2].any((s) => angka(peta(peta(r['semester'])['$s'])['akanGanti']) > 0);
  bool _bisa(Map<String, dynamic> r) =>
      [1, 2].any((s) => peta(r['semester'])['$s'] != null) || angka(r['bacaanTerisi']) > 0 || angka(r['soalTerisi']) > 0;

  Future<void> _simpan() async {
    final t = _semuaTeks;
    if (t.isEmpty || _ringkas == null) return;
    setState(() {
      _sibuk = true;
      _galat = null;
    });
    try {
      final r = peta(await Api.instance('waStafKurikulumImporManual', [_t, widget.idMapel, t, {'simpan': true, 'judulBuku': _judulBuku.text}], const Duration(minutes: 4)));
      if (!mounted) return;
      _hasil.clear();
      setState(() {
        _ringkas = r;
        _berkas = [];
      });
      kabar(context, 'Rencana disimpan.');
      final baru = peta(await Api.instance('waStafKurikulumBaca', [_t, widget.idMapel]));
      if (!mounted) return;
      d = baru;
      final sisa = _rows.where((x) => x['adaBacaan'] != true).length;
      final sisaSoal = _rows.where((x) => x['adaBacaan'] == true && x['adaSoal'] != true).length;
      setState(() {
        _isiPilihan(sisa > 0 ? 'bacaan' : (sisaSoal > 0 ? 'soal' : 'peta0'));
        _info = sisa > 0
            ? 'Masih ada $sisa sesi tanpa bacaan. Pilih "Bacaan lengkap + bank soal" di langkah 1 lalu buat prompt berikutnya, atau ketuk Tutup lalu "Buat Draft semua".'
            : (sisaSoal > 0
                ? 'Masih ada $sisaSoal sesi tanpa bank soal. Pilih "Bank soal" di langkah 1 untuk prompt berikutnya.'
                : 'Semua sesi sudah punya bacaan dan bank soal. Ketuk Tutup, lalu "Buat Draft semua" (Materi dan Diskusi), kemudian atur jadwal UTS/UAS di tab Jadwal Ujian.');
      });
      if (_lanjutOto) {
        _lanjutOto = false;
        if (sisa > 0 || sisaSoal > 0) await _buatPrompt(salinOto: true);
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = bersihTanda(e.pesan));
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  Widget _ringkasan(Map<String, dynamic> r) {
    final simpan = r['simpan'] == true;
    final w = <Widget>[Text(simpan ? '✅ Tersimpan' : 'Hasil pemeriksaan', style: const TextStyle(fontWeight: FontWeight.w800))];
    for (final smt in [1, 2]) {
      final s = peta(peta(r['semester'])['$smt']);
      if (s.isEmpty) continue;
      final ganti = angka(s['akanGanti']);
      w.add(Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Text('Semester $smt: ${angka(s['jumlah'])} dari ${angka(s['diharapkan'])} sesi'
            '${ganti > 0 ? (simpan ? ' · menggantikan $ganti sesi lama' : ' · akan MENGGANTIKAN $ganti sesi yang sudah ada (termasuk bacaannya)') : ' · baru'}'),
      ));
      w.add(ExpansionTile(
        tilePadding: EdgeInsets.zero,
        title: const Text('Lihat daftar topik', style: TextStyle(fontSize: 13)),
        children: [Align(alignment: Alignment.centerLeft, child: Text(daftar(s['topik']).join('\n')))],
      ));
    }
    if (angka(r['bacaanTerisi']) > 0) w.add(Text('Bacaan lengkap: ${angka(r['bacaanTerisi'])} sesi${simpan ? ' tersimpan.' : ' siap disimpan.'}'));
    if (angka(r['soalTerisi']) > 0) w.add(Text('Bank soal ujian: ${angka(r['soalTerisi'])} sesi${simpan ? ' tersimpan.' : ' siap disimpan.'}'));
    for (final p in daftar(r['peringatan'])) {
      w.add(Container(
        margin: const EdgeInsets.only(top: 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: Theme.of(context).colorScheme.primaryContainer, borderRadius: BorderRadius.circular(12)),
        child: Text('$p'),
      ));
    }
    if (!_bisa(r)) w.add(const Text('Tidak ada yang bisa disimpan dari teks ini.'));
    return Card(child: Padding(padding: const EdgeInsets.all(12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: w)));
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final p = _prompt;
    Widget judulLangkah(String t) => Padding(padding: const EdgeInsets.only(top: 18, bottom: 8), child: Text(t, style: TextStyle(fontWeight: FontWeight.w800, color: cs.primary)));
    return Scaffold(
      appBar: AppBar(title: const Text('Susun lewat Gemini langsung')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 40), children: [
        Text('${widget.judul}. Cara manual tanpa kuota AI aplikasi: Anda menyalin prompt ke Gemini, melampirkan PDF buku di sana, lalu menempelkan hasil JSON-nya ke sini.',
            style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
        if (widget.kuota)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: cs.primaryContainer, borderRadius: BorderRadius.circular(12)),
            child: const Text('Kuota AI gratis aplikasi sedang habis. Anda tidak perlu menunggu: ikuti 3 langkah di bawah, hasilnya langsung diproses di sini.'),
          ),
        judulLangkah('1 · Pilih yang ingin dibuat'),
        DropdownButtonFormField<String>(
          key: ValueKey('pilih|$_pilih|${_rows.length}'),
          initialValue: _pilih,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Yang ingin dibuat'),
          items: [for (final o in _opsi) DropdownMenuItem(value: o.$1, child: Text(o.$2, overflow: TextOverflow.ellipsis))],
          onChanged: (v) => setState(() => _pilih = v ?? 'peta0'),
        ),
        const SizedBox(height: 10),
        TextField(controller: _judulBuku, maxLength: 160, decoration: const InputDecoration(labelText: 'Judul buku (opsional)', hintText: 'mis. Matematika untuk SD Kelas V')),
        if (_pilih != 'bacaan' && _pilih != 'soal')
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _panduan,
            onChanged: (v) => setState(() => _panduan = v == true),
            title: const Text('Saya juga akan melampirkan Panduan Mata Pelajaran (PDF)'),
          ),
        TextField(controller: _catatan, maxLength: 500, minLines: 2, maxLines: 4, decoration: const InputDecoration(labelText: 'Catatan untuk AI (opsional)')),
        Text(_infoPilihan, style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
        const SizedBox(height: 10),
        FilledButton(onPressed: _sibuk ? null : () => _buatPrompt(), child: const Text('Buat prompt')),
        if (_galat != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_galat!, style: TextStyle(color: cs.error))),
        if (p != null) ...[
          judulLangkah('2 · Salin prompt, lalu kerjakan di Gemini'),
          Container(
            constraints: const BoxConstraints(maxHeight: 180),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: cs.surfaceContainerHigh, borderRadius: BorderRadius.circular(12)),
            child: SingleChildScrollView(child: SelectableText(teks(p['prompt']), style: const TextStyle(fontSize: 12, fontFamily: 'monospace'))),
          ),
          const SizedBox(height: 8),
          Row(children: [
            FilledButton.icon(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: teks(p['prompt'])));
                if (mounted) setState(() => _ketSalin = 'Prompt tersalin. Tempel di Gemini.');
              },
              icon: const Icon(Icons.copy_rounded, size: 18),
              label: const Text('Salin prompt'),
            ),
            const SizedBox(width: 8),
            Expanded(child: Text(_ketSalin, style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant))),
          ]),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Cara melakukannya di Gemini', style: TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                Row(children: [
                  const Expanded(child: Text('1. Buka Gemini dan masuk dengan akun Google. Mulai percakapan baru.')),
                  TextButton(onPressed: () => launchUrl(Uri.parse('https://gemini.google.com/app'), mode: LaunchMode.externalApplication), child: const Text('Buka')),
                ]),
                const Text('2. Bila ada pilihan model, pilih yang paling mampu (mis. Pro atau mode berpikir/Thinking).'),
                Text(teks(p['jenis']) == 'soal'
                    ? '3. Tidak ada file yang perlu dilampirkan: bacaan tiap sesi sudah ada di dalam prompt. Tempel prompt apa adanya.'
                    : '3. Ketuk ikon + (Unggah file) lalu lampirkan PDF Buku Siswa${p['panduanDipakai'] == true ? ' dan Panduan Mata Pelajaran' : ''}. Tunggu sampai file selesai diunggah.'
                        '${teks(p['jenis']) == 'bacaan' ? ' Lampirkan buku yang sama dengan yang dipakai untuk rencana.' : ''}'),
                const Text('4. Tempel prompt di kolom pesan lalu kirim. Tunggu sampai jawaban selesai; bisa memakan beberapa menit.'),
                const Text('5. Salin jawabannya (ikon salin di bawah jawaban, atau "Salin kode" pada blok JSON). Pastikan lengkap, dari tanda { sampai }.'),
                const Text('6. Kembali ke sini dan tempelkan di langkah 3. Bila jawaban Gemini berhenti di tengah, tetap tempelkan: sesi yang utuh akan dipakai.'),
                const SizedBox(height: 6),
                Text(
                  'Gemini di akun gratis juga bisa memiliki batas pemakaian sendiri. Bila Gemini menolak PDF karena terlalu besar, pecah PDF-nya lalu lampirkan semua bagiannya sekaligus.',
                  style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant),
                ),
              ]),
            ),
          ),
          if (teks(p['jenis']) == 'bacaan' || teks(p['jenis']) == 'soal')
            Text('Prompt ini memuat sesi ${daftar(p['sesi']).join(', ')}${angka(p['sisa']) > 0 ? '. Masih ada ${angka(p['sisa'])} sesi lagi setelah ini.' : '.'}',
                style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
          judulLangkah('3 · Tempel hasil dari Gemini'),
          TextField(
            controller: _hasil,
            minLines: 6,
            maxLines: 12,
            style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
            decoration: const InputDecoration(hintText: 'Tempel JSON jawaban Gemini di sini. Boleh beberapa hasil sekaligus (mis. Semester 1 lalu Semester 2).'),
          ),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
            OutlinedButton.icon(
              onPressed: _sibuk
                  ? null
                  : () async {
                      try {
                        final b = await pilihTeks();
                        if (b.isEmpty) return;
                        setState(() => _berkas = b);
                        await _periksa(oto: true);
                      } catch (e) {
                        if (context.mounted) kabar(context, '$e', galat: true);
                      }
                    },
              icon: const Icon(Icons.upload_file_rounded, size: 18),
              label: const Text('Pilih berkas hasil (.json/.txt)'),
            ),
            if (_berkas.isNotEmpty) Text('${_berkas.length} berkas: ${_berkas.map((b) => b.nama).join(', ')}', style: const TextStyle(fontSize: 12)),
            OutlinedButton(onPressed: _sibuk ? null : () => _periksa(), child: const Text('Periksa hasil')),
            if (_ringkas != null && _ringkas!['simpan'] != true && _bisa(_ringkas!))
              FilledButton(onPressed: _sibuk ? null : _simpan, child: Text(_ganti(_ringkas!) ? 'Ganti dan simpan' : 'Simpan ke rencana')),
          ]),
          if (_sibuk) const Padding(padding: EdgeInsets.only(top: 10), child: LinearProgressIndicator()),
          if (_ringkas != null) Padding(padding: const EdgeInsets.only(top: 10), child: _ringkasan(_ringkas!)),
          if (_info.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_info, style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant))),
        ],
        const SizedBox(height: 20),
        OutlinedButton(onPressed: () => Navigator.pop(context, true), child: const Text('Tutup')),
      ]),
    );
  }
}
