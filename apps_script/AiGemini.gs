// ============================================================
// UPLOAD PDF -> MATERI / DISKUSI / UJIAN OTOMATIS (GEMINI)
// ------------------------------------------------------------
// Alur bagi tutor: pilih mapel -> unggah PDF -> pilih konteks (materi / diskusi / ujian / semuanya) -> Proses.
// Prompt dibangun otomatis dari data mapel & kelas dan TIDAK pernah ditampilkan.
// Hasil dimasukkan ke mapel itu dengan Status "Draft" (pending, perlu review). Tutor mengedit lalu menekan Post.
//
// Kunci API Gemini disimpan HANYA di Script Properties (GEMINI_API_KEY) dan tidak pernah dikirim ke browser.
//   1. Browser meminta tautan unggah sementara ke server (server memanggil Gemini dengan kunci).
//   2. Browser mengunggah byte PDF langsung ke tautan itu (tautan sementara, bukan kunci).
//   3. Server memanggil generateContent dengan referensi file -> JSON -> baris Draft di sheet.
// Satu panggilan server = satu konteks, supaya tiap proses jauh di bawah batas 6 menit Apps Script.
// ============================================================

var AI = {
  PROP_KUNCI: 'GEMINI_API_KEY',
  PROP_MODEL: 'GEMINI_MODEL',
  MODEL_DEFAULT: 'gemini-3.8-flash',
  BASE: 'https://generativelanguage.googleapis.com',
  MAKS_BYTE_PDF: 60 * 1024 * 1024,
  MAKS_PROSES_PER_JAM: 60,
  MAKS_PERCOBAAN: 3,
  MAKS_DETIK_TOTAL: 270,
  MIN_SOAL: 3,
  MAKS_SOAL: 40,
  KONTEKS: ['materi', 'diskusi', 'ujian'],
  // Peran yang boleh melihat/mengubah hal teknis (kunci API, model, detail galat layanan AI).
  // Owner = Admin. Untuk peran koordinator di masa depan, cukup tambahkan namanya di sini
  // (dan di fungsi wajibAdmin_ bila perlu akses ke halaman pengaturan).
  PERAN_TEKNIS: ['Admin']
};

function aiKunci_() {
  return PropertiesService.getScriptProperties().getProperty(AI.PROP_KUNCI) || '';
}

function aiModel_() {
  return PropertiesService.getScriptProperties().getProperty(AI.PROP_MODEL) || AI.MODEL_DEFAULT;
}

function aiBolehTeknis_(p) {
  return !!(p && AI.PERAN_TEKNIS.indexOf(String(p.peran)) >= 0);
}

