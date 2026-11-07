// ============================================================================
// IMPOR DAPODIK (aplikasi 1.18, biodata 1.21): pengganti fitur impor di aplikasi SIM SETARA.
// Admin mengunggah file ekspor "Daftar Peserta Didik" (.xlsx) dari Dapodik.
// 1. waAdminDapodikPratinjau : membaca file, membandingkan dengan tab WARGA BELAJAR & ROMBEL
//                              (spreadsheet MENU), mengembalikan daftar perubahan. Tidak menulis apa pun.
// 2. waAdminDapodikTerapkan  : menerapkan perubahan yang sudah dipratinjau (+ opsi sinkron sheet
//                              Siswa e-learning: rombel & NISN mengikuti Dapodik).
// File .xlsx dibaca langsung (zip + XML) tanpa layanan tambahan, sehingga tidak perlu izin baru.
// ============================================================================
var DPK = {
  CACHE_DETIK: 3600,
  POTONG: 90000,
  MAKS_BYTE: 8 * 1048576,
  TINGKAT: [1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 5, 6] // kelas 1..12 -> TINGKAT di tab ROMBEL
};

// ---------- pembaca xlsx (fungsi murni, tanpa layanan Google) ----------
function dpkXmlTeks_(s) {
  return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function(m, d) { return String.fromCharCode(Number(d)); })
    .replace(/&#x([0-9a-fA-F]+);/g, function(m, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&amp;/g, '&');
}

function dpkSharedStrings_(xml) {
  var out = [];
  var re = /<si>([\s\S]*?)<\/si>/g, m;
  while ((m = re.exec(xml || ''))) {
    var t = '', r2 = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, n;
    while ((n = r2.exec(m[1]))) t += n[1];
    out.push(dpkXmlTeks_(t));
  }
  return out;
}

function dpkKolom_(ref) {
  var huruf = String(ref || '').replace(/[0-9]/g, ''), n = 0;
  for (var i = 0; i < huruf.length; i++) n = n * 26 + (huruf.charCodeAt(i) - 64);
  return n - 1;
}

// Mengembalikan array baris (array sel berupa teks), indeks baris mengikuti nomor baris Excel - 1.
function dpkBacaSheet_(xml, ss) {
  var baris = [];
  var reRow = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, m;
  var urut = 0;
  while ((m = reRow.exec(xml || ''))) {
    var rr = /\sr="(\d+)"/.exec(m[1] || '');
    var no = rr ? Number(rr[1]) - 1 : urut;
    urut = no + 1;
    var sel = [];
    var reC = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, c;
    var kolom = 0;
    while ((c = reC.exec(m[2] || ''))) {
      var atr = c[1] || '', isi = c[2] || '';
      var r = /\sr="([A-Z]+\d+)"/.exec(atr);
      var k = r ? dpkKolom_(r[1]) : kolom;
      kolom = k + 1;
      var t = (/\st="([^"]+)"/.exec(atr) || [])[1] || '';
      var v = (/<v>([\s\S]*?)<\/v>/.exec(isi) || [])[1];
      var nilai = '';
      if (t === 's') nilai = ss[Number(v)] || '';
      else if (t === 'inlineStr') { var it = '', ri = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, q; while ((q = ri.exec(isi))) it += q[1]; nilai = dpkXmlTeks_(it); }
      else nilai = v === undefined ? '' : dpkXmlTeks_(v);
      sel[k] = String(nilai).trim();
    }
    for (var j = 0; j < sel.length; j++) if (sel[j] === undefined) sel[j] = '';
    baris[no] = sel;
  }
  for (var b = 0; b < baris.length; b++) if (!baris[b]) baris[b] = [];
  return baris;
}

