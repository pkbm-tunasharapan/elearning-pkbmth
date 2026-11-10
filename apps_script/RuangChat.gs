// ============================================================
// RUANG CHAT
// ------------------------------------------------------------
// Satu sheet "Chat" dipakai semua ruang. Kolom A = kunci ruang:
//   <ID Rombel>      -> Chatroom Rombel (khusus siswa satu rombel; cara lama, tidak berubah)
//   MAPEL:<ID Mapel> -> chat mapel untuk SATU kelas: siswa kelas itu + tutor pengampu (admin juga)
//   STAF             -> Ruang Staf: tutor, admin, owner (siswa tidak bisa masuk)
// Kolom: [kunci ruang, nama, teks, waktu, peran]. Kolom peran (Siswa/Tutor/Admin) baru;
// baris lama tanpa peran dianggap Siswa.
//
// Keamanan: kelas lain tidak bisa melihat ruang mapel kelas ini, karena
//   - siswa: nama harus terdaftar di rombel itu dan mapel harus milik rombelnya;
//   - staf : token sesi diperiksa ulang; tutor hanya mapel yang di-enroll; admin semua mapel.
// ============================================================

var RUANG = {
  STAF: 'STAF',
  AWALAN_MAPEL: 'MAPEL:',
  MAKS_TEKS: 500,
  MAKS_BACA: 80,       // paling banyak pesan dikirim per permintaan baca
  MAKS_PINDAI: 700,    // paling banyak baris terakhir sheet yang dipindai
  AMBANG_ONLINE_MS: 20000,
  BATAS_KIRIM: 8,      // pesan per jendela
  JENDELA_KIRIM_DETIK: 10,
  TTL_IZIN_DETIK: 300
};

function msDariSel_(w) {
  var ms = (w instanceof Date) ? w.getTime() : new Date(w).getTime();
  return isNaN(ms) ? 0 : ms;
}

// Sheet lama bisa saja punya kolom lebih sedikit dari yang diminta; jangan sampai getRange gagal.
function lebarAman_(sheet, lebar) {
  var maks = sheet.getMaxColumns ? sheet.getMaxColumns() : lebar;
  return Math.max(1, Math.min(lebar, maks));
}

function siswaTerdaftar_(nama, idRombel) {
  var v = getSheetData(CONFIG.SHEETS.SISWA);
  var n = normNama_(nama);
  if (!n) return false;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim() === String(idRombel).trim() && normNama_(v[i][1]) === n) return true;
  }
  return false;
}

function mapelMilikRombel_(idMapel, idRombel) {
  var ada = false;
  mapelAktifSemua_().forEach(function(m) {
    if (m.idMapel === String(idMapel) && m.idRombel === String(idRombel)) ada = true;
  });
  return ada;
}

// Mengubah (nama, idRombel, kunci dari klien) menjadi kunci penyimpanan yang sah, atau melempar galat.
function ruangSiswa_(nama, idRombel, kunci) {
  nama = String(nama || '').trim();
  idRombel = String(idRombel || '').trim();
  var k = String(kunci || 'ROMBEL').trim();
  if (!nama || !idRombel) throw new Error('Data siswa tidak lengkap.');
  var cache = CacheService.getScriptCache();
  var ck = 'rgs|' + normNama_(nama) + '|' + idRombel + '|' + k;
  var simpan = (k === 'ROMBEL') ? idRombel : k;
  if (cache.get(ck) === '1') return simpan;
  if (!siswaTerdaftar_(nama, idRombel)) throw new Error('Siswa tidak dikenali.');
  if (k !== 'ROMBEL') {
    var idMapel = (k.indexOf(RUANG.AWALAN_MAPEL) === 0) ? k.substring(RUANG.AWALAN_MAPEL.length) : '';
    if (!idMapel || !mapelMilikRombel_(idMapel, idRombel)) throw new Error('Ruang chat ini bukan untuk kelas Anda.');
  }
  cache.put(ck, '1', RUANG.TTL_IZIN_DETIK);
  return simpan;
}

// Staf: kembalikan {p, kunci}. STAF boleh untuk semua staf; MAPEL:<id> lewat wajibMapel_.
function ruangStaf_(token, kunci) {
  var k = String(kunci || '').trim();
  if (k === RUANG.STAF) return { p: stafDariToken_(token), kunci: k };
  if (k.indexOf(RUANG.AWALAN_MAPEL) === 0) {
    var r = wajibMapel_(token, k.substring(RUANG.AWALAN_MAPEL.length));
    return { p: r.p, kunci: k };
  }
  throw new Error('Ruang chat tidak dikenal.');
}

// ---------- kehadiran (online) ----------
function tandaiHadirRuang_(kunci, nama, peran) {
  var sheet = getSheet(CONFIG.SHEETS.KEHADIRAN);
  var last = sheet.getLastRow();
  var now = new Date();
  if (last >= 2) {
    var v = sheet.getRange(2, 1, last - 1, 2).getValues();
    for (var i = 0; i < v.length; i++) {
      if (String(v[i][0]) === String(kunci) && v[i][1] === nama) {
        sheet.getRange(i + 2, 3).setValue(now);
        return;
      }
    }
  }
  sheet.appendRow([kunci, nama, now, peran]);
}

