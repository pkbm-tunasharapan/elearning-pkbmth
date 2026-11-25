import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

import '../absensi/umum.dart';
import '../api.dart';
import '../berkas.dart';
import '../config.dart';
import '../keuangan/kwitansi.dart';
import '../widgets.dart';
import 'referral.dart';

/// v1.93.0: pendaftaran peserta didik lewat link referral pribadi promotor.
/// - Halaman publik (web, tanpa login): ?daftar=KODE (formulir) dan ?pendaftaran=KODESTATUS (status, dokumen, konfirmasi bayar, kwitansi).
/// - Promotor: bagikan link, tinjau berkas + atur biaya + tanda tangan, teruskan konfirmasi pembayaran.
/// - Admin / KS: setujui atau tolak; Bendahara & Admin memverifikasi pembayaran di Tagihan → Bukti transfer.

Color warnaTahap(BuildContext c, String s) => switch (s) {
      'Diterima' => Colors.green,
      'Ditolak' => Theme.of(c).colorScheme.error,
      'Menunggu Promotor' || 'Konfirmasi Bayar' => const Color(0xFFD08A1E),
      'Menunggu Persetujuan' || 'Verifikasi Bayar' => const Color(0xFF7C3AED),
      'Menunggu Pembayaran' => const Color(0xFF3B82F6),
      _ => Theme.of(c).colorScheme.outline,
    };

/// Kode dari alamat web (?daftar= / ?pendaftaran=). Kosong di aplikasi Android.
String kodeDaftarDariUrl() => Uri.base.queryParameters['daftar']?.trim().toUpperCase() ?? '';
String kodeStatusDariUrl() => Uri.base.queryParameters['pendaftaran']?.trim().toUpperCase() ?? '';

// ───────────────────────── promotor: bagikan link ─────────────────────────

Future<void> bagikanLinkSaya(BuildContext context, String token) async {
  final r = await jalankan(context, () async => peta(await Api.instance('waRefLinkSaya', [token])), teksProses: 'Menyiapkan link...');
  if (!r.ok || !context.mounted) return;
  final d = r.data!;
  final link = teks(kBeta ? d['linkBeta'] : d['link']);
  final pesan = 'Daftar sekolah kesetaraan (Paket A/B/C) di PKBM Tunas Harapan lewat link ini: $link';
  await showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (c) => Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Link pendaftaran Anda', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
        const SizedBox(height: 6),
        Text('Kirim link ini ke calon peserta. Siapa pun yang mendaftar lewat link ini tercatat sebagai rekomendasi Anda. '
            'Biaya tidak terlihat oleh pendaftar; Anda mengaturnya saat meninjau.', style: TextStyle(fontSize: 13, color: Theme.of(c).colorScheme.onSurfaceVariant)),
        const SizedBox(height: 12),
        SelectableText(link, style: const TextStyle(fontWeight: FontWeight.w700)),
        Text('Kode: ${teks(d['kode'])}', style: const TextStyle(fontSize: 12)),
        const SizedBox(height: 10),
        Text('Biaya resmi: pendaftaran ${rpRef(d['resmiDaftar'])} · pendidikan Paket A ${rpRef(peta(d['didik'])['A'])}, B ${rpRef(peta(d['didik'])['B'])}, '
            'C ${rpRef(peta(d['didik'])['C'])} (bila dikenakan). Saldo Anda: cashback ${rpRef(d['cashback'])} + selisih di atas biaya resmi.',
            style: const TextStyle(fontSize: 12.5)),
        const SizedBox(height: 14),
        Wrap(spacing: 8, runSpacing: 8, children: [
          FilledButton.icon(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: link));
              if (c.mounted) kabar(c, 'Link disalin.');
            },
            icon: const Icon(Icons.copy_rounded),
            label: const Text('Salin link'),
          ),
          OutlinedButton.icon(onPressed: () => SharePlus.instance.share(ShareParams(text: pesan)), icon: const Icon(Icons.share_rounded), label: const Text('Bagikan')),
        ]),
      ]),
    ),
  );
}

// ───────────────────────── publik: formulir ─────────────────────────

class LinkPendaftaranScreen extends StatelessWidget {
  const LinkPendaftaranScreen({super.key, required this.kode});
  final String kode;

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      muat: () async => peta(await Api.instance('waRlInfo', [kode])),
      bangun: (context, d, _) => _AwalDaftar(kode: kode, info: d),
    );
  }
}

class _AwalDaftar extends StatefulWidget {
  const _AwalDaftar({required this.kode, required this.info});
  final String kode;
  final Map<String, dynamic> info;

  @override
  State<_AwalDaftar> createState() => _AwalDaftarState();
}

class _AwalDaftarState extends State<_AwalDaftar> {
  Map<String, dynamic>? _hasil;