// Dari baris mentah -> daftar peserta didik. Header dicari dari teks kolom, bukan posisi tetap.
function dpkPesertaDidik_(baris) {
  var hdr = -1, idx = {};
  for (var i = 0; i < Math.min(baris.length, 30); i++) {
    var r = baris[i].map(function(x) { return String(x).trim().toUpperCase(); });
    if (r.indexOf('NAMA') >= 0 && r.indexOf('NISN') >= 0) { hdr = i; r.forEach(function(x, j) { if (x && idx[x] === undefined) idx[x] = j; }); break; }
  }
  if (hdr < 0) throw new Error('Format file tidak dikenali: kolom "Nama" dan "NISN" tidak ditemukan. Gunakan file ekspor Daftar Peserta Didik dari Dapodik.');
  // Header dua tingkat (mis. "Data Ayah" -> Nama/Pekerjaan): kunci "DATA AYAH|NAMA".
  var sub = (baris[hdr + 1] || []).map(function(x) { return String(x).trim().toUpperCase(); }), atas = '';
  for (var s2 = 0; s2 < Math.max(sub.length, baris[hdr].length); s2++) {
    var a2 = String(baris[hdr][s2] || '').trim().toUpperCase();
    if (a2) atas = a2;
    if (sub[s2] && atas && idx[atas + '|' + sub[s2]] === undefined) idx[atas + '|' + sub[s2]] = s2;
  }
  var col = function(n) { return idx[n] === undefined ? -1 : idx[n]; };
  var cRombel = col('ROMBEL SAAT INI');
  if (cRombel < 0) throw new Error('Kolom "Rombel Saat Ini" tidak ditemukan di file Dapodik.');
  var ambil = function(r, n) { var c = col(n); return c < 0 ? '' : String(r[c] || '').trim(); };
  var out = [];
  for (var j = hdr + 1; j < baris.length; j++) {
    var r = baris[j];
    var nama = ambil(r, 'NAMA');
    if (!nama || !/^\d+$/.test(ambil(r, 'NO'))) continue; // lewati baris subjudul / kosong
    out.push({
      nama: nama.replace(/\s+/g, ' '),
      nipd: ambil(r, 'NIPD'),
      jk: ambil(r, 'JK').toUpperCase().slice(0, 1),
      nisn: ambil(r, 'NISN').replace(/\D/g, ''),
      tempat: ambil(r, 'TEMPAT LAHIR'),
      tgl: dpkTgl_(ambil(r, 'TANGGAL LAHIR')),
      nik: ambil(r, 'NIK').replace(/\D/g, ''),
      hp: (ambil(r, 'HP') || ambil(r, 'TELEPON')).replace(/[^\d+]/g, ''),
      rombel: ambil(r, 'ROMBEL SAAT INI').toUpperCase().replace(/\s+/g, ''),
      agama: ambil(r, 'AGAMA'), alamat: ambil(r, 'ALAMAT'), rt: ambil(r, 'RT'), rw: ambil(r, 'RW'), dusun: ambil(r, 'DUSUN'),
      kelurahan: ambil(r, 'KELURAHAN'), kecamatan: ambil(r, 'KECAMATAN'), kodePos: ambil(r, 'KODE POS'),
      anakKe: ambil(r, 'ANAK KE-BERAPA'), sekolahAsal: ambil(r, 'SEKOLAH ASAL'),
      ayah: ambil(r, 'DATA AYAH|NAMA'), kerjaAyah: ambil(r, 'DATA AYAH|PEKERJAAN'),
      ibu: ambil(r, 'DATA IBU|NAMA'), kerjaIbu: ambil(r, 'DATA IBU|PEKERJAAN'),
      wali: ambil(r, 'DATA WALI|NAMA'), kerjaWali: ambil(r, 'DATA WALI|PEKERJAAN')
    });
  }
  if (!out.length) throw new Error('Tidak ada data peserta didik di file ini.');
  return out;
}

// Tanggal Dapodik biasanya "yyyy-mm-dd"; bila berupa nomor seri Excel, diubah ke yyyy-mm-dd.
function dpkTgl_(s) {
  s = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    var d = new Date(Math.round((Number(s) - 25569) * 864e5));
    return d.toISOString().slice(0, 10);
  }
  var m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return s;
}

// Indeks WARGA BELAJAR untuk mencocokkan baris Dapodik (NIK -> NISN -> nama + tanggal lahir).
function dpkIndeks_(sim) {
  var idx = { nik: {}, nisn: {}, namaTgl: {} };
  sim.forEach(function(s) {
    if (s.nik) (idx.nik[s.nik] = idx.nik[s.nik] || []).push(s);
    if (s.nisn) (idx.nisn[s.nisn] = idx.nisn[s.nisn] || []).push(s);
    var k = dpkNorm_(s.nama) + '|' + s.tgl;
    (idx.namaTgl[k] = idx.namaTgl[k] || []).push(s);
  });
  return idx;
}
function dpkCari_(idx, p) {
  var pilih = function(arr) {
    if (!arr || !arr.length) return null;
    return arr.filter(function(x) { return x.status === 'Aktif' || !x.status; })[0] || arr[0];
  };
  return pilih(p.nik && idx.nik[p.nik]) || pilih(p.nisn && idx.nisn[p.nisn]) || pilih(idx.namaTgl[dpkNorm_(p.nama) + '|' + p.tgl]);
}

