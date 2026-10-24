import UniformTypeIdentifiers
import WebKit

/// Serves Rye's built-in pages (new tab, setup, Personalize) from the app
/// bundle at rye://newtab/…, so they get their own origin and storage.
final class RyePages: NSObject, WKURLSchemeHandler {
    static let scheme = "rye"
    static let newTab = URL(string: "rye://newtab/newtab.html")!
    static let personalize = URL(string: "rye://newtab/personalize.html")!

    private let root: URL

    override init() {
        root = Bundle.main.resourceURL!.appendingPathComponent("rye-newtab", isDirectory: true).standardizedFileURL
        super.init()
    }

    static func isRyePage(_ url: URL?) -> Bool {
        url?.scheme == scheme
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/newtab.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        // Only files inside Rye's page folder.
        guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let type = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let headers = [
            "Content-Type": type.hasPrefix("text/") || type.hasSuffix("javascript") ? "\(type); charset=utf-8" : type,
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache",
        ]
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}
}
