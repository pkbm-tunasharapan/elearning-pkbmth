import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'bingkai_stub.dart' if (dart.library.js_interop) 'bingkai_web.dart';

/// v1.39.1: pratinjau dokumen HTML (mis. rapor) TANPA tombol unduh, cetak, atau bagikan.
/// Dipakai akun Dinas Pendidikan yang hanya boleh melihat.
class PratinjauHtmlScreen extends StatefulWidget {
  const PratinjauHtmlScreen({super.key, required this.judul, required this.html, this.catatan});
  final String judul;
  final String html;
  final String? catatan;

  @override
  State<PratinjauHtmlScreen> createState() => _PratinjauHtmlScreenState();
}

class _PratinjauHtmlScreenState extends State<PratinjauHtmlScreen> {
  WebViewController? _c;
  late final Widget _bingkaiWeb = kIsWeb ? bingkaiHtml(widget.html) : const SizedBox.shrink();

  @override
  void initState() {
    super.initState();
    if (!kIsWeb) {
      _c = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.disabled)
        ..enableZoom(true)
        ..setNavigationDelegate(NavigationDelegate(
          // tautan di dalam dokumen tidak dibuka (tetap di pratinjau)
          onNavigationRequest: (r) => r.url.startsWith('about:') || r.url.startsWith('data:') ? NavigationDecision.navigate : NavigationDecision.prevent,
        ))
        ..loadHtmlString(widget.html);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(widget.judul, overflow: TextOverflow.ellipsis)),
      body: Column(children: [
        Container(
          width: double.infinity,
          color: cs.secondaryContainer,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(children: [
            Icon(Icons.visibility_rounded, size: 18, color: cs.onSecondaryContainer),
            const SizedBox(width: 8),
            Expanded(
              child: Text(widget.catatan ?? 'Pratinjau saja: dokumen tidak dapat diunduh atau dicetak.',
                  style: TextStyle(fontSize: 12.5, color: cs.onSecondaryContainer)),
            ),
          ]),
        ),
        Expanded(
          child: ColoredBox(
            color: Colors.white,
            child: kIsWeb ? _bingkaiWeb : WebViewWidget(controller: _c!),
          ),
        ),
      ]),
    );
  }
}