function dpkNorm_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function dpkHp_(s) { return String(s || '').replace(/\D/g, '').replace(/^62/, '0'); }

// Membandingkan peserta didik Dapodik dengan baris WARGA BELAJAR (semua status) dan ROMBEL.
// sim: [{baris, id, nisn, nik, nama, jk, tempat, tgl, rombel, hp, status}], rombelSim: {ID: NAMA}
function dpkBandingkan_(pd, sim, rombelSim) {
  var idRbPerNama = {};
  Object.keys(rombelSim).forEach(function(id) { idRbPerNama[String(rombelSim[id]).toUpperCase().replace(/\s+/g, '')] = id; });
  var perNik = {}, perNisn = {}, perNamaTgl = {};
  sim.forEach(function(s) {
    if (s.nik) (perNik[s.nik] = perNik[s.nik] || []).push(s);
    if (s.nisn) (perNisn[s.nisn] = perNisn[s.nisn] || []).push(s);
    var k = dpkNorm_(s.nama) + '|' + s.tgl;
    (perNamaTgl[k] = perNamaTgl[k] || []).push(s);
  });
  var pilih = function(arr) {
    if (!arr || !arr.length) return null;
    return arr.filter(function(x) { return x.status === 'Aktif' || !x.status; })[0] || arr[0];
  };
  var terpakai = {}, baru = [], berubah = [], sama = 0, rombelBaru = {};
  pd.forEach(function(p) {
    var s = pilih(p.nik && perNik[p.nik]) || pilih(p.nisn && perNisn[p.nisn]) || pilih(perNamaTgl[dpkNorm_(p.nama) + '|' + p.tgl]);
    if (s && terpakai[s.baris]) s = null;
    var idRb = idRbPerNama[p.rombel] || '';
    if (p.rombel && !idRb) rombelBaru[p.rombel] = (rombelBaru[p.rombel] || 0) + 1;
    if (!s) { baru.push({ pd: p, idRombel: idRb }); return; }
    terpakai[s.baris] = true;
    var ubah = [];
    var cek = function(kolom, label, lama, nilai, beda) { if (beda) ubah.push({ kolom: kolom, label: label, lama: lama, baru: nilai }); };
    cek('NISN', 'NISN', s.nisn, p.nisn, !!p.nisn && p.nisn !== s.nisn);
    cek('NIK', 'NIK', s.nik, p.nik, !!p.nik && p.nik !== s.nik);
    cek('NAMA WB', 'Nama', s.nama, p.nama, dpkNorm_(p.nama) !== dpkNorm_(s.nama));
    cek('JENIS KELAMIN', 'Jenis kelamin', s.jk, p.jk, !!p.jk && p.jk !== String(s.jk || '').toUpperCase().slice(0, 1));
    cek('TEMPAT LAHIR', 'Tempat lahir', s.tempat, p.tempat, !!p.tempat && dpkNorm_(p.tempat) !== dpkNorm_(s.tempat));
    cek('TANGGAL LAHIR', 'Tanggal lahir', s.tgl, p.tgl, !!p.tgl && p.tgl !== s.tgl);
    cek('ROMBEL', 'Rombel', rombelSim[s.rombel] || s.rombel, p.rombel, !!p.rombel && (idRb ? idRb !== s.rombel : true));
    cek('NO HP', 'No HP', s.hp, p.hp, !!p.hp && dpkHp_(p.hp) !== dpkHp_(s.hp));
    cek('STATUS', 'Status', s.status, 'Aktif', !!s.status && s.status !== 'Aktif');
    if (ubah.length) berubah.push({ baris: s.baris, id: s.id, nama: s.nama, idRombel: idRb, ubah: ubah });
    else sama++;
  });
  var hilang = sim.filter(function(s) { return !terpakai[s.baris] && (s.status === 'Aktif' || !s.status); })
    .map(function(s) { return { baris: s.baris, id: s.id, nama: s.nama, nisn: s.nisn, rombel: rombelSim[s.rombel] || s.rombel }; });
  return { baru: baru, berubah: berubah, sama: sama, hilang: hilang, rombelBaru: Object.keys(rombelBaru).sort() };
}

