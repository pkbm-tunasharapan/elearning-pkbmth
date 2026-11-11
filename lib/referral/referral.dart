import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../berkas.dart';
import '../theme.dart';
import '../keuangan/bayar_online.dart';
import '../widgets.dart';

String rpRef(dynamic n) {
  final v = (n is num ? n : num.tryParse('$n') ?? 0).round();
  final s = v.abs().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (m) => '.');
  return '${v < 0 ? '-' : ''}Rp$s';
}

Color warnaStatusRef(BuildContext c, String s) => switch (s) {
      'Selesai' => Colors.green,
      'Perlu Perbaikan' || 'Pembayaran Ditolak' => const Color(0xFFD08A1E),
      'Ditolak' => Theme.of(c).colorScheme.error,
      'Menunggu Pembayaran' => const Color(0xFF3B82F6),
      _ => Theme.of(c).colorScheme.outline,
    };

/// Tampilkan berkas (gambar atau PDF) dari server: {b64, mime, nama}.
Future<void> lihatBerkasRef(BuildContext context, Future<dynamic> Function() muat) async {
  final r = await jalankan(context, () async => peta(await muat()), teksProses: 'Mengambil berkas...');
  if (!r.ok || !context.mounted) return;
  final d = r.data!;
  if (teks(d['mime']) == 'application/pdf') {
    await bukaPdfB64(context, teks(d['b64']), teks(d['nama'], 'berkas.pdf'));
  } else {
    await lihatFoto(context, () async => d);
  }
}

/// Referral pendaftaran untuk promotor (siswa & staf, kecuali Dinas Pendidikan).
class ReferralScreen extends StatefulWidget {
  const ReferralScreen({super.key, required this.token});
  final String token;

  @override
  State<ReferralScreen> createState() => _ReferralScreenState();
}

class _ReferralScreenState extends State<ReferralScreen> {
  int _v = 0;
  int _tab = 0;

