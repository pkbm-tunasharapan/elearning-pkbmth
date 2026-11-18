/// v1.91.1: peringkas baris jadwal cetak (Jadwal Pengawas).
/// - Baris dengan nilai yang sama (tanggal, jam, mapel, mode, ruang, pengawas) digabung menjadi satu; rombelnya disatukan.
/// - Rombel satu paket yang lengkap pada baris itu (mis. B7, B8, B9) ditulis "Paket B".
///   "Lengkap" = semua rombel paket itu yang ikut masa ujian ini (dilihat dari seluruh jadwal), jadi paket A dengan
///   rombel A4–A6 tetap dikenali walau tidak ada A1–A3.
/// - Rombel yang dipisah per unit ("Kelas B7 · Unit X") dikelompokkan per unit.
library;

final _polaRombel = RegExp(r'^(?:kelas\s+)?([abc])\s*(\d{1,2})$', caseSensitive: false);

class _Rombel {
  _Rombel(this.asli) {
    final i = asli.indexOf(' · ');
    final inti = (i < 0 ? asli : asli.substring(0, i)).trim();
    unit = i < 0 ? '' : asli.substring(i + 3).trim();
    final m = _polaRombel.firstMatch(inti);
    paket = m == null ? '' : m.group(1)!.toUpperCase();
    angka = m == null ? 0 : int.parse(m.group(2)!);
    pendek = m == null ? inti : '$paket$angka';
  }
  final String asli;
  late final String unit;
  late final String paket;
  late final int angka;
  late final String pendek;
}

/// Anggota tiap paket yang ikut masa ujian: {'B': {7, 8, 9}, ...}. [semua] = semua nama rombel di seluruh jadwal.
Map<String, Set<int>> anggotaPaket(Iterable<String> semua) {
  final out = <String, Set<int>>{};
  for (final n in semua) {
    final r = _Rombel(n);
    if (r.paket.isNotEmpty) out.putIfAbsent(r.paket, () => <int>{}).add(r.angka);
  }
  return out;
}

/// Ringkas daftar rombel satu baris, mis. [Kelas B7, Kelas B8, Kelas B9, Kelas C10] -> "Paket B, C10".
String ringkasRombel(Iterable<String> rombel, Map<String, Set<int>> paket) {
  final perUnit = <String, List<_Rombel>>{};
  for (final n in rombel) {
    if (n.trim().isEmpty) continue;
    final r = _Rombel(n);
    perUnit.putIfAbsent(r.unit, () => []).add(r);
  }
  final bagian = <String>[];
  for (final e in perUnit.entries) {
    final l = e.value;
    final hasil = <String>[];
    final perPaket = <String, Set<int>>{};
    for (final r in l) {
      if (r.paket.isNotEmpty) perPaket.putIfAbsent(r.paket, () => <int>{}).add(r.angka);
    }
    final dipaketkan = <String>{};
    for (final p in perPaket.keys.toList()..sort()) {
      final anggota = paket[p] ?? const <int>{};
      if (anggota.length > 1 && perPaket[p]!.containsAll(anggota)) {
        hasil.add('Paket $p');
        dipaketkan.add(p);
      }
    }
    final sisa = l.where((r) => !dipaketkan.contains(r.paket)).toList()
      ..sort((a, b) => a.paket != b.paket ? a.paket.compareTo(b.paket) : a.angka != b.angka ? a.angka.compareTo(b.angka) : a.pendek.compareTo(b.pendek));
    final lihat = <String>{};
    for (final r in sisa) {
      if (lihat.add(r.pendek)) hasil.add(r.pendek);
    }
    final teks = hasil.join(', ');
    bagian.add(e.key.isEmpty ? teks : '$teks · ${e.key}');
  }
  return bagian.join('; ');
}

/// Satu baris jadwal pengawas setelah digabung.
class BarisPengawas {
  BarisPengawas({required this.tanggal, required this.jam, required this.selesai, required this.mapel, required this.mode, required this.ruang, required this.pengawas});
  final String tanggal, jam, selesai, mapel, mode, ruang, pengawas;
  final List<String> rombel = [];
  String rombelRingkas = '';
}

/// Gabungkan baris (tanggal, jam, selesai, mapel, mode, rombel, ruang, pengawas) yang nilainya sama kecuali rombel.
/// Urutan mengikuti kemunculan pertama. [p] = anggotaPaket dari seluruh jadwal.
List<BarisPengawas> gabungBarisPengawas(List<Map<String, String>> baris, Map<String, Set<int>> p) {
  final peta = <String, BarisPengawas>{};
  for (final b in baris) {
    final k = [b['tanggal'], b['jam'], b['selesai'], b['mapel'], b['mode'], b['ruang'], b['pengawas']].join('\u0001');
    final x = peta.putIfAbsent(k, () => BarisPengawas(tanggal: b['tanggal'] ?? '', jam: b['jam'] ?? '', selesai: b['selesai'] ?? '', mapel: b['mapel'] ?? '',
        mode: b['mode'] ?? '', ruang: b['ruang'] ?? '', pengawas: b['pengawas'] ?? ''));
    final r = b['rombel'] ?? '';
    if (r.isNotEmpty && !x.rombel.contains(r)) x.rombel.add(r);
  }
  for (final x in peta.values) {
    x.rombelRingkas = ringkasRombel(x.rombel, p);
  }
  return peta.values.toList();
}

/// v1.91.2: rowspan untuk sel bernilai sama yang berurutan. Hasil per indeks: jumlah baris yang digabung,
/// atau 0 bila sel itu sudah tertutup oleh sel di atasnya. Contoh: [a, a, b] -> [2, 0, 1].
List<int> rentangSama(List<String> nilai) {
  final out = List<int>.filled(nilai.length, 0);
  var i = 0;
  while (i < nilai.length) {
    var n = 1;
    while (i + n < nilai.length && nilai[i + n] == nilai[i]) {
      n++;
    }
    out[i] = n;
    i += n;
  }
  return out;
}

/// v1.91.2: urutkan baris satu tanggal menurut jam, lalu nama pengawas (yang belum ditentukan di akhir),
/// supaya baris dengan pengawas sama berdekatan dan bisa digabung.
void urutBarisPengawas(List<BarisPengawas> l) {
  l.sort((a, b) {
    final w = '${a.jam}|${a.selesai}'.compareTo('${b.jam}|${b.selesai}');
    if (w != 0) return w;
    if (a.pengawas.isEmpty != b.pengawas.isEmpty) return a.pengawas.isEmpty ? 1 : -1;
    return a.pengawas.compareTo(b.pengawas);
  });
}