// ---------- akses data (layanan Google) ----------
function dpkBacaXlsx_(b64) {
  var bytes = Utilities.base64Decode(String(b64 || ''));
  if (!bytes.length) throw new Error('File kosong.');
  if (bytes.length > DPK.MAKS_BYTE) throw new Error('File terlalu besar (maksimal 8 MB).');
  var isi;
  try { isi = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip', 'dapodik.zip')); }
  catch (e) { throw new Error('File bukan .xlsx yang valid. Unduh ulang dari Dapodik lalu pilih file .xlsx-nya.'); }
  var peta = {};
  isi.forEach(function(b) { peta[b.getName()] = b; });
  var namaSheet = peta['xl/worksheets/sheet1.xml'] ? 'xl/worksheets/sheet1.xml' : Object.keys(peta).filter(function(n) { return /^xl\/worksheets\/[^\/]+\.xml$/.test(n); }).sort()[0];
  if (!namaSheet) throw new Error('Lembar kerja tidak ditemukan di file.');
  var ss = peta['xl/sharedStrings.xml'] ? dpkSharedStrings_(peta['xl/sharedStrings.xml'].getDataAsString('UTF-8')) : [];
  return dpkPesertaDidik_(dpkBacaSheet_(peta[namaSheet].getDataAsString('UTF-8'), ss));
}

function dpkDataSim_() {
  absLupakan_();
  var t = absBaca_('WARGA BELAJAR'), rb = absBaca_('ROMBEL');
  var rombelSim = {};
  for (var i = 1; i < rb.v.length; i++) {
    var id = sTeks_(absNilai_(rb, rb.v[i], 'ID ROMBEL')).trim();
    if (id) rombelSim[id] = sTeks_(absNilai_(rb, rb.v[i], 'NAMA ROMBEL')).trim();
  }
  var sim = [];
  for (var j = 1; j < t.v.length; j++) {
    var r = t.v[j];
    var nama = sTeks_(absNilai_(t, r, 'NAMA WB')).trim();
    if (!nama) continue;
    sim.push({
      baris: j + 1, id: sTeks_(absNilai_(t, r, 'ID WB')).trim(),
      nisn: sTeks_(absNilai_(t, r, 'NISN')).replace(/\D/g, ''), nik: sTeks_(absNilai_(t, r, 'NIK')).replace(/\D/g, ''),
      nama: nama, jk: sTeks_(absNilai_(t, r, 'JENIS KELAMIN')).trim(), tempat: sTeks_(absNilai_(t, r, 'TEMPAT LAHIR')).trim(),
      tgl: absTgl_(absNilai_(t, r, 'TANGGAL LAHIR')), rombel: sTeks_(absNilai_(t, r, 'ROMBEL')).trim(),
      hp: sTeks_(absNilai_(t, r, 'NO HP')).trim(), status: sTeks_(absNilai_(t, r, 'STATUS')).trim()
    });
  }
  return { t: t, rb: rb, sim: sim, rombelSim: rombelSim };
}

function dpkCacheSimpan_(kunci, obj) {
  var s = JSON.stringify(obj), c = CacheService.getScriptCache(), n = Math.ceil(s.length / DPK.POTONG), m = {};
  for (var i = 0; i < n; i++) m[kunci + '_' + i] = s.slice(i * DPK.POTONG, (i + 1) * DPK.POTONG);
  m[kunci + '_n'] = String(n);
  c.putAll(m, DPK.CACHE_DETIK);
}

function dpkCacheAmbil_(kunci) {
  var c = CacheService.getScriptCache(), n = Number(c.get(kunci + '_n') || 0);
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < n; i++) keys.push(kunci + '_' + i);
  var m = c.getAll(keys), s = '';
  for (var j = 0; j < n; j++) { if (m[keys[j]] === undefined || m[keys[j]] === null) return null; s += m[keys[j]]; }
  return JSON.parse(s);
}