  Future<void> _isi() async {
    final h = await Navigator.of(context).push<Map<String, dynamic>>(
        MaterialPageRoute(builder: (_) => FormPendaftaranRef(token: '', konteks: widget.info, kodeLink: widget.kode)));
    if (h != null && mounted) setState(() => _hasil = h);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final h = _hasil;
    return Scaffold(
      appBar: AppBar(automaticallyImplyLeading: false, title: Text('Pendaftaran ${teks(widget.info['lembaga'], 'PKBM Tunas Harapan')}')),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 16, 20, 32), children: [
        if (h == null) ...[
          Icon(Icons.school_rounded, size: 64, color: cs.primary),
          const SizedBox(height: 10),
          Text('Selamat datang!', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 6),
          Text('Anda direkomendasikan oleh ${teks(widget.info['promotor'])}. Siapkan foto/scan KK, pas foto, KTP atau akta, ijazah terakhir, '
              'dan rapor terakhir (dianjurkan untuk kelas 6, 9, 12). Isian bertanda * wajib diisi.', textAlign: TextAlign.center),
          const SizedBox(height: 20),
          FilledButton.icon(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)), onPressed: _isi, icon: const Icon(Icons.edit_note_rounded), label: const Text('Isi formulir pendaftaran')),
        ] else ...[
          const Icon(Icons.check_circle_rounded, size: 72, color: Colors.green),
          const SizedBox(height: 10),
          Text('Pendaftaran terkirim', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text('Nomor pendaftaran ${teks(h['id'])}. Data Anda sedang diperiksa oleh ${teks(h['promotor'])}. Kabar selanjutnya dikirim ke e-mail Anda.',
              textAlign: TextAlign.center),
          const SizedBox(height: 16),
          Card(
            child: ListTile(
              leading: const Icon(Icons.key_rounded),
              title: const Text('Kode status pendaftaran'),
              subtitle: SelectableText(teks(h['kodeStatus']), style: const TextStyle(fontWeight: FontWeight.w800, letterSpacing: 1)),
              trailing: IconButton(
                tooltip: 'Salin',
                icon: const Icon(Icons.copy_rounded),
                onPressed: () async {
                  await Clipboard.setData(ClipboardData(text: teks(h['kodeStatus'])));
                  if (context.mounted) kabar(context, 'Kode disalin. Simpan kode ini.');
                },
              ),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton.tonalIcon(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => StatusPendaftaranScreen(kodeStatus: teks(h['kodeStatus'])))),
            icon: const Icon(Icons.fact_check_rounded),
            label: const Text('Lihat status pendaftaran'),
          ),
        ],
      ]),
    );
  }
}

// ───────────────────────── publik: status pendaftar ─────────────────────────

class StatusPendaftaranScreen extends StatefulWidget {
  const StatusPendaftaranScreen({super.key, required this.kodeStatus});
  final String kodeStatus;

  @override
  State<StatusPendaftaranScreen> createState() => _StatusPendaftaranScreenState();
}

class _StatusPendaftaranScreenState extends State<StatusPendaftaranScreen> {
  int _v = 0;

  Future<void> _dokumen(String jenis, String nama) =>
      lihatBerkasRef(context, () => Api.instance('waRlDokumen', [widget.kodeStatus, jenis], const Duration(minutes: 2)));

