import 'dart:convert';

import 'package:flutter/material.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../session.dart';
import '../widgets.dart';
import 'referral.dart';

String? get _t => Sesi.instance.token;

const _urutStatus = ['Menunggu Verifikasi Berkas', 'Menunggu Verifikasi Bayar', 'Menunggu Pembayaran', 'Perlu Perbaikan', 'Pembayaran Ditolak', 'Selesai', 'Ditolak'];

/// Referral pendaftaran (petugas): verifikasi berkas & pembayaran, penarikan saldo, pengaturan.
class ReferralAdminScreen extends StatefulWidget {
  const ReferralAdminScreen({super.key});

  @override
  State<ReferralAdminScreen> createState() => _ReferralAdminScreenState();
}

class _ReferralAdminScreenState extends State<ReferralAdminScreen> {
  int _v = 0;
  int _tab = 0;
  String _saring = 'Semua';
  final _cari = TextEditingController();

  @override
  void dispose() {
    _cari.dispose();
    super.dispose();
  }

  Future<void> _detail(Map<String, dynamic> x, Map<String, dynamic> peran) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _DetailPendaftaran(x: x, peran: peran)));
    if (ok == true && mounted) setState(() => _v++);
  }

  Future<void> _bayarTarik(Map<String, dynamic> t) async {
    final bukti = await ambilFoto(bolehGaleri: true, context: context);
    if (bukti == null || !mounted) return;
    final cat = await mintaTeks(context, 'Bayar ${rpRef(t['jumlah'])} ke ${teks(t['promotor'])}?', label: 'Catatan (opsional)');
    if (cat == null || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafRefTarikBayar', [_t, teks(t['id']), bukti, cat], const Duration(minutes: 2)), teksProses: 'Mencatat pembayaran...');
    if (r.ok && mounted) {
      kabar(context, 'Penarikan dibayar. Promotor mendapat notifikasi.');
      setState(() => _v++);
    }
  }

  Future<void> _tolakTarik(Map<String, dynamic> t) async {
    final a = await mintaTeks(context, 'Tolak penarikan ${teks(t['promotor'])}?', label: 'Alasan');
    if (a == null || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafRefTarikTolak', [_t, teks(t['id']), a]), teksProses: 'Menolak...');
    if (r.ok && mounted) setState(() => _v++);
  }

  Widget _pendaftaran(Map<String, dynamic> d) {
    final semua = daftar(d['daftar']).map(peta).toList();
    final hitung = peta(d['hitung']);
    final peran = peta(d['peran']);
    final q = _cari.text.trim().toLowerCase();
    final list = semua.where((x) {
      if (_saring != 'Semua' && teks(x['status']) != _saring) return false;
      if (q.isEmpty) return true;
      return '${teks(x['nama'])} ${teks(x['nik'])} ${teks(x['promotor'])} ${teks(x['id'])}'.toLowerCase().contains(q);
    }).toList();
    return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
      TextField(controller: _cari, onChanged: (_) => setState(() {}), decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Cari nama, NIK, promotor', isDense: true)),
      const SizedBox(height: 8),
      Wrap(spacing: 6, runSpacing: 6, children: [
        ChoiceChip(label: Text('Semua (${semua.length})'), selected: _saring == 'Semua', onSelected: (_) => setState(() => _saring = 'Semua')),
        for (final s in _urutStatus)
          if (angka(hitung[s]) > 0) ChoiceChip(label: Text('$s (${hitung[s]})'), selected: _saring == s, onSelected: (_) => setState(() => _saring = s)),
      ]),
      const SizedBox(height: 8),
      if (list.isEmpty) const Kosong(pesan: 'Tidak ada pendaftaran.', ikon: Icons.person_search_rounded),
      for (final x in list)
        Card(
          child: ListTile(
            onTap: () => _detail(x, peran),
            title: Text(teks(x['nama']), style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text('${teks(x['program'])} · promotor ${teks(x['promotor'])} (${teks(x['promotorPeran'])})\n${teks(x['id'])} · ${teks(x['waktu'])}'),
            isThreeLine: true,
            trailing: Lencana(teks(x['status']), warna: warnaStatusRef(context, teks(x['status']))),
          ),
        ),
    ]);
  }

  Widget _penarikan(Map<String, dynamic> d) {
    final cs = Theme.of(context).colorScheme;
    final tarik = daftar(d['tarik']).map(peta).toList();
    final promotor = daftar(d['promotor']).map(peta).toList();
    final bend = peta(d['peran'])['bendahara'] == true;
    final menunggu = tarik.where((t) => teks(t['status']) == 'Menunggu').toList();
    final total = menunggu.fold<int>(0, (s, t) => s + angka(t['jumlah']));
    return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: [
      Card(
        child: ListTile(
          leading: const Icon(Icons.pending_actions_rounded),
          title: Text('${menunggu.length} pengajuan menunggu · ${rpRef(total)}', style: const TextStyle(fontWeight: FontWeight.w800)),
          subtitle: Text(bend ? 'Unggah bukti transfer untuk menandai dibayar.' : 'Pembayaran penarikan dilakukan oleh Bendahara.'),
        ),
      ),
      for (final t in tarik)
        Card(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(4, 4, 8, 8),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              ListTile(
                title: Text('${teks(t['promotor'])} · ${rpRef(t['jumlah'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('${teks(t['peran'])} · ${teks(t['waktu'])}\n${teks(t['rekening'])}${teks(t['catatan']).isNotEmpty ? '\n${teks(t['catatan'])}' : ''}'
                    '${teks(t['oleh']).isNotEmpty ? '\nDiproses ${teks(t['oleh'])} · ${teks(t['pada'])}' : ''}'),
                trailing: Lencana(teks(t['status']), warna: teks(t['status']) == 'Dibayar' ? Colors.green : (teks(t['status']) == 'Ditolak' ? cs.error : cs.outline)),
              ),
              Wrap(spacing: 8, children: [
                const SizedBox(width: 8),
                if (bend && teks(t['status']) == 'Menunggu') ...[
                  FilledButton.icon(onPressed: () => _bayarTarik(t), icon: const Icon(Icons.upload_rounded, size: 18), label: const Text('Bayar & unggah bukti')),
                  TextButton(onPressed: () => _tolakTarik(t), child: const Text('Tolak')),
                ],
                if (t['adaBukti'] == true)
                  TextButton.icon(
                    onPressed: () => lihatBerkasRef(context, () => Api.instance('waStafRefTarikBukti', [_t, teks(t['id'])])),
                    icon: const Icon(Icons.receipt_long_rounded, size: 18),
                    label: const Text('Bukti transfer'),
                  ),
              ]),
            ]),
          ),
        ),
      if (tarik.isEmpty) const Kosong(pesan: 'Belum ada pengajuan penarikan.', ikon: Icons.outbox_outlined),
      JudulBagian('Saldo promotor', sub: '${promotor.length} promotor'),
      for (final p in promotor)
        ListTile(
          dense: true,
          title: Text(teks(p['nama'])),
          subtitle: Text(p['rekening'] == null ? 'Rekening belum diisi' : '${teks(peta(p['rekening'])['bank'])} · ${teks(peta(p['rekening'])['nomor'])} a.n. ${teks(peta(p['rekening'])['atasNama'])}'),
          trailing: Text(rpRef(p['saldo']), style: const TextStyle(fontWeight: FontWeight.w800)),
        ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Muatan<Map<String, dynamic>>(
      key: ValueKey(_v),
      muat: () async => peta(await Api.instance('waStafRefAdmin', [_t, {}], const Duration(seconds: 120))),
      bangun: (context, d, _) {
        final peran = peta(d['peran']);
        final menungguTarik = daftar(d['tarik']).where((t) => teks(peta(t)['status']) == 'Menunggu').length;
        return Column(children: [
          Container(
            width: double.infinity,
            color: cs.surfaceContainerLowest,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: SegmentedButton<int>(
              segments: [
                const ButtonSegment(value: 0, label: Text('Pendaftaran'), icon: Icon(Icons.how_to_reg_rounded)),
                ButtonSegment(value: 1, label: Text('Penarikan${menungguTarik > 0 ? ' ($menungguTarik)' : ''}'), icon: const Icon(Icons.outbox_rounded)),
                if (peran['admin'] == true) const ButtonSegment(value: 2, label: Text('Pengaturan'), icon: Icon(Icons.tune_rounded)),
              ],
              selected: {_tab},
              onSelectionChanged: (s) => setState(() => _tab = s.first),
            ),
          ),
          Expanded(child: switch (_tab) { 0 => _pendaftaran(d), 1 => _penarikan(d), _ => const _PengaturanReferral() }),
        ]);
      },
    );
  }
}

