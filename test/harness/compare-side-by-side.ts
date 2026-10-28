import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
	createSessionIni,
	discoverVpinball,
	getDynamicLinkerEnv,
	getNativeArgs,
	resolveVpxSession,
	spawnTaggedProcess,
} from './vpinball-resolver.js'

interface CompareOptions {
	vpxArgs: string[]
	headed: boolean
	help: boolean
	width: number
	height: number
	nativeX: number
	nativeY: number
}

function parseArgs(raw: string[]): CompareOptions {
	let headed = true
	let help = false
	let width = 1280
	let height = 900
	let nativeX = 1280
	let nativeY = 0
	const vpxArgs: string[] = []
	for (const token of raw) {
		if (token === '--headless') headed = false
		else if (token === '--headed') headed = true
		else if (token === '--help' || token === '-h') help = true
		else if (token.startsWith('--width=')) width = Number.parseInt(token.slice(8), 10) || 1280
		else if (token.startsWith('--height=')) height = Number.parseInt(token.slice(9), 10) || 900
		else if (token.startsWith('--x=')) nativeX = Number.parseInt(token.slice(4), 10) || 1280
		else if (token.startsWith('--y=')) nativeY = Number.parseInt(token.slice(4), 10) || 0
		else vpxArgs.push(token)
	}
	return { vpxArgs, headed, help, width, height, nativeX, nativeY }
}

function printHelp() {
	console.log(`compare-side-by-side — dual window launcher (browser left, native right)
Usage:
  npm run compare -- --vpx=<path|fixture|url> [--headless] [--width=1280] [--height=900]
  npx tsx test/harness/compare-side-by-side.ts --vpx=table-flipper
  npx tsx test/harness/compare-side-by-side.ts "http://localhost:3000/?vpx=/@fs/..."

Left:  Vite + Puppeteer Chrome at 0,0 {width}x{height}  → http://localhost:3000/?vpx=/@fs/...&rom=/@fs/...
Right: VPinballX native at {x},{y} {width}x{height}     → -Play <vpx> -Ini <session.ini>

Options:
  --headless             Browser headless (default headed for visual compare)
  --headed               Explicit headed
  --width=<px>           Window width (default: 1280)
  --height=<px>          Window height (default: 900)
  --x=<px>               Native window X position (default: 1280)
  --y=<px>               Native window Y position (default: 0)
  --help                 Show this help
`)
}

async function ensureDistEsm() {
	const marker = path.resolve('dist-esm/lib/refs.browser.js')
	if (fs.existsSync(marker)) return
	console.log('[compare] dist-esm missing, building…')
	try {
		execSync('npm run build:esm', { stdio: 'inherit', timeout: 120000 })
	} catch (error) {
		console.warn('[compare] build:esm failed, continuing anyway', error)
	}
}

