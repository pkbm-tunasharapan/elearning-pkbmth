// ============================================================================
// KISI-KISI UJIAN (v1.85.0)
// Disusun dari kurikulum mapel x rombel (bab, topik, tujuan pembelajaran) dalam cakupan ujian (sama dengan ujPool_),
// ditambah jumlah & tingkat soal dari slot / jadwal. Perkiraan jumlah soal per sesi mengikuti cara pengundian soal:
// bergiliran dari setiap sesi yang punya bank soal, per tingkat (ujUndi_). TIDAK memuat soal atau kunci jawaban.
// - Staf (Admin, KS, Koordinator Kurikulum): waStafMasaKisi -> semua rombel x mapel satu masa (untuk dicetak).
// - Siswa: waSiswaKisi -> kisi-kisi ujian terjadwal miliknya (jadwal khusus unit dihormati), setelah masa ditetapkan.
// ============================================================================
if (typeof API_FLUTTER !== 'undefined' && API_FLUTTER && API_FLUTTER.TAMBAHAN) {
  ['waSiswaKisi', 'waSiswaHtmlPdf'].forEach(function(f) { API_FLUTTER.TAMBAHAN[f] = true; });
}

// Kurikulum semua mapel, sekali baca per eksekusi.
var KK_MEMO_ = null;
function kkKurikulum_() {
  if (KK_MEMO_) return KK_MEMO_;
  var v = kurSheet_().getDataRange().getValues(), o = {};
  for (var i = 1; i < v.length; i++) {
    var id = sTeks_(v[i][KUR.K.mapel]).trim();
    if (!id) continue;
    var x = kurBarisKeObjek_(v[i], i);
    if (x.smt >= 1 && x.minggu >= 1) (o[id] = o[id] || []).push(x);
  }
  Object.keys(o).forEach(function(k) { o[k].sort(function(a, b) { return (a.smt - b.smt) || (a.minggu - b.minggu); }); });
  return (KK_MEMO_ = o);
}

// Perkiraan sebaran soal (murni, diuji): bank[i] = {mudah, sedang, sulit} jumlah soal per sesi; komp = {mudah, sedang, sulit}.
// Hasil: [{mudah, sedang, sulit}] per sesi, dibagi bergiliran seperti ujUndi_ (kekurangan satu tingkat diambil dari tingkat lain).
function kkSebar_(bank, komp) {
  var hasil = bank.map(function() { return { mudah: 0, sedang: 0, sulit: 0 }; }), sisa = bank.map(function(b) { return { mudah: b.mudah || 0, sedang: b.sedang || 0, sulit: b.sulit || 0 }; });
  var kurang = 0;
  ['mudah', 'sedang', 'sulit'].forEach(function(t) {
    var perlu = komp[t] || 0, ambil = 0, ada = true;
    while (ambil < perlu && ada) {
      ada = false;
      for (var i = 0; i < sisa.length && ambil < perlu; i++) if (sisa[i][t] > 0) { sisa[i][t]--; hasil[i][t]++; ambil++; ada = true; }
    }
    kurang += perlu - ambil;
  });
  for (var putar = 0; kurang > 0 && putar < 500; putar++) {   // isi kekurangan dari tingkat lain, bergiliran
    var ada2 = false;
    for (var i2 = 0; i2 < sisa.length && kurang > 0; i2++) {
      ['sedang', 'mudah', 'sulit'].some(function(t) { if (sisa[i2][t] > 0) { sisa[i2][t]--; hasil[i2][t]++; kurang--; ada2 = true; return true; } return false; });
    }
    if (!ada2) break;
  }
  return hasil;
}

// Kisi-kisi satu ujian. o: {idMapel, smt, jenisPool, jumlah, komposisi}
function kkSusun_(o, cfg) {
  var rows = (kkKurikulum_()[String(o.idMapel)] || []);
  var nomor = kurDaftarNomorMateri_(cfg);
  var cak = kurCakupanUjian_(rows, cfg, o.smt, o.jenisPool, true);
  var punyaBank = cak.filter(function(x) { return x.bank.length >= KUR.MIN_SOAL_BANK; });
  var hitung = punyaBank.map(function(x) { var r = { mudah: 0, sedang: 0, sulit: 0 }; x.bank.forEach(function(q) { r[q.tingkat] = (r[q.tingkat] || 0) + 1; }); return r; });
  var sebar = kkSebar_(hitung, o.komposisi || {}), per = {};
  punyaBank.forEach(function(x, i) { per[x.smt + '|' + x.minggu] = sebar[i]; });
  var baris = cak.map(function(x, i) {
    var s = per[x.smt + '|' + x.minggu] || { mudah: 0, sedang: 0, sulit: 0 };
    return { no: i + 1, sesi: nomor[x.minggu - 1] || x.minggu, bab: x.bab, judulBab: x.judulBab, topik: x.topik,
      tp: String(x.tp || '').split(/\r?\n/).map(function(t) { return t.replace(/^[\s\-•*\d.)]+/, '').trim(); }).filter(String).slice(0, 4),
      mudah: s.mudah, sedang: s.sedang, sulit: s.sulit, jumlah: s.mudah + s.sedang + s.sulit };
  });
  return { ada: cak.length > 0, bankAda: punyaBank.length > 0, baris: baris, jumlahSesi: cak.length };
}

