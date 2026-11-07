// ============================================================================
// DATA INDUK MASSAL (aplikasi 1.24): ubah atau nonaktifkan banyak baris sekaligus
// dari tabel Data Induk (aplikasi & web). Satu permintaan, diproses di server
// memakai fungsi yang sama dengan simpan satuan, sehingga aturan & hak akses tetap sama.
// ============================================================================
var IKM = { MAKS: 300 };

function ikmDaftar_(daftar) {
  if (!Array.isArray(daftar) || !daftar.length) throw new Error('Tidak ada baris yang dipilih.');
  if (daftar.length > IKM.MAKS) throw new Error('Maksimal ' + IKM.MAKS + ' baris sekali proses.');
  return daftar;
}

// daftar: [{_id, KOLOM: nilai, ...}] (baris lengkap seperti form satuan)
function waStafIndukSimpanBanyak(token, tabel, daftar) {
  ikmDaftar_(daftar);
  var ok = 0, gagal = [];
  daftar.forEach(function(d) {
    try { waStafIndukSimpan(token, tabel, d); ok++; }
    catch (e) { gagal.push({ id: String((d && d._id) || ''), pesan: String((e && e.message) || e) }); }
  });
  try { absLupakan_(); } catch (e2) {}
  return { ok: ok, gagal: gagal };
}

// ids: ['_id', ...]
function waStafIndukNonaktifBanyak(token, tabel, ids) {
  ikmDaftar_(ids);
  var ok = 0, gagal = [];
  ids.forEach(function(id) {
    try { waStafIndukNonaktif(token, tabel, String(id)); ok++; }
    catch (e) { gagal.push({ id: String(id), pesan: String((e && e.message) || e) }); }
  });
  try { absLupakan_(); } catch (e2) {}
  return { ok: ok, gagal: gagal };
}
