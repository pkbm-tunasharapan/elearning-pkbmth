/// v1.95.0: pengurai tabel KETERANGAN kalender akademik (kaldik) tanpa AI.
/// Tiap baris = Tanggal + Kegiatan, mis. "28 Desember 2026-8 Januari 2027 | Libur semester 1".
/// - [uraiTanggal]: format Indonesia: "15 Juli 2026", "2-3 Juli 2026", "15-17, 20-21 Juli 2026",
///   "26 Juli-01 Agustus 2026", "28 Desember 2026-8 Januari 2027", "8–12 Februari 2027", tanda kaki "*)",
///   bulan saja "Maret–April 2027" / "Juni 2027" (ditandai bulanSaja).
/// - [kategoriKegiatan]: mulai / libur / uas / rapor / ujianJenjang / kegiatan berdasarkan kata kunci.
/// - [uraiTempel]: teks tempelan (dari Excel/Word: "tanggal<TAB>kegiatan" per baris; dari PDF: kolom tanggal dan
///   kolom kegiatan bisa terpisah -> dipasangkan berurutan).
library;

const _bulan = {
  'januari': 1, 'jan': 1, 'februari': 2, 'pebruari': 2, 'feb': 2, 'maret': 3, 'mar': 3, 'april': 4, 'apr': 4, 'mei': 5,
  'juni': 6, 'jun': 6, 'juli': 7, 'jul': 7, 'agustus': 8, 'agu': 8, 'ags': 8, 'agt': 8, 'aug': 8, 'september': 9, 'sep': 9, 'sept': 9,
  'oktober': 10, 'okt': 10, 'oct': 10, 'november': 11, 'nov': 11, 'nopember': 11, 'desember': 12, 'des': 12, 'dec': 12,
};

class HasilTanggal {
  HasilTanggal(this.rentang, {this.bulanSaja = false});
  /// Daftar rentang [dari, sampai] (inklusif).
  final List<(DateTime, DateTime)> rentang;
  final bool bulanSaja;
  DateTime get dari => rentang.map((r) => r.$1).reduce((a, b) => a.isBefore(b) ? a : b);
  DateTime get sampai => rentang.map((r) => r.$2).reduce((a, b) => a.isAfter(b) ? a : b);
}

class _Titik {
  int? hari, bulan, tahun;
  bool tahunTegas = false;
}

DateTime _akhirBulan(int t, int b) => DateTime(t, b + 1, 0);

/// null bila tidak bisa dibaca (mis. tahun terpotong "202").
HasilTanggal? uraiTanggal(String teks) {
  var s = teks.toLowerCase().replaceAll(RegExp(r'[–—−]'), '-').replaceAll(RegExp(r'[*()]'), ' ').replaceAll(RegExp(r'\bs\.?\s*d\.?\b'), '-');
  s = s.replaceAll(RegExp(r'\bsampai( dengan)?\b'), '-').replaceAll(RegExp(r'\bdan\b'), ',');
  final token = RegExp(r'\d+|[a-z]+|-|,').allMatches(s).map((m) => m.group(0)!).toList();
  final titik = <_Titik>[];
  final sambung = <String>[];   // penghubung SEBELUM titik ke-i ('-' / ',' / '')
  var penghubung = '';
  _Titik? kini;
  for (final t in token) {
    if (t == '-' || t == ',') {
      penghubung = t;
      kini = null;
      continue;
    }
    if (RegExp(r'^\d+$').hasMatch(t)) {
      final n = int.parse(t);
      if (t.length == 4) {
        if (titik.isEmpty) return null;
        titik.last
          ..tahun = n
          ..tahunTegas = true;
        continue;
      }
      if (t.length == 3) return null;   // tahun terpotong
      if (n < 1 || n > 31) return null;
      kini = _Titik()..hari = n;
      titik.add(kini);
      sambung.add(penghubung);
      penghubung = '';
      continue;
    }
    final b = _bulan[t];
    if (b == null) continue;   // kata lain (mis. "tanggal") diabaikan
    if (kini != null && kini.bulan == null) {
      kini.bulan = b;
    } else {
      kini = _Titik()..bulan = b;
      titik.add(kini);
      sambung.add(penghubung);
      penghubung = '';
    }
  }
  if (titik.isEmpty) return null;
  // bulan & tahun yang kosong diisi dari titik sesudahnya (kanan ke kiri)
  int? bl, th;
  for (var i = titik.length - 1; i >= 0; i--) {
    titik[i].bulan ??= bl;
    titik[i].tahun ??= th;
    bl = titik[i].bulan;
    th = titik[i].tahun;
  }
  if (titik.any((x) => x.bulan == null || x.tahun == null)) return null;
  final bulanSaja = titik.every((x) => x.hari == null);
  if (titik.any((x) => x.hari == null) && !bulanSaja) return null;
  DateTime awal(_Titik x) => DateTime(x.tahun!, x.bulan!, x.hari ?? 1);
  DateTime akhir(_Titik x) => x.hari == null ? _akhirBulan(x.tahun!, x.bulan!) : DateTime(x.tahun!, x.bulan!, x.hari!);
  final rentang = <(DateTime, DateTime)>[];
  for (var i = 0; i < titik.length; i++) {
    final a = titik[i];
    if (i + 1 < titik.length && sambung[i + 1] == '-') {
      final b = titik[i + 1];
      var da = awal(a);
      final db = akhir(b);
      if (da.isAfter(db) && !a.tahunTegas) da = DateTime(da.year - 1, da.month, da.day);   // "28 Desember-8 Januari 2027"
      if (da.isAfter(db)) return null;
      rentang.add((da, db));
      i++;
    } else {
      rentang.add((awal(a), akhir(a)));
    }
  }
  return HasilTanggal(rentang, bulanSaja: bulanSaja);
}

