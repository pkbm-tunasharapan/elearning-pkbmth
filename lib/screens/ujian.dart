import 'package:flutter/material.dart';

import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

String? get _t => Sesi.instance.token;

String _iso(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
DateTime? _dariIso(String s) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(s);
  return m == null ? null : DateTime(int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
}

String _jam(TimeOfDay t) => '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

Color _warnaStatusUjian(BuildContext c, String s) => switch (s) {
      'Menunggu Tutor' || 'Menunggu Admin' => const Color(0xFFE9A23B),
      'Didisposisikan' => const Color(0xFF3B82F6),
      'Disetujui' || 'Diteruskan' => const Color(0xFF2F9E8F),
      'Akses Dibuka' || 'Terlaksana' => Colors.green,
      _ => s.startsWith('Ditolak') ? Theme.of(c).colorScheme.error : Theme.of(c).colorScheme.outline,
    };

/// Pilih tanggal (dalam rentang) lalu jam.
Future<(String, String)?> pilihWaktu(BuildContext context, {DateTime? mulai, DateTime? akhir, String judul = 'Pilih tanggal'}) async {
  final kini = DateTime.now();
  final awal = mulai != null && mulai.isAfter(kini) ? mulai : DateTime(kini.year, kini.month, kini.day);
  final batas = akhir ?? DateTime(kini.year + 2);
  if (batas.isBefore(awal)) return null;
  final t = await showDatePicker(context: context, initialDate: awal, firstDate: awal, lastDate: batas, helpText: judul);
  if (t == null || !context.mounted) return null;
  final j = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 8, minute: 0), helpText: 'Jam mulai');
  if (j == null) return null;
  return (_iso(t), _jam(j));
}

// ═════════════════════ JADWAL UTS / UAS PER MAPEL ═════════════════════

class JadwalUjianTab extends StatefulWidget {
  const JadwalUjianTab({super.key, required this.idMapel});
  final String idMapel;

  @override
  State<JadwalUjianTab> createState() => _JadwalUjianTabState();
}

class _JadwalUjianTabState extends State<JadwalUjianTab> with AutomaticKeepAliveClientMixin {
  int _versi = 0;

  @override
  bool get wantKeepAlive => true;

