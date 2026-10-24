import UIKit

/// The colors and corner style chosen on Rye's pages (Customize, setup,
/// Personalize). The pages send them over; the app's toolbar uses them.
struct Look: Codable, Equatable {
    var dark: Bool
    var shape: String
    var frame: String
    var base: String
    var sheet: String
    var raised: String
    var sunken: String
    var text: String
    var text2: String
    var accent: String
    var onAccent: String

    /// Rye's warm dark default, used until the pages send a look.
    static let standard = Look(
        dark: true, shape: "rounded",
        frame: "#1c1b19", base: "#252321", sheet: "#211f1d", raised: "#2d2a28", sunken: "#1c1b19",
        text: "#eeeded", text2: "#b8b5b2", accent: "#7593b4", onAccent: "#141210"
    )

    init(dark: Bool, shape: String, frame: String, base: String, sheet: String, raised: String,
         sunken: String, text: String, text2: String, accent: String, onAccent: String) {
        self.dark = dark
        self.shape = shape
        self.frame = frame
        self.base = base
        self.sheet = sheet
        self.raised = raised
        self.sunken = sunken
        self.text = text
        self.text2 = text2
        self.accent = accent
        self.onAccent = onAccent
    }

    /// Builds a look from a page message, ignoring anything malformed.
    init?(message: [String: Any]) {
        func color(_ key: String) -> String? {
            guard let value = message[key] as? String, UIColor(hex: value) != nil else { return nil }
            return value
        }
        guard let dark = message["dark"] as? Bool,
              let frame = color("frame"), let base = color("base"), let sheet = color("sheet"),
              let raised = color("raised"), let sunken = color("sunken"), let text = color("text"),
              let text2 = color("text2"), let accent = color("accent"), let onAccent = color("onAccent")
        else { return nil }
        let shape = message["shape"] as? String ?? "rounded"
        self.init(dark: dark, shape: ["soft", "rounded", "extra"].contains(shape) ? shape : "rounded",
                  frame: frame, base: base, sheet: sheet, raised: raised, sunken: sunken,
                  text: text, text2: text2, accent: accent, onAccent: onAccent)
    }

    var cornerRadius: CGFloat {
        switch shape {
        case "soft": return 10
        case "extra": return 22
        default: return 14
        }
    }

    // MARK: Saved between launches

    private static let key = "rye.look"

    static func load() -> Look {
        guard let data = UserDefaults.standard.data(forKey: key),
              let look = try? JSONDecoder().decode(Look.self, from: data) else { return .standard }
        return look
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: Look.key)
        }
    }
}

extension UIColor {
    /// "#rrggbb" → UIColor.
    convenience init?(hex: String) {
        var value = hex.trimmingCharacters(in: .whitespaces)
        guard value.hasPrefix("#"), value.count == 7 else { return nil }
        value.removeFirst()
        guard let number = UInt32(value, radix: 16) else { return nil }
        self.init(
            red: CGFloat((number >> 16) & 0xFF) / 255,
            green: CGFloat((number >> 8) & 0xFF) / 255,
            blue: CGFloat(number & 0xFF) / 255,
            alpha: 1
        )
    }

    static func rye(_ hex: String) -> UIColor {
        UIColor(hex: hex) ?? .systemBackground
    }
}