  Future<void> _konfirmasi(Map<String, dynamic> d) async {
    final ok = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => _KonfirmasiBayar(kodeStatus: widget.kodeStatus, d: d)));
    if (ok == true && mounted) setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Status pendaftaran')),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_v),
        muat: () async => peta(await Api.instance('waRlStatus', [widget.kodeStatus])),
        bangun: (context, d, segarkan) {
          final tahap = teks(d['tahap']);
          final tagihan = daftar(d['tagihan']).map(peta).toList();
          final dok = daftar(d['dokumen']).map(teks).toList();
          final bayar = daftar(d['pembayaran']).map(peta).toList();
          final kon = daftar(d['konfirmasi']).map(peta).toList();
          final penjelasan = switch (tahap) {
            'Menunggu Promotor' => 'Data Anda sedang diperiksa oleh ${teks(d['promotor'])}.',
            'Menunggu Persetujuan' => 'Data sudah diperiksa dan menunggu persetujuan pimpinan.',
            'Menunggu Pembayaran' => 'Pendaftaran DITERIMA. Unduh surat & rincian biaya, lakukan pembayaran, lalu kirim konfirmasi.',
            'Konfirmasi Bayar' => 'Konfirmasi pembayaran Anda sedang diperiksa ${teks(d['promotor'])}.',
            'Verifikasi Bayar' => 'Pembayaran sedang diverifikasi bendahara.',
            'Diterima' => 'Biaya pendaftaran lunas. Petugas segera mengatur kelas Anda dan memberi tahu cara masuk ke aplikasi.',
            'Ditolak' => 'Pendaftaran tidak dapat diproses${teks(d['catatan']).isEmpty ? '' : ': ${teks(d['catatan'])}'}.',
            _ => '',
          };
          return RefreshIndicator(
            onRefresh: segarkan,
            child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
              Text(teks(d['nama']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
              Text('${teks(d['id'])} · ${teks(d['program'])} · kelas ${teks(d['kelas'])}', style: TextStyle(color: cs.onSurfaceVariant)),
              const SizedBox(height: 10),
              Card(
                color: warnaTahap(context, tahap).withValues(alpha: 0.10),
                child: ListTile(
                  leading: Icon(Icons.flag_rounded, color: warnaTahap(context, tahap)),
                  title: Text(tahap, style: TextStyle(fontWeight: FontWeight.w800, color: warnaTahap(context, tahap))),
                  subtitle: Text(penjelasan),
                ),
              ),
              if (dok.isNotEmpty) ...[
                const JudulBagian('Dokumen'),
                if (dok.contains('diterima'))
                  Card(child: ListTile(leading: const Icon(Icons.picture_as_pdf_rounded), title: const Text('Surat Pernyataan Diterima'), onTap: () => _dokumen('diterima', 'Surat'))),
                if (dok.contains('biaya'))
                  Card(child: ListTile(leading: const Icon(Icons.picture_as_pdf_rounded), title: const Text('Rincian Biaya'), onTap: () => _dokumen('biaya', 'Rincian'))),
              ],
              if (tagihan.isNotEmpty) ...[
                const JudulBagian('Tagihan'),
                for (final t in tagihan)
                  Card(
                    child: ListTile(
                      title: Text(t['jenis'] == 'daftar' ? 'Biaya pendaftaran (wajib lunas)' : 'Biaya pendidikan'),
                      subtitle: Text('${rpRef(t['jumlah'])} · dibayar ${rpRef(t['dibayar'])}'
                          '${teks(t['jatuhTempo']).isEmpty ? '' : ' · ${t['jenis'] == 'daftar' ? 'paling lambat' : 'rencana bayar'} ${tglIndo(teks(t['jatuhTempo']))}'}'),
                      trailing: Lencana(teks(t['status']), warna: teks(t['status']) == 'Lunas' ? Colors.green : cs.error),
                    ),
                  ),
                for (final r in daftar(d['rekening']).map(peta))
                  Text('Transfer: ${teks(r['bank'])} · ${teks(r['nomor'])} a.n. ${teks(r['atasNama'])}', style: const TextStyle(fontSize: 12.5)),
                const SizedBox(height: 8),
                if (d['bolehKonfirmasi'] == true)
                  FilledButton.icon(onPressed: () => _konfirmasi(d), icon: const Icon(Icons.verified_rounded), label: const Text('Konfirmasi pembayaran')),
              ],
              if (kon.isNotEmpty) ...[
                const JudulBagian('Riwayat konfirmasi'),
                for (final k in kon)
                  ListTile(
                    dense: true,
                    title: Text('${rpRef(k['jumlah'])} · ${teks(k['metode'])} · ${teks(k['waktu'])}'),
                    subtitle: teks(k['catatan']).isEmpty ? null : Text(teks(k['catatan'])),
                    trailing: Text(teks(k['status']), style: const TextStyle(fontSize: 12)),
                  ),
              ],
              if (bayar.isNotEmpty) ...[
                const JudulBagian('Kwitansi'),
                for (final b in bayar)
                  Card(
                    child: ListTile(
                      leading: const Icon(Icons.receipt_long_rounded),
                      title: Text(rpRef(b['jumlah'])),
                      subtitle: Text(teks(b['tanggal'])),
                      trailing: const Icon(Icons.download_rounded),
                      onTap: () => cetakKwitansi(context, [teks(b['id'])], kodePendaftaran: widget.kodeStatus),
                    ),
                  ),
              ],
            ]),
          );
        },
      ),
    );
  }
}

class _KonfirmasiBayar extends StatefulWidget {
  const _KonfirmasiBayar({required this.kodeStatus, required this.d});
  final String kodeStatus;
  final Map<String, dynamic> d;

  @override
  State<_KonfirmasiBayar> createState() => _KonfirmasiBayarState();
}

class _KonfirmasiBayarState extends State<_KonfirmasiBayar> {
  final _jumlah = TextEditingController();
  final _catatan = TextEditingController();
  String _metode = 'Transfer', _rekening = '';
  String? _bukti;

  num get _sisa => daftar(widget.d['tagihan']).map(peta).fold<num>(0, (a, t) => a + angka(t['sisa']));

  @override
  void initState() {
    super.initState();
    _jumlah.text = '${_sisa.round()}';
  }

  @override
  void dispose() {
    _jumlah.dispose();
    _catatan.dispose();
    super.dispose();
  }

