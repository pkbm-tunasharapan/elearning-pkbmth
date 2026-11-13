import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'api.dart';
import 'config.dart';
import 'session.dart';
import 'siswa/kartu_siswa.dart';
import 'siswa/sesi_siswa.dart';
import 'theme.dart';
import 'widgets.dart';

/// Ucapan sesuai jam di HP: pagi 04.00–10.59, siang 11.00–14.59, sore 15.00–17.59, malam 18.00–03.59.
String sapaan([DateTime? t]) {
  final j = (t ?? DateTime.now()).hour;
  if (j >= 4 && j < 11) return 'Selamat pagi';
  if (j >= 11 && j < 15) return 'Selamat siang';
  if (j >= 15 && j < 18) return 'Selamat sore';
  return 'Selamat malam';
}

IconData ikonSapaan([DateTime? t]) {
  final j = (t ?? DateTime.now()).hour;
  if (j >= 4 && j < 11) return Icons.wb_twilight_rounded;
  if (j >= 11 && j < 15) return Icons.wb_sunny_rounded;
  if (j >= 15 && j < 18) return Icons.wb_cloudy_rounded;
  return Icons.nightlight_round;
}

/// Teks sapaan yang ikut berganti saat jam berganti (diperiksa tiap menit).
class TeksSapaan extends StatefulWidget {
  const TeksSapaan({super.key, this.style});
  final TextStyle? style;

  @override
  State<TeksSapaan> createState() => _TeksSapaanState();
}

class _TeksSapaanState extends State<TeksSapaan> {
  Timer? _t;
  String _s = sapaan();

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(minutes: 1), (_) {
      final baru = sapaan();
      if (baru != _s && mounted) setState(() => _s = baru);
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(ikonSapaan(), size: 16, color: widget.style?.color),
        const SizedBox(width: 6),
        Text('$_s,', style: widget.style),
      ]);
}

/// Profil akun yang sedang masuk (siswa atau staf): email, HP, foto.
class ProfilAkun extends ChangeNotifier {
  ProfilAkun._();
  static final ProfilAkun instance = ProfilAkun._();

  Map<String, dynamic> data = {};
  String _milik = '';

  bool get siswa => SesiSiswa.instance.masuk;
  String get foto => teks(data['foto']);

  String get _identitas => siswa ? 'S|${SesiSiswa.instance.token}' : (Sesi.instance.masuk ? 'P|${Sesi.instance.token}' : '');

  /// Memuat profil bila akun berganti. Galat diabaikan (avatar memakai inisial).
  Future<void> pastikan({bool paksa = false}) async {
    final id = _identitas;
    if (id.isEmpty) {
      if (data.isNotEmpty) {
        data = {};
        _milik = '';
        notifyListeners();
      }
      return;
    }
    if (!paksa && id == _milik && data.isNotEmpty) return;
    try {
      final r = siswa
          ? await Api.instance('waProfilSiswa', [SesiSiswa.instance.token])
          : await Api.instance('waStafProfilAkun', [Sesi.instance.token]);
      if (id != _identitas) return;
      data = peta(r);
      _milik = id;
      notifyListeners();
    } catch (_) {}
  }

  Future<void> simpan({required String email, required String hp, String? fotoBaru}) async {
    final isi = <String, dynamic>{'email': email, 'hp': hp, if (fotoBaru != null) 'foto': fotoBaru};
    final r = peta(siswa
        ? await Api.instance('waProfilSiswaSimpan', [SesiSiswa.instance.token, isi])
        : await Api.instance('waStafProfilAkunSimpan', [Sesi.instance.token, isi]));
    data = {...data, 'email': teks(r['email']), 'hp': teks(r['hp']), 'foto': teks(r['foto'])};
    notifyListeners();
  }

  void pasang(Map<String, dynamic> d) {
    data = d;
    notifyListeners();
  }

  void kosongkan() {
    data = {};
    _milik = '';
    notifyListeners();
  }
}

String inisial(String nama) {
  final b = nama.trim().split(RegExp(r'\s+')).where((x) => x.isNotEmpty && x != '-').toList();
  if (b.isEmpty) return '?';
  return (b.first[0] + (b.length > 1 ? b[1][0] : '')).toUpperCase();
}

