import ExpoModulesCore
import Network

/** One-on-one rallies and doubles games advertise different Bonjour services, so each lobby only lists its own kind. */
private let pairService = "_pocketpickle._tcp"
private let groupService = "_pocketdubs._tcp"
// kDNSServiceErr_PolicyDenied: the person turned off Local Network for the app.
private let localNetworkDenied: Int32 = -65570

/**
 * Phones find each other with Bonjour and talk over TCP connections.
 * Peer-to-peer Wi-Fi is on, so iPhones can connect without sharing a network.
 * A one-on-one rally is a single connection. In doubles the host keeps up to three, one per friend,
 * and each friend keeps one to the host. Every connection gets a peer id that events carry.
 * Messages are newline-delimited UTF-8 text. Everything runs on one serial queue.
 */
public class PickleLinkModule: Module {
  private let queue = DispatchQueue(label: "com.pocketpickle.app.link")
  private var listener: NWListener?
  private var browser: NWBrowser?
  /** Open connections by peer id; `live` holds the ones that finished connecting. */
  private var connections: [String: NWConnection] = [:]
  private var live: Set<String> = []
  private var buffers: [String: Data] = [:]
  private var endpoints: [String: NWEndpoint] = [:]
  private var myName = ""
  private var maxPeers = 1
  /** A doubles host keeps advertising (and turning away extras) instead of going quiet once it's full. */
  private var keepListening = false

  public func definition() -> ModuleDefinition {
    Name("PickleLink")
    Events("onPeers", "onConnected", "onMessage", "onClosed", "onWaiting")

    Function("start") { (name: String) in
      self.queue.async { self.start(name: name, service: pairService, advertise: true, browse: true, maxPeers: 1) }
    }
    Function("startGroup") { (name: String, host: Bool) in
      self.queue.async { self.start(name: name, service: groupService, advertise: host, browse: !host, maxPeers: host ? 3 : 1) }
    }
    Function("connect") { (id: String) in
      self.queue.async { self.connect(id: id) }
    }
    Function("send") { (text: String) in
      self.queue.async { self.send(text, to: nil) }
    }
    Function("sendTo") { (peer: String, text: String) in
      self.queue.async { self.send(text, to: peer) }
    }
    Function("stop") {
      self.queue.async { self.stop() }
    }
    OnDestroy {
      self.queue.async { self.stop() }
    }
  }

  private static func parameters() -> NWParameters {
    let tcp = NWProtocolTCP.Options()
    // Shots are tiny and timing matters more than throughput.
    tcp.noDelay = true
    tcp.enableKeepalive = true
    tcp.keepaliveIdle = 2
    let parameters = NWParameters(tls: nil, tcp: tcp)
    parameters.includePeerToPeer = true
    return parameters
  }

  private func start(name: String, service: String, advertise: Bool, browse: Bool, maxPeers: Int) {
    stop()
    myName = name
    self.maxPeers = maxPeers
    keepListening = advertise && !browse
    if advertise {
      do {
        let listener = try NWListener(using: Self.parameters())
        listener.service = NWListener.Service(name: name, type: service)
        listener.serviceRegistrationUpdateHandler = { [weak self] change in
          // Bonjour renames us if another phone already took this name.
          if case .add(let endpoint) = change, case .service(let registered, _, _, _) = endpoint {
            self?.myName = registered
          }
        }
        listener.newConnectionHandler = { [weak self] incoming in
          guard let self, self.connections.count < self.maxPeers else { incoming.cancel(); return }
          self.adopt(incoming, initiator: false)
        }
        listener.stateUpdateHandler = { [weak self] state in
          if case .failed(let error) = state { self?.fail("Couldn't host a rally: \(error.localizedDescription)") }
        }
        listener.start(queue: queue)
        self.listener = listener
      } catch {
        fail("Couldn't host a rally: \(error.localizedDescription)")
        return
      }
    }
    guard browse else { return }
    let browser = NWBrowser(for: .bonjour(type: service, domain: nil), using: Self.parameters())
    browser.browseResultsChangedHandler = { [weak self] results, _ in self?.publish(results) }
    browser.stateUpdateHandler = { [weak self] state in
      switch state {
      case .waiting(let error):
        var denied = false
        if case .dns(let code) = error { denied = code == localNetworkDenied }
        self?.sendEvent("onWaiting", ["denied": denied, "reason": error.localizedDescription])
      case .failed(let error):
        self?.fail("Couldn't look for nearby paddles: \(error.localizedDescription)")
      default:
        break
      }
    }
    browser.start(queue: queue)
    self.browser = browser
  }