  Future<void> _kirim() async {
    final j = num.tryParse(_jumlah.text.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
    if (j <= 0) return kabar(context, 'Isi jumlah yang dibayar.', galat: true);
    if (_metode == 'Transfer' && _bukti == null) return kabar(context, 'Unggah foto bukti transfer.', galat: true);
    final r = await jalankan(
        context,
        () async => peta(await Api.instance('waRlKonfirmasi',
            [widget.kodeStatus, {'jumlah': j, 'metode': _metode, 'rekening': _rekening, 'bukti': _bukti, 'catatan': _catatan.text.trim()}], const Duration(minutes: 2))),
        teksProses: 'Mengirim konfirmasi...');
    if (r.ok && mounted) {
      kabar(context, teks(r.data!['pesan'], 'Konfirmasi terkirim.'));
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rek = daftar(widget.d['rekening']).map(peta).map((r) => '${teks(r['bank'])} · ${teks(r['nomor'])} a.n. ${teks(r['atasNama'])}').toList();
    if (_rekening.isEmpty && rek.isNotEmpty) _rekening = rek.first;
    return Scaffold(
      appBar: AppBar(title: const Text('Konfirmasi pembayaran')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
        Text('Sisa tagihan ${rpRef(_sisa)}. Konfirmasi dikirim ke promotor Anda untuk diteruskan ke bendahara.', style: const TextStyle(fontSize: 13)),
        const SizedBox(height: 12),
        SegmentedButton<String>(
          segments: const [ButtonSegment(value: 'Transfer', label: Text('Transfer')), ButtonSegment(value: 'Tunai', label: Text('Tunai ke promotor/sekretariat'))],
          selected: {_metode},
          onSelectionChanged: (s) => setState(() => _metode = s.first),
        ),
        const SizedBox(height: 12),
        TextField(controller: _jumlah, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Jumlah yang dibayar (Rp)', isDense: true)),
        if (_metode == 'Transfer') ...[
          const SizedBox(height: 10),
          if (rek.isNotEmpty)
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _rekening,
              decoration: const InputDecoration(labelText: 'Rekening tujuan', isDense: true),
              items: [for (final r in rek) DropdownMenuItem(value: r, child: Text(r, overflow: TextOverflow.ellipsis))],
              onChanged: (v) => setState(() => _rekening = v ?? ''),
            ),
          const SizedBox(height: 10),
          Card(
            child: ListTile(
              leading: Icon(_bukti == null ? Icons.upload_file_rounded : Icons.check_circle_rounded, color: _bukti == null ? null : Colors.green),
              title: const Text('Foto bukti transfer *'),
              subtitle: Text(_bukti == null ? 'Dari kamera atau galeri' : 'Siap dikirim'),
              onTap: () async {
                final f = await ambilFoto(bolehGaleri: true, context: context);
                if (f != null && mounted) setState(() => _bukti = f);
              },
            ),
          ),
        ],
        const SizedBox(height: 10),
        TextField(controller: _catatan, maxLines: 2, decoration: const InputDecoration(labelText: 'Catatan (opsional)', isDense: true)),
        const SizedBox(height: 16),
        FilledButton.icon(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: _kirim, icon: const Icon(Icons.send_rounded), label: const Text('Kirim konfirmasi')),
      ]),
    );
  }
}

// ───────────────────────── promotor: tinjau & teruskan pembayaran ─────────────────────────

class TinjauLinkScreen extends StatefulWidget {
  const TinjauLinkScreen({super.key, required this.token, required this.id});
  final String token;
  final String id;

  @override
  State<TinjauLinkScreen> createState() => _TinjauLinkScreenState();
}

class _TinjauLinkScreenState extends State<TinjauLinkScreen> {
  int _v = 0;
  final _daftar = TextEditingController(), _didik = TextEditingController(), _catatan = TextEditingController();
  String _jadwal = '';
  String? _ttd;
  bool _isi = false;

  @override
  void dispose() {
    _daftar.dispose();
    _didik.dispose();
    _catatan.dispose();
    super.dispose();
  }