/// Kategori baris keterangan.
const katMulai = 'mulai', katLibur = 'libur', katUts = 'uts', katUas = 'uas', katRapor = 'rapor', katJenjang = 'ujianJenjang', katKegiatan = 'kegiatan';
const kategoriLabel = {
  katMulai: 'Hari pertama masuk',
  katLibur: 'Libur',
  katUts: 'UTS / asesmen tengah',
  katUas: 'UAS / asesmen akhir',
  katRapor: 'Pembagian rapor',
  katJenjang: 'Ujian jenjang (info)',
  katKegiatan: 'Kegiatan (abaikan)',
};

String kategoriKegiatan(String kegiatan) {
  final k = kegiatan.toLowerCase();
  if (k.contains('hari pertama') && (k.contains('masuk') || k.contains('sekolah'))) return katMulai;
  if (k.contains('pembagian rapor') || k.contains('pembagian raport')) return katRapor;
  if (RegExp(r'asesmen sumatif akhir (semester|tahun)|sumatif akhir tahun|sumatif akhir fase|penilaian akhir (semester|tahun)|ujian akhir semester').hasMatch(k)) return katUas;
  if (RegExp(r'asesmen sumatif tengah semester|penilaian tengah semester|ujian tengah semester|\buts\b|\bpts\b').hasMatch(k)) return katUts;
  if (k.contains('akhir jenjang') || (RegExp(r'tes (kemampuan|kompetensi) akademik').hasMatch(k) && k.contains('paket'))) return katJenjang;
  if (RegExp(r'^(perkiraan )?(hari (guru|pendidikan|disabilitas|anak|kartini|pahlawan|santri|ibu))').hasMatch(k) || k.contains('pramuka')) return katKegiatan;
  if (RegExp(r'\blibur\b|cuti bersama|hari raya|tahun baru (islam|imlek|masehi|hijriah)|\bnatal\b|wafat isa|kenaikan isa|waisak|waisyak|nyepi|isra|maulid|idul (fitri|adha)|kemerdekaan|lahir pancasila|hari buruh')
      .hasMatch(k)) {
    return katLibur;
  }
  return katKegiatan;
}

class BarisKet {
  BarisKet(this.tanggal, this.kegiatan, {String? kategori}) : hasil = uraiTanggal(tanggal) {
    this.kategori = kategori ?? (hasil == null || hasil!.bulanSaja ? katKegiatan : kategoriKegiatan(kegiatan));
  }
  final String tanggal, kegiatan;
  final HasilTanggal? hasil;
  late String kategori;
  bool get perkiraan => kegiatan.toLowerCase().contains('perkiraan') || tanggal.contains('*');
  Map<String, dynamic> keJson() => {
        'tanggal': tanggal,
        'kegiatan': kegiatan,
        'kategori': kategori,
        if (hasil != null) 'dari': isoTgl(hasil!.dari),
        if (hasil != null) 'sampai': isoTgl(hasil!.sampai),
      };
}

final _tahun = RegExp(r'(19|20)\d{2}');
final _abaikan = RegExp(r'^(tanggal|kegiatan|keterangan|tanggal\s+kegiatan|no\.?|semester\s*\d*|kalender pendidikan.*)$', caseSensitive: false);