  Future<void> _tetapkan(Map<String, dynamic> k) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _FormJadwal(idMapel: widget.idMapel, kartu: k),
    );
    if (ok == true) setState(() => _versi++);
  }

  Future<void> _ajukanUbah(Map<String, dynamic> k) async {
    final alasan = TextEditingController();
    final w = await pilihWaktu(context, judul: 'Usulan tanggal baru');
    if (w == null || !mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Ajukan perubahan jadwal'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Usulan: ${w.$1} pukul ${w.$2}'),
          const SizedBox(height: 12),
          TextField(controller: alasan, maxLines: 3, decoration: const InputDecoration(labelText: 'Alasan (min. 15 karakter)')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Ajukan')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final r = await jalankan(
      context,
      () => Api.instance('waStafUjianPerubahanAjukan', [_t, widget.idMapel, {'smt': k['smt'], 'jenis': k['jenis'], 'tanggal': w.$1, 'jam': w.$2, 'alasan': alasan.text}]),
      teksProses: 'Mengirim permohonan...',
    );
    if (r.ok && mounted) {
      kabar(context, 'Permohonan perubahan dikirim ke admin.');
      setState(() => _versi++);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_versi),
      muat: () async => peta(await Api.instance('waStafUjianInfo', [_t, widget.idMapel])),
      bangun: (context, d, _) {
        final kartu = daftar(d['kartu']).map(peta).toList();
        return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
          for (final k in kartu) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    IkonBulat(Icons.event_note_rounded, warna: teks(k['jenis']) == 'UTS' ? const Color(0xFF3B82F6) : const Color(0xFFE0789B), ukuran: 42, sudut: 14),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(teks(k['judul']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5)),
                        Text('${teks(k['sesiNama'])} · ${teks(k['mulaiIso'])} s.d. ${teks(k['selesaiIso'])}', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
                      ]),
                    ),
                    if (k['jadwal'] != null) const Lencana('Terjadwal', warna: Colors.green) else Lencana('Belum', warna: cs.outline),
                  ]),
                  const SizedBox(height: 10),
                  _BarisBank(bank: peta(k['bank'])),
                  if (k['jadwal'] != null) ..._infoJadwal(context, k) else ...[
                    const SizedBox(height: 10),
                    Text(teks(k['cakupanTeks']), style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
                    const SizedBox(height: 10),
                    if (!Sesi.instance.hanyaLihat) Row(children: [
                      Expanded(child: FilledButton.icon(onPressed: () => _tetapkan(k), icon: const Icon(Icons.event_available_rounded), label: const Text('Tetapkan jadwal'))),
                    ]),
                  ],
                  const SizedBox(height: 6),
                  TextButton.icon(
                    onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => _PratinjauSoal(idMapel: widget.idMapel, smt: k['smt'], jenis: teks(k['jenis'])))),
                    icon: const Icon(Icons.visibility_rounded),
                    label: const Text('Pratinjau soal acak'),
                  ),
                ]),
              ),
            ),
          ],
          if (kartu.isEmpty) const Kosong(pesan: 'Belum ada data ujian.'),
        ]);
      },
    );
  }

  List<Widget> _infoJadwal(BuildContext context, Map<String, dynamic> k) {
    final cs = Theme.of(context).colorScheme;
    final j = peta(k['jadwal']);
    final rekap = peta(k['rekap']);
    final ring = peta(rekap['ringkas']);
    final ubah = k['perubahan'] == null ? null : peta(k['perubahan']);
    return [
      const SizedBox(height: 10),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: cs.primary.withValues(alpha: 0.07), borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(teks(j['teks']), style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text('${angka(j['durasi'])} menit · KKM ${teks(j['kkm'])} · ${angka(j['jumlah'])} soal · masuk sampai ${teks(j['masukSampai'])}', style: const TextStyle(fontSize: 12.5)),
          if (teks(j['catatan']).isNotEmpty) Text(teks(j['catatan']), style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
        ]),
      ),
      if (ring.isNotEmpty) ...[
        const SizedBox(height: 10),
        Wrap(spacing: 6, runSpacing: 6, children: [
          Lencana('Lulus ${angka(ring['lulus'])}', warna: Colors.green),
          Lencana('Remedial ${angka(ring['remedial'])}', warna: cs.error),
          Lencana('Mengerjakan ${angka(ring['berlangsung'])}', warna: const Color(0xFF3B82F6)),
          Lencana('Belum ${angka(ring['belum'])}', warna: cs.outline),
          if (angka(ring['tidakIkut']) > 0) Lencana('Tidak ikut ${angka(ring['tidakIkut'])}', warna: const Color(0xFFE9A23B)),
        ]),
        const SizedBox(height: 4),
        TextButton(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => _RekapUjian(judul: teks(k['judul']), rows: daftar(rekap['rows']).map(peta).toList(), kkm: teks(j['kkm'])))),
          child: const Text('Lihat hasil per siswa'),
        ),
      ],
      if (ubah != null)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text('Permohonan perubahan ke ${teks(ubah['usulanTanggal'])} ${teks(ubah['usulanJam'])}: ${teks(ubah['status'])}', style: const TextStyle(fontSize: 12.5, color: Color(0xFFE9A23B))),
        )
      else if (j['sudahMulai'] != true && !Sesi.instance.hanyaLihat)
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(onPressed: () => _ajukanUbah(k), icon: const Icon(Icons.edit_calendar_rounded), label: const Text('Ajukan perubahan jadwal')),
        ),
    ];
  }
}

class _BarisBank extends StatelessWidget {
  const _BarisBank({required this.bank});
  final Map<String, dynamic> bank;

  @override
  Widget build(BuildContext context) {
    final total = angka(bank['total']);
    final cs = Theme.of(context).colorScheme;
    final kurang = daftar(bank['tanpaBank']);
    return Row(children: [
      Icon(total > 0 ? Icons.inventory_2_rounded : Icons.inventory_2_outlined, size: 18, color: total > 0 ? Colors.green : cs.error),
      const SizedBox(width: 8),
      Expanded(
        child: Text(
          'Bank soal: $total soal dari ${angka(bank['sesiTerisi'])}/${angka(bank['jumlahSesi'])} sesi${kurang.isNotEmpty ? ' · belum ada: ${kurang.join(', ')}' : ''}',
          style: TextStyle(fontSize: 12.5, color: total > 0 ? null : cs.error),
        ),
      ),
    ]);
  }
}

class _FormJadwal extends StatefulWidget {
  const _FormJadwal({required this.idMapel, required this.kartu});
  final String idMapel;
  final Map<String, dynamic> kartu;