  num _angkaDari(TextEditingController c) => num.tryParse(c.text.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;

  Future<void> _kirim(Map<String, dynamic> d) async {
    final bw = peta(d['bawaan']);
    if (_angkaDari(_daftar) < angka(bw['daftar'])) return kabar(context, 'Biaya pendaftaran tidak boleh di bawah ${rpRef(bw['daftar'])}.', galat: true);
    if (bw['wajibPendidikan'] == true) {
      if (_angkaDari(_didik) < angka(bw['pendidikan'])) return kabar(context, 'Biaya pendidikan tidak boleh di bawah ${rpRef(bw['pendidikan'])}.', galat: true);
      if (_jadwal.isEmpty) return kabar(context, 'Pilih tanggal rencana pembayaran biaya pendidikan.', galat: true);
    }
    if (_ttd == null) return kabar(context, 'Tanda tangani dulu.', galat: true);
    if (!await konfirmasi(context, 'Kirim ke pimpinan?', 'Berkas dinyatakan sesuai. Biaya: pendaftaran ${rpRef(_angkaDari(_daftar))}'
        '${bw['wajibPendidikan'] == true ? ', pendidikan ${rpRef(_angkaDari(_didik))} (rencana bayar ${tglIndo(_jadwal)})' : ''}. Admin/KS akan menyetujui.', ya: 'Kirim')) {
      return;
    }
    if (!mounted) return;
    final r = await jalankan(
        context,
        () => Api.instance('waRefTinjauKirim', [
              widget.token,
              widget.id,
              {'biayaDaftar': _angkaDari(_daftar), 'biayaPendidikan': _angkaDari(_didik), 'jadwalPendidikan': _jadwal, 'catatan': _catatan.text.trim(), 'ttd': _ttd}
            ], const Duration(minutes: 2)),
        teksProses: 'Mengirim...');
    if (r.ok && mounted) {
      kabar(context, 'Terkirim ke Admin, Kepala Sekolah, dan Bendahara.');
      Navigator.pop(context, true);
    }
  }

  Future<void> _tolak() async {
    final c = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (dl) => AlertDialog(
        title: const Text('Tolak pendaftaran?'),
        content: TextField(controller: c, maxLines: 3, decoration: const InputDecoration(labelText: 'Alasan (dikirim ke e-mail pendaftar)')),
        actions: [TextButton(onPressed: () => Navigator.pop(dl, false), child: const Text('Batal')), FilledButton(onPressed: () => Navigator.pop(dl, true), child: const Text('Tolak'))],
      ),
    );
    final a = c.text.trim();
    c.dispose();
    if (ok != true || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waRefTinjauTolak', [widget.token, widget.id, a]));
    if (r.ok && mounted) Navigator.pop(context, true);
  }

  Future<void> _teruskan(Map<String, dynamic> k, bool terima) async {
    String alasan = '';
    if (!terima) {
      final c = TextEditingController();
      final ok = await showDialog<bool>(
        context: context,
        builder: (dl) => AlertDialog(
          title: const Text('Kembalikan konfirmasi?'),
          content: TextField(controller: c, maxLines: 3, decoration: const InputDecoration(labelText: 'Alasan (mis. bukti tidak terbaca)')),
          actions: [TextButton(onPressed: () => Navigator.pop(dl, false), child: const Text('Batal')), FilledButton(onPressed: () => Navigator.pop(dl, true), child: const Text('Kembalikan'))],
        ),
      );
      alasan = c.text.trim();
      c.dispose();
      if (ok != true) return;
    } else if (!await konfirmasi(context, 'Teruskan ke bendahara?', '${rpRef(k['jumlah'])} (${teks(k['metode'])}). Dibagi otomatis: biaya pendaftaran dilunasi lebih dulu, sisanya ke biaya pendidikan.',
        ya: 'Teruskan')) {
      return;
    }
    if (!mounted) return;
    final r = await jalankan(context, () => Api.instance('waRefKonfirmasiTeruskan', [widget.token, widget.id, {'idKonfirmasi': k['id'], 'terima': terima, 'alasan': alasan}]));
    if (r.ok && mounted) {
      kabar(context, terima ? 'Diteruskan ke bendahara untuk diverifikasi.' : 'Konfirmasi dikembalikan ke pendaftar.');
      setState(() => _v++);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Tinjau pendaftar')),
      body: Muatan<Map<String, dynamic>>(
        key: ValueKey(_v),
        muat: () async => peta(await Api.instance('waRefTinjau', [widget.token, widget.id], const Duration(minutes: 1))),
        bangun: (context, d, segarkan) {
          final bw = peta(d['bawaan']);
          final data = peta(d['data']);
          final tahap = teks(d['tahap']);
          if (!_isi && tahap == 'Menunggu Promotor') {
            _isi = true;
            _daftar.text = '${angka(bw['daftar'])}';
            _didik.text = '${angka(bw['pendidikan'])}';
          }
          final kon = daftar(d['konfirmasi']).map(peta).toList();
          return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Text(teks(d['nama']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            Text('${teks(d['id'])} · ${teks(d['program'])} · kelas ${teks(d['kelas'])}${d['kelasAkhir'] == true ? ' (kelas akhir)' : ''}', style: TextStyle(color: cs.onSurfaceVariant)),
            const SizedBox(height: 6),
            Lencana(tahap, warna: warnaTahap(context, tahap)),
            const JudulBagian('Data pendaftar'),
            Text('NIK ${teks(data['nik'])} · lahir ${teks(data['tempatLahir'])}, ${tglIndo(teks(data['tanggalLahir']))}\n'
                'HP ${teks(d['hp'])} · ${teks(d['email'])}\nAlamat: ${teks(data['alamat'])}\nIbu: ${teks(data['ibuNama'])} · sekolah asal: ${teks(data['sekolahAsal'], '-')}',
                style: const TextStyle(fontSize: 13)),
            const JudulBagian('Berkas'),
            Wrap(spacing: 8, runSpacing: 6, children: [
              for (final b in daftar(d['berkas']).map(teks))
                OutlinedButton.icon(
                  onPressed: () => lihatBerkasRef(context, () => Api.instance('waRefBerkas', [widget.token, widget.id, b], const Duration(minutes: 2))),
                  icon: const Icon(Icons.visibility_rounded, size: 18),
                  label: Text(b),
                ),
            ]),
            if (d['kelasAkhir'] == true && !daftar(d['berkas']).map(teks).contains('rapor'))
              Padding(padding: const EdgeInsets.only(top: 6), child: Text('Rapor belum diunggah (dianjurkan untuk kelas akhir).', style: TextStyle(color: cs.error, fontSize: 12.5))),
            if (tahap == 'Menunggu Promotor') ...[
              const JudulBagian('Biaya & teknis pembayaran', sub: 'Hanya terlihat oleh Anda dan petugas; tidak ditampilkan kepada pendaftar sebelum disetujui'),
              TextField(controller: _daftar, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: 'Biaya pendaftaran (min. ${rpRef(bw['daftar'])}) · wajib lunas', isDense: true)),
              const SizedBox(height: 10),
              if (bw['wajibPendidikan'] == true) ...[
                Text('Biaya pendidikan dikenakan: ${teks(bw['alasan'])}.', style: const TextStyle(fontSize: 12.5)),
                const SizedBox(height: 6),
                TextField(controller: _didik, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: 'Biaya pendidikan Paket ${teks(d['paket'])} (min. ${rpRef(bw['pendidikan'])})', isDense: true)),
                const SizedBox(height: 6),
                OutlinedButton.icon(
                  onPressed: () async {
                    final n = DateTime.now();
                    final p = await showDatePicker(context: context, firstDate: n, lastDate: DateTime(n.year + 2), initialDate: n.add(const Duration(days: 30)));
                    if (p != null) setState(() => _jadwal = tglIso(p));
                  },
                  icon: const Icon(Icons.event_rounded),
                  label: Text(_jadwal.isEmpty ? 'Kapan biaya pendidikan akan dibayar? *' : 'Rencana bayar: ${tglIndo(_jadwal)}'),
                ),
              ] else
                Text('Biaya pendidikan tidak dikenakan (${teks(bw['alasan'])}).', style: const TextStyle(fontSize: 12.5)),
              const SizedBox(height: 10),
              Text('Saldo Anda saat biaya pendaftaran lunas: cashback ${rpRef(bw['cashback'])} + selisih di atas biaya resmi.', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant)),
              const SizedBox(height: 10),
              TextField(controller: _catatan, maxLines: 2, decoration: const InputDecoration(labelText: 'Catatan untuk pimpinan (opsional)', isDense: true)),
              const SizedBox(height: 10),
              Card(
                child: ListTile(
                  leading: Icon(_ttd == null ? Icons.draw_rounded : Icons.check_circle_rounded, color: _ttd == null ? null : Colors.green),
                  title: const Text('Tanda tangan promotor *'),
                  subtitle: Text(_ttd == null ? 'Menyatakan berkas sudah diperiksa dan sesuai' : 'Sudah ditandatangani'),
                  onTap: () async {
                    final png = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => const PadTandaTangan()));
                    if (png != null && mounted) setState(() => _ttd = png);
                  },
                ),
              ),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(child: OutlinedButton.icon(onPressed: _tolak, icon: const Icon(Icons.close_rounded), label: const Text('Tolak'))),
                const SizedBox(width: 10),
                Expanded(flex: 2, child: FilledButton.icon(onPressed: () => _kirim(d), icon: const Icon(Icons.send_rounded), label: const Text('Tanda tangani & kirim'))),
              ]),
            ] else ...[
              const JudulBagian('Biaya'),
              Text('Pendaftaran ${rpRef(d['biayaDaftar'])}${angka(d['biayaPendidikan']) > 0 ? ' · pendidikan ${rpRef(d['biayaPendidikan'])} (rencana bayar ${tglIndo(teks(d['jadwalPendidikan']))})' : ''}'),
              if (teks(d['catatanPutusan']).isNotEmpty) Text('Catatan pimpinan: ${teks(d['catatanPutusan'])}', style: const TextStyle(fontSize: 12.5)),
              for (final t in daftar(d['tagihan']).map(peta))
                ListTile(
                  dense: true,
                  title: Text(teks(t['nama'])),
                  subtitle: Text('${rpRef(t['jumlah'])} · dibayar ${rpRef(t['dibayar'])}'),
                  trailing: Lencana(teks(t['status']), warna: teks(t['status']) == 'Lunas' ? Colors.green : cs.error),
                ),
            ],
            if (kon.isNotEmpty) ...[
              const JudulBagian('Konfirmasi pembayaran dari pendaftar'),
              for (final k in kon)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${rpRef(k['jumlah'])} · ${teks(k['metode'])} · ${teks(k['waktu'])}', style: const TextStyle(fontWeight: FontWeight.w700)),
                      if (teks(k['rekening']).isNotEmpty) Text('Ke ${teks(k['rekening'])}', style: const TextStyle(fontSize: 12.5)),
                      if (teks(k['catatan']).isNotEmpty) Text(teks(k['catatan']), style: const TextStyle(fontSize: 12.5)),
                      Text('Status: ${teks(k['status'])}', style: const TextStyle(fontSize: 12.5)),
                      Wrap(spacing: 8, children: [
                        if (k['adaBukti'] == true)
                          TextButton.icon(
                            onPressed: () => lihatBerkasRef(context, () => Api.instance('waRefKonfirmasiBukti', [widget.token, widget.id, k['id']])),
                            icon: const Icon(Icons.image_rounded, size: 18),
                            label: const Text('Bukti'),
                          ),
                        if (teks(k['status']) == 'Menunggu Promotor') ...[
                          OutlinedButton(onPressed: () => _teruskan(k, false), child: const Text('Kembalikan')),
                          FilledButton(onPressed: () => _teruskan(k, true), child: const Text('Teruskan ke bendahara')),
                        ],
                      ]),
                    ]),
                  ),
                ),
            ],
          ]);
        },
      ),
    );
  }
}

