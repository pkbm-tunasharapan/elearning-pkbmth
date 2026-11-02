"""Dijalankan di GitHub Actions setelah `flutter create`: izin internet Android, nama aplikasi, judul web."""
import json, pathlib, re, shutil

akar = pathlib.Path(__file__).resolve().parent.parent
NAMA = 'BM Staf'

man = akar / 'android/app/src/main/AndroidManifest.xml'
s = man.read_text()
if 'android.permission.INTERNET' not in s:
    s = s.replace('<application', '<uses-permission android:name="android.permission.INTERNET"/>\n    <application', 1)
s = re.sub(r'android:label="[^"]*"', f'android:label="{NAMA}"', s, count=1)
if 'android:scheme="bmstaf"' not in s:
    filt = (
        '\n            <intent-filter>\n'
        '                <action android:name="android.intent.action.VIEW"/>\n'
        '                <category android:name="android.intent.category.DEFAULT"/>\n'
        '                <category android:name="android.intent.category.BROWSABLE"/>\n'
        '                <data android:scheme="bmstaf" android:host="sso"/>\n'
        '            </intent-filter>\n'
        '            <meta-data android:name="flutter_deeplinking_enabled" android:value="false"/>'
    )
    i = s.find('</intent-filter>')
    s = s[:i + len('</intent-filter>')] + filt + s[i + len('</intent-filter>'):]
man.write_text(s)

idx = akar / 'web/index.html'
if idx.exists():
    h = idx.read_text()
    h = re.sub(r'<title>.*?</title>', '<title>Belajar Mandiri Staf</title>', h, flags=re.S)
    idx.write_text(h)
mf = akar / 'web/manifest.json'
if mf.exists():
    d = json.loads(mf.read_text())
    d.update({'name': 'Belajar Mandiri Staf', 'short_name': NAMA, 'background_color': '#4B2FD0', 'theme_color': '#4B2FD0'})
    mf.write_text(json.dumps(d, indent=2))

# test bawaan `flutter create` merujuk MyApp yang tidak ada di proyek ini
shutil.rmtree(akar / 'test', ignore_errors=True)
print('Platform siap.')