function kkJudul_(jenis, smt) { return (MU.NAMA_JENIS[jenis] || jenis) + (jenis === 'UPK' ? '' : ' Semester ' + smt); }

// ---------- staf: semua rombel x mapel satu masa ----------
function waStafMasaKisi(token, idMasa) {
  var p = stafDariToken_(token);
  muWajib_(p);
  var m = muCari_(idMasa), cfg = taBaca_(), jp = muJenisPool_(m.jenis, m.cakupan), rb = honProgramRombel_(), nm = muNamaMapel_();
  var slot = muSlot_(m.id).sort(function(a, b) { return (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam); }), kelas = muKelas_(m), per = {};
  slot.forEach(function(s) {
    kelas.filter(function(k) { return k.kode === s.kode && muSlotKena_(s, k.idRombelSim); }).forEach(function(k) {
      var x = kkSusun_({ idMapel: k.idMapel, smt: m.smt, jenisPool: jp, komposisi: s.komposisi }, cfg);
      (per[k.idRombelSim] = per[k.idRombelSim] || []).push({ mapel: nm[s.kode] || s.namaMapel || s.kode, tanggal: s.tanggal, jam: s.jam, durasi: s.durasi,
        mode: muModeSlot_(m, s) === 'Offline' ? 'Tulis (offline)' : 'Online (aplikasi)', jumlah: s.jumlah, komposisi: s.komposisi, kkm: m.kkm,
        ada: x.ada, bankAda: x.bankAda, baris: x.baris });
    });
  });
  var kop = {};
  try { kop = kwKop_(); } catch (e) {}
  var rombel = Object.keys(per).map(function(r) { return { id: r, nama: rb[r] ? rb[r].nama : r, mapel: per[r] }; })
    .sort(function(a, b) { return a.nama.localeCompare(b.nama, 'id', { numeric: true }); });
  return { masa: { id: m.id, nama: m.nama, jenis: m.jenis, judul: kkJudul_(m.jenis, m.smt), dari: m.dari, sampai: m.sampai, status: m.status },
    rombel: rombel, kop: kop, dibuat: absWaktu_(), oleh: p.nama };
}

// ---------- siswa: kisi-kisi ujian terjadwal miliknya ----------
function waSiswaKisi(token) {
  var s = siswaDariSesi_(token), cfg = taBaca_(), hari = absHariIni_(), pm = ujtPetaMapel_(), masa = {};
  try { muSemua_().forEach(function(m) { masa[m.id] = m; }); } catch (e) {}
  var out = [];
  ujJadwalSemua_().forEach(function(j0) {
    var mp = pm[String(j0.idMapel)];
    if (!mp || String(mp.idRombel) !== String(s.idRombel) || !j0.masa || !masa[j0.masa]) return;
    var j = ujJadwalSiswa_(j0, s.idRombel, s.nama), m = masa[j.masa];
    if (!m || m.status !== 'Ditetapkan' || j.tanggal < hari) return;
    if (muGerbang_(j, s.idRombel, s.nama)) return;   // bukan peserta masa ini (unit / siswa tertentu)
    var x = kkSusun_({ idMapel: j.idMapel, smt: j.smt, jenisPool: j.jenisPool, komposisi: j.komposisi }, cfg);
    out.push({ masa: m.nama, judul: j.judulKhusus || kkJudul_(j.jenis, j.smt), mapel: mp.namaMapel, tanggal: j.tanggal, jam: j.jam, durasi: j.durasi,
      mode: j.mode === 'Kertas' ? 'Tulis (offline)' : 'Online (aplikasi)', jumlah: j.jumlah, komposisi: j.komposisi, kkm: j.kkm,
      ada: x.ada, bankAda: x.bankAda, baris: x.baris });
  });
  out.sort(function(a, b) { return (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam); });
  var kop = {};
  try { kop = kwKop_(); } catch (e2) {}
  return { nama: s.nama, rombel: getNamaRombel_(s.idRombel), kisi: out, kop: kop };
}

// Siswa membuat PDF dari HTML (mis. kisi-kisi) - sama dengan waStafHtmlPdf, dengan sesi siswa.
function waSiswaHtmlPdf(token, html) {
  siswaDariSesi_(token);
  html = String(html || '');
  if (html.length < 50) throw new Error('Dokumen kosong.');
  if (html.length > 2000000) throw new Error('Dokumen terlalu besar untuk dibuat PDF.');
  var pdf = Utilities.newBlob(html, 'text/html', 'dokumen.html').getAs('application/pdf');
  return { b64: Utilities.base64Encode(pdf.getBytes()) };
}
