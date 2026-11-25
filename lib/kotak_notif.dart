import 'package:flutter/material.dart';

import 'api.dart';
import 'honor/honor.dart';
import 'keuangan/keuangan.dart';
import 'keuangan/va_custom.dart';
import 'pemberitahuan.dart';
import 'induk/induk.dart' show DataIndukScreen;
import 'induk/pantauan_unit.dart';
import 'jadwal/agenda_lembaga.dart';
import 'referral/referral_admin.dart';
import 'screens/admin_lain.dart' show PengajuanTutorScreen;
import 'screens/ujian.dart' show KotakUjianScreen;
import 'siswa/aktivasi_qr.dart';
import 'siswa/pencapaian_siswa.dart';
import 'ujian/kelayakan.dart';
import 'ujian/masa_ujian.dart' show MasaUjianScreen;
import 'ujian/pengawas.dart' show PengawasScreen;
import 'ujian/tinjauan.dart' show TinjauanPelanggaranScreen;
import 'session.dart';
import 'siswa/sesi_siswa.dart';
import 'siswa/tagihan_siswa.dart';
import 'widgets.dart';

/// v1.50.0: lonceng notifikasi dengan angka belum dibaca. Ketuk -> kotak masuk.
class LoncengNotif extends StatelessWidget {
  const LoncengNotif({super.key, this.warna});
  final Color? warna;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<int>(
        valueListenable: Pemberitahuan.instance.belumDibaca,
        builder: (context, n, _) => IconButton(
          tooltip: 'Notifikasi',
          onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const KotakNotifScreen())),
          icon: Badge(
            isLabelVisible: n > 0,
            label: Text(n > 99 ? '99+' : '$n'),
            child: Icon(Icons.notifications_rounded, color: warna),
          ),
        ),
      );
}

IconData _ikonJenis(String j) => switch (j) {
      'pengumuman' => Icons.campaign_rounded,
      'tagihan_baru' || 'tagihan_ingat' || 'keringanan' => Icons.request_quote_rounded,
      'pembayaran_diterima' || 'bayar_online_masuk' => Icons.verified_rounded,
      'transfer_masuk' || 'transfer_ditolak' => Icons.fact_check_rounded,
      'honor_disetujui' || 'honor_dibayar' || 'honor_batal' || 'honor_perlu_setuju' => Icons.payments_rounded,
      'referral_baru' || 'referral_bukti' || 'tarik_menunggu' || 'tarik_disetujui' => Icons.campaign_outlined,
      'pajak_belum_setor' => Icons.receipt_rounded,
      'ringkasan_keuangan' => Icons.assessment_rounded,
      _ => Icons.notifications_rounded,
    };

Widget _bungkus(String judul, Widget isi) => Scaffold(appBar: AppBar(title: Text(judul)), body: isi);

/// Buka layar terkait notifikasi.
Future<void> bukaAksiNotif(BuildContext context, String aksi) async {
  final nav = Navigator.of(context);
  final siswa = SesiSiswa.instance.masuk;
  Widget? layar;
  switch (aksi) {
    case 'kelayakan':
      if (!siswa) layar = _bungkus('Analisa Kelayakan Ujian', const KelayakanScreen());
    case 'kelayakan_saya':
      if (siswa) layar = const KelayakanSiswaScreen();
    case 'tagihan_saya':
      if (siswa) layar = const TagihanSiswaScreen();
    case 'keuangan':
      if (!siswa) layar = _bungkus('Keuangan', const KeuanganScreen());
    case 'va_custom':
      if (!siswa) layar = _bungkus('Custom Transaction', const VaCustomScreen());
    case 'transfer':
      if (!siswa) layar = const TransferTagihanScreen();
    case 'referral_admin':
      if (!siswa) layar = _bungkus('Kelola Referral', const ReferralAdminScreen());
    case 'data_induk':   // v1.93.0: siswa baru lewat link referral lunas pendaftaran -> atur unit, rombel, label
      if (!siswa) layar = _bungkus('Data Induk', const DataIndukScreen());
    case 'kotak_ujian':
      if (!siswa) layar = _bungkus('Kotak Ujian', const KotakUjianScreen());
    case 'rekap_nilai':
      if (siswa) layar = const PencapaianSiswaScreen();
    case 'masa_ujian':
      if (!siswa) layar = const MasaUjianScreen();
    case 'pengawas_ujian':
      if (!siswa) layar = const PengawasScreen();
    case 'tinjau_ujian':
      if (!siswa) layar = const TinjauanPelanggaranScreen();
    case 'pengajuan_tutor':
      if (!siswa) layar = _bungkus('Pengajuan Tutor', const PengajuanTutorScreen());
    case 'agenda_lembaga':
      if (!siswa) layar = const AgendaLembagaScreen();
    case 'aktivasi_qr':
      if (!siswa) layar = _bungkus('Aktivasi QR Siswa', const AktivasiQrScreen());
    case 'pantauan_unit':
      if (!siswa) layar = const PantauanUnitScreen();
    case 'honor':
      if (!siswa) layar = Sesi.instance.peran == 'Tutor' ? _bungkus('Saldo Honor', const HonorSayaScreen()) : _bungkus('Rekap Honor', const RekapHonorScreen());
  }
  if (layar != null) await nav.push(MaterialPageRoute(builder: (_) => layar!));
}