function daftarHadirRuang_(kunci) {
  var sheet = getSheet(CONFIG.SHEETS.KEHADIRAN);
  var last = sheet.getLastRow();
  var out = [];
  if (last < 2) return out;
  var v = sheet.getRange(2, 1, last - 1, lebarAman_(sheet, 4)).getValues();
  var now = Date.now();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0]) !== String(kunci)) continue;
    var ms = msDariSel_(v[i][2]);
    if (ms && (now - ms) <= RUANG.AMBANG_ONLINE_MS) out.push({ nama: String(v[i][1]), peran: String(v[i][3] || 'Siswa') });
  }
  out.sort(function(a, b) { return a.nama < b.nama ? -1 : (a.nama > b.nama ? 1 : 0); });
  return out;
}

// ---------- baca & kirim ----------
function bacaPesanRuang_(kunci, sejakMs) {
  var sheet = getSheet(CONFIG.SHEETS.CHAT);
  var last = sheet.getLastRow();
  var hasil = [];
  if (last < 2) return hasil;
  var mulai = Math.max(2, last - RUANG.MAKS_PINDAI + 1);
  var v = sheet.getRange(mulai, 1, last - mulai + 1, lebarAman_(sheet, 5)).getValues();
  var ambang = Number(sejakMs) || 0;
  for (var i = v.length - 1; i >= 0; i--) {
    var r = v[i];
    if (String(r[0]) !== String(kunci)) continue;
    var ms = msDariSel_(r[3]);
    if (!ms || ms <= ambang) break;   // baris berurutan waktu: yang lebih lama pasti sudah dibaca
    hasil.push({ nama: String(r[1]), pesan: String(r[2]), waktu: ms, peran: String(r[4] || 'Siswa') });
    if (hasil.length >= RUANG.MAKS_BACA) break;
  }
  hasil.reverse();
  return hasil;
}

function pollRuang_(kunci, nama, peran, sejakMs) {
  tandaiHadirRuang_(kunci, nama, peran);
  return {
    online: daftarHadirRuang_(kunci),
    chatBaru: bacaPesanRuang_(kunci, sejakMs),
    sekarangMs: Date.now()
  };
}

function kirimRuang_(kunci, nama, peran, pesan) {
  var teks = String(pesan === null || pesan === undefined ? '' : pesan).trim();
  if (!teks) return { sukses: false, pesan: 'Pesan tidak boleh kosong.' };
  if (teks.length > RUANG.MAKS_TEKS) teks = teks.substring(0, RUANG.MAKS_TEKS);
  if (hitung_('cht|' + peran + '|' + normNama_(nama), RUANG.JENDELA_KIRIM_DETIK) > RUANG.BATAS_KIRIM) {
    return { sukses: false, pesan: 'Terlalu cepat. Tunggu sebentar lalu kirim lagi.' };
  }
  var now = new Date();
  getSheet(CONFIG.SHEETS.CHAT).appendRow([kunci, nama, teks, now, peran]);
  tandaiHadirRuang_(kunci, nama, peran);
  return { sukses: true, waktu: now.getTime() };
}

// ---------- endpoint siswa ----------
function waRuangPoll(nama, idRombel, kunci, sejakMs) {
  var k = ruangSiswa_(nama, idRombel, kunci);
  return pollRuang_(k, String(nama).trim(), 'Siswa', sejakMs);
}

function waRuangKirim(nama, idRombel, kunci, pesan) {
  var k = ruangSiswa_(nama, idRombel, kunci);
  return kirimRuang_(k, String(nama).trim(), 'Siswa', pesan);
}

// ---------- endpoint staf ----------
// Daftar ruang yang boleh dimasuki: Ruang Staf + chat tiap mapel yang diampu (admin: semua mapel aktif).
function waStafRuangDaftar(token) {
  var p = stafDariToken_(token);
  var profil = waStafProfil(token);
  var ruang = [{ kunci: RUANG.STAF, nama: 'Ruang Staf', keterangan: 'Tutor, admin, dan owner', jenis: 'staf' }];
  profil.mapel.slice().sort(function(a, b) {
    return (a.namaRombel + a.namaMapel).localeCompare(b.namaRombel + b.namaMapel);
  }).forEach(function(m) {
    ruang.push({
      kunci: kunciRuangMapel_(m.idMapel), nama: m.namaMapel, keterangan: m.namaRombel,
      jenis: 'mapel', idMapel: m.idMapel, idRombel: m.idRombel
    });
  });
  return { saya: { nama: p.nama, peran: p.peran }, ruang: ruang };
}

function kunciRuangMapel_(idMapel) { return RUANG.AWALAN_MAPEL + idMapel; }

function waStafRuangPoll(token, kunci, sejakMs) {
  var r = ruangStaf_(token, kunci);
  return pollRuang_(r.kunci, r.p.nama, r.p.peran, sejakMs);
}

