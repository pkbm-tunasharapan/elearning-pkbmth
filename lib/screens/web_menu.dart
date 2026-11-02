import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../config.dart';
import '../session.dart';

/// Alamat halaman staf versi web yang langsung masuk (token) dan membuka tab tertentu.
Uri alamatWebStaf({String? tab, String? idMapel}) {
  final q = <String, String>{'halaman': 'staf', 'app': '1'};
  final t = Sesi.instance.token;
  if (t != null) q['t'] = t;
  if (tab != null && tab.isNotEmpty) q['tab'] = tab;
  if (idMapel != null && idMapel.isNotEmpty) q['mapel'] = idMapel;
  return Uri.parse(kWebUrl).replace(queryParameters: q);
}

/// Menu yang belum dibuat native: dibuka dari halaman staf versi web (mobile-friendly).
/// Android: di dalam aplikasi (WebView). Web: tab browser baru.
class WebMenu extends StatefulWidget {
  const WebMenu({super.key, required this.judul, this.tab, this.idMapel, this.denganAppBar = false});
  final String judul;
  final String? tab;
  final String? idMapel;
  final bool denganAppBar;

  @override
  State<WebMenu> createState() => _WebMenuState();
}

class _WebMenuState extends State<WebMenu> {
  WebViewController? _c;
  int _progres = 0;

  @override
  void initState() {
    super.initState();
    if (!kIsWeb) {
      _c = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setNavigationDelegate(NavigationDelegate(onProgress: (p) {
          if (mounted) setState(() => _progres = p);
        }))
        ..loadRequest(alamatWebStaf(tab: widget.tab, idMapel: widget.idMapel));
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget isi;
    if (kIsWeb) {
      isi = Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.open_in_new, size: 48),
            const SizedBox(height: 12),
            Text('Menu "${widget.judul}" dibuka di halaman staf versi web.', textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => launchUrl(alamatWebStaf(tab: widget.tab, idMapel: widget.idMapel), webOnlyWindowName: '_blank'),
              icon: const Icon(Icons.open_in_browser),
              label: const Text('Buka'),
            ),
          ]),
        ),
      );
    } else {
      isi = Stack(children: [
        WebViewWidget(controller: _c!),
        if (_progres < 100) LinearProgressIndicator(value: _progres / 100),
      ]);
    }
    if (!widget.denganAppBar) return isi;
    return Scaffold(
      appBar: AppBar(title: Text(widget.judul), actions: [
        if (!kIsWeb) IconButton(tooltip: 'Muat ulang', onPressed: () => _c?.reload(), icon: const Icon(Icons.refresh)),
      ]),
      body: isi,
    );
  }
}