  Future<void> _formulir(Map<String, dynamic> d, [Map<String, dynamic>? awal]) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => FormPendaftaranRef(token: widget.token, konteks: d, awal: awal)));
    if (ok == true && mounted) setState(() => _v++);
  }

  Future<void> _perbaiki(Map<String, dynamic> d, Map<String, dynamic> x) async {
    final r = await jalankan(context, () async => peta(await Api.instance('waRefDetail', [widget.token, teks(x['id'])])), teksProses: 'Memuat data...');
    if (r.ok && mounted) await _formulir(d, r.data);
  }

  Future<void> _bayar(Map<String, dynamic> d, Map<String, dynamic> x) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _LembarBayar(token: widget.token, x: x, aturan: peta(d['aturan'])),
    );
    if (ok == true && mounted) setState(() => _v++);
  }

  Future<void> _rekening(Map<String, dynamic>? rek) async {
    final ok = await showDialog<bool>(context: context, builder: (_) => _DialogRekening(token: widget.token, awal: rek));
    if (ok == true && mounted) setState(() => _v++);
  }

  Future<void> _tarik(Map<String, dynamic> d) async {
    final at = peta(d['aturan']);
    final saldo = angka(d['saldo']);
    if (d['rekening'] == null || peta(d['rekening'])['dariTutor'] == true) {
      kabar(context, 'Isi data rekening pembayaran Anda dulu.', galat: true);
      return _rekening(d['rekening'] == null ? null : peta(d['rekening']));
    }
    if (saldo < angka(at['minTarik'])) {
      kabar(context, 'Penarikan minimal ${rpRef(at['minTarik'])}. Saldo Anda ${rpRef(saldo)}.', galat: true);
      return;
    }
    final t = await mintaTeks(context, 'Tarik saldo (maks ${rpRef(saldo)})', label: 'Jumlah (Rp), minimal ${rpRef(at['minTarik'])}', awal: '$saldo');
    if (t == null || !mounted) return;
    final j = int.tryParse(t.replaceAll(RegExp(r'[^\d]'), '')) ?? 0;
    final r = await jalankan(context, () => Api.instance('waRefTarik', [widget.token, j]), teksProses: 'Mengajukan penarikan...');
    if (r.ok && mounted) {
      kabar(context, 'Pengajuan penarikan terkirim. Bendahara akan memproses dan memberi tahu Anda.');
      setState(() => _v++);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waRefKonteks', [widget.token], const Duration(seconds: 90))),
      bangun: (context, d, segarkan) {
        final at = peta(d['aturan']);
        final rek = d['rekening'] == null ? null : peta(d['rekening']);
        final daftarRef = daftar(d['daftar']).map(peta).toList();
        final riwayat = daftar(d['riwayat']).map(peta).toList();
        final tarik = daftar(d['tarik']).map(peta).toList();
        return Stack(children: [
          ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 100), children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(gradient: Gaya.gradasi, borderRadius: BorderRadius.circular(Gaya.radius)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Saldo referral', style: TextStyle(color: Colors.white70)),
                Text(rpRef(d['saldo']), style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
                const SizedBox(height: 4),
                Text('Cashback ${rpRef(at['cashback'])} untuk setiap peserta baru yang terverifikasi. Tarik minimal ${rpRef(at['minTarik'])}.',
                    style: const TextStyle(color: Colors.white, fontSize: 12.5)),
                const SizedBox(height: 10),
                Wrap(spacing: 8, runSpacing: 6, children: [
                  FilledButton.tonalIcon(onPressed: () => _tarik(d), icon: const Icon(Icons.account_balance_wallet_rounded, size: 18), label: const Text('Tarik saldo')),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white70)),
                    onPressed: () => _rekening(rek),
                    icon: const Icon(Icons.credit_card_rounded, size: 18),
                    label: Text(rek == null ? 'Isi rekening' : 'Rekening'),
                  ),
                ]),
              ]),
            ),
            if (rek != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Rekening: ${teks(rek['metode'])} · ${teks(rek['bank'])} · ${teks(rek['nomor'])} a.n. ${teks(rek['atasNama'])}${rek['dariTutor'] == true ? ' (dari data tutor, ketuk Rekening untuk menyimpan)' : ''}',
                    style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
              ),
            const SizedBox(height: 12),
            SegmentedButton<int>(
              segments: [
                ButtonSegment(value: 0, label: Text('Pendaftaran (${daftarRef.length})')),
                ButtonSegment(value: 1, label: Text('Riwayat saldo (${riwayat.length + tarik.length})')),
              ],
              selected: {_tab},
              onSelectionChanged: (s) => setState(() => _tab = s.first),
            ),
            const SizedBox(height: 8),
            if (_tab == 0) ...[
              if (daftarRef.isEmpty) const Kosong(pesan: 'Belum ada peserta yang Anda daftarkan. Ketuk "Daftarkan peserta".', ikon: Icons.person_add_alt_1_rounded),
              for (final x in daftarRef)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(4, 4, 8, 8),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      ListTile(
                        title: Text(teks(x['nama']), style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: Text('${teks(x['id'])} · ${teks(x['program'])} · ${teks(x['waktu'])}'
                            '${teks(x['catatanBerkas']).isNotEmpty ? '\nCatatan berkas: ${teks(x['catatanBerkas'])}' : ''}'
                            '${teks(x['catatanBayar']).isNotEmpty && teks(x['statusBayar']) == 'Ditolak' ? '\nCatatan bayar: ${teks(x['catatanBayar'])}' : ''}'),
                        trailing: Lencana(teks(x['status']), warna: warnaStatusRef(context, teks(x['status']))),
                      ),
                      Wrap(spacing: 8, runSpacing: 6, children: [
                        const SizedBox(width: 8),
                        if (x['bisaBayar'] == true)
                          FilledButton.icon(onPressed: () => _bayar(d, x), icon: const Icon(Icons.payments_rounded, size: 18), label: const Text('Bayar pendaftaran')),
                        if (x['bisaPerbaiki'] == true)
                          OutlinedButton.icon(onPressed: () => _perbaiki(d, x), icon: const Icon(Icons.edit_rounded, size: 18), label: const Text('Ubah data')),
                        if (teks(x['status']) == 'Selesai') Text('Cashback ${rpRef(x['cashback'])} diterima', style: const TextStyle(color: Colors.green, fontWeight: FontWeight.w700)),
                      ]),
                    ]),
                  ),
                ),
            ] else ...[
              if (tarik.isNotEmpty) const JudulBagian('Penarikan'),
              for (final t in tarik)
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.outbox_rounded),
                    title: Text('${rpRef(t['jumlah'])} · ${teks(t['waktu'])}'),
                    subtitle: teks(t['catatan']).isEmpty ? null : Text(teks(t['catatan'])),
                    trailing: Lencana(teks(t['status']), warna: teks(t['status']) == 'Dibayar' ? Colors.green : (teks(t['status']) == 'Ditolak' ? cs.error : cs.outline)),
                  ),
                ),
              const JudulBagian('Mutasi saldo'),
              if (riwayat.isEmpty) const Kosong(pesan: 'Belum ada mutasi saldo.', ikon: Icons.receipt_long_outlined),
              for (final m in riwayat)
                ListTile(
                  dense: true,
                  leading: Icon(angka(m['jumlah']) >= 0 ? Icons.add_circle_rounded : Icons.remove_circle_rounded, color: angka(m['jumlah']) >= 0 ? Colors.green : cs.error),
                  title: Text('${teks(m['jenis'])} · ${rpRef(m['jumlah'])}'),
                  subtitle: Text('${teks(m['waktu'])} · ${teks(m['keterangan'])}'),
                ),
            ],
          ]),
          Positioned(
            right: 16,
            bottom: 16,
            child: FloatingActionButton.extended(heroTag: 'refDaftar', onPressed: () => _formulir(d), icon: const Icon(Icons.person_add_alt_1_rounded), label: const Text('Daftarkan peserta')),
          ),
        ]);
      },
    );
  }
}