class _DetailPendaftaran extends StatelessWidget {
  const _DetailPendaftaran({required this.x, required this.peran});
  final Map<String, dynamic> x;
  final Map<String, dynamic> peran;

  static const _label = <String, String>{
    'nama': 'Nama', 'jk': 'Jenis kelamin', 'nik': 'NIK', 'nisn': 'NISN', 'tempatLahir': 'Tempat lahir', 'tanggalLahir': 'Tanggal lahir', 'agama': 'Agama',
    'program': 'Program', 'sekolahAsal': 'Sekolah asal', 'kebutuhanKhusus': 'Kebutuhan khusus', 'alamat': 'Alamat', 'rt': 'RT', 'rw': 'RW', 'dusun': 'Dusun',
    'kelurahan': 'Kelurahan', 'kecamatan': 'Kecamatan', 'kodePos': 'Kode pos', 'jenisTinggal': 'Jenis tinggal', 'transportasi': 'Transportasi', 'hp': 'HP', 'email': 'E-mail',
    'noKk': 'No. KK', 'anakKe': 'Anak ke-', 'jumlahSaudara': 'Jml. saudara', 'ibuNama': 'Nama ibu', 'ibuNik': 'NIK ibu', 'ibuTahun': 'Tahun lahir ibu',
    'ibuPendidikan': 'Pendidikan ibu', 'ibuPekerjaan': 'Pekerjaan ibu', 'ibuPenghasilan': 'Penghasilan ibu', 'ayahNama': 'Nama ayah', 'ayahNik': 'NIK ayah',
    'ayahTahun': 'Tahun lahir ayah', 'ayahPendidikan': 'Pendidikan ayah', 'ayahPekerjaan': 'Pekerjaan ayah', 'ayahPenghasilan': 'Penghasilan ayah',
    'waliNama': 'Nama wali', 'waliNik': 'NIK wali', 'waliTahun': 'Tahun lahir wali', 'waliPendidikan': 'Pendidikan wali', 'waliPekerjaan': 'Pekerjaan wali',
    'waliPenghasilan': 'Penghasilan wali', 'tinggi': 'Tinggi (cm)', 'berat': 'Berat (kg)', 'jarak': 'Jarak (km)',
  };
  static const _berkas = {'foto': 'Pas foto', 'ijazah': 'Ijazah', 'kk': 'KK', 'ktp': 'KTP/Akta', 'ttd': 'Tanda tangan', 'bukti': 'Bukti bayar'};