ImageProvider? _gambar(String foto) {
  final i = foto.indexOf('base64,');
  if (i < 0) return null;
  try {
    return MemoryImage(base64Decode(foto.substring(i + 7)));
  } catch (_) {
    return null;
  }
}

/// Avatar akun yang sedang masuk: foto profil bila ada, selain itu inisial nama.
class AvatarAkun extends StatelessWidget {
  const AvatarAkun({super.key, this.radius = 24, this.terang = true, this.onTap});
  final double radius;
  final bool terang;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: ProfilAkun.instance,
      builder: (context, _) {
        final p = ProfilAkun.instance;
        final nama = p.siswa ? SesiSiswa.instance.nama : Sesi.instance.nama;
        final img = _gambar(p.foto);
        final cs = Theme.of(context).colorScheme;
        final av = CircleAvatar(
          radius: radius,
          backgroundColor: terang ? Colors.white.withValues(alpha: 0.25) : cs.primaryContainer,
          backgroundImage: img,
          child: img == null
              ? Text(inisial(nama), style: TextStyle(color: terang ? Colors.white : cs.onPrimaryContainer, fontWeight: FontWeight.w800, fontSize: radius * 0.7))
              : null,
        );
        return onTap == null ? av : InkWell(customBorder: const CircleBorder(), onTap: onTap, child: av);
      },
    );
  }
}

/// Halaman profil: foto, email, nomor HP, dan data akun.
class ProfilScreen extends StatefulWidget {
  const ProfilScreen({super.key, this.denganAppBar = true, this.onKeluar});
  final bool denganAppBar;
  final VoidCallback? onKeluar;

  @override
  State<ProfilScreen> createState() => _ProfilScreenState();
}

class _ProfilScreenState extends State<ProfilScreen> {
  final _email = TextEditingController();
  final _hp = TextEditingController();
  String? _fotoBaru;
  bool _memuat = true;
  bool _sibuk = false;
  String? _galat;

  ProfilAkun get p => ProfilAkun.instance;

  @override
  void initState() {
    super.initState();
    _muat();
  }

  Future<void> _muat() async {
    setState(() {
      _memuat = true;
      _galat = null;
    });
    try {
      final r = p.siswa
          ? await Api.instance('waProfilSiswa', [SesiSiswa.instance.token])
          : await Api.instance('waStafProfilAkun', [Sesi.instance.token]);
      p.pasang(peta(r));
      _email.text = teks(p.data['email']);
      _hp.text = teks(p.data['hp']);
    } on ApiException catch (e) {
      _galat = e.sesiHabis && p.siswa ? 'Sesi Anda sudah berakhir. Keluar lalu masuk kembali untuk mengubah profil.' : e.ramah;
    } finally {
      if (mounted) setState(() => _memuat = false);
    }
  }

  Future<void> _pilihFoto(ImageSource sumber) async {
    try {
      var x = await ImagePicker().pickImage(source: sumber, maxWidth: 256, maxHeight: 256, imageQuality: 70, preferredCameraDevice: CameraDevice.front);
      if (x == null) return;
      var b = await x.readAsBytes();
      if (b.length > 34000) {
        x = await ImagePicker().pickImage(source: sumber, maxWidth: 180, maxHeight: 180, imageQuality: 55);
        if (x == null) return;
        b = await x.readAsBytes();
      }
      if (b.length > 34000) {
        if (mounted) kabar(context, 'Foto terlalu besar. Pilih foto lain.', galat: true);
        return;
      }
      setState(() => _fotoBaru = 'data:image/jpeg;base64,${base64Encode(b)}');
    } catch (e) {
      if (mounted) kabar(context, 'Foto tidak bisa diambil: $e', galat: true);
    }
  }

