import Capacitor
import CoreMIDI
import Darwin
import UIKit

final class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(DrummerMIDIPlugin())
    }
}

/// Foreground-only, input-only MIDI. A session token prevents a late web-view
/// cleanup from disconnecting a newly opened drummer session.
@objc(DrummerMIDIPlugin)
public class DrummerMIDIPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DrummerMIDIPlugin"
    public let jsName = "DrummerMIDI"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "selectInput", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]
    private var client: MIDIClientRef = 0
    private var port: MIDIPortRef = 0
    private var session = ""
    private var selection = UUID()
    private var selectedID: String?
    private static let timebase: Double = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return Double(info.numer) / Double(info.denom) / 1_000_000
    }()
    private static func milliseconds(_ timestamp: UInt64 = 0) -> Double {
        Double(timestamp == 0 ? mach_absolute_time() : timestamp) * timebase
    }
    private func string(_ object: MIDIObjectRef, _ property: CFString) -> String {
        var value: Unmanaged<CFString>?
        guard MIDIObjectGetStringProperty(object, property, &value) == noErr else { return "" }
        return value?.takeRetainedValue() as String? ?? ""
    }
    private func id(_ source: MIDIEndpointRef) -> String {
        var value: Int32 = 0
        return MIDIObjectGetIntegerProperty(source, kMIDIPropertyUniqueID, &value) == noErr ? String(value) : "endpoint:\(source)"
    }
    private func sources() -> [MIDIEndpointRef] {
        (0..<MIDIGetNumberOfSources()).map { MIDIGetSource($0) }.filter { $0 != 0 }
    }
    private func devices() -> [[String: String]] {
        sources().map { source in
            let display = string(source, kMIDIPropertyDisplayName)
            return ["id": id(source), "name": display.isEmpty ? string(source, kMIDIPropertyName) : display,
                    "manufacturer": string(source, kMIDIPropertyManufacturer)]
        }
    }
    private func closePort() {
        selection = UUID(); selectedID = nil
        if port != 0 { MIDIPortDispose(port); port = 0 }
    }
    private func closeClient() {
        closePort()
        if client != 0 { MIDIClientDispose(client); client = 0 }
    }
    private func refreshDevices() {
        guard client != 0 else { return }
        let list = devices()
        if let selectedID, !list.contains(where: { $0["id"] == selectedID }) { closePort() }
        notifyListeners("devices", data: ["session": session, "devices": list])
    }
    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.reject("midi-unavailable"); return }
            self.closeClient()
            self.session = UUID().uuidString
            let result = MIDIClientCreateWithBlock("ChordMaster drummer" as CFString, &self.client) { [weak self] _ in
                DispatchQueue.main.async { self?.refreshDevices() }
            }
            guard result == noErr else { call.reject("midi-unavailable"); return }
            call.resolve(["session": self.session, "devices": self.devices(), "now": Self.milliseconds()])
        }
    }
    @objc func selectInput(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.client != 0, call.getString("session") == self.session else { call.reject("midi-session-expired"); return }
            self.closePort()
            guard let selectedID = call.getString("id") else { call.resolve(); return }
            guard let source = self.sources().first(where: { self.id($0) == selectedID }) else { call.reject("midi-disconnected"); return }
            let token = self.selection, session = self.session
            let result = MIDIInputPortCreateWithProtocol(self.client, "Drummer input" as CFString, ._1_0, &self.port) { [weak self] events, _ in
                // Copy packet data on the MIDI thread before its borrowed pointers expire.
                let messages = Self.messages(events)
                guard !messages.isEmpty else { return }
                DispatchQueue.main.async {
                    guard let self, self.selection == token, self.session == session,
                          UIApplication.shared.applicationState == .active else { return }
                    self.notifyListeners("messages", data: ["session": session, "deviceId": selectedID, "messages": messages])
                }
            }
            guard result == noErr, MIDIPortConnectSource(self.port, source, nil) == noErr else {
                self.closePort(); call.reject("midi-connect-failed"); return
            }
            self.selectedID = selectedID
            call.resolve()
        }
    }
    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            if let self, call.getString("session") == self.session { self.closeClient(); self.session = "" }
            call.resolve()
        }
    }
    private static func messages(_ events: UnsafePointer<MIDIEventList>) -> [[String: Any]] {
        var result: [[String: Any]] = []
        let packetOffset = MemoryLayout<MIDIEventList>.offset(of: \MIDIEventList.packet)!
        let wordsOffset = MemoryLayout<MIDIEventPacket>.offset(of: \MIDIEventPacket.words)!
        var packet = UnsafeRawPointer(events).advanced(by: packetOffset).assumingMemoryBound(to: MIDIEventPacket.self)
        let wordCounts = [1, 1, 1, 2, 2, 4, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4]
        for _ in 0..<events.pointee.numPackets {
            let words = UnsafeRawPointer(packet).advanced(by: wordsOffset).assumingMemoryBound(to: UInt32.self)
            var index = 0
            while index < Int(packet.pointee.wordCount) {
                let word = words[index], type = Int(word >> 28)
                if type == 2 {
                    let status = Int((word >> 16) & 0xff)
                    if [0x80, 0x90, 0xb0].contains(status & 0xf0) {
                        result.append(["data": [status, Int((word >> 8) & 0x7f), Int(word & 0x7f)], "timestamp": milliseconds(packet.pointee.timeStamp)])
                    }
                }
                index += wordCounts[type]
            }
            packet = UnsafePointer(MIDIEventPacketNext(packet))
        }
        return result
    }
    deinit { closeClient() }
}
