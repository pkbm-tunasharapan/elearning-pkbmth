// ============================================================================
// KECEPATAN (v1.42.0, Fase 2)
// ----------------------------------------------------------------------------
// Penanda "terakhir berubah" per jenis data di CacheService:
//   chat - pesan chat baru (kirimRuang_)          nv  - baris Notifikasi baru (nilai diskusi / jawaban baru)
//   jwb  - isi tab Jawaban berubah (kirim jawaban, simpan nilai, nilai otomatis)
// Dipakai untuk:
//   - jalur cepat pemeriksaan chat (waRuangCek / waStafRuangCek): bila tidak ada yang baru sejak pemeriksaan
//     terakhir, server langsung menjawab tanpa membaca spreadsheet;
//   - cache "Belum dinilai" per pengguna yang otomatis basi saat Jawaban berubah.
// Bila penanda hilang dari cache (dibuang Google), jalur lengkap dipakai (aman, hanya lebih lambat).
// ============================================================================
var KCP = { AWALAN: 'kcp|', TTL: 21600, TTL_BELUM: 300 };

function kcpTanda_(jenis, ms) {
  try { CacheService.getScriptCache().put(KCP.AWALAN + jenis, String(ms || new Date().getTime()), KCP.TTL); } catch (e) {}
}
function kcpAkhir_(jenis) {
  try { return Number(CacheService.getScriptCache().get(KCP.AWALAN + jenis)) || 0; } catch (e) { return 0; }
}
// Isi penanda dari data yang kebetulan sudah dibaca (bila belum ada).
function kcpIsiBila_(jenis, ms) { if (ms && !kcpAkhir_(jenis)) kcpTanda_(jenis, ms); }

// Jalur cepat: true bila pasti tidak ada chat & notifikasi baru sejak titik-titik ini.
function kcpTakAdaBaru_(sejakChatMs, sejakNvMs) {
  var a = Number(sejakChatMs) || 0, b = Number(sejakNvMs) || 0;
  if (!a || !b) return false;
  var chat = kcpAkhir_('chat'), nv = kcpAkhir_('nv');
  return !!(chat && nv && chat < a && nv < b);
}

// "Belum dinilai" dengan cache per pengguna (basi otomatis saat Jawaban berubah).
function waStafBelumDinilai(token) {
  var p = stafDariToken_(token), c = CacheService.getScriptCache();
  var ck = 'bdn|' + p.id + '|' + (p.proksi || '') + '|' + kcpAkhir_('jwb');
  try { var lama = c.get(ck); if (lama) return JSON.parse(lama); } catch (e) {}
  var h = waStafBelumDinilaiInti_(token);
  try { var s = JSON.stringify(h); if (s.length < 90000) c.put(ck, s, KCP.TTL_BELUM); } catch (e2) {}
  return h;
}