/// Pisah satu baris menjadi (tanggal, kegiatan). Tanpa tahun -> tanggal kosong.
(String, String) _belah(String baris) {
  if (baris.contains('\t')) {
    final p = baris.split('\t').map((x) => x.trim()).where((x) => x.isNotEmpty).toList();
    if (p.length >= 2) return (p.first, p.sublist(1).join(' '));
  }
  if (baris.contains('|')) {
    final p = baris.split('|').map((x) => x.trim()).where((x) => x.isNotEmpty).toList();
    if (p.length >= 2) return (p.first, p.sublist(1).join(' '));
  }
  final m = _tahun.allMatches(baris).toList();
  if (m.isEmpty) return ('', baris.trim());
  // tanggal = awal baris sampai tahun TERAKHIR yang masih diikuti hanya penanda (*) atau rentang
  var potong = -1;
  for (final x in m) {
    final depan = baris.substring(0, x.start);
    if (RegExp(r'[a-z]{3,}', caseSensitive: false).allMatches(depan).every((w) => _bulan.containsKey(w.group(0)!.toLowerCase()) || w.group(0)!.toLowerCase() == 'dan')) {
      potong = x.end;
    } else {
      break;
    }
  }
  if (potong < 0) return ('', baris.trim());
  var sisa = baris.substring(potong);
  final tanda = RegExp(r'^\s*\*+\)?').firstMatch(sisa);
  var tgl = baris.substring(0, potong);
  if (tanda != null) {
    tgl += tanda.group(0)!.trim();
    sisa = sisa.substring(tanda.end);
  }
  return (tgl.trim(), sisa.trim());
}

/// Teks tempelan -> baris keterangan.
List<BarisKet> uraiTempel(String teks) {
  final baris = teks.split(RegExp(r'\r?\n')).map((x) => x.trim()).where((x) => x.isNotEmpty && !_abaikan.hasMatch(x)).toList();
  final pasangan = <BarisKet>[], hanyaTgl = <String>[], hanyaTeks = <String>[];
  for (final b in baris) {
    final (t, k) = _belah(b);
    if (t.isNotEmpty && k.isNotEmpty) {
      pasangan.add(BarisKet(t, k));
    } else if (t.isNotEmpty) {
      hanyaTgl.add(t);
    } else {
      hanyaTeks.add(k);
    }
  }
  // kolom terpisah (salinan PDF): pasangkan berurutan
  for (var i = 0; i < hanyaTgl.length; i++) {
    pasangan.add(BarisKet(hanyaTgl[i], i < hanyaTeks.length ? hanyaTeks[i] : ''));
  }
  return pasangan;
}

/// Ringkasan untuk diterapkan ke satu semester kaldik.
class RingkasKet {
  DateTime? mulai, rapor, uasDari, uasSampai, utsDari, utsSampai;
  final libur = <Map<String, String>>[];
  final jenjang = <String>[];
}

String isoTgl(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

RingkasKet ringkasKet(List<BarisKet> baris) {
  final r = RingkasKet(), ada = <String>{};
  for (final b in baris) {
    final h = b.hasil;
    if (h == null) continue;
    switch (b.kategori) {
      case katMulai:
        r.mulai ??= h.dari;
      case katRapor:
        r.rapor = h.sampai;
      case katUts:
        r.utsDari = r.utsDari == null || h.dari.isBefore(r.utsDari!) ? h.dari : r.utsDari;
        r.utsSampai = r.utsSampai == null || h.sampai.isAfter(r.utsSampai!) ? h.sampai : r.utsSampai;
      case katUas:
        r.uasDari = r.uasDari == null || h.dari.isBefore(r.uasDari!) ? h.dari : r.uasDari;
        r.uasSampai = r.uasSampai == null || h.sampai.isAfter(r.uasSampai!) ? h.sampai : r.uasSampai;
      case katLibur:
        for (final x in h.rentang) {
          final k = '${isoTgl(x.$1)}|${isoTgl(x.$2)}';
          if (ada.add(k)) r.libur.add({'dari': isoTgl(x.$1), 'sampai': isoTgl(x.$2), 'nama': b.kegiatan.replaceFirst(RegExp(r'^perkiraan\s+', caseSensitive: false), '')});
        }
      case katJenjang:
        r.jenjang.add('${b.kegiatan} (${b.tanggal})');
    }
  }
  r.libur.sort((a, b) => a['dari']!.compareTo(b['dari']!));
  return r;
}
