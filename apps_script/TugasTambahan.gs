// ============================================================================
// TUGAS TAMBAHAN: TUTOR (v1.73.0)
// - Akun dengan peran utama selain Tutor (mis. Koordinator Unit) dapat diberi tugas tambahan sebagai Tutor oleh Admin
//   (menu Kelola Pengguna). Satu akun, satu kode akses.
// - Setelah masuk, pengguna dapat beralih ke "mode Tutor" dan kembali ke peran utama. Dalam mode Tutor, akun bekerja
//   persis seperti tutor: penugasan diambil dari Pemetaan (Tutor Online per unit / jadwal tatap muka).
// - Honor: akun bertugas tambahan TIDAK mendapat honor tutor (honor bersifat global untuk peran utamanya).
// - Data: tab TUGAS TAMBAHAN (ID PENGGUNA, NAMA, TUGAS, AKTIF, DIUBAH OLEH, DIUBAH PADA).
// ============================================================================
var TG = { TAB: 'TUGAS TAMBAHAN', HDR: ['ID PENGGUNA', 'NAMA', 'TUGAS', 'AKTIF', 'DIUBAH OLEH', 'DIUBAH PADA'], DURASI: 21600 };
var TG_MEMO_ = null;

function tgPeta_() {
  if (TG_MEMO_) return TG_MEMO_;
  var out = {};
  try {
    var c = CacheService.getScriptCache(), l = c.get('tg_peta');
    if (l) return (TG_MEMO_ = JSON.parse(l));
    var t = absBaca_(TG.TAB, TG.HDR);
    for (var i = 1; i < t.v.length; i++) {
      var id = sTeks_(absNilai_(t, t.v[i], 'ID PENGGUNA')).trim();
      if (id && sTeks_(absNilai_(t, t.v[i], 'TUGAS')).trim() === 'Tutor' && absBenar_(absNilai_(t, t.v[i], 'AKTIF'))) out[id] = true;
    }
    try { c.put('tg_peta', JSON.stringify(out), 600); } catch (e1) {}
  } catch (e) {}
  return (TG_MEMO_ = out);
}
function tgTambahanTutor_(u) { return !!u && u.peran !== 'Tutor' && tgPeta_()[u.id] === true; }

// Dipanggil stafDariToken_: bila sesi sedang mode Tutor, kembalikan salinan akun berperan Tutor.
function tgTerapkanMode_(u, token) {
  try {
    if (!u || !token || !tgTambahanTutor_(u)) return u;
    if (CacheService.getScriptCache().get('mode_' + token) !== 'Tutor') return u;
    var x = {};
    Object.keys(u).forEach(function(k) { x[k] = u[k]; });
    x.peranUtama = u.peranKustom || u.peran;
    x.peran = 'Tutor'; x.peranKustom = '';
    return x;
  } catch (e) { return u; }
}

// mode: 'Tutor' | 'utama'
function waStafGantiMode(token, mode) {
  var p = stafDariToken_(token);
  var asli = null;
  bacaPengguna_().forEach(function(u) { if (u.id === p.id) asli = u; });
  if (!asli || !tgTambahanTutor_(asli)) throw new Error('Akun Anda tidak memiliki tugas tambahan sebagai Tutor.');
  var c = CacheService.getScriptCache();
  if (mode === 'Tutor') c.put('mode_' + token, 'Tutor', TG.DURASI); else c.remove('mode_' + token);
  try { catat_(asli.peran, asli.id, asli.nama, 'Ganti mode', mode === 'Tutor' ? 'Mode Tutor' : 'Peran utama', 'OK'); } catch (e) {}
  return { peran: mode === 'Tutor' ? 'Tutor' : asli.peran, peranUtama: asli.peranKustom || asli.peran };
}

// Admin: beri / cabut tugas tambahan Tutor.
function waAdminTugasTambahan(token, idPengguna, aktif) {
  var me = wajibAdmin_(token);
  var u = null;
  bacaPengguna_().forEach(function(x) { if (x.id === String(idPengguna)) u = x; });
  if (!u) throw new Error('Pengguna tidak ditemukan.');
  if (u.peran === 'Tutor' && aktif) throw new Error('Pengguna ini sudah berperan Tutor.');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var t = absBaca_(TG.TAB, TG.HDR), b = 0;
    for (var i = 1; i < t.v.length; i++) {
      if (sTeks_(absNilai_(t, t.v[i], 'ID PENGGUNA')).trim() === u.id && sTeks_(absNilai_(t, t.v[i], 'TUGAS')).trim() === 'Tutor') { b = i + 1; break; }
    }
    var isi = { 'ID PENGGUNA': u.id, 'NAMA': u.nama, 'TUGAS': 'Tutor', 'AKTIF': !!aktif, 'DIUBAH OLEH': me.nama, 'DIUBAH PADA': absWaktu_() };
    if (b) Object.keys(isi).forEach(function(h) { var c = absCol_(t, h); if (c >= 0) t.sh.getRange(b, c + 1).setValue(isi[h]); });
    else if (aktif) t.sh.appendRow(absBaris_(t, isi));
    absLupakan_(TG.TAB);
  } finally { try { SpreadsheetApp.flush(); } catch (eF) {} lock.releaseLock(); }
  TG_MEMO_ = null;
  try { CacheService.getScriptCache().remove('tg_peta'); } catch (e) {}
  try { if (typeof perfHapusCache_ === 'function') perfHapusCache_(); } catch (e2) {}
  catat_(me.peran, u.id, me.nama, 'Tugas tambahan', u.nama + ': Tutor ' + (aktif ? 'diberikan' : 'dicabut'), 'OK');
  return { sukses: true };
}