  void _menuFoto() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.photo_camera_rounded), title: const Text('Ambil dengan kamera'), onTap: () {
            Navigator.pop(c);
            _pilihFoto(ImageSource.camera);
          }),
          ListTile(leading: const Icon(Icons.photo_library_rounded), title: const Text('Pilih dari galeri'), onTap: () {
            Navigator.pop(c);
            _pilihFoto(ImageSource.gallery);
          }),
          if (p.foto.isNotEmpty || (_fotoBaru ?? '').isNotEmpty)
            ListTile(leading: const Icon(Icons.delete_outline_rounded), title: const Text('Hapus foto'), onTap: () {
              Navigator.pop(c);
              setState(() => _fotoBaru = '');
            }),
          const SizedBox(height: 8),
        ]),
      ),
    );
  }

  Future<void> _simpan() async {
    final email = _email.text.trim();
    final hp = _hp.text.replaceAll(RegExp(r'[^\d+]'), '');
    if (email.isNotEmpty && !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(email)) return kabar(context, 'Alamat email belum benar.', galat: true);
    if (hp.isNotEmpty && !RegExp(r'^\+?\d{8,15}$').hasMatch(hp)) return kabar(context, 'Nomor HP harus 8 sampai 15 angka.', galat: true);
    setState(() => _sibuk = true);
    try {
      await p.simpan(email: email, hp: hp, fotoBaru: _fotoBaru);
      if (!mounted) return;
      setState(() => _fotoBaru = null);
      kabar(context, 'Profil disimpan.');
    } on ApiException catch (e) {
      if (mounted) kabar(context, e.ramah, galat: true);
    } finally {
      if (mounted) setState(() => _sibuk = false);
    }
  }

  String _tgl(String iso) {
    final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(iso);
    if (m == null) return iso;
    const b = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return '${int.parse(m[3]!)} ${b[int.parse(m[2]!) - 1]} ${m[1]}';
  }

  Widget _isi() {
    final cs = Theme.of(context).colorScheme;
    if (_memuat) return const Center(child: CircularProgressIndicator());
    if (_galat != null) return PesanGalat(pesan: _galat!, ulangi: _muat);
    final d = p.data;
    final siswa = p.siswa;
    final fotoTampil = _fotoBaru ?? p.foto;
    final img = _gambar(fotoTampil);
    final nama = teks(d['nama'], siswa ? SesiSiswa.instance.nama : Sesi.instance.nama);
    final info = <(IconData, String, String)>[
      if (siswa) ...[
        (Icons.school_rounded, 'Kelas', teks(d['namaRombel'], SesiSiswa.instance.namaRombel)),
        if (teks(d['tanggalLahir']).isNotEmpty) (Icons.cake_rounded, 'Tanggal lahir', _tgl(teks(d['tanggalLahir']))),
        if (teks(d['nisn']).isNotEmpty) (Icons.badge_rounded, 'NISN', teks(d['nisn'])),
        if (teks(d['terdaftar']).isNotEmpty) (Icons.event_available_rounded, 'Terdaftar', teks(d['terdaftar'])),
      ] else ...[
        (Icons.verified_user_rounded, 'Peran', teks(d['peran'], Sesi.instance.peran)),
        (Icons.menu_book_rounded, 'Mata pelajaran', '${Sesi.instance.jumlahMapel} mapel · ${Sesi.instance.jumlahRombel} rombel'),
      ],
    ];
    return ListView(padding: EdgeInsets.zero, children: [
      Container(
        padding: EdgeInsets.fromLTRB(20, widget.denganAppBar ? 20 : MediaQuery.of(context).padding.top + 20, 20, 28),
        decoration: const BoxDecoration(gradient: Gaya.gradasi, borderRadius: BorderRadius.vertical(bottom: Radius.circular(32))),
        child: Column(children: [
          Stack(children: [
            Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: 0.7), width: 3)),
              child: CircleAvatar(
                radius: 52,
                backgroundColor: Colors.white.withValues(alpha: 0.25),
                backgroundImage: img,
                child: img == null ? Text(inisial(nama), style: const TextStyle(color: Colors.white, fontSize: 34, fontWeight: FontWeight.w800)) : null,
              ),
            ),
            Positioned(
              right: 0,
              bottom: 0,
              child: Material(
                color: Colors.white,
                shape: const CircleBorder(),
                elevation: 3,
                child: IconButton(onPressed: _menuFoto, icon: Icon(Icons.photo_camera_rounded, color: cs.primary), tooltip: 'Ganti foto'),
              ),
            ),
          ]),
          const SizedBox(height: 12),
          Text(nama, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800)),
          Text(siswa ? 'Siswa · ${teks(d['namaRombel'], SesiSiswa.instance.namaRombel)}' : teks(d['peran'], Sesi.instance.peran),
              style: TextStyle(color: Colors.white.withValues(alpha: 0.85))),
          if (_fotoBaru != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_fotoBaru!.isEmpty ? 'Foto akan dihapus setelah disimpan.' : 'Foto baru belum disimpan.',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
            ),
        ]),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const JudulBagian('Kontak'),
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            maxLength: 120,
            decoration: const InputDecoration(labelText: 'Alamat email', prefixIcon: Icon(Icons.email_rounded), counterText: ''),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _hp,
            keyboardType: TextInputType.phone,
            maxLength: 16,
            decoration: const InputDecoration(labelText: 'Nomor HP / WhatsApp', hintText: '08xxxxxxxxxx', prefixIcon: Icon(Icons.phone_android_rounded), counterText: ''),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
            onPressed: _sibuk ? null : _simpan,
            icon: _sibuk ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.save_rounded),
            label: const Text('Simpan profil'),
          ),
          const JudulBagian('Data akun'),
          Card(
            child: Column(children: [
              for (final x in info) ListTile(leading: Icon(x.$1, color: cs.primary), title: Text(x.$3), subtitle: Text(x.$2)),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: FilledButton.tonalIcon(
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              onPressed: () => siswa ? bukaKartuSiswa(context) : bukaKartuStaf(context),
              icon: const Icon(Icons.qr_code_2_rounded),
              label: Text(siswa ? 'Tampilkan Kartu Siswa (QR)' : 'Tampilkan Kartu Tutor (QR)'),
            ),
          ),
          if (siswa)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text('Nama, kelas, dan tanggal lahir diatur sekolah. Bila ada yang salah, hubungi tutor atau admin.',
                  style: TextStyle(fontSize: 12.5, color: cs.onSurfaceVariant)),
            ),
          // v1.73.0: tugas tambahan Tutor (mis. Koordinator Unit) -> beralih mode
          if (!siswa && Sesi.instance.tambahanTutor)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                onPressed: () => gantiModeTutor(context),
                icon: const Icon(Icons.swap_horiz_rounded),
                label: Text(Sesi.instance.modeTutor ? 'Kembali ke ${Sesi.instance.peranUtama}' : 'Beralih ke mode Tutor'),
              ),
            ),
          if (widget.onKeluar != null) ...[
            const SizedBox(height: 16),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(foregroundColor: cs.error, minimumSize: const Size.fromHeight(48)),
              onPressed: widget.onKeluar,
              icon: const Icon(Icons.logout_rounded),
              label: const Text('Keluar'),
            ),
          ],
          const SizedBox(height: 12),
          Center(child: Text('TH.E-Course versi $kVersi', style: TextStyle(fontSize: 12, color: cs.outline))),
        ]),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.denganAppBar) return _isi();
    return Scaffold(appBar: AppBar(title: const Text('Profil Saya')), body: _isi());
  }
}


/// v1.73.0: ganti antara peran utama dan mode Tutor (tugas tambahan). Profil & menu dimuat ulang.
Future<void> gantiModeTutor(BuildContext context) async {
  final keTutor = !Sesi.instance.modeTutor;
  final nav = Navigator.of(context);
  final r = await jalankan(context, () async {
    await Api.instance('waStafGantiMode', [Sesi.instance.token, keTutor ? 'Tutor' : 'utama']);
    Api.instance.bersihkanCache();
    await Sesi.instance.segarkanProfil();
    return true;
  }, teksProses: keTutor ? 'Beralih ke mode Tutor...' : 'Kembali ke peran utama...');
  if (!r.ok) return;
  nav.popUntil((x) => x.isFirst);
}