function waStafRuangKirim(token, kunci, pesan) {
  var r = ruangStaf_(token, kunci);
  return kirimRuang_(r.kunci, r.p.nama, r.p.peran, pesan);
}


// ---------- notifikasi pesan baru lintas ruang (siswa dan staf) ----------
// Satu panggilan murah untuk SEMUA ruang yang boleh dilihat pemanggil; dipakai klien untuk bunyi dan kartu pemberitahuan.
// sejakMs = 0 hanya menetapkan titik awal (tanpa pesan). Pesan milik pemanggil sendiri tidak dikembalikan.
RUANG.MAKS_NOTIF = 20;
RUANG.TTL_PETA_DETIK = 300;

function notifPesanBaru_(peta, nama, peran, sejakMs) {
  var sekarang = Date.now();
  var ambang = Number(sejakMs) || 0;
  if (!ambang) return { baru: [], sekarangMs: sekarang };
  var sheet = getSheet(CONFIG.SHEETS.CHAT);
  var last = sheet.getLastRow();
  var hasil = [];
  if (last >= 2) {
    var mulai = Math.max(2, last - RUANG.MAKS_PINDAI + 1);
    var v = sheet.getRange(mulai, 1, last - mulai + 1, lebarAman_(sheet, 5)).getValues();
    var saya = normNama_(nama);
    for (var i = v.length - 1; i >= 0; i--) {
      var r = v[i];
      var ms = msDariSel_(r[3]);
      if (!ms || ms < ambang) break;   // sama dengan titik awal ikut dikembalikan; klien membuang duplikat
      var kl = peta[String(r[0])];
      if (!kl) continue;
      var p = String(r[4] || 'Siswa');
      if (p === peran && normNama_(r[1]) === saya) continue;
      hasil.push({ kunci: kl, nama: String(r[1]), peran: p, pesan: String(r[2]).substring(0, 140), waktu: ms });
      if (hasil.length >= RUANG.MAKS_NOTIF) break;
    }
  }
  hasil.reverse();
  return { baru: hasil, sekarangMs: sekarang };
}

function notifPetaSiswa_(idRombel) {
  var id = String(idRombel).trim();
  var cache = CacheService.getScriptCache(), ck = 'rcp|' + id;
  var s = cache.get(ck);
  if (s) { try { return JSON.parse(s); } catch (e) {} }
  var peta = {};
  peta[id] = 'ROMBEL';
  mapelAktifSemua_().forEach(function(m) {
    if (String(m.idRombel) === id) peta[RUANG.AWALAN_MAPEL + m.idMapel] = RUANG.AWALAN_MAPEL + m.idMapel;
  });
  cache.put(ck, JSON.stringify(peta), RUANG.TTL_PETA_DETIK);
  return peta;
}

function notifPetaStaf_(token, p) {
  var cache = CacheService.getScriptCache(), ck = 'rcs|' + p.id;
  var s = cache.get(ck);
  if (s) { try { return JSON.parse(s); } catch (e) {} }
  var peta = {};
  peta[RUANG.STAF] = RUANG.STAF;
  waStafProfil(token).mapel.forEach(function(m) { peta[RUANG.AWALAN_MAPEL + m.idMapel] = RUANG.AWALAN_MAPEL + m.idMapel; });
  cache.put(ck, JSON.stringify(peta), RUANG.TTL_PETA_DETIK);
  return peta;
}

// sejakNilaiMs (opsional): batas bawah untuk nilai baru dari tutor (lihat nvBaru_). 0 = beberapa hari terakhir.
function waRuangCek(nama, idRombel, sejakMs, sejakNilaiMs) {
  ruangSiswa_(nama, idRombel, 'ROMBEL');
  var h = notifPesanBaru_(notifPetaSiswa_(idRombel), String(nama).trim(), 'Siswa', sejakMs);
  try { h.nilai = nvBaru_(idRombel, nama, sejakNilaiMs, h.sekarangMs); } catch (e) { h.nilai = []; }
  return h;
}

// sejakJawabanMs (opsional): batas bawah untuk jawaban diskusi baru dari siswa (lihat nvBaruStaf_).
function waStafRuangCek(token, sejakMs, sejakJawabanMs) {
  var p = stafDariToken_(token);
  var peta = notifPetaStaf_(token, p);
  var h = notifPesanBaru_(peta, p.nama, p.peran, sejakMs);
  try {
    // notifikasi jawaban diskusi baru hanya untuk tutor pengampu mapel itu (penilaian = tanggung jawab pengampu)
    var milik = ndMilikMap_(p), petaNilai = {};
    Object.keys(peta).forEach(function(k) { if (k.indexOf(RUANG.AWALAN_MAPEL) === 0 && milik[k.slice(RUANG.AWALAN_MAPEL.length)] === true) petaNilai[k] = peta[k]; });
    h.jawaban = nvBaruStaf_(petaNilai, sejakJawabanMs, h.sekarangMs);
  } catch (e) { h.jawaban = []; }
  return h;
}
