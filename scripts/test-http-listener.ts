/** HTTP fixture listeners avoid ports that Fetch rejects before sending a request. */
import type { Server } from 'node:net'

const BLOCKED_PORTS = new Set([
  1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
])

/**
 * Bind a loopback fixture even when the OS dynamic range includes Fetch-blocked ports.
 * @param server - Unstarted HTTP or TCP fixture listener.
 * @returns Once the listener has an unprivileged port permitted by Fetch.
 */
export async function listenForFetch(server: Server): Promise<void> {
  for (let attempt = 0; attempt < 32; attempt++) {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('HTTP fixture has no TCP address')
    if (address.port >= 1024 && !BLOCKED_PORTS.has(address.port)) return
    await new Promise<void>((resolve, reject) => { server.close((error) => { if (error) reject(error); else resolve() }) })
  }
  throw new Error('OS repeatedly assigned Fetch-blocked ports to the HTTP fixture')
}
