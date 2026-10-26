// TWD browser E2E — runs demo-browser/e2e/integration.mjs against the real
// Walking Dead table (plus the PinMAME ROM when present) so the pageerror
// gate, backbox map-bound, live-DMD and DMD-visible legs exercise real
// content instead of the empty-table fixture.
// Run: npx tsx test/harness/verify-twd-e2e.ts [--vpx=...] [--rom=...] [--url=...] [--gpu=...]
// Exit: 0 pass, 1 failure, 77 skipped (VPX file not found).
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Tap, tapComment, tapSkip } from './tap.js'
import {
	detectGameName,
	findRomForGameName,
	getArg,
	parseVpxArgs,
	resolvePathToUrl,
	resolveVpxPath,
} from './vpinball-resolver.js'

const SKIP_EXIT = 77
const DEFAULT_VPX = '/home/qinghao1/Downloads/walking_dead.vpx'

const tap = new Tap('twd browser e2e')
const args = process.argv.slice(2)
const parsed = parseVpxArgs(args)
const gpu = getArg(args, 'gpu', process.env.USE_GPU ?? process.env.GPU ?? null)

let targetUrl = parsed.url
if (!targetUrl) {
	const vpxInput = parsed.vpx ?? DEFAULT_VPX
	const vpxPath = resolveVpxPath(vpxInput)
	if (!vpxPath || !fs.existsSync(vpxPath)) {
		tapSkip(1, 'twd-e2e', `VPX not found: ${vpxInput}`)
		process.exit(SKIP_EXIT)
	}
	let romPath: string | null = null
	if (parsed.rom) {
		const explicit = resolveVpxPath(parsed.rom)
		if (explicit && fs.existsSync(explicit)) romPath = explicit
		else tapComment(`explicit ROM not found, continuing without ROM: ${parsed.rom}`)
	} else {
		let gameName: string | null = null
		try {
			gameName = await detectGameName(vpxPath)
		} catch {}
		if (gameName) romPath = findRomForGameName(gameName, path.dirname(vpxPath))
		if (!romPath) romPath = findRomForGameName('twd_160h', path.dirname(vpxPath))
	}
	tapComment(`vpx: ${vpxPath}`)
	tapComment(`rom: ${romPath ?? 'none (ROM-dependent legs will SKIP)'}`)
	tapComment(`gpu: ${gpu ?? 'swiftshader (default)'}`)
	targetUrl = resolvePathToUrl(vpxPath, romPath, { host: 'https://localhost:3000', mode: 'play' })
} else {
	tapComment(`url: ${targetUrl}`)
	tapComment(`gpu: ${gpu ?? 'swiftshader (default)'}`)
}

const script = path.join(process.cwd(), 'demo-browser/e2e/integration.mjs')
if (!fs.existsSync(script)) {
	tapSkip(1, 'twd-e2e', 'integration script not found, not run')
	process.exit(SKIP_EXIT)
}

const code = await new Promise<number>(resolve => {
	const child = spawn('node', [script, `--url=${targetUrl}`, ...(gpu ? [`--gpu=${gpu}`] : [])], {
		stdio: 'inherit',
		// TWD is a 200MB+ table: allow long load + long GPU runs by default
		// (explicit env still wins).
		env: {
			...process.env,
			E2E_READY_TIMEOUT_MS: process.env.E2E_READY_TIMEOUT_MS ?? '180000',
			E2E_AUTOKILL_MS: process.env.E2E_AUTOKILL_MS ?? '600000',
		},
	})
	child.on('close', exitCode => resolve(exitCode ?? 1))
	child.on('error', () => resolve(1))
})

if (code === SKIP_EXIT) {
	tapSkip(1, 'twd-e2e', 'child reported skip')
	process.exit(SKIP_EXIT)
}
tap.assert(code === 0, `twd browser e2e passes (exit=${code})`)
process.exit(tap.done() ? 0 : 1)