// ───────────────────────── formulir pendaftaran ─────────────────────────

const _agama = ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu', 'Lainnya'];
const _pendidikan = ['', 'Tidak sekolah', 'SD/sederajat', 'SMP/sederajat', 'SMA/sederajat', 'D1/D2/D3', 'S1', 'S2', 'S3'];
const _penghasilan = ['', 'Tidak berpenghasilan', 'Kurang dari Rp500.000', 'Rp500.000 - Rp999.999', 'Rp1.000.000 - Rp1.999.999', 'Rp2.000.000 - Rp4.999.999', 'Rp5.000.000 ke atas'];
const _tinggal = ['', 'Bersama orang tua', 'Wali', 'Kos', 'Asrama', 'Panti asuhan', 'Lainnya'];
const _transportasi = ['', 'Jalan kaki', 'Sepeda', 'Sepeda motor', 'Mobil pribadi', 'Angkutan umum', 'Ojek', 'Lainnya'];

class FormPendaftaranRef extends StatefulWidget {
  const FormPendaftaranRef({super.key, required this.token, required this.konteks, this.awal});
  final String token;
  final Map<String, dynamic> konteks;
  final Map<String, dynamic>? awal;

  @override
  State<FormPendaftaranRef> createState() => _FormPendaftaranRefState();
}

class _FormPendaftaranRefState extends State<FormPendaftaranRef> {
  final Map<String, TextEditingController> _c = {};
  final Map<String, String> _p = {'jk': '', 'agama': 'Islam', 'program': '', 'jenisTinggal': '', 'transportasi': '',
    'ayahPendidikan': '', 'ayahPenghasilan': '', 'ibuPendidikan': '', 'ibuPenghasilan': '', 'waliPendidikan': '', 'waliPenghasilan': ''};
  final Map<String, String> _berkas = {};
  List<String> _sudahAda = [];

  TextEditingController c(String k) => _c[k] ??= TextEditingController();

  @override
  void initState() {
    super.initState();
    final a = widget.awal;
    if (a != null) {
      final d = peta(a['data']);
      d.forEach((k, v) {
        if (_p.containsKey(k)) {
          _p[k] = teks(v);
        } else {
          c(k).text = teks(v);
        }
      });
      _sudahAda = daftar(a['berkas']).map(teks).toList();
    }
  }

  @override
  void dispose() {
    for (final x in _c.values) {
      x.dispose();
    }
    super.dispose();
  }

  Map<String, String> get _jenisBerkas => peta(widget.konteks['berkasJenis']).map((k, v) => MapEntry(k, teks(v)));
  List<String> get _wajibBerkas => daftar(widget.konteks['berkasWajib']).map(teks).toList();

