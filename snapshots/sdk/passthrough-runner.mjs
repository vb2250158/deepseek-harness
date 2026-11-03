/** Forward the sandbox command for SDK replay without a platform backend. */
import { spawn } from 'node:child_process'
const separator = process.argv.indexOf('--', 2)
if (separator < 0 || separator + 1 === process.argv.length) {
  throw new Error('sdk-snapshot-runner: profile rejected: missing command')
}
const [command, ...args] = process.argv.slice(separator + 1)
const child = spawn(command, args, { stdio: 'inherit', windowsHide: true })
child.once('error', error => { console.error(error); process.exitCode = 1 })
child.once('exit', code => { process.exitCode = code ?? 1 })