// Sheet Siswa e-learning: kolom A = ID Rombel, B = Nama Siswa, G = NISN.
function dpkRencanaElearning_(pd) {
  var elRb = {};
  getSheetData(CONFIG.SHEETS.ROMBEL).forEach(function(r, i) {
    if (i && String(r[0]).trim()) elRb[pmlNormRombel_(sTeks_(r[1]).trim() || sTeks_(r[0]).trim())] = sTeks_(r[0]).trim();
  });
  var perNisn = {}, perNama = {};
  pd.forEach(function(p) {
    if (p.nisn) perNisn[p.nisn] = p;
    var k = normNama_(p.nama);
    (perNama[k] = perNama[k] || []).push(p);
  });
  var rencana = [];
  getSheetData(CONFIG.SHEETS.SISWA).forEach(function(r, i) {
    if (!i || !String(r[1]).trim()) return;
    var nama = sTeks_(r[1]).trim(), nisn = sTeks_(r[6]).replace(/\D/g, ''), idRb = sTeks_(r[0]).trim();
    var p = (nisn && perNisn[nisn]) || ((perNama[normNama_(nama)] || []).length === 1 ? perNama[normNama_(nama)][0] : null);
    if (!p) return;
    var tujuan = elRb[pmlNormRombel_(p.rombel)] || '';
    var x = { baris: i + 1, nama: nama, rombelLama: idRb, rombelBaru: '', nisnBaru: '' };
    if (tujuan && tujuan !== idRb) x.rombelBaru = tujuan;
    if (!nisn && p.nisn) x.nisnBaru = p.nisn;
    if (x.rombelBaru || x.nisnBaru) rencana.push(x);
  });
  return rencana;
}

// ---------- API ----------
function waAdminDapodikPratinjau(token, b64, namaFile) {
  var p = wajibAdmin_(token);
  var pd = dpkBacaXlsx_(b64);
  var d = dpkDataSim_();
  var h = dpkBandingkan_(pd, d.sim, d.rombelSim);
  var el = dpkRencanaElearning_(pd);
  var id = 'dpk_' + p.id + '_' + absId_();
  dpkCacheSimpan_(id, { pd: pd, namaFile: String(namaFile || '').slice(0, 120), oleh: p.id });
  var potong = function(a) { return a.slice(0, 400); };
  return {
    idPratinjau: id,
    jumlahDapodik: pd.length,
    jumlahSim: d.sim.filter(function(s) { return s.status === 'Aktif' || !s.status; }).length,
    sama: h.sama,
    rombelBaru: h.rombelBaru,
    baru: potong(h.baru.map(function(b) { return { nama: b.pd.nama, nisn: b.pd.nisn, rombel: b.pd.rombel, tgl: b.pd.tgl, jk: b.pd.jk }; })),
    berubah: potong(h.berubah.map(function(b) { return { nama: b.nama, ubah: b.ubah.map(function(u) { return { label: u.label, lama: String(u.lama || ''), baru: String(u.baru || '') }; }) }; })),
    hilang: potong(h.hilang),
    elearning: potong(el.map(function(x) { return { nama: x.nama, rombelLama: x.rombelLama, rombelBaru: x.rombelBaru, nisnBaru: x.nisnBaru }; })),
    jumlah: { baru: h.baru.length, berubah: h.berubah.length, hilang: h.hilang.length, elearning: el.length }
  };
}