  Future<void> _ambil(String k) async {
    if (k == 'ttd') {
      final png = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => const _PadTandaTangan()));
      if (png != null && mounted) setState(() => _berkas[k] = png);
      return;
    }
    final f = await ambilFoto(selfie: k == 'foto', bolehGaleri: true, context: context);
    if (f != null && mounted) setState(() => _berkas[k] = f);
  }

  Future<void> _simpan() async {
    final d = <String, dynamic>{for (final e in _c.entries) e.key: e.value.text.trim(), ..._p};
    for (final k in _wajibBerkas) {
      if (!_berkas.containsKey(k) && !_sudahAda.contains(k)) return kabar(context, 'Unggah ${_jenisBerkas[k] ?? k}.', galat: true);
    }
    final ubah = widget.awal != null;
    if (!await konfirmasi(context, ubah ? 'Simpan perubahan?' : 'Kirim pendaftaran?',
        'Pastikan data ${teks(d['nama'])} sudah benar. Petugas akan memverifikasi berkas, lalu Anda dapat melanjutkan pembayaran.', ya: 'Kirim')) {
      return;
    }
    if (!mounted) return;
    final r = await jalankan(
        context,
        () => ubah
            ? Api.instance('waRefPerbaiki', [widget.token, teks(widget.awal!['id']), d, _berkas], const Duration(minutes: 3))
            : Api.instance('waRefDaftar', [widget.token, d, _berkas], const Duration(minutes: 3)),
        teksProses: 'Mengunggah data & berkas...');
    if (r.ok && mounted) {
      kabar(context, ubah ? 'Data diperbarui dan dikirim ulang untuk verifikasi.' : 'Pendaftaran terkirim. Pantau statusnya di menu Referral.');
      Navigator.pop(context, true);
    }
  }

  Widget _t(String k, String label, {TextInputType? tipe, int? maks, String? bantu, bool huruf = false}) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextField(
          controller: c(k),
          keyboardType: tipe,
          maxLength: maks,
          textCapitalization: huruf ? TextCapitalization.characters : TextCapitalization.words,
          inputFormatters: tipe == TextInputType.number ? [FilteringTextInputFormatter.digitsOnly] : null,
          decoration: InputDecoration(labelText: label, helperText: bantu, counterText: '', isDense: true),
        ),
      );

  Widget _pilih(String k, String label, List<String> opsi) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: opsi.contains(_p[k]) ? _p[k] : null,
          decoration: InputDecoration(labelText: label, isDense: true),
          items: [for (final o in opsi) DropdownMenuItem(value: o, child: Text(o.isEmpty ? '-' : o, overflow: TextOverflow.ellipsis))],
          onChanged: (v) => setState(() => _p[k] = v ?? ''),
        ),
      );

  Widget _ortu(String awalan, String judul) => ExpansionTile(
        tilePadding: EdgeInsets.zero,
        title: Text(judul, style: const TextStyle(fontWeight: FontWeight.w700)),
        initiallyExpanded: awalan == 'ibu',
        children: [
          _t('${awalan}Nama', 'Nama${awalan == 'ibu' ? ' ibu kandung *' : ''}'),
          _t('${awalan}Nik', 'NIK', tipe: TextInputType.number, maks: 16),
          _t('${awalan}Tahun', 'Tahun lahir', tipe: TextInputType.number, maks: 4),
          _pilih('${awalan}Pendidikan', 'Pendidikan terakhir', _pendidikan),
          _t('${awalan}Pekerjaan', 'Pekerjaan'),
          _pilih('${awalan}Penghasilan', 'Penghasilan per bulan', _penghasilan),
        ],
      );

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final program = daftar(widget.konteks['program']).map(peta).toList();
    final progOpsi = program.isEmpty ? ['Paket A', 'Paket B', 'Paket C'] : program.map((x) => teks(x['nama'])).toList();
    return Scaffold(
      appBar: AppBar(title: Text(widget.awal == null ? 'Daftarkan peserta didik baru' : 'Ubah data pendaftaran')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
        Card(
          color: cs.primaryContainer.withValues(alpha: 0.4),
          child: ListTile(
            leading: const Icon(Icons.campaign_rounded),
            title: Text('Promotor: ${teks(widget.konteks['nama'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: const Text('Tercatat otomatis dari akun Anda.'),
          ),
        ),
        const JudulBagian('Identitas calon peserta'),
        _t('nama', 'Nama lengkap (sesuai KK/akta) *', huruf: true),
        _pilih('jk', 'Jenis kelamin *', const ['L', 'P']),
        _t('nik', 'NIK *', tipe: TextInputType.number, maks: 16),
        _t('nisn', 'NISN (bila ada)', tipe: TextInputType.number, maks: 10),
        _t('tempatLahir', 'Tempat lahir *'),
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: OutlinedButton.icon(
            onPressed: () async {
              final n = DateTime.now();
              final p = await showDatePicker(context: context, firstDate: DateTime(1940), lastDate: n, initialDate: DateTime.tryParse(c('tanggalLahir').text) ?? DateTime(n.year - 18));
              if (p != null) setState(() => c('tanggalLahir').text = tglIso(p));
            },
            icon: const Icon(Icons.cake_rounded),
            label: Text(c('tanggalLahir').text.isEmpty ? 'Tanggal lahir *' : 'Tanggal lahir: ${tglIndo(c('tanggalLahir').text)}'),
          ),
        ),
        _pilih('agama', 'Agama', _agama),
        _pilih('program', 'Program / paket yang dituju *', progOpsi),
        _t('sekolahAsal', 'Sekolah asal'),
        _t('kebutuhanKhusus', 'Kebutuhan khusus (kosongkan bila tidak ada)'),
        const JudulBagian('Alamat & kontak'),
        _t('alamat', 'Alamat (jalan / blok / dusun) *'),
        Row(children: [
          Expanded(child: _t('rt', 'RT', tipe: TextInputType.number, maks: 3)),
          const SizedBox(width: 8),
          Expanded(child: _t('rw', 'RW', tipe: TextInputType.number, maks: 3)),
          const SizedBox(width: 8),
          Expanded(child: _t('kodePos', 'Kode pos', tipe: TextInputType.number, maks: 5)),
        ]),
        _t('dusun', 'Dusun'),
        _t('kelurahan', 'Kelurahan / desa'),
        _t('kecamatan', 'Kecamatan'),
        _pilih('jenisTinggal', 'Jenis tinggal', _tinggal),
        _pilih('transportasi', 'Alat transportasi', _transportasi),
        _t('hp', 'Nomor HP / WhatsApp *', tipe: TextInputType.phone, maks: 16),
        _t('email', 'E-mail', tipe: TextInputType.emailAddress),
        const JudulBagian('Data keluarga'),
        _t('noKk', 'Nomor KK', tipe: TextInputType.number, maks: 16),
        Row(children: [
          Expanded(child: _t('anakKe', 'Anak ke-', tipe: TextInputType.number, maks: 2)),
          const SizedBox(width: 8),
          Expanded(child: _t('jumlahSaudara', 'Jml. saudara kandung', tipe: TextInputType.number, maks: 2)),
        ]),
        _ortu('ibu', 'Data ibu'),
        _ortu('ayah', 'Data ayah'),
        _ortu('wali', 'Data wali (bila ada)'),
        const JudulBagian('Data periodik'),
        Row(children: [
          Expanded(child: _t('tinggi', 'Tinggi (cm)', tipe: TextInputType.number, maks: 3)),
          const SizedBox(width: 8),
          Expanded(child: _t('berat', 'Berat (kg)', tipe: TextInputType.number, maks: 3)),
          const SizedBox(width: 8),
          Expanded(child: _t('jarak', 'Jarak ke PKBM (km)', tipe: TextInputType.number, maks: 3)),
        ]),
        JudulBagian('Berkas pendaftaran', sub: 'Wajib: ${_wajibBerkas.map((k) => _jenisBerkas[k] ?? k).join(', ')}'),
        for (final e in _jenisBerkas.entries)
          Card(
            child: ListTile(
              leading: Icon(
                _berkas.containsKey(e.key) || _sudahAda.contains(e.key) ? Icons.check_circle_rounded : (e.key == 'ttd' ? Icons.draw_rounded : Icons.upload_file_rounded),
                color: _berkas.containsKey(e.key) || _sudahAda.contains(e.key) ? Colors.green : cs.outline,
              ),
              title: Text('${e.value}${_wajibBerkas.contains(e.key) ? ' *' : ''}'),
              subtitle: Text(_berkas.containsKey(e.key) ? 'Siap diunggah' : (_sudahAda.contains(e.key) ? 'Sudah ada (ketuk untuk mengganti)' : (e.key == 'ttd' ? 'Tanda tangan di layar' : 'Foto dari kamera atau galeri'))),
              trailing: const Icon(Icons.chevron_right_rounded),
              onTap: () => _ambil(e.key),
            ),
          ),
        const SizedBox(height: 16),
        FilledButton.icon(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          onPressed: _simpan,
          icon: const Icon(Icons.send_rounded),
          label: Text(widget.awal == null ? 'Kirim pendaftaran' : 'Simpan & kirim ulang'),
        ),
      ]),
    );
  }
}

