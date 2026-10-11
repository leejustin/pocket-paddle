package expo.modules.picklelink

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors

private const val SERVICE_TYPE = "_pocketpickle._tcp."

/**
 * Two phones find each other with Network Service Discovery (Bonjour) on the same
 * Wi-Fi and rally over one TCP connection. Messages are newline-delimited UTF-8
 * text. State lives on one worker thread; sockets block on their own threads.
 */
class PickleLinkModule : Module() {
  private val worker = Executors.newSingleThreadExecutor()
  private var nsd: NsdManager? = null
  private var server: ServerSocket? = null
  private var socket: Socket? = null
  private var output: OutputStream? = null
  private var registration: NsdManager.RegistrationListener? = null
  private var discovery: NsdManager.DiscoveryListener? = null
  private val found = mutableMapOf<String, NsdServiceInfo>()
  private var myName = ""

  override fun definition() = ModuleDefinition {
    Name("PickleLink")
    Events("onPeers", "onConnected", "onMessage", "onClosed", "onWaiting")

    Function("start") { name: String -> worker.execute { start(name) } }
    Function("connect") { id: String -> worker.execute { connect(id) } }
    Function("send") { text: String -> worker.execute { send(text) } }
    Function("stop") { worker.execute { stopAll() } }
    OnDestroy {
      worker.execute { stopAll() }
      worker.shutdown()
    }
  }

  private fun start(name: String) {
    stopAll()
    myName = name
    val context = appContext.reactContext ?: return fail("Couldn't host a rally.")
    val manager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    nsd = manager
    val listening = try {
      ServerSocket(0)
    } catch (error: Exception) {
      return fail("Couldn't host a rally: ${error.message}")
    }
    server = listening
    Thread { acceptLoop(listening) }.start()

    val registered = object : NsdManager.RegistrationListener {
      // NSD renames us if another phone already took this name.
      override fun onServiceRegistered(info: NsdServiceInfo) { worker.execute { myName = info.serviceName; publish() } }
      override fun onRegistrationFailed(info: NsdServiceInfo, code: Int) { worker.execute { fail("Couldn't host a rally ($code).") } }
      override fun onServiceUnregistered(info: NsdServiceInfo) {}
      override fun onUnregistrationFailed(info: NsdServiceInfo, code: Int) {}
    }
    registration = registered
    val info = NsdServiceInfo().apply {
      serviceName = name
      serviceType = SERVICE_TYPE
      port = listening.localPort
    }
    manager.registerService(info, NsdManager.PROTOCOL_DNS_SD, registered)

    val discovered = object : NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(type: String) {}
      override fun onDiscoveryStopped(type: String) {}
      override fun onStartDiscoveryFailed(type: String, code: Int) { worker.execute { fail("Couldn't look for nearby paddles ($code).") } }
      override fun onStopDiscoveryFailed(type: String, code: Int) {}
      override fun onServiceFound(info: NsdServiceInfo) { worker.execute { found[info.serviceName] = info; publish() } }
      override fun onServiceLost(info: NsdServiceInfo) { worker.execute { found.remove(info.serviceName); publish() } }
    }
    discovery = discovered
    manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discovered)
  }

  private fun publish() {
    val peers = found.keys.filter { it != myName }.sorted().map { mapOf("id" to it, "name" to it) }
    sendEvent("onPeers", mapOf("peers" to peers))
  }

  @Suppress("DEPRECATION")
  private fun connect(id: String) {
    val info = found[id] ?: return
    val manager = nsd ?: return
    if (socket != null) return
    manager.resolveService(info, object : NsdManager.ResolveListener {
      override fun onResolveFailed(info: NsdServiceInfo, code: Int) {
        sendEvent("onClosed", mapOf("reason" to "Couldn't reach that paddle ($code)."))
      }
      override fun onServiceResolved(resolved: NsdServiceInfo) {
        Thread {
          try {
            val outgoing = Socket()
            outgoing.tcpNoDelay = true
            outgoing.connect(InetSocketAddress(resolved.host, resolved.port), 4000)
            worker.execute { adopt(outgoing, initiator = true) }
          } catch (error: Exception) {
            sendEvent("onClosed", mapOf("reason" to "Couldn't reach that paddle: ${error.message}"))
          }
        }.start()
      }
    })
  }

  private fun acceptLoop(listening: ServerSocket) {
    while (!listening.isClosed) {
      val incoming = try { listening.accept() } catch (error: Exception) { return }
      worker.execute {
        if (socket == null && server === listening) adopt(incoming, initiator = false) else closeQuietly(incoming)
      }
    }
  }

  private fun adopt(candidate: Socket, initiator: Boolean) {
    if (socket != null) return closeQuietly(candidate)
    candidate.tcpNoDelay = true
    socket = candidate
    output = candidate.getOutputStream()
    // One rally at a time: stop advertising once a friend is on the line.
    stopDiscovery()
    sendEvent("onConnected", mapOf("initiator" to initiator))
    Thread { readLoop(candidate) }.start()
  }

  private fun readLoop(candidate: Socket) {
    try {
      val reader = BufferedReader(InputStreamReader(candidate.getInputStream(), Charsets.UTF_8))
      while (true) {
        val line = reader.readLine() ?: break
        if (line.isNotEmpty()) sendEvent("onMessage", mapOf("text" to line))
      }
      worker.execute { close(candidate, "Your friend left the rally.") }
    } catch (error: Exception) {
      worker.execute { close(candidate, "The connection dropped.") }
    }
  }

  private fun send(text: String) {
    val current = socket ?: return
    try {
      output?.write((text + "\n").toByteArray(Charsets.UTF_8))
      output?.flush()
    } catch (error: Exception) {
      close(current, "The connection dropped.")
    }
  }

  private fun close(candidate: Socket, reason: String) {
    if (socket !== candidate) return
    socket = null
    output = null
    closeQuietly(candidate)
    sendEvent("onClosed", mapOf("reason" to reason))
  }

  private fun fail(reason: String) {
    stopAll()
    sendEvent("onClosed", mapOf("reason" to reason))
  }

  private fun stopDiscovery() {
    registration?.let { runCatching { nsd?.unregisterService(it) } }
    registration = null
    discovery?.let { runCatching { nsd?.stopServiceDiscovery(it) } }
    discovery = null
    server?.let { runCatching { it.close() } }
    server = null
    found.clear()
  }

  /** Stops everything quietly; the caller asked for it, so no event is sent. */
  private fun stopAll() {
    stopDiscovery()
    socket?.let { closeQuietly(it) }
    socket = null
    output = null
  }

  private fun closeQuietly(candidate: Socket) {
    runCatching { candidate.close() }
  }
}
