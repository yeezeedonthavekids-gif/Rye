import UIKit
import WebKit

/// One tab. Its web view is created when the tab is first shown, so restored
/// tabs cost nothing until you open them.
final class Tab {
    let id = UUID()
    private(set) var webView: WKWebView?
    /// Where the tab goes when its web view is created.
    var pendingURL: URL?
    /// A picture of the page for the tab switcher.
    var snapshot: UIImage?
    /// Lets the app itself open rye:// pages; web pages can't.
    var allowsRyePageOnce = false

    init(url: URL?) {
        pendingURL = url
    }

    init(webView: WKWebView) {
        self.webView = webView
    }

    var url: URL? {
        webView?.url ?? pendingURL
    }

    var title: String {
        if let title = webView?.title, !title.isEmpty { return title }
        if RyePages.isRyePage(url) { return "New Tab" }
        return url?.host ?? "New Tab"
    }

    func attach(_ webView: WKWebView) {
        self.webView = webView
    }
}

/// Holds the message handler weakly; WKUserContentController retains its
/// handlers, which would otherwise keep the browser alive forever.
final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