// ───────────────────────── tanda tangan ─────────────────────────

class _PadTandaTangan extends StatefulWidget {
  const _PadTandaTangan();

  @override
  State<_PadTandaTangan> createState() => _PadTandaTanganState();
}

class _PadTandaTanganState extends State<_PadTandaTangan> {
  final List<List<Offset>> _garis = [];
  Size _ukuran = Size.zero;

  Future<void> _selesai() async {
    if (_garis.every((g) => g.length < 2)) return kabar(context, 'Silakan tanda tangan dulu.', galat: true);
    final rec = ui.PictureRecorder();
    final cv = Canvas(rec);
    cv.drawRect(Offset.zero & _ukuran, Paint()..color = Colors.white);
    _LukisTtd(_garis).paint(cv, _ukuran);
    final img = await rec.endRecording().toImage(_ukuran.width.round(), _ukuran.height.round());
    final bd = await img.toByteData(format: ui.ImageByteFormat.png);
    if (bd == null || !mounted) return;
    Navigator.pop(context, 'data:image/png;base64,${base64Encode(bd.buffer.asUint8List())}');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tanda tangan calon peserta'), actions: [
        TextButton(onPressed: () => setState(_garis.clear), child: const Text('Ulangi')),
      ]),
      body: Column(children: [
        const Padding(padding: EdgeInsets.all(12), child: Text('Tanda tangani di dalam kotak di bawah ini.')),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: LayoutBuilder(builder: (c, k) {
              _ukuran = Size(k.maxWidth, k.maxHeight.clamp(120, 320).toDouble());
              return Align(
                alignment: Alignment.topCenter,
                child: Container(
                  width: _ukuran.width,
                  height: _ukuran.height,
                  decoration: BoxDecoration(color: Colors.white, border: Border.all(color: Colors.black26), borderRadius: BorderRadius.circular(12)),
                  child: GestureDetector(
                    onPanStart: (d) => setState(() => _garis.add([d.localPosition])),
                    onPanUpdate: (d) => setState(() => _garis.last.add(d.localPosition)),
                    child: CustomPaint(painter: _LukisTtd(_garis), size: _ukuran),
                  ),
                ),
              );
            }),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: _selesai, child: const Text('Gunakan tanda tangan ini')),
        ),
      ]),
    );
  }
}