  @override
  State<_FormJadwal> createState() => _FormJadwalState();
}

class _FormJadwalState extends State<_FormJadwal> {
  late final Map<String, dynamic> _b = peta(widget.kartu['bawaan']);
  late final _durasi = TextEditingController(text: '${angka(_b['durasi'], 60)}');
  late final _kkm = TextEditingController(text: '${angka(_b['kkm'], 70)}');
  late final _jumlah = TextEditingController(text: '${angka(_b['jumlah'], 20)}');
  late final _mudah = TextEditingController(text: '${angka(_b['mudah'])}');
  late final _sedang = TextEditingController(text: '${angka(_b['sedang'])}');
  late final _sulit = TextEditingController(text: '${angka(_b['sulit'])}');
  String? _tgl;
  String? _jamMulai;

  Widget _angka(TextEditingController c, String l) => Expanded(child: TextField(controller: c, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l, isDense: true)));

  Future<void> _simpan() async {
    if (_tgl == null || _jamMulai == null) {
      kabar(context, 'Pilih tanggal dan jam.', galat: true);
      return;
    }
    final k = widget.kartu;
    final r = await jalankan(
      context,
      () => Api.instance('waStafUjianSimpan', [
        _t,
        widget.idMapel,
        {
          'smt': k['smt'],
          'jenis': k['jenis'],
          'tanggal': _tgl,
          'jam': _jamMulai,
          'durasi': _durasi.text,
          'kkm': _kkm.text,
          'jumlah': _jumlah.text,
          'mudah': _mudah.text,
          'sedang': _sedang.text,
          'sulit': _sulit.text,
        }
      ]),
      teksProses: 'Menetapkan jadwal...',
    );
    if (!r.ok || !mounted) return;
    final h = peta(r.data);
    if (teks(h['peringatan']).isNotEmpty) {
      await showDialog<void>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('Jadwal ditetapkan'),
          content: Text('${teks(h['teks'])}\n\n⚠️ ${teks(h['peringatan'])}'),
          actions: [FilledButton(onPressed: () => Navigator.pop(c), child: const Text('Mengerti'))],
        ),
      );
    } else {
      kabar(context, 'Jadwal ditetapkan: ${teks(h['teks'])}');
    }
    if (mounted) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final k = widget.kartu;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Jadwal ${teks(k['judul'])}', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          Text('Harus pada ${teks(k['sesiNama'])} (${teks(k['mulaiIso'])} s.d. ${teks(k['selesaiIso'])}). Setelah ditetapkan, jadwal terkunci; perubahan lewat permohonan.',
              style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant)),
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: () async {
              final w = await pilihWaktu(context, mulai: _dariIso(teks(k['mulaiIso'])), akhir: _dariIso(teks(k['selesaiIso'])), judul: 'Tanggal ujian');
              if (w != null) {
                setState(() {
                  _tgl = w.$1;
                  _jamMulai = w.$2;
                });
              }
            },
            icon: const Icon(Icons.calendar_month_rounded),
            label: Text(_tgl == null ? 'Pilih tanggal & jam' : '$_tgl pukul $_jamMulai'),
          ),
          const SizedBox(height: 12),
          Row(children: [_angka(_durasi, 'Durasi (menit)'), const SizedBox(width: 8), _angka(_kkm, 'KKM'), const SizedBox(width: 8), _angka(_jumlah, 'Jumlah soal')]),
          const SizedBox(height: 10),
          Row(children: [_angka(_mudah, 'Mudah'), const SizedBox(width: 8), _angka(_sedang, 'Sedang'), const SizedBox(width: 8), _angka(_sulit, 'Sulit')]),
          const SizedBox(height: 16),
          FilledButton.icon(onPressed: _simpan, icon: const Icon(Icons.lock_clock_rounded), label: const Text('Tetapkan & kunci jadwal')),
        ]),
      ),
    );
  }
}