// opsi: {tambahBaru, perbarui, nonaktifkanHilang, buatRombel, sinkronElearning, biodata} (boolean; biodata bawaan true)
function waAdminDapodikTerapkan(token, idPratinjau, opsi) {
  var p = wajibAdmin_(token);
  opsi = opsi || {};
  var simpan = dpkCacheAmbil_(String(idPratinjau || ''));
  if (!simpan || simpan.oleh !== p.id) throw new Error('Pratinjau sudah kedaluwarsa (lebih dari 1 jam). Unggah ulang file Dapodik.');
  var kunci = LockService.getScriptLock();
  kunci.waitLock(30000);
  try {
    var hasil = { rombelDibuat: 0, ditambah: 0, diperbarui: 0, dinonaktifkan: 0, elearning: 0, biodata: 0 };
    var d = dpkDataSim_();
    // 0. pengaman: file tidak lengkap tidak boleh menonaktifkan banyak warga belajar (dicek sebelum menulis apa pun)
    if (opsi.nonaktifkanHilang === true) {
      var cekAwal = dpkBandingkan_(simpan.pd, d.sim, d.rombelSim);
      var aktif = d.sim.filter(function(s) { return s.status === 'Aktif' || !s.status; }).length;
      if (cekAwal.hilang.length > Math.max(10, Math.round(aktif * 0.3))) throw new Error(cekAwal.hilang.length + ' warga belajar aktif tidak ada di file ini (lebih dari 30%). Pastikan file Dapodik lengkap untuk semua rombel sebelum menonaktifkan.');
    }
    // 1. rombel yang belum ada
    if (opsi.buatRombel === true) {
      var awal = dpkBandingkan_(simpan.pd, d.sim, d.rombelSim);
      awal.rombelBaru.forEach(function(nama) {
        var m = /^([ABC])(\d{1,2})$/.exec(nama);
        var kelas = m ? Number(m[2]) : 0;
        d.rb.sh.appendRow(absBaris_(d.rb, {
          'ID ROMBEL': absId_(), 'NAMA ROMBEL': nama, 'PROGRAM': m ? 'PKT-' + m[1] : '',
          'TINGKAT': kelas >= 1 && kelas <= 12 ? DPK.TINGKAT[kelas - 1] : '', 'TUTOR': '', 'AKTIF': true
        }));
        hasil.rombelDibuat++;
      });
      if (hasil.rombelDibuat) d = dpkDataSim_();
    }
    var h = dpkBandingkan_(simpan.pd, d.sim, d.rombelSim);
    var sh = d.t.sh;
    var teksKolom = { 'NISN': true, 'NIK': true, 'NO HP': true };
    var tulis = function(baris, kolom, nilai) {
      var c = absCol_(d.t, kolom);
      if (c < 0) return;
      var sel = sh.getRange(baris, c + 1);
      if (teksKolom[kolom]) sel.setNumberFormat('@');
      sel.setValue(nilai);
    };
    // 2. perbarui baris yang berubah
    if (opsi.perbarui === true) {
      h.berubah.forEach(function(b) {
        b.ubah.forEach(function(u) {
          if (u.kolom === 'ROMBEL') { if (b.idRombel) tulis(b.baris, 'ROMBEL', b.idRombel); }
          else tulis(b.baris, u.kolom, u.baru);
        });
        hasil.diperbarui++;
      });
    }
    // 3. tambah peserta didik baru
    if (opsi.tambahBaru === true) {
      h.baru.forEach(function(b) {
        var pd = b.pd;
        sh.appendRow(absBaris_(d.t, {
          'ID WB': 'WB-' + absId_(), 'NAMA WB': pd.nama, 'JENIS KELAMIN': pd.jk, 'TEMPAT LAHIR': pd.tempat,
          'TANGGAL LAHIR': pd.tgl, 'ROMBEL': b.idRombel, 'STATUS': 'Aktif'
        }));
        var baris = sh.getLastRow();
        if (pd.nisn) tulis(baris, 'NISN', pd.nisn);
        if (pd.nik) tulis(baris, 'NIK', pd.nik);
        if (pd.hp) tulis(baris, 'NO HP', pd.hp);
        hasil.ditambah++;
      });
    }
    // 4. nonaktifkan yang tidak ada lagi di Dapodik
    if (opsi.nonaktifkanHilang === true) {
      h.hilang.forEach(function(x) { tulis(x.baris, 'STATUS', 'Nonaktif'); hasil.dinonaktifkan++; });
    }
    SpreadsheetApp.flush();
    absLupakan_();
    // 5. sheet Siswa e-learning mengikuti Dapodik (rombel + NISN yang kosong)
    if (opsi.sinkronElearning === true) {
      var shEl = getSheet(CONFIG.SHEETS.SISWA);
      dpkRencanaElearning_(simpan.pd).forEach(function(x) {
        if (x.rombelBaru) shEl.getRange(x.baris, 1).setValue(x.rombelBaru);
        if (x.nisnBaru) shEl.getRange(x.baris, 7).setNumberFormat('@').setValue(x.nisnBaru);
        hasil.elearning++;
      });
    }
    // 6. biodata lengkap (agama, alamat, orang tua/wali) untuk halaman biodata rapor
    if (opsi.biodata !== false && typeof bioSimpanDariDapodik_ === 'function') hasil.biodata = bioSimpanDariDapodik_(simpan.pd);
    try {
      catat_(p.peran, '', p.nama, 'Impor Dapodik', simpan.namaFile + ': +' + hasil.ditambah + ' baru, ' + hasil.diperbarui + ' diperbarui, ' +
        hasil.dinonaktifkan + ' nonaktif, ' + hasil.rombelDibuat + ' rombel baru, ' + hasil.elearning + ' siswa e-learning, ' + hasil.biodata + ' biodata', 'OK');
    } catch (e) {}
    return hasil;
  } finally {
    kunci.releaseLock();
  }
}
