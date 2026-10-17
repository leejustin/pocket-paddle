import ExpoModulesCore
import Network

private let serviceType = "_pocketpickle._tcp"
// kDNSServiceErr_PolicyDenied: the person turned off Local Network for the app.
private let localNetworkDenied: Int32 = -65570

/**
 * Two phones find each other with Bonjour and rally over one TCP connection.
 * Peer-to-peer Wi-Fi is on, so two iPhones can connect without sharing a network.
 * Messages are newline-delimited UTF-8 text. Everything runs on one serial queue.
 */
public class PickleLinkModule: Module {
  private let queue = DispatchQueue(label: "com.pocketpickle.app.link")
  private var listener: NWListener?
  private var browser: NWBrowser?
  private var connection: NWConnection?
  private var endpoints: [String: NWEndpoint] = [:]
  private var myName = ""
  private var buffer = Data()

  public func definition() -> ModuleDefinition {
    Name("PickleLink")
    Events("onPeers", "onConnected", "onMessage", "onClosed", "onWaiting")

    Function("start") { (name: String) in
      self.queue.async { self.start(name: name) }
    }
    Function("connect") { (id: String) in
      self.queue.async { self.connect(id: id) }
    }
    Function("send") { (text: String) in
      self.queue.async { self.send(text) }
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

  private func start(name: String) {
    stop()
    myName = name
    do {
      let listener = try NWListener(using: Self.parameters())
      listener.service = NWListener.Service(name: name, type: serviceType)
      listener.serviceRegistrationUpdateHandler = { [weak self] change in
        // Bonjour renames us if another phone already took this name.
        if case .add(let endpoint) = change, case .service(let registered, _, _, _) = endpoint {
          self?.myName = registered
        }
      }
      listener.newConnectionHandler = { [weak self] incoming in
        guard let self, self.connection == nil else { incoming.cancel(); return }
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
    let browser = NWBrowser(for: .bonjour(type: serviceType, domain: nil), using: Self.parameters())
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
    guard connection == nil, let endpoint = endpoints[id] else { return }
    adopt(NWConnection(to: endpoint, using: Self.parameters()), initiator: true)
  }

  private func adopt(_ candidate: NWConnection, initiator: Bool) {
    connection = candidate
    buffer = Data()
    candidate.stateUpdateHandler = { [weak self, weak candidate] state in
      guard let self, let candidate, self.connection === candidate else { return }
      switch state {
      case .ready:
        // One rally at a time: stop advertising once a friend is on the line.
        self.listener?.cancel()
        self.listener = nil
        self.browser?.cancel()
        self.browser = nil
        self.sendEvent("onConnected", ["initiator": initiator])
        self.receive(on: candidate)
      case .waiting(let error), .failed(let error):
        self.close(candidate, reason: "Couldn't reach that paddle: \(error.localizedDescription)")
      default:
        break
      }
    }
    candidate.start(queue: queue)
  }

  private func receive(on candidate: NWConnection) {
    candidate.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self, weak candidate] data, _, isComplete, error in
      guard let self, let candidate, self.connection === candidate else { return }
      if let data, !data.isEmpty {
        self.buffer.append(data)
        while let newline = self.buffer.firstIndex(of: 0x0A) {
          let line = self.buffer[self.buffer.startIndex..<newline]
          self.buffer.removeSubrange(self.buffer.startIndex...newline)
          if let text = String(data: line, encoding: .utf8), !text.isEmpty {
            self.sendEvent("onMessage", ["text": text])
          }
        }
        if self.buffer.count > 64 * 1024 {
          self.close(candidate, reason: "The other phone sent something unexpected.")
          return
        }
      }
      if isComplete {
        self.close(candidate, reason: "Your friend left the rally.")
      } else if let error {
        self.close(candidate, reason: "The connection dropped: \(error.localizedDescription)")
      } else {
        self.receive(on: candidate)
      }
    }
  }

  private func send(_ text: String) {
    guard let current = connection, var data = text.data(using: .utf8) else { return }
    data.append(0x0A)
    current.send(content: data, completion: .contentProcessed { [weak self, weak current] error in
      guard let self, let current, let error else { return }
      self.close(current, reason: "The connection dropped: \(error.localizedDescription)")
    })
  }

  private func close(_ candidate: NWConnection, reason: String) {
    guard connection === candidate else { return }
    connection = nil
    candidate.cancel()
    sendEvent("onClosed", ["reason": reason])
  }

  private func fail(_ reason: String) {
    stop()
    sendEvent("onClosed", ["reason": reason])
  }

  /** Stops everything quietly; the caller asked for it, so no event is sent. */
  private func stop() {
    listener?.cancel()
    listener = nil
    browser?.cancel()
    browser = nil
    if let current = connection {
      connection = nil
      current.cancel()
    }
    endpoints = [:]
    buffer = Data()
  }
}