// ───────────────────────── Admin / KS / Bendahara ─────────────────────────

class AdminPendaftaranLinkScreen extends StatefulWidget {
  const AdminPendaftaranLinkScreen({super.key, required this.token});
  final String token;

  @override
  State<AdminPendaftaranLinkScreen> createState() => _AdminPendaftaranLinkScreenState();
}

class _AdminPendaftaranLinkScreenState extends State<AdminPendaftaranLinkScreen> {
  String _tahap = 'aktif';
  int _v = 0;

  @override
  Widget build(BuildContext context) {
    return Muatan<Map<String, dynamic>>(
      key: ValueKey('$_tahap|$_v'),
      muat: () async => peta(await Api.instance('waStafRefVerifLinkDaftar', [widget.token, {'tahap': _tahap}], const Duration(minutes: 1))),
      bangun: (context, d, segarkan) {
        final data = daftar(d['data']).map(peta).toList();
        return RefreshIndicator(
          onRefresh: segarkan,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Wrap(spacing: 6, runSpacing: 6, children: [
              for (final t in const ['aktif', 'Menunggu Persetujuan', 'Menunggu Pembayaran', 'Diterima', 'Ditolak', ''])
                ChoiceChip(label: Text(t == 'aktif' ? 'Sedang berjalan' : (t.isEmpty ? 'Semua' : t)), selected: _tahap == t, onSelected: (_) => setState(() => _tahap = t)),
            ]),
            const SizedBox(height: 8),
            if (data.isEmpty) const Kosong(pesan: 'Belum ada pendaftaran lewat link.', ikon: Icons.link_rounded),
            for (final x in data)
              Card(
                child: ListTile(
                  title: Text(teks(x['nama']), style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text('${teks(x['program'])} · kelas ${teks(x['kelas'])} · promotor ${teks(x['promotor'])}\n${teks(x['waktu'])}'
                      '${angka(x['biayaDaftar']) > 0 ? ' · daftar ${rpRef(x['biayaDaftar'])}' : ''}${angka(x['biayaPendidikan']) > 0 ? ' · pendidikan ${rpRef(x['biayaPendidikan'])}' : ''}'),
                  isThreeLine: true,
                  trailing: Lencana(teks(x['tahap']), warna: warnaTahap(context, teks(x['tahap']))),
                  onTap: () async {
                    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => _DetailAdminLink(token: widget.token, id: teks(x['id']))));
                    if (mounted) setState(() => _v++);
                  },
                ),
              ),
          ]),
        );
      },
    );
  }
}

