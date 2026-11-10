// ============================================================================
// SUMBER DATA (v1.37.0): seluruh tabel eks-MENU / SIM SETARA kini tinggal di
// spreadsheet ini sendiri (Standalone). Aplikasi tidak lagi membuka file MENU.
//
// Google Sheets tidak membedakan huruf besar/kecil pada nama tab, sehingga tab
// MENU yang namanya sama dengan tab bawaan Standalone (Rombel, Mapel, Pengguna)
// disimpan dengan awalan "SIM ". Selalu akses tab eks-MENU lewat simTab_(),
// jangan getSheetByName() langsung: getSheetByName('ROMBEL') akan diam-diam
// mengembalikan tab "Rombel" milik LMS.
// ============================================================================

function simSs_() { return SpreadsheetApp.getActiveSpreadsheet(); }

// Nama tab MENU -> nama tab di Standalone (hanya untuk yang bentrok).
var SIM_ALIAS = {
  'ROMBEL': 'SIM ROMBEL',
  'MAPEL': 'SIM MAPEL',
  'PENGGUNA': 'SIM PENGGUNA'
};

function simNamaTab_(nama) { return SIM_ALIAS[nama] || nama; }

function simTab_(nama) { return simSs_().getSheetByName(simNamaTab_(nama)); }