/// v1.88.0: notifikasi dikelompokkan per tanggal. Layar utama hanya hari ini s.d. [_hariTampil] hari sebelumnya;
/// yang lebih lama masuk Inbox (layar yang sama dengan [inbox] = true).
const _hariTampil = 3;
const _namaHari = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const _namaBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/// Tanggal (tanpa jam) dari kolom waktu "yyyy-MM-dd HH:mm"; null bila tidak terbaca.
DateTime? _tglNotif(Map<String, dynamic> p) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(teks(p['waktu']).trim());
  if (m == null) return null;
  return DateTime(int.parse(m.group(1)!), int.parse(m.group(2)!), int.parse(m.group(3)!));
}

DateTime _hariIni() {
  final n = DateTime.now();
  return DateTime(n.year, n.month, n.day);
}

/// Masuk Inbox bila tanggalnya lebih lama dari [_hariTampil] hari sebelum hari ini. Tanggal tak terbaca tetap di layar utama.
bool _masukInbox(Map<String, dynamic> p) {
  final t = _tglNotif(p);
  return t != null && t.isBefore(_hariIni().subtract(const Duration(days: _hariTampil)));
}

String _judulTanggal(DateTime? t) {
  if (t == null) return 'Lainnya';
  final selisih = _hariIni().difference(t).inDays;
  if (selisih == 0) return 'Hari ini';
  if (selisih == 1) return 'Kemarin';
  return '${_namaHari[t.weekday - 1]}, ${t.day} ${_namaBulan[t.month - 1]} ${t.year}';
}

class KotakNotifScreen extends StatefulWidget {
  const KotakNotifScreen({super.key, this.inbox = false});

  /// true = layar Inbox (notifikasi lebih lama dari 3 hari).
  final bool inbox;

  @override
  State<KotakNotifScreen> createState() => _KotakNotifScreenState();
}

class _KotakNotifScreenState extends State<KotakNotifScreen> {
  int _v = 0;
  Set<String> _dibaca = {};

  Future<List<Map<String, dynamic>>> _muat() async {
    final p = await Pemberitahuan.instance.kotak();
    _dibaca = await Pemberitahuan.instance.dibaca();
    return p;
  }

  Future<void> _ketuk(Map<String, dynamic> p) async {
    final id = teks(p['id']);
    await Pemberitahuan.instance.tandaiDibaca([id]);
    if (!mounted) return;
    setState(() => _dibaca.add(id));
    final aksi = teks(p['aksi']);
    if (aksi.isNotEmpty) {
      await bukaAksiNotif(context, aksi);
      return;
    }
    await showDialog<void>(
      context: context,
      builder: (d) => AlertDialog(
        icon: Icon(_ikonJenis(teks(p['jenis']))),
        title: Text(teks(p['judul'], 'Pemberitahuan')),
        content: SingleChildScrollView(child: SelectableText(teks(p['isi']))),
        actions: [FilledButton(onPressed: () => Navigator.pop(d), child: const Text('Tutup'))],
      ),
    );
  }