class _DetailAdminLink extends StatefulWidget {
  const _DetailAdminLink({required this.token, required this.id});
  final String token;
  final String id;

  @override
  State<_DetailAdminLink> createState() => _DetailAdminLinkState();
}

class _DetailAdminLinkState extends State<_DetailAdminLink> {
  Future<void> _putus(bool setuju) async {
    final c = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (dl) => AlertDialog(
        title: Text(setuju ? 'Setujui pendaftaran?' : 'Tolak pendaftaran?'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(setuju
              ? 'Peserta masuk Data Induk (status Calon), tagihan dibuat, dan pendaftar menerima Surat Pernyataan Diterima serta Rincian Biaya lewat e-mail.'
              : 'Pendaftar diberi tahu lewat e-mail.', style: const TextStyle(fontSize: 13)),
          TextField(controller: c, maxLines: 2, decoration: InputDecoration(labelText: setuju ? 'Catatan (opsional)' : 'Alasan penolakan')),
        ]),
        actions: [TextButton(onPressed: () => Navigator.pop(dl, false), child: const Text('Batal')), FilledButton(onPressed: () => Navigator.pop(dl, true), child: Text(setuju ? 'Setujui' : 'Tolak'))],
      ),
    );
    final a = c.text.trim();
    c.dispose();
    if (ok != true || !mounted) return;
    final r = await jalankan(context, () => Api.instance('waStafRefVerifLinkPutus', [widget.token, widget.id, setuju, a], const Duration(minutes: 3)), teksProses: setuju ? 'Menyetujui & membuat dokumen...' : 'Menolak...');
    if (r.ok && mounted) {
      kabar(context, setuju ? 'Disetujui. Dokumen dikirim ke e-mail pendaftar.' : 'Pendaftaran ditolak.');
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Pendaftaran lewat link')),
      body: Muatan<Map<String, dynamic>>(
        muat: () async => peta(await Api.instance('waStafRefVerifLinkDetail', [widget.token, widget.id], const Duration(minutes: 1))),
        bangun: (context, d, _) {
          final data = peta(d['data']);
          final bw = peta(d['bawaan']);
          return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: [
            Text(teks(d['nama']), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            Text('${teks(d['id'])} · ${teks(d['program'])} · kelas ${teks(d['kelas'])} · promotor ${teks(d['promotor'])}', style: TextStyle(color: cs.onSurfaceVariant)),
            const SizedBox(height: 6),
            Lencana(teks(d['tahap']), warna: warnaTahap(context, teks(d['tahap']))),
            const JudulBagian('Data'),
            Text('NIK ${teks(data['nik'])} · ${teks(data['jk'])} · lahir ${teks(data['tempatLahir'])}, ${tglIndo(teks(data['tanggalLahir']))}\n'
                'HP ${teks(d['hp'])} · ${teks(d['email'])}\nAlamat: ${teks(data['alamat'])}\nIbu: ${teks(data['ibuNama'])} · sekolah asal: ${teks(data['sekolahAsal'], '-')}',
                style: const TextStyle(fontSize: 13)),
            const JudulBagian('Berkas'),
            Wrap(spacing: 8, runSpacing: 6, children: [
              for (final b in [...daftar(d['berkas']).map(teks), if (angka(d['biayaDaftar']) > 0) 'ttdPromotor'])
                OutlinedButton.icon(
                  onPressed: () => lihatBerkasRef(context, () => Api.instance('waStafRefVerifLinkBerkas', [widget.token, widget.id, b], const Duration(minutes: 2))),
                  icon: const Icon(Icons.visibility_rounded, size: 18),
                  label: Text(b == 'ttdPromotor' ? 'TTD promotor' : b),
                ),
            ]),
            const JudulBagian('Biaya dari promotor'),
            Text('Pendaftaran ${rpRef(d['biayaDaftar'])} (resmi ${rpRef(bw['daftar'])})'
                '${angka(d['biayaDaftar']) > angka(bw['daftar']) ? ' · DI ATAS RESMI' : ''}'),
            Text(angka(d['biayaPendidikan']) > 0
                ? 'Pendidikan ${rpRef(d['biayaPendidikan'])} (bawaan ${rpRef(bw['pendidikan'])}) · rencana bayar ${tglIndo(teks(d['jadwalPendidikan']))}'
                    '${angka(d['biayaPendidikan']) > angka(bw['pendidikan']) ? ' · DI ATAS BAWAAN' : ''}'
                : 'Biaya pendidikan tidak dikenakan (${teks(bw['alasan'])}).'),
            if (teks(d['catatanPromotor']).isNotEmpty) Text('Catatan promotor: ${teks(d['catatanPromotor'])}', style: const TextStyle(fontSize: 12.5)),
            for (final t in daftar(d['tagihan']).map(peta))
              ListTile(dense: true, title: Text(teks(t['nama'])), subtitle: Text('${rpRef(t['jumlah'])} · dibayar ${rpRef(t['dibayar'])}'), trailing: Text(teks(t['status']))),
            const SizedBox(height: 16),
            if (d['bolehPutus'] == true)
              Row(children: [
                Expanded(child: OutlinedButton.icon(onPressed: () => _putus(false), icon: const Icon(Icons.close_rounded), label: const Text('Tolak'))),
                const SizedBox(width: 10),
                Expanded(flex: 2, child: FilledButton.icon(onPressed: () => _putus(true), icon: const Icon(Icons.verified_rounded), label: const Text('Setujui'))),
              ])
            else if (teks(d['tahap']) == 'Menunggu Persetujuan')
              Text('Persetujuan oleh Admin atau Kepala Sekolah.', style: TextStyle(color: cs.onSurfaceVariant)),
          ]);
        },
      ),
    );
  }
}