  Future<void> _berkasVerif(BuildContext context, String keputusan) async {
    String cat = '';
    if (keputusan != 'setuju') {
      final c = await mintaTeks(context, keputusan == 'perbaiki' ? 'Minta perbaikan' : 'Tolak pendaftaran', label: 'Catatan untuk promotor');
      if (c == null) return;
      cat = c;
    }
    if (!context.mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafRefVerifBerkas', [_t, teks(x['id']), keputusan, cat], const Duration(minutes: 2)), teksProses: 'Menyimpan...');
    if (r.ok && context.mounted) Navigator.pop(context, true);
  }

  Future<void> _bayarVerif(BuildContext context, bool lunas) async {
    String cat = '';
    if (!lunas) {
      final c = await mintaTeks(context, 'Tolak pembayaran', label: 'Alasan');
      if (c == null) return;
      cat = c;
    } else {
      final c = await mintaTeks(context, teks(x['metodeBayar']).isEmpty || teks(x['metodeBayar']) == 'Sekretariat' ? 'Tandai lunas (bayar di sekretariat)' : 'Bukti pembayaran sah?',
          label: 'Catatan (opsional)');
      if (c == null) return;
      cat = c;
    }
    if (!context.mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafRefVerifBayar', [_t, teks(x['id']), lunas ? 'lunas' : 'tolak', cat, null], const Duration(minutes: 2)),
        teksProses: 'Menyimpan...');
    if (r.ok && context.mounted) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final d = peta(x['data']);
    final info = peta(x['promotorInfo']);
    final berkas = [...daftar(x['berkas']).map(teks), if (x['adaBukti'] == true) 'bukti'];
    final st = teks(x['status']);
    return Scaffold(
      appBar: AppBar(title: Text(teks(x['nama']))),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
        Row(children: [Expanded(child: Text(teks(x['id']), style: TextStyle(color: cs.onSurfaceVariant))), Lencana(st, warna: warnaStatusRef(context, st))]),
        const JudulBagian('Promotor'),
        Card(
          child: ListTile(
            leading: const Icon(Icons.campaign_rounded),
            title: Text('${teks(x['promotor'])} · ${teks(x['promotorPeran'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text([
              if (teks(info['rombel']).isNotEmpty) 'Rombel ${teks(info['rombel'])}',
              if (teks(info['id']).isNotEmpty) 'ID ${teks(info['id'])}',
              if (teks(info['email']).isNotEmpty) teks(info['email']),
              if (teks(info['hp']).isNotEmpty) 'HP ${teks(info['hp'])}',
              teks(x['promotorKunci']),
            ].join('\n')),
          ),
        ),
        const JudulBagian('Status verifikasi'),
        ListTile(
          dense: true,
          leading: const Icon(Icons.folder_shared_rounded),
          title: Text('Berkas: ${teks(x['statusBerkas'])}'),
          subtitle: Text([teks(x['catatanBerkas']), teks(x['verifBerkas'])].where((s) => s.isNotEmpty).join(' · ')),
        ),
        ListTile(
          dense: true,
          leading: const Icon(Icons.payments_rounded),
          title: Text('Pembayaran: ${teks(x['statusBayar'])}${teks(x['metodeBayar']).isNotEmpty ? ' (${teks(x['metodeBayar'])})' : ''}'),
          subtitle: Text([if (angka(x['jumlahBayar']) > 0) rpRef(x['jumlahBayar']), teks(x['catatanBayar']), teks(x['verifBayar'])].where((s) => s.isNotEmpty).join(' · ')),
        ),
        if (st != 'Selesai' && st != 'Ditolak')
          Wrap(spacing: 8, runSpacing: 6, children: [
            if (peran['berkas'] == true && teks(x['statusBerkas']) != 'Terverifikasi') ...[
              FilledButton.icon(onPressed: () => _berkasVerif(context, 'setuju'), icon: const Icon(Icons.verified_rounded, size: 18), label: const Text('Berkas sah')),
              OutlinedButton(onPressed: () => _berkasVerif(context, 'perbaiki'), child: const Text('Minta perbaikan')),
              TextButton(onPressed: () => _berkasVerif(context, 'tolak'), child: Text('Tolak', style: TextStyle(color: cs.error))),
            ],
            if (peran['bayar'] == true && teks(x['statusBayar']) != 'Lunas') ...[
              FilledButton.tonalIcon(onPressed: () => _bayarVerif(context, true), icon: const Icon(Icons.price_check_rounded, size: 18), label: const Text('Tandai lunas')),
              if (teks(x['statusBayar']) == 'Menunggu Verifikasi') TextButton(onPressed: () => _bayarVerif(context, false), child: const Text('Tolak bukti')),
            ],
          ]),
        JudulBagian('Berkas', sub: '${berkas.length} file'),
        Wrap(spacing: 8, runSpacing: 6, children: [
          for (final b in berkas)
            OutlinedButton.icon(
              onPressed: () => lihatBerkasRef(context, () => Api.instance('waStafRefBerkas', [_t, teks(x['id']), b], const Duration(minutes: 2))),
              icon: const Icon(Icons.image_rounded, size: 18),
              label: Text(_berkas[b] ?? b),
            ),
        ]),
        const JudulBagian('Data calon peserta'),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(children: [
              for (final e in _label.entries)
                if (teks(d[e.key]).isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      SizedBox(width: 140, child: Text(e.value, style: TextStyle(color: cs.onSurfaceVariant))),
                      Expanded(child: SelectableText(e.key == 'tanggalLahir' ? tglIndo(teks(d[e.key])) : teks(d[e.key]))),
                    ]),
                  ),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _PengaturanReferral extends StatefulWidget {
  const _PengaturanReferral();

  @override
  State<_PengaturanReferral> createState() => _PengaturanReferralState();
}

class _PengaturanReferralState extends State<_PengaturanReferral> {
  Map<String, dynamic>? _d;
  String? _galat;
  final _biaya = TextEditingController();
  final _cashback = TextEditingController();
  final _min = TextEditingController();
  final _alamat = TextEditingController();
  final _serverKey = TextEditingController();
  final _clientKey = TextEditingController();
  final _merchant = TextEditingController();
  List<Map<String, TextEditingController>> _rek = [];
  bool _gwAktif = false, _produksi = false;
  String? _qrisBaru;
  bool _hapusQris = false;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  @override
  void dispose() {
    for (final c in [_biaya, _cashback, _min, _alamat, _serverKey, _clientKey, _merchant, for (final r in _rek) ...r.values]) {
      c.dispose();
    }
    super.dispose();
  }

  void _isi(Map<String, dynamic> d) {
    final a = peta(d['aturan']), g = peta(a['gateway']);
    _biaya.text = '${a['biaya'] ?? 0}';
    _cashback.text = '${a['cashback'] ?? 50000}';
    _min.text = '${a['minTarik'] ?? 150000}';
    _alamat.text = teks(a['alamatSekretariat']);
    _serverKey.text = teks(g['serverKey']);
    _clientKey.text = teks(g['clientKey']);
    _merchant.text = teks(g['merchantId']);
    _gwAktif = g['aktif'] == true;
    _produksi = g['produksi'] == true;
    _rek = daftar(a['rekening']).map(peta).map((r) => {
          'bank': TextEditingController(text: teks(r['bank'])),
          'nomor': TextEditingController(text: teks(r['nomor'])),
          'atasNama': TextEditingController(text: teks(r['atasNama'])),
        }).toList();
    _qrisBaru = null;
    _hapusQris = false;
  }

  Future<void> _muat() async {
    try {
      final d = peta(await Api.instance('waStafRefAturan', [_t]));
      _isi(d);
      if (mounted) setState(() { _d = d; _galat = null; });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  int _n(TextEditingController c) => int.tryParse(c.text.replaceAll(RegExp(r'[^\d]'), '')) ?? 0;

  Future<void> _simpan() async {
    final r = await jalankan(context, () async => peta(await Api.instance('waAdminRefAturanSimpan', [
          _t,
          {
            'biaya': _n(_biaya),
            'cashback': _n(_cashback),
            'minTarik': _n(_min),
            'alamatSekretariat': _alamat.text.trim(),
            'rekening': [for (final x in _rek) {'bank': x['bank']!.text, 'nomor': x['nomor']!.text, 'atasNama': x['atasNama']!.text}],
            if (_qrisBaru != null) 'qris': _qrisBaru else if (_hapusQris) 'qris': '',
            'gateway': {'aktif': _gwAktif, 'produksi': _produksi, 'penyedia': 'midtrans', 'serverKey': _serverKey.text.trim(), 'clientKey': _clientKey.text.trim(), 'merchantId': _merchant.text.trim()},
          }
        ])), teksProses: 'Menyimpan pengaturan...');
    if (r.ok && mounted) {
      _isi(r.data!);
      setState(() => _d = r.data);
      kabar(context, 'Pengaturan referral tersimpan.');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_galat != null) return PesanGalat(pesan: _galat!, ulangi: _muat);
    final d = _d;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final cs = Theme.of(context).colorScheme;
    final qris = _qrisBaru ?? (_hapusQris ? '' : teks(d['qris']));
    final i = qris.indexOf(',');
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
      const JudulBagian('Biaya & cashback'),
      TextField(controller: _biaya, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Biaya pendaftaran (Rp)', isDense: true)),
      const SizedBox(height: 8),
      TextField(controller: _cashback, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Cashback per peserta terverifikasi (Rp)', isDense: true)),
      const SizedBox(height: 8),
      TextField(controller: _min, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Minimal penarikan (Rp)', isDense: true)),
      const SizedBox(height: 8),
      TextField(controller: _alamat, decoration: const InputDecoration(labelText: 'Alamat / jam layanan sekretariat (opsional)', isDense: true)),
      JudulBagian('Rekening lembaga', sub: '${_rek.length} rekening · tampil saat peserta memilih transfer'),
      for (final x in _rek)
        Card(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 6, 4, 6),
            child: Row(children: [
              Expanded(
                child: Column(children: [
                  TextField(controller: x['bank'], decoration: const InputDecoration(labelText: 'Bank / e-wallet', isDense: true)),
                  TextField(controller: x['nomor'], decoration: const InputDecoration(labelText: 'Nomor rekening', isDense: true)),
                  TextField(controller: x['atasNama'], decoration: const InputDecoration(labelText: 'Atas nama', isDense: true)),
                ]),
              ),
              IconButton(onPressed: () => setState(() => _rek.remove(x)), icon: Icon(Icons.delete_outline_rounded, color: cs.error)),
            ]),
          ),
        ),
      if (_rek.length < 6)
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => setState(() => _rek.add({'bank': TextEditingController(), 'nomor': TextEditingController(), 'atasNama': TextEditingController()})),
            icon: const Icon(Icons.add_rounded),
            label: const Text('Tambah rekening'),
          ),
        ),
      const JudulBagian('QRIS statis lembaga'),
      if (i > 0) Center(child: Image.memory(base64Decode(qris.substring(i + 1)), width: 200)),
      Wrap(spacing: 8, children: [
        OutlinedButton.icon(
          onPressed: () async {
            final f = await ambilFoto(bolehGaleri: true, context: context);
            if (f != null) setState(() { _qrisBaru = f; _hapusQris = false; });
          },
          icon: const Icon(Icons.qr_code_2_rounded),
          label: Text(i > 0 ? 'Ganti gambar QRIS' : 'Unggah gambar QRIS'),
        ),
        if (i > 0) TextButton(onPressed: () => setState(() { _qrisBaru = null; _hapusQris = true; }), child: const Text('Hapus')),
      ]),
      const JudulBagian('QRIS dinamis (Midtrans)'),
      Text('Disiapkan untuk pembayaran QRIS otomatis (lunas tanpa verifikasi manual). Biarkan nonaktif sampai akun Midtrans siap.',
          style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
      SwitchListTile(contentPadding: EdgeInsets.zero, value: _gwAktif, onChanged: (v) => setState(() => _gwAktif = v), title: const Text('Aktifkan QRIS dinamis')),
      SwitchListTile(contentPadding: EdgeInsets.zero, value: _produksi, onChanged: (v) => setState(() => _produksi = v), title: const Text('Mode produksi (matikan = sandbox/uji)')),
      TextField(controller: _serverKey, decoration: const InputDecoration(labelText: 'Server Key', isDense: true)),
      TextField(controller: _clientKey, decoration: const InputDecoration(labelText: 'Client Key', isDense: true)),
      TextField(controller: _merchant, decoration: const InputDecoration(labelText: 'Merchant ID', isDense: true)),
      const SizedBox(height: 6),
      SelectableText('Payment Notification URL (isi di dasbor Midtrans):\n${teks(d['webhook'])}', style: const TextStyle(fontSize: 12)),
      const SizedBox(height: 16),
      FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: _simpan, child: const Text('Simpan pengaturan')),
    ]);
  }
}

/// Admin: popup promosi yang tampil setiap kali aplikasi dibuka (sebelum jendela pembaruan).
class PromosiAdminScreen extends StatefulWidget {
  const PromosiAdminScreen({super.key});

  @override
  State<PromosiAdminScreen> createState() => _PromosiAdminScreenState();
}

class _PromosiAdminScreenState extends State<PromosiAdminScreen> {
  Map<String, dynamic>? _d;
  String? _galat;
  bool _aktif = false;
  String _aksi = 'referral', _sasaran = 'semua';
  final _judul = TextEditingController();
  final _teks = TextEditingController();
  final _tombol = TextEditingController();
  final _url = TextEditingController();
  String? _gambarBaru;
  bool _hapusGambar = false;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  @override
  void dispose() {
    for (final c in [_judul, _teks, _tombol, _url]) {
      c.dispose();
    }
    super.dispose();
  }

  void _isi(Map<String, dynamic> d) {
    final a = peta(d['aturan']);
    _aktif = a['aktif'] == true;
    _aksi = teks(a['aksi'], 'referral');
    _sasaran = teks(a['sasaran'], 'semua');
    _judul.text = teks(a['judul']);
    _teks.text = teks(a['teks']);
    _tombol.text = teks(a['tombol'], 'Daftarkan sekarang');
    _url.text = teks(a['url']);
    _gambarBaru = null;
    _hapusGambar = false;
  }

  Future<void> _muat() async {
    try {
      final d = peta(await Api.instance('waStafPromosiAtur', [_t], const Duration(seconds: 60)));
      _isi(d);
      if (mounted) setState(() { _d = d; _galat = null; });
    } on ApiException catch (e) {
      if (mounted) setState(() => _galat = e.ramah);
    }
  }

  Future<void> _simpan() async {
    final r = await jalankan(context, () async => peta(await Api.instance('waAdminPromosiSimpan', [
          _t,
          {
            'aktif': _aktif,
            'judul': _judul.text.trim(),
            'teks': _teks.text.trim(),
            'tombol': _tombol.text.trim(),
            'aksi': _aksi,
            'url': _url.text.trim(),
            'sasaran': _sasaran,
            if (_gambarBaru != null) 'gambar': _gambarBaru else if (_hapusGambar) 'gambar': '',
          }
        ], const Duration(minutes: 2))), teksProses: 'Menyimpan promosi...');
    if (r.ok && mounted) {
      _isi(r.data!);
      setState(() => _d = r.data);
      kabar(context, _aktif ? 'Promosi aktif: tampil saat aplikasi dibuka.' : 'Promosi dinonaktifkan.');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_galat != null) return PesanGalat(pesan: _galat!, ulangi: _muat);
    final d = _d;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final cs = Theme.of(context).colorScheme;
    final g = _gambarBaru ?? (_hapusGambar ? '' : teks(d['gambar']));
    final i = g.indexOf(',');
    return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        value: _aktif,
        onChanged: (v) => setState(() => _aktif = v),
        title: const Text('Tampilkan popup promosi', style: TextStyle(fontWeight: FontWeight.w800)),
        subtitle: const Text('Muncul setiap kali aplikasi dibuka, sebelum pemberitahuan pembaruan. Tidak tampil untuk Dinas Pendidikan.'),
      ),
      const JudulBagian('Gambar promosi'),
      if (i > 0)
        ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.memory(base64Decode(g.substring(i + 1)), fit: BoxFit.contain))
      else
        Text('Belum ada gambar.', style: TextStyle(color: cs.onSurfaceVariant)),
      Wrap(spacing: 8, children: [
        OutlinedButton.icon(
          onPressed: () async {
            final f = await ambilFoto(bolehGaleri: true, context: context);
            if (f != null) setState(() { _gambarBaru = f; _hapusGambar = false; });
          },
          icon: const Icon(Icons.image_rounded),
          label: Text(i > 0 ? 'Ganti gambar' : 'Pilih gambar'),
        ),
        if (i > 0) TextButton(onPressed: () => setState(() { _gambarBaru = null; _hapusGambar = true; }), child: const Text('Hapus gambar')),
      ]),
      const JudulBagian('Teks (opsional)'),
      TextField(controller: _judul, decoration: const InputDecoration(labelText: 'Judul', isDense: true)),
      const SizedBox(height: 8),
      TextField(controller: _teks, maxLines: 3, decoration: const InputDecoration(labelText: 'Keterangan', isDense: true)),
      const JudulBagian('Tombol'),
      SegmentedButton<String>(
        segments: const [
          ButtonSegment(value: 'referral', label: Text('Buka Referral')),
          ButtonSegment(value: 'url', label: Text('Buka tautan')),
          ButtonSegment(value: 'tutup', label: Text('Tanpa tombol')),
        ],
        selected: {_aksi},
        onSelectionChanged: (s) => setState(() => _aksi = s.first),
      ),
      if (_aksi != 'tutup') ...[
        const SizedBox(height: 8),
        TextField(controller: _tombol, decoration: const InputDecoration(labelText: 'Tulisan tombol', isDense: true)),
      ],
      if (_aksi == 'url') ...[
        const SizedBox(height: 8),
        TextField(controller: _url, keyboardType: TextInputType.url, decoration: const InputDecoration(labelText: 'Tautan (https://...)', isDense: true)),
      ],
      const JudulBagian('Ditampilkan untuk'),
      SegmentedButton<String>(
        segments: const [ButtonSegment(value: 'semua', label: Text('Semua')), ButtonSegment(value: 'staf', label: Text('Staf')), ButtonSegment(value: 'siswa', label: Text('Siswa'))],
        selected: {_sasaran},
        onSelectionChanged: (s) => setState(() => _sasaran = s.first),
      ),
      const SizedBox(height: 20),
      FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), onPressed: _simpan, child: const Text('Simpan promosi')),
    ]);
  }
}