async function main() {
	const raw = process.argv.slice(2)
	const { vpxArgs, headed, help, width, height, nativeX, nativeY } = parseArgs(raw)
	if (help) {
		printHelp()
		process.exit(0)
	}
	if (vpxArgs.length === 0) {
		printHelp()
		console.error('\nerror: provide --vpx=<path|fixture> or browser URL')
		process.exit(1)
	}

	let session
	try {
		session = await resolveVpxSession(vpxArgs)
	} catch (error: unknown) {
		console.error(`[compare] resolve failed: ${(error as Error).message}`)
		process.exit(1)
	}
	console.log(`[compare] table: ${session.vpxPath}`)
	if (session.gameName) console.log(`[compare] game:  ${session.gameName}`)
	if (session.romPath) console.log(`[compare] rom:   ${session.romPath}`)
	console.log(`[compare] url:   ${session.browserUrl}`)

	const disc = discoverVpinball()
	if (!disc.binPath) {
		console.error('[compare] native VPinballX not found — cannot launch side-by-side')
		console.error('  Fix: npm run vpinball:setup  or export VPINBALL_BIN=/path/to/VPinballX_GL')
		console.error('  Browser-only mode: opening browser alone…')
	}

	await ensureDistEsm()

	// Start vite
	console.log('[compare] ensuring vite dev server on :3000…')
	const utils: any = await import('./utils.mjs')
	let viteProc: any = null
	if (utils.ensureVite) {
		viteProc = await utils.ensureVite(session.browserUrl, { label: 'vite' })
	}

	// Launch browser
	console.log(
		`[compare] launching browser ${headed ? 'headed' : 'headless'} at 0,0 ${width}x${height} → ${session.browserUrl}`,
	)
	let browser: any = null
	let page: any = null
	try {
		const puppeteer = await utils.loadPuppeteer()
		const launchOpts: any = headed
			? {
					headless: false,
					args: [
						'--window-position=0,0',
						`--window-size=${width},${height}`,
						'--no-sandbox',
						'--disable-dev-shm-usage',
					],
				}
			: { headless: 'new', args: [`--window-size=${width},${height}`, '--no-sandbox'] }
		browser = await utils.launchBrowser(puppeteer, launchOpts)
		// Override viewport / window position for side-by-side
		try {
			const pages = await browser.pages()
			page = pages[0] ?? (await browser.newPage())
		} catch {
			page = await browser.newPage()
		}
		await page.setViewport({ width, height })
		// Attempt to set window bounds via CDP for headed mode
		try {
			const cdpSession = await page.createCDPSession()
			await cdpSession.send('Browser.setWindowBounds', {
				windowId: 1,
				bounds: { left: 0, top: 0, width, height, windowState: 'normal' },
			} as any)
		} catch {}
		page.on('console', (msg: any) => {
			const msgText = msg.text()
			if (msgText) console.log(`[vpx-browser] ${msgText.slice(0, 800)}`)
		})
		page.on('pageerror', (pageErr: any) => console.log(`[vpx-browser:pageerror] ${pageErr.message.slice(0, 800)}`))
		await page.goto(session.browserUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
		console.log('[compare] browser navigated')
	} catch (err: unknown) {
		console.error('[compare] browser launch failed', (err as Error).message)
		if (!disc.binPath) process.exit(1)
	}

	// Launch native
	let nativeProc: any = null
	if (disc.binPath && disc.binDir) {
		const binPath = disc.binPath
		const binDir = disc.binDir
		const iniPath = createSessionIni(session.vpxPath, session.romPath, {
			width,
			height,
			x: nativeX,
			y: nativeY,
		})
		const nativeArgs = getNativeArgs(session.vpxPath, iniPath, 'play')
		const env = { ...process.env, ...getDynamicLinkerEnv(binDir) }
		console.log(`[compare] launching native: ${binPath} ${nativeArgs.join(' ')}`)
		console.log(`[compare] ini: ${iniPath}`)
		try {
			console.log(fs.readFileSync(iniPath, 'utf-8'))
		} catch {}
		nativeProc = spawnTaggedProcess(binPath, nativeArgs, env, 'vpx-native')
		nativeProc.on('close', (code: number | null) => {
			console.log(`[compare] native exited with code ${code}`)
		})
		nativeProc.on('error', (err: Error) => console.error('[compare] native spawn error', err.message))
		// cleanup INI on exit
		const tmpDir = path.dirname(iniPath)
		const cleanupIni = () => {
			try {
				if (tmpDir.includes('vpinball-') && fs.existsSync(tmpDir))
					fs.rmSync(tmpDir, { recursive: true, force: true })
			} catch {}
		}
		process.once('exit', cleanupIni)
		nativeProc.once('close', cleanupIni)
	}

	console.log(`\n[compare] side-by-side ready — Left: Browser (0,0)  Right: Native (${nativeX},${nativeY})`)
	console.log('[compare] press Ctrl+C to terminate both\n')

	const terminate = (proc: any, escalationMs: number) => {
		try {
			if (proc && !proc.killed) {
				proc.kill('SIGTERM')
				setTimeout(() => {
					try {
						proc.kill('SIGKILL')
					} catch {}
				}, escalationMs)
			}
		} catch {}
	}
	const cleanup = async () => {
		console.log('\n[compare] shutting down…')
		try {
			if (page) await page.close().catch(() => {})
		} catch {}
		try {
			if (browser) await browser.close().catch(() => {})
		} catch {}
		terminate(nativeProc, 2000)
		terminate(viteProc, 1000)
		// also ensure stale kills
		try {
			utils.killStaleChromeSync()
		} catch {}
		process.exit(0)
	}
	process.once('SIGINT', cleanup)
	process.once('SIGTERM', cleanup)
	process.once('SIGHUP', cleanup)

	// Keep alive until one side exits
	if (nativeProc) {
		await new Promise<void>(res => {
			nativeProc.on('close', () => res())
			if (browser) browser.on('disconnected', () => res())
		})
		await cleanup()
	} else {
		// browser only — wait for browser close
		if (browser) {
			await new Promise<void>(res => {
				browser.on('disconnected', () => res())
				process.once('SIGINT', () => res())
			})
		} else {
			// wait forever until SIGINT
			await new Promise(() => {})
		}
	}
}

main().catch(error => {
	console.error('[compare] fatal', error)
	process.exit(1)
})