class _LukisTtd extends CustomPainter {
  _LukisTtd(this.garis);
  final List<List<Offset>> garis;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = Colors.black
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    for (final g in garis) {
      if (g.length < 2) continue;
      final path = Path()..moveTo(g.first.dx, g.first.dy);
      for (final o in g.skip(1)) {
        path.lineTo(o.dx, o.dy);
      }
      canvas.drawPath(path, p);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}

// ───────────────────────── pembayaran ─────────────────────────

class _LembarBayar extends StatefulWidget {
  const _LembarBayar({required this.token, required this.x, required this.aturan});
  final String token;
  final Map<String, dynamic> x;
  final Map<String, dynamic> aturan;

  @override
  State<_LembarBayar> createState() => _LembarBayarState();
}

class _LembarBayarState extends State<_LembarBayar> {
  String _metode = 'Transfer';
  String? _bukti;
  String _qrUrl = '';
  String _urlOnline = '';

  Future<void> _bukaOnline() async {
    if (_urlOnline.isEmpty) {
      final kode = await pilihMetodeBayar(context, pokok: angka(widget.aturan['biaya']), metode: daftar(widget.aturan['metodeBayar']).map(peta).toList(), judul: 'Bayar biaya pendaftaran');
      if (kode == null || !mounted) return;
      final r = await jalankan(context, () async => peta(await Api.instance('waRefBayar', [widget.token, teks(widget.x['id']), 'Online', kode], const Duration(minutes: 2))),
          teksProses: 'Menyiapkan pembayaran...');
      if (!r.ok || !mounted) return;
      if (!await konfirmasiTotalBayar(context, r.data!) || !mounted) return;
      setState(() => _urlOnline = teks(r.data!['url']));
    }
    if (_urlOnline.isEmpty || !mounted) return;
    final lunas = await bukaPembayaranDoku(context, url: _urlOnline, judul: 'Biaya pendaftaran',
        cekStatus: () async => teks(peta(await Api.instance('waRefCekBayar', [widget.token, teks(widget.x['id'])], const Duration(minutes: 1)))['status'], 'Menunggu'));
    if (lunas && mounted) Navigator.pop(context, true);
  }