  Future<void> _bukaInbox() async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => const KotakNotifScreen(inbox: true)));
    if (mounted) setState(() => _v++);
  }

  Widget _kartu(Map<String, dynamic> p, ColorScheme cs) {
    final dibaca = _dibaca.contains(teks(p['id']));
    final w = teks(p['waktu']).trim();
    final jam = _tglNotif(p) != null && w.length >= 16 ? w.substring(11, 16) : w;
    return Card(
      color: dibaca ? null : cs.primaryContainer.withValues(alpha: 0.45),
      child: ListTile(
        onTap: () => _ketuk(p),
        leading: Icon(_ikonJenis(teks(p['jenis'])), color: cs.primary),
        title: Text(teks(p['judul'], 'Pemberitahuan'), style: TextStyle(fontWeight: dibaca ? FontWeight.w500 : FontWeight.w800)),
        subtitle: Text('${teks(p['isi'])}\n$jam', maxLines: 3, overflow: TextOverflow.ellipsis),
        isThreeLine: true,
        trailing: teks(p['aksi']).isEmpty ? null : const Icon(Icons.chevron_right_rounded),
      ),
    );
  }

  /// Daftar yang dikelompokkan per tanggal (terbaru di atas), urutan dalam satu tanggal mengikuti server.
  List<Widget> _kelompok(List<Map<String, dynamic>> data, ColorScheme cs) {
    final grup = <String, List<Map<String, dynamic>>>{};
    final tgl = <String, DateTime?>{};
    for (final p in data) {
      final t = _tglNotif(p);
      final k = t == null ? '' : t.toIso8601String();
      (grup[k] ??= []).add(p);
      tgl[k] = t;
    }
    final kunci = grup.keys.toList()
      ..sort((a, b) => a.isEmpty ? 1 : (b.isEmpty ? -1 : b.compareTo(a)));
    return [
      for (final k in kunci) ...[
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 14, 4, 6),
          child: Text(_judulTanggal(tgl[k]), style: TextStyle(fontWeight: FontWeight.w800, color: cs.primary)),
        ),
        for (final p in grup[k]!) _kartu(p, cs),
      ],
    ];
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final inbox = widget.inbox;
    return Scaffold(
      appBar: AppBar(title: Text(inbox ? 'Inbox Notifikasi' : 'Notifikasi'), actions: [
        TextButton(
          onPressed: () async {
            final semua = (await Pemberitahuan.instance.kotak()).where((p) => _masukInbox(p) == inbox);
            await Pemberitahuan.instance.tandaiDibaca(semua.map((p) => teks(p['id'])));
            if (mounted) setState(() => _v++);
          },
          child: const Text('Tandai semua dibaca'),
        ),
      ]),
      body: Muatan<List<Map<String, dynamic>>>(
        key: ValueKey(_v),
        muat: _muat,
        bangun: (context, semua, segarkan) {
          final data = semua.where((p) => _masukInbox(p) == inbox).toList();
          final lama = inbox ? const <Map<String, dynamic>>[] : semua.where(_masukInbox).toList();
          final lamaBaru = lama.where((p) => !_dibaca.contains(teks(p['id']))).length;
          return RefreshIndicator(
            onRefresh: segarkan,
            child: ListView(padding: const EdgeInsets.fromLTRB(12, 0, 12, 32), children: [
              if (data.isEmpty)
                Kosong(
                  pesan: inbox ? 'Inbox kosong.' : 'Tidak ada notifikasi dalam $_hariTampil hari terakhir.',
                  ikon: Icons.notifications_none_rounded,
                ),
              ..._kelompok(data, cs),
              if (lama.isNotEmpty) ...[
                const SizedBox(height: 16),
                Card(
                  child: ListTile(
                    onTap: _bukaInbox,
                    leading: Icon(Icons.inbox_rounded, color: cs.primary),
                    title: Text('Inbox (${lama.length})', style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('Notifikasi lebih dari $_hariTampil hari lalu${lamaBaru > 0 ? ' · $lamaBaru belum dibaca' : ''}'),
                    trailing: const Icon(Icons.chevron_right_rounded),
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