class _RekapUjian extends StatelessWidget {
  const _RekapUjian({required this.judul, required this.rows, required this.kkm});
  final String judul;
  final List<Map<String, dynamic>> rows;
  final String kkm;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    const label = {'lulus': 'Lulus', 'remedial': 'Remedial', 'berlangsung': 'Mengerjakan', 'belum': 'Belum', 'tidakIkut': 'Tidak ikut'};
    Color w(String s) => switch (s) { 'lulus' => Colors.green, 'remedial' => cs.error, 'berlangsung' => const Color(0xFF3B82F6), 'tidakIkut' => const Color(0xFFE9A23B), _ => cs.outline };
    return Scaffold(
      appBar: AppBar(title: Text(judul)),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('KKM $kkm', style: TextStyle(color: cs.onSurfaceVariant)),
        const SizedBox(height: 8),
        Card(
          child: Column(children: [
            for (final r in rows)
              ListTile(
                title: Text(teks(r['nama'])),
                subtitle: angka(r['ronde']) > 0 ? Text('${teks(r['jenis'])} · ronde ${angka(r['ronde'])}') : null,
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  if (r['persen'] != null) Text('${r['persen']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                  const SizedBox(width: 8),
                  Lencana(label[teks(r['state'])] ?? teks(r['state']), warna: w(teks(r['state']))),
                ]),
              ),
          ]),
        ),
      ]),
    );
  }
}

class _PratinjauSoal extends StatefulWidget {
  const _PratinjauSoal({required this.idMapel, required this.smt, required this.jenis});
  final String idMapel;
  final dynamic smt;
  final String jenis;

  @override
  State<_PratinjauSoal> createState() => _PratinjauSoalState();
}

class _PratinjauSoalState extends State<_PratinjauSoal> {
  int _putaran = 0;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pratinjau soal'),
        actions: [IconButton(tooltip: 'Acak ulang', onPressed: () => setState(() => _putaran++), icon: const Icon(Icons.shuffle_rounded))],
      ),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_putaran),
        muat: () async => peta(await Api.instance('waStafUjianPratinjau', [_t, widget.idMapel, widget.smt, widget.jenis, _putaran])),
        bangun: (context, d, _) {
          final soal = daftar(d['soal']).map(peta).toList();
          return ListView(padding: const EdgeInsets.all(16), children: [
            Text('${teks(d['judul'])} · ${angka(d['jumlah'])} soal per siswa · contoh susunan untuk satu siswa', style: TextStyle(color: cs.onSurfaceVariant)),
            const SizedBox(height: 8),
            if (soal.isEmpty) const Kosong(pesan: 'Bank soal masih kosong. Susun dulu lewat Kurikulum.', ikon: Icons.inventory_2_outlined),
            for (final s in soal)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Text('${angka(s['no'])}.', style: const TextStyle(fontWeight: FontWeight.w800)),
                      const SizedBox(width: 8),
                      Lencana(teks(s['tingkat'])),
                    ]),
                    const SizedBox(height: 6),
                    Text(teks(s['pertanyaan'])),
                    const SizedBox(height: 6),
                    for (final e in peta(s['opsi']).entries)
                      Text('${e.key}. ${e.value}', style: TextStyle(color: e.key == teks(s['kunci']) ? Colors.green : null, fontWeight: e.key == teks(s['kunci']) ? FontWeight.w700 : null)),
                  ]),
                ),
              ),
          ]);
        },
      ),
    );
  }
}

// ═════════════════════ KOTAK UJIAN (susulan, remedial, perubahan) ═════════════════════

class KotakUjianScreen extends StatefulWidget {
  const KotakUjianScreen({super.key});

  @override
  State<KotakUjianScreen> createState() => _KotakUjianScreenState();
}

class _KotakUjianScreenState extends State<KotakUjianScreen> {
  int _versi = 0;
  final Set<String> _pilih = {};
  final Map<String, String> _jenisAju = {};

  void _muatUlang() => setState(() {
        _versi++;
        _pilih.clear();
      });