  private func publish(_ results: Set<NWBrowser.Result>) {
    endpoints = [:]
    var peers: [[String: String]] = []
    for result in results {
      guard case .service(let name, _, _, _) = result.endpoint, name != myName else { continue }
      endpoints[name] = result.endpoint
      peers.append(["id": name, "name": name])
    }
    peers.sort { ($0["name"] ?? "") < ($1["name"] ?? "") }
    sendEvent("onPeers", ["peers": peers])
  }

  private func connect(id: String) {
    guard connections.count < maxPeers, let endpoint = endpoints[id] else { return }
    adopt(NWConnection(to: endpoint, using: Self.parameters()), initiator: true)
  }

  private func adopt(_ candidate: NWConnection, initiator: Bool) {
    let peer = UUID().uuidString
    connections[peer] = candidate
    buffers[peer] = Data()
    candidate.stateUpdateHandler = { [weak self, weak candidate] state in
      guard let self, let candidate, self.connections[peer] === candidate else { return }
      switch state {
      case .ready:
        self.live.insert(peer)
        // Once everyone's on the line, stop advertising and looking (a doubles host keeps turning extras away instead).
        if self.live.count >= self.maxPeers && !self.keepListening {
          self.listener?.cancel()
          self.listener = nil
          self.browser?.cancel()
          self.browser = nil
        }
        self.sendEvent("onConnected", ["initiator": initiator, "peer": peer])
        self.receive(peer, on: candidate)
      case .waiting(let error), .failed(let error):
        self.close(peer, reason: "Couldn't reach that paddle: \(error.localizedDescription)")
      default:
        break
      }
    }
    candidate.start(queue: queue)
  }

  private func receive(_ peer: String, on candidate: NWConnection) {
    candidate.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self, weak candidate] data, _, isComplete, error in
      guard let self, let candidate, self.connections[peer] === candidate else { return }
      if let data, !data.isEmpty {
        var buffer = (self.buffers[peer] ?? Data()) + data
        while let newline = buffer.firstIndex(of: 0x0A) {
          let line = buffer[buffer.startIndex..<newline]
          buffer.removeSubrange(buffer.startIndex...newline)
          if let text = String(data: line, encoding: .utf8), !text.isEmpty {
            self.sendEvent("onMessage", ["text": text, "peer": peer])
          }
        }
        self.buffers[peer] = buffer
        if buffer.count > 64 * 1024 {
          self.close(peer, reason: "The other phone sent something unexpected.")
          return
        }
      }
      if isComplete {
        self.close(peer, reason: "Your friend left the rally.")
      } else if let error {
        self.close(peer, reason: "The connection dropped: \(error.localizedDescription)")
      } else {
        self.receive(peer, on: candidate)
      }
    }
  }

  /** Sends to one peer, or to every connected peer when `to` is nil. */
  private func send(_ text: String, to: String?) {
    guard var data = text.data(using: .utf8) else { return }
    data.append(0x0A)
    let targets = to.map { [$0] } ?? Array(live)
    for peer in targets {
      guard live.contains(peer), let current = connections[peer] else { continue }
      current.send(content: data, completion: .contentProcessed { [weak self, weak current] error in
        guard let self, let current, let error, self.connections[peer] === current else { return }
        self.close(peer, reason: "The connection dropped: \(error.localizedDescription)")
      })
    }
  }

  private func close(_ peer: String, reason: String) {
    guard let candidate = connections.removeValue(forKey: peer) else { return }
    live.remove(peer)
    buffers.removeValue(forKey: peer)
    candidate.cancel()
    sendEvent("onClosed", ["reason": reason, "peer": peer])
  }

  private func fail(_ reason: String) {
    stop()
    sendEvent("onClosed", ["reason": reason, "peer": ""])
  }

  /** Stops everything quietly; the caller asked for it, so no event is sent. */
  private func stop() {
    listener?.cancel()
    listener = nil
    browser?.cancel()
    browser = nil
    for candidate in connections.values { candidate.cancel() }
    connections = [:]
    live = []
    buffers = [:]
    endpoints = [:]
  }
}