  Future<void> _cekOnline() async {
    final r = await jalankan(context, () async => peta(await Api.instance('waRefCekBayar', [widget.token, teks(widget.x['id'])], const Duration(minutes: 1))), teksProses: 'Memeriksa pembayaran...');
    if (!r.ok || !mounted) return;
    if (teks(r.data!['status']) == 'Lunas') {
      kabar(context, 'Pembayaran lunas dan sudah tercatat.');
      Navigator.pop(context, true);
    } else {
      kabar(context, 'Status pembayaran: ${teks(r.data!['status'], 'Menunggu')}. Selesaikan pembayaran di halaman DOKU.');
    }
  }

  Future<void> _kirim() async {
    if (_metode == 'Online') return _bukaOnline();
    if (_metode == 'QRIS' && widget.aturan['qrisDinamis'] == true && _bukti == null) {
      final r = await jalankan(context, () async => peta(await Api.instance('waRefBayar', [widget.token, teks(widget.x['id']), 'QRIS', null])), teksProses: 'Membuat QRIS...');
      if (r.ok && mounted) setState(() => _qrUrl = teks(r.data!['qrUrl']));
      return;
    }
    if (_metode != 'Sekretariat' && _bukti == null) return kabar(context, 'Unggah bukti pembayaran.', galat: true);
    final r = await jalankan(context, () async => peta(await Api.instance('waRefBayar', [widget.token, teks(widget.x['id']), _metode, _bukti], const Duration(minutes: 2))),
        teksProses: 'Mengirim...');
    if (r.ok && mounted) {
      kabar(context, teks(r.data!['pesan'], 'Terkirim.'));
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final at = widget.aturan;
    final cs = Theme.of(context).colorScheme;
    final rek = daftar(at['rekening']).map(peta).toList();
    final adaQris = at['adaQris'] == true || at['qrisDinamis'] == true;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Pembayaran pendaftaran ${teks(widget.x['nama'])}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            if (angka(at['biaya']) > 0) Text('Biaya pendaftaran: ${rpRef(at['biaya'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            SegmentedButton<String>(
              segments: [
                const ButtonSegment(value: 'Transfer', label: Text('Transfer'), icon: Icon(Icons.account_balance_rounded)),
                if (at['bayarOnline'] == true) const ButtonSegment(value: 'Online', label: Text('Online'), icon: Icon(Icons.credit_card_rounded)),
                if (adaQris) const ButtonSegment(value: 'QRIS', label: Text('QRIS'), icon: Icon(Icons.qr_code_2_rounded)),
                const ButtonSegment(value: 'Sekretariat', label: Text('Sekretariat'), icon: Icon(Icons.storefront_rounded)),
              ],
              selected: {_metode},
              onSelectionChanged: (s) => setState(() { _metode = s.first; _bukti = null; _qrUrl = ''; }),
            ),
            const SizedBox(height: 12),
            if (_metode == 'Transfer') ...[
              if (rek.isEmpty) Text('Rekening lembaga belum diatur Admin. Pilih bayar di sekretariat.', style: TextStyle(color: cs.error)),
              for (final r in rek)
                Card(
                  child: ListTile(
                    title: Text('${teks(r['bank'])} · ${teks(r['nomor'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('a.n. ${teks(r['atasNama'])}'),
                    trailing: IconButton(
                      tooltip: 'Salin nomor',
                      icon: const Icon(Icons.copy_rounded),
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: teks(r['nomor'])));
                        kabar(context, 'Nomor rekening disalin.');
                      },
                    ),
                  ),
                ),
            ],
            if (_metode == 'QRIS') ...[
              if (at['qrisDinamis'] == true && _qrUrl.isNotEmpty)
                Center(child: Image.network(_qrUrl, width: 260, height: 260))
              else if (at['qrisDinamis'] == true)
                const Text('Ketuk "Buat QRIS" untuk menampilkan kode bayar. Status lunas otomatis setelah pembayaran berhasil.')
              else
                _QrisStatis(dataUrl: teks(at['qris'])),
            ],
            if (_metode == 'Online') ...[
              const Text('Bayar lewat DOKU: Virtual Account, QRIS, e-wallet, atau gerai retail. Biaya admin sesuai metode ditanggung pembayar. Status lunas tercatat otomatis; tidak perlu unggah bukti.'),
              if (_urlOnline.isNotEmpty) ...[
                const SizedBox(height: 8),
                OutlinedButton.icon(onPressed: _cekOnline, icon: const Icon(Icons.refresh_rounded), label: const Text('Saya sudah bayar — cek status')),
              ],
            ],
            if (_metode == 'Sekretariat')
              Text('Datang langsung ke sekretariat PKBM Tunas Harapan${teks(at['alamatSekretariat']).isNotEmpty ? ' (${teks(at['alamatSekretariat'])})' : ''}. '
                  'Petugas akan menandai pembayaran lunas.'),
            if (_metode == 'Transfer' || (_metode == 'QRIS' && at['qrisDinamis'] != true)) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () async {
                  final f = await ambilFoto(bolehGaleri: true, context: context);
                  if (f != null) setState(() => _bukti = f);
                },
                icon: Icon(_bukti == null ? Icons.receipt_long_rounded : Icons.check_circle_rounded, color: _bukti == null ? null : Colors.green),
                label: Text(_bukti == null ? 'Unggah bukti pembayaran' : 'Bukti siap dikirim (ganti)'),
              ),
            ],
            const SizedBox(height: 14),
            if (!(_metode == 'QRIS' && _qrUrl.isNotEmpty))
              FilledButton(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                onPressed: _kirim,
                child: Text(_metode == 'Online'
                    ? (_urlOnline.isEmpty ? 'Bayar sekarang (DOKU)' : 'Buka lagi halaman pembayaran')
                    : _metode == 'Sekretariat' ? 'Saya akan bayar di sekretariat' : (_metode == 'QRIS' && at['qrisDinamis'] == true ? 'Buat QRIS' : 'Kirim bukti pembayaran')),
              ),
          ]),
        ),
      ),
    );
  }
}