  Future<String?> _mintaCatatan(String judul, {bool wajib = false}) async {
    final c = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(judul),
        content: TextField(controller: c, maxLines: 3, decoration: InputDecoration(labelText: wajib ? 'Alasan (wajib)' : 'Catatan (opsional)')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(d, true), child: const Text('Kirim')),
        ],
      ),
    );
    return ok == true ? c.text : null;
  }

  // v1.57.0: remedial disetujui langsung dengan membuka akses remedial (pilih waktu); susulan tetap diteruskan ke admin.
  Future<void> _prosesAju(String keputusan) async {
    final adaRemedial = _pilih.any((id) => _jenisAju[id] == 'Remedial');
    final adaSusulan = _pilih.any((id) => _jenisAju[id] != 'Remedial');
    Map<String, dynamic>? jadwal;
    if (keputusan == 'setuju' && adaRemedial) {
      final a = await pilihWaktu(context, judul: 'Akses remedial dibuka mulai');
      if (a == null || !mounted) return;
      final b = await pilihWaktu(context, mulai: _dariIso(a.$1), judul: 'Akses remedial ditutup pada');
      if (b == null || !mounted) return;
      jadwal = {'mulaiTanggal': a.$1, 'mulaiJam': a.$2, 'selesaiTanggal': b.$1, 'selesaiJam': b.$2};
    }
    final judul = keputusan == 'tolak' ? 'Tolak pengajuan' : (adaRemedial && adaSusulan ? 'Setujui (remedial dibuka, susulan diteruskan ke admin)' : (adaRemedial ? 'Setujui remedial' : 'Teruskan ke admin'));
    final cat = await _mintaCatatan(judul, wajib: keputusan == 'tolak');
    if (cat == null || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafAjuTutorProses', [_t, _pilih.toList(), keputusan, cat, jadwal]), teksProses: 'Memproses...');
    if (r.ok && mounted) {
      final dib = angka(peta(r.data)['remedialDibuka']);
      kabar(context, '${angka(peta(r.data)['diproses'])} pengajuan diproses${dib > 0 ? ' · $dib akses remedial dibuka' : ''}.');
      _muatUlang();
    }
  }

  Future<void> _aksiPerm(Map<String, dynamic> x, String aksi) async {
    final id = teks(x['id']);
    Future<dynamic> Function()? panggil;
    if (aksi == 'tolak') {
      final c = await _mintaCatatan('Tolak permohonan', wajib: true);
      if (c == null) return;
      panggil = () => Api.instance('waAdminUjianTolak', [_t, id, c]);
    } else if (aksi == 'disposisi') {
      if (!mounted) return;
      final tujuan = await showDialog<String>(
        context: context,
        builder: (d) => SimpleDialog(title: const Text('Disposisikan ke'), children: [
          for (final t in ['Kepala Sekolah', 'Koordinator Kurikulum']) SimpleDialogOption(onPressed: () => Navigator.pop(d, t), child: Text(t)),
        ]),
      );
      if (tujuan == null) return;
      final c = await _mintaCatatan('Catatan disposisi');
      if (c == null) return;
      panggil = () => Api.instance('waAdminUjianDisposisi', [_t, id, tujuan, c]);
    } else if (aksi == 'Setuju' || aksi == 'Tolak') {
      final c = await _mintaCatatan(aksi == 'Setuju' ? 'Setujui permohonan' : 'Tolak permohonan', wajib: aksi == 'Tolak');
      if (c == null) return;
      panggil = () => Api.instance('waPimpinanUjianPutusan', [_t, id, aksi, c]);
    } else if (aksi == 'buka') {
      Map<String, dynamic> dd;
      if (teks(x['jenis']) == 'Perubahan') {
        dd = {'tanggal': teks(x['usulanTanggal']), 'jam': teks(x['usulanJam'])};
      } else {
        if (!mounted) return;
        final a = await pilihWaktu(context, judul: 'Akses dibuka mulai');
        if (a == null || !mounted) return;
        final b = await pilihWaktu(context, mulai: _dariIso(a.$1), judul: 'Akses ditutup pada');
        if (b == null) return;
        dd = {'mulaiTanggal': a.$1, 'mulaiJam': a.$2, 'selesaiTanggal': b.$1, 'selesaiJam': b.$2};
      }
      panggil = () => Api.instance('waAdminUjianBukaAkses', [_t, id, dd]);
    }
    if (panggil == null || !mounted) return;
    final r = await jalankan(context, panggil, teksProses: 'Memproses...');
    if (!r.ok || !mounted) return;
    final p = teks(peta(r.data)['peringatan']);
    kabar(context, p.isNotEmpty ? p : 'Berhasil.');
    _muatUlang();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_versi),
      muat: () async => peta(await Api.instance('waStafUjianKotak', [_t])),
      bangun: (context, d, _) {
        final peran = teks(d['peran']);
        final aju = daftar(d['aju']).map(peta).toList();
        final ajuTunggu = aju.where((a) => teks(a['status']) == 'Menunggu Tutor').toList();
        final ajuLain = aju.where((a) => teks(a['status']) != 'Menunggu Tutor').toList();
        final perm = daftar(d['perm']).map(peta).toList();
        final h = peta(d['hitung']);
        final rem = daftar(d['remedial']).map(peta).toList();
        for (final a in [...aju, ...rem]) {
          _jenisAju[teks(a['id'])] = teks(a['jenis']);
        }
        return Scaffold(
          backgroundColor: Colors.transparent,
          bottomNavigationBar: _pilih.isEmpty
              ? null
              : SafeArea(
                  child: Container(
                    margin: const EdgeInsets.all(12),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                    decoration: BoxDecoration(color: cs.inverseSurface, borderRadius: BorderRadius.circular(18)),
                    child: Row(children: [
                      IconButton(onPressed: () => setState(_pilih.clear), icon: Icon(Icons.close_rounded, color: cs.onInverseSurface)),
                      Text('${_pilih.length} dipilih', style: TextStyle(color: cs.onInverseSurface, fontWeight: FontWeight.w700)),
                      const Spacer(),
                      TextButton(onPressed: () => _prosesAju('tolak'), child: const Text('Tolak')),
                      FilledButton(onPressed: () => _prosesAju('setuju'), child: Text(_pilih.every((id) => _jenisAju[id] == 'Remedial') ? 'Setujui' : 'Setujui / teruskan')),
                    ]),
                  ),
                ),
          body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 24), children: [
            Wrap(spacing: 8, runSpacing: 8, children: [
              if (peran == 'Tutor') Lencana('Menunggu Anda: ${angka(h['menungguTutor'])}', warna: const Color(0xFFE9A23B)),
              if (peran == 'Admin') Lencana('Menunggu admin: ${angka(h['menungguAdmin'])}', warna: const Color(0xFFE9A23B)),
              if (peran == 'Admin') Lencana('Siap dibuka: ${angka(h['siapDibuka'])}', warna: Colors.green),
              if (peran != 'Tutor' && peran != 'Admin') Lencana('Menunggu putusan: ${angka(h['menungguPutusan'])}', warna: const Color(0xFF3B82F6)),
            ]),
            if (peran == 'Tutor') ...[
              JudulBagian('Pengajuan siswa', sub: 'Susulan / remedial · ketuk untuk memilih'),
              if (ajuTunggu.isEmpty) const Kosong(pesan: 'Tidak ada pengajuan yang menunggu.', ikon: Icons.inbox_rounded),
              for (final a in ajuTunggu)
                Card(
                  child: CheckboxListTile(
                    value: _pilih.contains(teks(a['id'])),
                    onChanged: (v) => setState(() => v == true ? _pilih.add(teks(a['id'])) : _pilih.remove(teks(a['id']))),
                    title: Text('${teks(a['nama'])} · ${teks(a['jenis'])}'),
                    subtitle: Text('${teks(a['namaMapel'])} ${teks(a['namaRombel'])} · ${teks(a['judul'])}\n${teks(a['alasan'])}'
                        '${a['persen'] != null ? '\nNilai terbaik ${a['persen']} (KKM ${a['kkm'] ?? '-'})' : ''}'),
                    isThreeLine: true,
                  ),
                ),
            ],
            if (d['remedial'] != null) ...[
              JudulBagian('Remedial menunggu tutor', sub: 'Lewat 2 hari tanpa keputusan tutor: Anda dapat menyetujui atau menolak (${angka(h['remedialLewat'])})'),
              if (rem.isEmpty) const Kosong(pesan: 'Tidak ada remedial yang menunggu.', ikon: Icons.inbox_rounded),
              for (final a in rem)
                Card(
                  child: a['bolehPutus'] == true
                      ? CheckboxListTile(
                          value: _pilih.contains(teks(a['id'])),
                          onChanged: (v) => setState(() => v == true ? _pilih.add(teks(a['id'])) : _pilih.remove(teks(a['id']))),
                          title: Text('${teks(a['nama'])} · Remedial'),
                          subtitle: Text('${teks(a['namaMapel'])} ${teks(a['namaRombel'])} · ${teks(a['judul'])}\nMenunggu ${angka(a['jamMenunggu'])} jam'
                              '${a['persen'] != null ? ' · nilai ${a['persen']} (KKM ${a['kkm'] ?? '-'})' : ''}'),
                          isThreeLine: true,
                        )
                      : ListTile(
                          title: Text('${teks(a['nama'])} · Remedial'),
                          subtitle: Text('${teks(a['namaMapel'])} ${teks(a['namaRombel'])} · menunggu tutor ${angka(a['jamMenunggu'])} jam'),
                          trailing: const Lencana('Menunggu tutor', warna: Color(0xFFE9A23B)),
                        ),
                ),
            ],
            JudulBagian('Permohonan', sub: '${perm.length} permohonan'),
            if (perm.isEmpty) const Kosong(pesan: 'Belum ada permohonan.', ikon: Icons.assignment_outlined),
            for (final x in perm) _KartuPerm(x: x, peran: peran, aksi: (a) => _aksiPerm(x, a)),
            if (ajuLain.isNotEmpty) ...[
              JudulBagian('Riwayat pengajuan', sub: '${ajuLain.length}'),
              Card(
                child: Column(children: [
                  for (final a in ajuLain.take(50))
                    ListTile(
                      dense: true,
                      title: Text('${teks(a['nama'])} · ${teks(a['jenis'])} ${teks(a['judul'])}'),
                      subtitle: Text('${teks(a['namaMapel'])} · ${teks(a['waktu'])}'),
                      trailing: Lencana(teks(a['status']), warna: _warnaStatusUjian(context, teks(a['status']))),
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

class _KartuPerm extends StatelessWidget {
  const _KartuPerm({required this.x, required this.peran, required this.aksi});
  final Map<String, dynamic> x;
  final String peran;
  final void Function(String) aksi;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final status = teks(x['status']);
    final siswa = daftar(x['siswa']).map((s) => teks(peta(s)['nama'])).toList();
    final ubah = teks(x['jenis']) == 'Perubahan';
    final tombol = <Widget>[
      if (peran == 'Admin' && (status == 'Menunggu Admin' || status == 'Didisposisikan')) ...[
        OutlinedButton(onPressed: () => aksi('tolak'), child: const Text('Tolak')),
        FilledButton.tonal(onPressed: () => aksi('disposisi'), child: const Text('Disposisi')),
      ],
      if (peran == 'Admin' && status == 'Disetujui') FilledButton(onPressed: () => aksi('buka'), child: Text(ubah ? 'Terapkan jadwal baru' : 'Buka akses')),
      if (peran != 'Admin' && peran != 'Tutor' && status == 'Didisposisikan') ...[
        OutlinedButton(onPressed: () => aksi('Tolak'), child: const Text('Tolak')),
        FilledButton(onPressed: () => aksi('Setuju'), child: const Text('Setujui')),
      ],
    ];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            IkonBulat(ubah ? Icons.edit_calendar_rounded : Icons.assignment_late_rounded, warna: Gaya.warnaMenu(teks(x['jenis'])), ukuran: 38, sudut: 12),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${teks(x['jenis'])} · ${teks(x['judul'])}', style: const TextStyle(fontWeight: FontWeight.w800)),
                Text('${teks(x['namaMapel'])} ${teks(x['namaRombel'])} · ${teks(x['waktu'])}', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
              ]),
            ),
            Lencana(status, warna: _warnaStatusUjian(context, status)),
          ]),
          const SizedBox(height: 8),
          if (ubah) Text('Usulan: ${teks(x['usulanTanggal'])} ${teks(x['usulanJam'])}${x['jadwal'] != null ? ' (semula ${teks(peta(x['jadwal'])['teks'])})' : ''}'),
          if (siswa.isNotEmpty) Text('Siswa: ${siswa.join(', ')}'),
          if (teks(x['alasan']).isNotEmpty) Text('Alasan: ${teks(x['alasan'])}', style: TextStyle(color: cs.onSurfaceVariant)),
          Text('Diajukan oleh ${teks(x['diajukanOleh'])}${teks(x['tujuan']).isNotEmpty ? ' · ke ${teks(x['tujuan'])}' : ''}', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
          if (teks(x['putusan']).isNotEmpty) Text('${teks(x['putusan'])} oleh ${teks(x['pemutus'])}${teks(x['catatanPutusan']).isNotEmpty ? ': ${teks(x['catatanPutusan'])}' : ''}', style: const TextStyle(fontSize: 12)),
          if (teks(x['aksesMulai']).isNotEmpty) Text('Akses: ${teks(x['aksesMulai'])}${teks(x['aksesSelesai']).isNotEmpty ? ' s.d. ${teks(x['aksesSelesai'])}' : ''}', style: const TextStyle(fontSize: 12, color: Colors.green)),
          if (tombol.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(spacing: 8, runSpacing: 8, alignment: WrapAlignment.end, children: tombol),
          ],
        ]),
      ),
    );
  }
}