// Tutor tidak perlu melihat urusan teknis (kunci, model, izin). Detailnya dicatat di Log Aktivitas untuk admin.
function aiPesanUntukPeran_(token, e) {
  var msg = String((e && e.message) || e || 'Terjadi kesalahan.');
  var p = null;
  try { p = stafDariToken_(token); } catch (x) { return msg; }
  if (aiBolehTeknis_(p)) return msg;
  if (/Kunci API|Pengaturan AI|belum diaktifkan|Model Gemini|izin|ditolak \(|menolak permintaan|tidak memberikan tautan/i.test(msg)) {
    try { catat_(p.peran, '-', p.nama, 'AI galat', msg.slice(0, 200), 'GAGAL'); } catch (x2) {}
    return 'Layanan buat otomatis sedang tidak tersedia. Silakan hubungi admin.';
  }
  return msg.replace(/Gemini/g, 'AI');
}

function aiLindungi_(token, fn) {
  try { return fn(); } catch (e) { throw new Error(aiPesanUntukPeran_(token, e)); }
}

function aiWajibSiap_() {
  if (!aiKunci_()) throw new Error('Fitur AI belum diaktifkan. Minta admin mengisi kunci Gemini di tab "Pengaturan AI".');
}

// ---------- pengaturan (admin) ----------
function waAdminAiStatus(token) {
  wajibAdmin_(token);
  return { kunciTerisi: !!aiKunci_(), model: aiModel_(), modelDefault: AI.MODEL_DEFAULT };
}

function waAdminAiSimpan(token, kunci, model) {
  var p = wajibAdmin_(token);
  var props = PropertiesService.getScriptProperties();
  var k = String(kunci || '').trim();
  if (k) {
    if (!/^[A-Za-z0-9._\-]{20,200}$/.test(k)) throw new Error('Format kunci API tidak valid.');
    props.setProperty(AI.PROP_KUNCI, k);
  }
  // Kode model harus persis seperti di dokumentasi Gemini: huruf kecil, angka, titik, tanda hubung, tanpa spasi (mis. gemini-3.5-flash-lite).
  // Awalan "models/" dan huruf besar dirapikan otomatis; nama tampilan seperti "Flash-Lite" ditolak.
  var m = String(model || '').trim().replace(/^models\//i, '').toLowerCase();
  if (m) {
    if (!/^gemini-[a-z0-9.\-]{2,50}$/.test(m)) throw new Error('Nama model tidak valid. Isi KODE model, bukan nama tampilannya: huruf kecil, tanda hubung, tanpa spasi, diawali "gemini-". Contoh: gemini-3.5-flash-lite');
    props.setProperty(AI.PROP_MODEL, m);
  }
  catat_('Admin', '-', p.nama, 'AI simpan pengaturan', (k ? 'kunci diperbarui; ' : '') + 'model ' + aiModel_(), 'OK');
  return { kunciTerisi: !!aiKunci_(), model: aiModel_() };
}

function waAdminAiUji(token) {
  wajibAdmin_(token);
  aiWajibSiap_();
  var res = aiPanggil_('POST', AI.BASE + '/v1beta/models/' + aiModel_() + ':generateContent', {
    contents: [{ role: 'user', parts: [{ text: 'Balas hanya dengan kata: siap' }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 512 }
  }, { maks: 1 });
  var teks = aiTeksDariRespons_(res.json, true);
  return { sukses: true, model: aiModel_(), balasan: String(teks || '(terhubung)').slice(0, 40) };
}

// Dijalankan pemilik sekali dari editor agar Google meminta izin "menghubungi layanan eksternal".
function menuSetujuiIzinGemini() {
  var r = UrlFetchApp.fetch(AI.BASE + '/', { muteHttpExceptions: true });
  var pesan = 'Izin layanan eksternal sudah aktif (kode ' + r.getResponseCode() + '). Kunci Gemini diisi lewat halaman admin > Pengaturan AI.';
  try { SpreadsheetApp.getUi().alert(pesan); } catch (e) {}
  return pesan;
}

// ---------- panggilan HTTP ke Gemini ----------
// Tingkat "thinking" Gemini: model Flash terbaru berpikir level medium secara default, dan di tier gratis itu bisa membuat
// satu jawaban memakan beberapa menit. opsi.pikir ('low') menurunkannya. Bila API menolak kolom itu (400), kolom dibuang
// dan penolakan diingat 6 jam supaya panggilan berikutnya tidak membuang waktu.
var AI_KUNCI_PIKIR_MATI = 'ai_pikir_mati';
function aiPikirMati_() {
  try { return !!CacheService.getScriptCache().get(AI_KUNCI_PIKIR_MATI); } catch (e) { return false; }
}
function aiTandaiPikirMati_() {
  try { CacheService.getScriptCache().put(AI_KUNCI_PIKIR_MATI, '1', 21600); } catch (e) {}
}

// Info kuota dari galat 429: berapa detik harus menunggu dan apakah itu kuota harian.
function aiInfoKuota_(g) {
  var detik = 0;
  var teks = (g && g.teks) || '';
  var harian = /PerDay/i.test(teks);
  var det = g && g.json && g.json.error && g.json.error.details;
  if (det && det.length) {
    det.forEach(function(x) {
      var m = x && x.retryDelay ? String(x.retryDelay).match(/([\d.]+)\s*s/) : null;
      if (m) detik = Math.max(detik, Math.ceil(parseFloat(m[1])));
    });
  }
  if (!detik) {
    var pesan = (g && g.json && g.json.error && g.json.error.message) ? String(g.json.error.message) : '';
    var m2 = pesan.match(/retry in ([\d.]+)\s*s/i);
    if (m2) detik = Math.ceil(parseFloat(m2[1]));
  }
  return { detik: detik, harian: harian };
}

// Ringkasan pemakaian untuk Log Aktivitas (membantu admin melihat apa yang lambat/mahal).
function aiRingkasPakai_(res, mulai) {
  var u = res && res.json && res.json.usageMetadata;
  var s = Math.round((Date.now() - mulai) / 1000) + ' dtk';
  if (u) {
    if (u.promptTokenCount) s += ' · ' + u.promptTokenCount + ' token masuk';
    if (u.thoughtsTokenCount) s += ' · ' + u.thoughtsTokenCount + ' token pikir';
    if (u.candidatesTokenCount) s += ' · ' + u.candidatesTokenCount + ' token keluar';
  }
  return s;
}

function aiPanggil_(metode, url, badan, opsi) {
  aiWajibSiap_();
  var mulai = (opsi && opsi.mulai) || Date.now();
  var penanda = !!(opsi && opsi.penanda);
  var pikirDipasang = false;
  if (opsi && opsi.pikir && badan && badan.generationConfig && !aiPikirMati_()) {
    badan.generationConfig.thinkingConfig = { thinkingLevel: String(opsi.pikir) };
    pikirDipasang = true;
  }
  var param = {
    method: metode.toLowerCase(),
    muteHttpExceptions: true,
    headers: { 'x-goog-api-key': aiKunci_() }
  };
  if (badan !== undefined && badan !== null) {
    param.contentType = 'application/json';
    param.payload = JSON.stringify(badan);
  }
  var terakhir = null;
  var maks = (opsi && opsi.maks) || AI.MAKS_PERCOBAAN;
  for (var i = 0; i < maks; i++) {
    var resp = UrlFetchApp.fetch(url, param);
    var kode = resp.getResponseCode();
    var teks = resp.getContentText();
    var json = null;
    try { json = JSON.parse(teks); } catch (e) { json = null; }
    if (kode >= 200 && kode < 300) return { kode: kode, json: json, teks: teks, resp: resp };
    terakhir = { kode: kode, json: json, teks: teks };
    if (kode === 400 && pikirDipasang && /thinking|Unknown name|Invalid JSON payload/i.test(teks)) {
      // API menolak kolom thinking: buang, ingat, dan ulangi tanpa menghitung sebagai percobaan
      delete badan.generationConfig.thinkingConfig;
      pikirDipasang = false;
      aiTandaiPikirMati_();
      param.payload = JSON.stringify(badan);
      i--;
      continue;
    }
    if (kode === 429) {
      // 429 = kuota menit/hari habis. Menunggu beberapa detik di server hanya menghabiskan waktu 6 menit,
      // jadi: tunggu singkat bila diminta <= 15 detik, selain itu serahkan ke layar (hitung mundur lalu ulangi).
      var kuota = aiInfoKuota_(terakhir);
      if (kuota.harian || kuota.detik > 15 || i === maks - 1) break;
      if ((Date.now() - mulai) / 1000 > AI.MAKS_DETIK_TOTAL - 30) break;
      Utilities.sleep(Math.max(2, kuota.detik + 1) * 1000);
      continue;
    }
    var sementara = (kode === 500 || kode === 502 || kode === 503 || kode === 504);
    if (!sementara || i === maks - 1) break;
    if ((Date.now() - mulai) / 1000 > AI.MAKS_DETIK_TOTAL - 30) break;
    Utilities.sleep(2500 * (i + 1));
  }
  throw new Error(aiPesanGalat_(terakhir, penanda));
}

function aiPesanGalat_(g, penanda) {
  if (!g) return 'Gemini tidak merespons.';
  var msg = (g.json && g.json.error && g.json.error.message) ? String(g.json.error.message) : '';
  if (g.kode === 400 && /API key/i.test(msg)) return 'Kunci API Gemini tidak valid. Minta admin memeriksanya.';
  if (g.kode === 401 || g.kode === 403) return 'Kunci API Gemini ditolak (' + g.kode + '). Minta admin memeriksa kunci dan izinnya.';
  if (g.kode === 400 && /model name|unexpected model/i.test(msg)) return 'Model Gemini salah format. Admin: buka Pengaturan AI dan isi kode model, mis. gemini-3.5-flash-lite (huruf kecil, tanda hubung, tanpa spasi).';
  if (g.kode === 404) return 'Model Gemini tidak ditemukan. Minta admin memeriksa nama model di Pengaturan AI.';
  if (g.kode === 429) {
    var k = aiInfoKuota_(g);
    if (k.harian) return 'Kuota harian layanan Gemini gratis sudah habis. Kuota pulih setiap hari sekitar pukul 14.00-15.00 WIB. Coba lagi nanti.' + (penanda ? ' [harian]' : '');
    if (penanda) return 'Kuota Gemini sedang terlalu sering dipakai. Aplikasi akan mencoba lagi otomatis. [tunggu:' + Math.max(20, k.detik || 45) + ']';
    return 'Kuota Gemini sedang habis atau terlalu sering dipakai. Coba lagi beberapa menit lagi.';
  }
  if (g.kode === 503 || g.kode === 500) return 'Server Gemini sedang sibuk. Coba proses lagi sebentar lagi.';
  return 'Gemini menolak permintaan (' + g.kode + '): ' + (msg || 'tanpa keterangan').slice(0, 160);
}

function aiTeksDariRespons_(json, abaikanPotong) {
  if (!json) return '';
  if (json.promptFeedback && json.promptFeedback.blockReason) {
    throw new Error('Isi PDF ditolak oleh penyaring Gemini (' + json.promptFeedback.blockReason + ').');
  }
  var kand = json.candidates && json.candidates[0];
  if (!kand) return '';
  var out = '';
  var parts = (kand.content && kand.content.parts) || [];
  parts.forEach(function(p) { if (p && typeof p.text === 'string') out += p.text; });
  if (kand.finishReason === 'MAX_TOKENS' && !abaikanPotong) throw new Error('Hasil terlalu panjang dan terpotong. Kurangi jumlah soal atau gunakan PDF yang lebih pendek.');
  return out;
}

// ---------- unggah: bagian server ----------
function aiHeaderCari_(headers, nama) {
  var target = String(nama).toLowerCase();
  for (var k in headers) {
    if (String(k).toLowerCase() === target) return headers[k];
  }
  return '';
}

function waStafAiStatus(token) {
  stafDariToken_(token);
  return { siap: !!aiKunci_(), maksMB: Math.floor(AI.MAKS_BYTE_PDF / 1048576) };
}

function waStafAiMulaiUnggah(token, idMapel, namaFile, ukuran, mime) {
  return aiLindungi_(token, function() { return aiMulaiUnggahInti_(token, idMapel, namaFile, ukuran, mime); });
}

function aiMulaiUnggahInti_(token, idMapel, namaFile, ukuran, mime) {
  var r = wajibMapel_(token, idMapel);
  aiWajibSiap_();
  ukuran = Number(ukuran) || 0;
  if (String(mime) !== 'application/pdf') throw new Error('Berkas harus berformat PDF.');
  if (ukuran <= 0) throw new Error('Berkas kosong.');
  if (ukuran > AI.MAKS_BYTE_PDF) throw new Error('PDF terlalu besar. Maksimal ' + Math.floor(AI.MAKS_BYTE_PDF / 1048576) + ' MB.');
  var nama = String(namaFile || 'dokumen.pdf').replace(/[^\w.\- ]/g, '_').slice(0, 80);
  var resp = UrlFetchApp.fetch(AI.BASE + '/upload/v1beta/files', {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    headers: {
      'x-goog-api-key': aiKunci_(),
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(ukuran),
      'X-Goog-Upload-Header-Content-Type': 'application/pdf'
    },
    payload: JSON.stringify({ file: { display_name: 'bm-' + r.m.idMapel + '-' + nama } })
  });
  var kode = resp.getResponseCode();
  if (kode < 200 || kode >= 300) {
    var j = null;
    try { j = JSON.parse(resp.getContentText()); } catch (e) {}
    throw new Error(aiPesanGalat_({ kode: kode, json: j }));
  }
  var url = String(aiHeaderCari_(resp.getAllHeaders(), 'x-goog-upload-url') || '');
  if (url.indexOf(AI.BASE + '/') !== 0) throw new Error('Gemini tidak memberikan tautan unggah. Coba lagi.');
  return { uploadUrl: url };
}

function aiNamaFileValid_(nama) {
  return /^files\/[a-z0-9\-]{1,60}$/.test(String(nama || ''));
}

function aiRefFileValid_(ref) {
  return ref && aiNamaFileValid_(ref.name) && String(ref.uri || '').indexOf(AI.BASE + '/') === 0;
}

function aiTungguAktif_(nama) {
  var mulai = Date.now();
  for (var i = 0; i < 12; i++) {
    var res = aiPanggil_('GET', AI.BASE + '/v1beta/' + nama, null);
    var st = res.json && res.json.state;
    if (!st || st === 'ACTIVE') return;
    if (st === 'FAILED') throw new Error('Gemini gagal memproses PDF ini. Coba PDF lain.');
    if (Date.now() - mulai > 40000) break;
    Utilities.sleep(2500);
  }
  throw new Error('PDF masih diproses Gemini. Coba proses lagi sebentar lagi.');
}

function waStafAiBersihkan(token, namaFile) {
  stafDariToken_(token);
  if (!aiNamaFileValid_(namaFile)) return { sukses: false };
  try {
    UrlFetchApp.fetch(AI.BASE + '/v1beta/' + namaFile, { method: 'delete', muteHttpExceptions: true, headers: { 'x-goog-api-key': aiKunci_() } });
  } catch (e) {}
  return { sukses: true };
}

// ---------- prompt tersembunyi, dibangun dari data mapel ----------
function aiJenjang_(namaRombel) {
  var m = String(namaRombel || '').match(/([ABC])\s*-?\s*(\d{1,2})/i);
  if (!m) return { tingkat: 'Pendidikan Kesetaraan (PKBM)', fase: '', kelas: String(namaRombel || '') };
  var huruf = m[1].toUpperCase();
  var n = parseInt(m[2], 10);
  var fase = n <= 2 ? 'A' : n <= 4 ? 'B' : n <= 6 ? 'C' : n <= 9 ? 'D' : n === 10 ? 'E' : 'F';
  var tingkat = { A: 'SD/MI/Program Paket A', B: 'SMP/MTs/Program Paket B', C: 'SMA/MA/SMK/Program Paket C' }[huruf];
  return { tingkat: tingkat, fase: fase, kelas: String(n) };
}

function aiBersihCatatan_(t) {
  return String(t || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function aiBangunPrompt_(mapel, konteks, opsi) {
  var j = aiJenjang_(mapel.namaRombel);
  var kelasTeks = j.fase ? ('Fase ' + j.fase + ', Kelas ' + j.kelas) : mapel.namaRombel;
  var kepala =
    'Anda adalah tutor berpengalaman mata pelajaran ' + mapel.namaMapel + ' untuk jenjang ' + j.tingkat +
    ' (Kurikulum Merdeka, ' + kelasTeks + ') di PKBM (Pendidikan Kesetaraan). ' +
    'Warga belajar umumnya dewasa atau sudah bekerja dan belajar mandiri lewat aplikasi, sehingga bahasa harus jelas, ramah, ' +
    'dan contoh sebaiknya dekat dengan kehidupan sehari-hari mereka.\n\n' +
    'Dokumen PDF terlampir adalah sumber materi untuk SATU sesi pembelajaran. Gunakan HANYA isi PDF itu sebagai sumber fakta. ' +
    'Jangan mengarang data, angka, nama, rumus, atau kutipan yang tidak ada di PDF. Tulis dalam bahasa Indonesia.\n\n';
  var catatan = aiBersihCatatan_(opsi && opsi.catatan);
  var ekor = catatan ? ('\n\nCatatan tambahan dari tutor (ikuti selama tidak bertentangan dengan isi PDF): ' + catatan) : '';
  var aturanJson =
    '\n\nFORMAT KELUARAN: balas HANYA dengan satu objek JSON valid (tanpa pagar kode markdown, tanpa penjelasan sebelum/sesudahnya). ' +
    'Semua nilai teks berupa string biasa tanpa markdown (tanpa #, **, atau tabel). Pastikan JSON dapat di-parse.\n\nSKEMA:\n';
  if (konteks === 'materi') {
    return kepala +
      'TUGAS: susun MATERI bacaan sesi ini untuk dibaca warga belajar secara mandiri.\n' +
      '- judul: judul sesi yang singkat dan jelas (maksimal 90 karakter).\n' +
      '- tujuan_pembelajaran: 2 sampai 4 tujuan, kalimat operasional ("Peserta dapat ...").\n' +
      '- isi_materi: bacaan utuh 5 sampai 9 paragraf, dipisah satu baris kosong; mulai dari pengantar, lalu konsep inti secara runtut, ' +
      'sertakan contoh kontekstual, definisikan istilah penting saat pertama muncul, dan akhiri dengan penutup singkat.\n' +
      '- kata_kunci: 3 sampai 8 istilah penting.\n' +
      '- ringkasan: 2 sampai 3 kalimat.' + aturanJson +
      '{"judul":"...","tujuan_pembelajaran":["..."],"isi_materi":"...","kata_kunci":["..."],"ringkasan":"..."}' + ekor;
  }
  if (konteks === 'diskusi') {
    return kepala +
      'TUGAS: susun satu topik DISKUSI untuk forum sesi ini.\n' +
      '- judul: judul diskusi yang mengundang (maksimal 90 karakter).\n' +
      '- pertanyaan_pemantik: satu pertanyaan reflektif/analitis yang bisa dijawab dari isi PDF dan pengalaman sendiri (bukan pertanyaan ya/tidak).\n' +
      '- petunjuk: 2 sampai 4 kalimat cara menjawab (mis. kaitkan dengan pengalaman, minimal beberapa kalimat, hormati pendapat teman).' +
      aturanJson +
      '{"judul":"...","pertanyaan_pemantik":"...","petunjuk":"..."}' + ekor;
  }
  var n = Math.max(AI.MIN_SOAL, Math.min(AI.MAKS_SOAL, parseInt(opsi && opsi.jumlahSoal, 10) || 10));
  return kepala +
    'TUGAS: susun UJIAN pilihan ganda sebanyak TEPAT ' + n + ' soal dari isi PDF.\n' +
    '- Tiap soal punya opsi A, B, C, dan D; hanya satu jawaban paling benar.\n' +
    '- Komposisi tingkat kesulitan: sekitar 30% mudah (mengingat/memahami), 50% sedang (menerapkan), 20% sulit (menganalisis).\n' +
    '- Pengecoh harus masuk akal dan setara panjangnya dengan jawaban benar. Jangan memakai "semua benar" atau "tidak ada yang benar".\n' +
    '- Sebarkan kunci jawaban secara merata di A, B, C, D (jangan dominan satu huruf).\n' +
    '- Setiap soal harus bisa dijawab mandiri: jangan merujuk "gambar/tabel/halaman sekian" kecuali isinya dituliskan di soal.\n' +
    '- pertanyaan maksimal 300 karakter; tiap opsi maksimal 150 karakter, tanpa awalan huruf seperti "A.".\n' +
    '- judul: judul ujian (maksimal 90 karakter). durasi_menit: perkiraan wajar (sekitar 1,5 menit per soal, dibulatkan ke kelipatan 5).' +
    aturanJson +
    '{"judul":"...","durasi_menit":20,"soal":[{"pertanyaan":"...","opsi":{"A":"...","B":"...","C":"...","D":"..."},"kunci":"B"}]}' + ekor;
}

// ---------- parse & validasi keluaran ----------
function aiParseJson_(teks) {
  var t = String(teks || '').trim();
  var pagar = String.fromCharCode(96, 96, 96);
  t = t.replace(new RegExp('^' + pagar + '(?:json)?\\s*', 'i'), '').replace(new RegExp('\\s*' + pagar + '$'), '');
  try { return JSON.parse(t); } catch (e) {}
  var a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try { return JSON.parse(t.substring(a, b + 1)); } catch (e2) {}
  }
  throw new Error('Jawaban Gemini tidak berupa JSON yang valid. Coba proses lagi.');
}

function aiTeks_(v, maks) {
  return kmBersih_(v, maks).replace(/\*\*/g, '').replace(/^#{1,6}\s+/gm, '').trim();
}

function aiDaftarTeks_(v, maks, n) {
  if (!(v instanceof Array)) return [];
  var out = [];
  v.forEach(function(x) { var t = aiTeks_(x, maks); if (t) out.push(t); });
  return out.slice(0, n);
}

function aiSusunMateri_(j) {
  var judul = aiTeks_(j.judul, 120);
  var isi = aiTeks_(j.isi_materi, 24000);
  if (!judul || !isi) throw new Error('Gemini tidak menghasilkan materi yang lengkap. Coba proses lagi.');
  var tujuan = aiDaftarTeks_(j.tujuan_pembelajaran, 300, 6);
  var kunci = aiDaftarTeks_(j.kata_kunci, 60, 10);
  var ringkas = aiTeks_(j.ringkasan, 800);
  var bag = [];
  if (tujuan.length) bag.push('TUJUAN PEMBELAJARAN\n' + tujuan.map(function(x) { return '• ' + x; }).join('\n'));
  bag.push('MATERI\n' + isi);
  if (kunci.length) bag.push('KATA KUNCI\n' + kunci.join(', '));
  if (ringkas) bag.push('RINGKASAN\n' + ringkas);
  return { judul: judul, konten: bag.join('\n\n') };
}

function aiSusunDiskusi_(j) {
  var judul = aiTeks_(j.judul, 120);
  var tanya = aiTeks_(j.pertanyaan_pemantik, 1500);
  var petunjuk = aiTeks_(j.petunjuk, 800);
  if (!judul || !tanya) throw new Error('Gemini tidak menghasilkan topik diskusi yang lengkap. Coba proses lagi.');
  return { judul: judul, konten: tanya + (petunjuk ? '\n\n' + petunjuk : '') };
}

function aiSusunUjian_(j, jumlahDiminta) {
  var judul = aiTeks_(j.judul, 120) || 'Ujian';
  var daftar = (j.soal instanceof Array) ? j.soal : [];
  var soal = [];
  daftar.forEach(function(s) {
    if (!s) return;
    var tanya = aiTeks_(s.pertanyaan, KM.MAKS_TEKS_SOAL);
    var opsi = {};
    var masuk = s.opsi || {};
    KM.HURUF_OPSI.forEach(function(h) {
      var t = aiTeks_(masuk[h], KM.MAKS_TEKS_OPSI).replace(/^[A-Ea-e][\.\)]\s+/, '');
      if (t) opsi[h] = t;
    });
    var kunci = String(s.kunci || '').trim().toUpperCase().charAt(0);
    if (!tanya || Object.keys(opsi).length < 2 || !opsi.hasOwnProperty(kunci)) return;
    soal.push({ pertanyaan: tanya, opsi: opsi, kunci: kunci });
  });
  if (!soal.length) throw new Error('Gemini tidak menghasilkan soal yang valid. Coba proses lagi.');
  if (soal.length > jumlahDiminta) soal = soal.slice(0, jumlahDiminta);
  var durasi = Number(j.durasi_menit) || 0;
  if (durasi < 5 || durasi > 240) durasi = Math.max(10, Math.ceil(soal.length * 1.5 / 5) * 5);
  return { judul: judul, durasi: durasi, soal: soal };
}

// ---------- tulis ke sheet sebagai Draft ----------
function aiTulisItem_(idMapel, jenis, judul, konten, sesi, durasi) {
  var m = kmMateri_();
  var c = m.c;
  var baris = [];
  for (var i = 0; i < m.lebar; i++) baris.push('');
  var id = generateId_('MTR-');
  baris[c.id - 1] = id;
  baris[c.idMapel - 1] = String(idMapel);
  baris[c.jenis - 1] = jenis;
  baris[c.judul - 1] = judul;
  baris[c.konten - 1] = konten;
  baris[c.status - 1] = 'Draft';
  baris[c.dibuatPada - 1] = waktuSekarang_();
  baris[c.sesi - 1] = sesi;
  baris[c.batasWaktu - 1] = kmBatasOtomatis_(jenis, sesi);
  if (jenis === 'Ujian' && durasi) baris[c.durasiMenit - 1] = durasi;
  m.sheet.appendRow(baris);
  return id;
}

function aiTulisSoal_(idUjian, soal) {
  var q = kmSoal_();
  var c = q.c;
  var poin = Math.round((100 / soal.length) * 100) / 100;
  var rows = soal.map(function(s) {
    var b = [];
    for (var i = 0; i < q.lebar; i++) b.push('');
    b[c.id - 1] = generateId_('SOAL-');
    b[c.idUjian - 1] = idUjian;
    b[c.pertanyaan - 1] = s.pertanyaan;
    KM.HURUF_OPSI.forEach(function(h) { b[c['opsi' + h] - 1] = s.opsi[h] || ''; });
    b[c.kunci - 1] = s.kunci;
    b[c.poin - 1] = poin;
    return b;
  });
  var awal = q.sheet.getLastRow() + 1;
  q.sheet.getRange(awal, 1, rows.length, q.lebar).setValues(rows);
}

// ---------- titik masuk proses ----------
// opsi: { konteks: 'materi'|'diskusi'|'ujian', sesi, jumlahSoal, catatan }
function waStafAiProses(token, idMapel, fileRef, opsi) {
  return aiLindungi_(token, function() { return aiProsesInti_(token, idMapel, fileRef, opsi); });
}

function aiProsesInti_(token, idMapel, fileRef, opsi) {
  var r = wajibMapel_(token, idMapel);
  aiWajibSiap_();
  opsi = opsi || {};
  var konteks = String(opsi.konteks || '');
  if (AI.KONTEKS.indexOf(konteks) < 0) throw new Error('Konteks harus materi, diskusi, atau ujian.');
  if (!aiRefFileValid_(fileRef)) throw new Error('Referensi PDF tidak valid. Unggah ulang PDF-nya.');
  var sesi = taValidasiSesiItem_(konteks === 'ujian' ? 'Ujian' : (konteks === 'diskusi' ? 'Diskusi' : 'Materi'), kmBersih_(opsi.sesi, 60).trim());
  if (hitung_('aip|' + r.p.id, 3600) > AI.MAKS_PROSES_PER_JAM) {
    throw new Error('Terlalu banyak proses AI dalam satu jam. Coba lagi nanti.');
  }
  var mulai = Date.now();
  aiTungguAktif_(fileRef.name);
  var prompt = aiBangunPrompt_(r.m, konteks, opsi);
  var res = aiPanggil_('POST', AI.BASE + '/v1beta/models/' + aiModel_() + ':generateContent', {
    contents: [{ role: 'user', parts: [
      { fileData: { mimeType: 'application/pdf', fileUri: fileRef.uri } },
      { text: prompt }
    ] }],
    generationConfig: { temperature: 0.4, responseMimeType: 'application/json', maxOutputTokens: 32768 }
  }, { mulai: mulai });
  var j = aiParseJson_(aiTeksDariRespons_(res.json));

  var kunci = kmKunciUnik_();
  kunci.waitLock(20000);
  try {
    var hasil;
    if (konteks === 'materi') {
      var a = aiSusunMateri_(j);
      hasil = { id: aiTulisItem_(idMapel, 'Materi', a.judul, a.konten, sesi, 0), jenis: 'Materi', judul: a.judul };
    } else if (konteks === 'diskusi') {
      var b = aiSusunDiskusi_(j);
      hasil = { id: aiTulisItem_(idMapel, 'Diskusi', b.judul, b.konten, sesi, 0), jenis: 'Diskusi', judul: b.judul };
    } else {
      var diminta = Math.max(AI.MIN_SOAL, Math.min(AI.MAKS_SOAL, parseInt(opsi.jumlahSoal, 10) || 10));
      var u = aiSusunUjian_(j, diminta);
      var idU = aiTulisItem_(idMapel, 'Ujian', u.judul,
        'Kerjakan semua soal dengan teliti. Pilih satu jawaban yang paling tepat.', sesi, u.durasi);
      aiTulisSoal_(idU, u.soal);
      hasil = { id: idU, jenis: 'Ujian', judul: u.judul, jumlahSoal: u.soal.length, diminta: diminta };
    }
    kmCatat_(r.p, idMapel, 'AI buat ' + konteks, hasil.judul, 'OK');
    hasil.sesi = sesi;
    return hasil;
  } finally {
    kunci.releaseLock();
  }
}

// ---------- unggah per potongan lewat server ----------
// Browser tidak bisa mengirim langsung ke Gemini: header unggah (X-Goog-Upload-*) ditolak aturan CORS Google,
// sehingga unggah langsung selalu gagal. Karena itu berkas dikirim ke server per potongan (base64), lalu server
// meneruskannya ke tautan unggah yang dibuat waStafAiMulaiUnggah. Kunci API tidak pernah dikirim ke browser.
AI.POTONGAN = 8 * 1024 * 1024;

function waStafAiKirimPotongan(token, uploadUrl, offset, b64, akhir) {
  return aiLindungi_(token, function() { return aiKirimPotonganInti_(token, uploadUrl, offset, b64, akhir); });
}

function aiKirimPotonganInti_(token, uploadUrl, offset, b64, akhir) {
  stafDariToken_(token);
  uploadUrl = String(uploadUrl || '');
  if (uploadUrl.indexOf(AI.BASE + '/upload/') !== 0 || uploadUrl.indexOf('upload_id=') < 0) throw new Error('Tautan unggah tidak valid. Ulangi dari awal.');
  offset = Number(offset);
  if (!(offset >= 0) || offset >= AI.MAKS_BYTE_PDF) throw new Error('Posisi unggah tidak valid. Ulangi dari awal.');
  var bytes = Utilities.base64Decode(String(b64 || ''));
  if (!bytes.length) throw new Error('Potongan berkas kosong.');
  if (bytes.length > AI.POTONGAN) throw new Error('Potongan berkas terlalu besar.');
  if (offset + bytes.length > AI.MAKS_BYTE_PDF) throw new Error('PDF terlalu besar. Maksimal ' + Math.floor(AI.MAKS_BYTE_PDF / 1048576) + ' MB.');
  var resp = UrlFetchApp.fetch(uploadUrl, {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/octet-stream',
    headers: { 'X-Goog-Upload-Offset': String(offset), 'X-Goog-Upload-Command': akhir ? 'upload, finalize' : 'upload' },
    payload: bytes
  });
  var kode = resp.getResponseCode();
  var teks = resp.getContentText();
  var j = null;
  try { j = JSON.parse(teks); } catch (e) { j = null; }
  if (kode < 200 || kode >= 300) throw new Error(aiPesanGalat_({ kode: kode, json: j }));
  if (!akhir) return { selesai: false };
  var f = j && j.file;
  var ref = f && f.name && f.uri ? { name: String(f.name), uri: String(f.uri) } : null;
  if (!aiRefFileValid_(ref)) throw new Error('Respons unggahan tidak dikenali. Coba lagi.');
  return { selesai: true, ref: ref };
}