/// QRIS statis lembaga (gambar dari pengaturan Admin).
class _QrisStatis extends StatelessWidget {
  const _QrisStatis({required this.dataUrl});
  final String dataUrl;

  @override
  Widget build(BuildContext context) {
    final i = dataUrl.indexOf(',');
    if (i < 0) return const Text('Gambar QRIS belum diatur Admin. Pilih metode lain.');
    return Column(children: [
      Center(child: Image.memory(base64Decode(dataUrl.substring(i + 1)), width: 260, fit: BoxFit.contain)),
      const SizedBox(height: 6),
      const Text('Pindai QRIS di atas dengan aplikasi bank/e-wallet, bayar sesuai biaya, lalu unggah bukti pembayarannya.'),
    ]);
  }
}

// ───────────────────────── rekening promotor ─────────────────────────

class _DialogRekening extends StatefulWidget {
  const _DialogRekening({required this.token, this.awal});
  final String token;
  final Map<String, dynamic>? awal;

  @override
  State<_DialogRekening> createState() => _DialogRekeningState();
}

class _DialogRekeningState extends State<_DialogRekening> {
  late String _metode = teks(widget.awal?['metode']) == 'E-Wallet' ? 'E-Wallet' : 'Transfer Bank';
  late final _bank = TextEditingController(text: teks(widget.awal?['bank']));
  late final _nomor = TextEditingController(text: teks(widget.awal?['nomor']));
  late final _an = TextEditingController(text: teks(widget.awal?['atasNama']));
  late final _hp = TextEditingController(text: teks(widget.awal?['hp']));

  @override
  void dispose() {
    for (final x in [_bank, _nomor, _an, _hp]) {
      x.dispose();
    }
    super.dispose();
  }

  Future<void> _simpan() async {
    final r = await jalankan(context, () => Api.instance('waRefRekening', [widget.token, {'metode': _metode, 'bank': _bank.text, 'nomor': _nomor.text, 'atasNama': _an.text, 'hp': _hp.text}]),
        teksProses: 'Menyimpan...');
    if (r.ok && mounted) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Rekening pembayaran cashback'),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          SegmentedButton<String>(
            segments: const [ButtonSegment(value: 'Transfer Bank', label: Text('Bank')), ButtonSegment(value: 'E-Wallet', label: Text('E-Wallet'))],
            selected: {_metode},
            onSelectionChanged: (s) => setState(() => _metode = s.first),
          ),
          const SizedBox(height: 10),
          TextField(controller: _bank, decoration: InputDecoration(labelText: _metode == 'E-Wallet' ? 'E-Wallet (DANA, OVO, GoPay, ...)' : 'Nama bank', isDense: true)),
          TextField(controller: _nomor, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: _metode == 'E-Wallet' ? 'Nomor e-wallet' : 'Nomor rekening', isDense: true)),
          TextField(controller: _an, decoration: const InputDecoration(labelText: 'Atas nama', isDense: true)),
          TextField(controller: _hp, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Nomor HP/WA (untuk konfirmasi)', isDense: true)),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Batal')),
        FilledButton(onPressed: _simpan, child: const Text('Simpan')),
      ],
    );
  }
}
