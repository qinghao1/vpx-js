#!/usr/bin/env tsx
import { execSync, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
	discoverVpinball,
	getDynamicLinkerEnv,
	getNativeArgs,
	resolveVpxSession,
	spawnTaggedProcess,
} from '../test/harness/vpinball-resolver.js'
import { runDoctor } from './vpinball-doctor.js'

function printHelp() {
	console.log(`vpinball-runner — bridge browser URLs / CLI flags to native VPinballX
Usage:
  npx tsx bin/vpinball-runner.ts [options] <vpx>

Inputs (any of):
  "http://localhost:3000/?vpx=/@fs/...&rom=/@fs/..."   Browser URL copy-paste
  --vpx=<path|fixture|url>  --rom=<path>  --url=<url>
  --vpx=table-flipper       short fixture name
  flipper                   bare fixture short name

Modes:
  (default)                 -Play with transient -Ini (windowed 1280x900)
  --extractvbs              -ExtractVBS (headless, writes <table>.vbs)
  --audit                   -Audit
  --pov                     -Pov
  --doctor                  Pre-flight diagnostics only (no launch)

Options:
  --headless                Wrap in xvfb-run for CI (also auto-used when DISPLAY is unset)
  --help, -h                Show this help
  --vpx=<p> --rom=<p>       Override resolver
  --ini <path>              Use existing INI instead of generating session one

Examples:
  npx tsx bin/vpinball-runner.ts "http://localhost:3000/?vpx=/@fs/home/qinghao1/Downloads/walking_dead.vpx&rom=/@fs/home/qinghao1/.pinmame/roms/twd_160h.zip"
  npx tsx bin/vpinball-runner.ts --vpx=table-flipper
  npx tsx bin/vpinball-runner.ts --vpx=/home/qinghao1/Downloads/walking_dead.vpx --extractvbs
  npx tsx bin/vpinball-runner.ts --doctor
`)
}

function hasCmd(cmd: string): boolean {
	try {
		execSync(`command -v ${cmd} 2>/dev/null`, { stdio: 'ignore' })
		return true
	} catch {
		return false
	}
}

function buildSpawnArgs(
	binPath: string,
	nativeArgs: string[],
	opts: { headless: boolean },
): { cmd: string; args: string[] } {
	let cmd = binPath
	let args = [...nativeArgs]
	const needsXvfb = opts.headless || (!process.env.DISPLAY && process.platform === 'linux')
	if (needsXvfb && hasCmd('xvfb-run')) {
		cmd = 'xvfb-run'
		args = ['-a', binPath, ...args]
		console.log(`[vpinball] wrapping with xvfb-run (headless)`)
	} else if (needsXvfb) {
		console.log(
			'[vpinball] headless without xvfb-run — -ExtractVBS/-Audit are lazy-init safe, GUI may need xvfb-run or DISPLAY',
		)
	}
	return { cmd, args }
}

async function main() {
	const raw = process.argv.slice(2)
	if (raw.includes('--help') || raw.includes('-h')) {
		printHelp()
		process.exit(0)
	}
	if (raw.includes('--doctor')) {
		const ok = await runDoctor()
		process.exit(ok ? 0 : 1)
	}

	const headless = raw.includes('--headless')
	const extract = raw.includes('--extractvbs') || raw.includes('--extractVBS') || raw.includes('--extract')
	const audit = raw.includes('--audit')
	const pov = raw.includes('--pov')

	// Filter out flags that are not vpx/rom/url inputs for resolver
	const skipFlags = new Set([
		'--headless',
		'--doctor',
		'--help',
		'-h',
		'--extractvbs',
		'--extractVBS',
		'--extract',
		'--audit',
		'--pov',
	])
	let iniArg: string | undefined
	const resolverArgs: string[] = []
	for (let i = 0; i < raw.length; i++) {
		const a = raw[i]
		if (a === '--ini' && raw[i + 1]) {
			iniArg = raw[++i]
			continue
		}
		if (a.startsWith('--ini=')) {
			iniArg = a.slice('--ini='.length)
			continue
		}
		if (a === '--ini' || skipFlags.has(a)) continue
		resolverArgs.push(a)
	}

	if (resolverArgs.length === 0) {
		printHelp()
		console.error('\nerror: no VPX input provided')
		process.exit(1)
	}

	let session
	try {
		session = await resolveVpxSession(resolverArgs)
	} catch (error: unknown) {
		console.error(`[vpinball] resolve failed: ${(error as Error).message}`)
		process.exit(1)
	}

	const disc = discoverVpinball()
	if (!disc.binPath || !disc.binDir) {
		console.error('[vpinball] native binary not found.')
		console.error(
			'  Tried: $VPINBALL_BIN, $VPINBALL_DIR, ~/projects/vpinball/build, external/vpinball/build, ~/.cache/vpinball',
		)
		console.error('  Fix: npm run vpinball:setup  or  export VPINBALL_BIN=/path/to/VPinballX_GL')
		console.error('  Then: npm run vpinball:doctor')
		process.exit(1)
	}
	const binPath = disc.binPath
	const binDir = disc.binDir
	console.log(`[vpinball] binary: ${binPath} (${disc.source})`)
	console.log(`[vpinball] table:  ${session.vpxPath}`)
	if (session.gameName) console.log(`[vpinball] game:   ${session.gameName}`)
	if (session.romPath) console.log(`[vpinball] rom:    ${session.romPath}`)
	else if (session.gameName)
		console.log(`[vpinball] rom:    not found for ${session.gameName} (set --rom= or place in ~/.pinmame/roms)`)
	console.log(`[vpinball] browser: ${session.browserUrl}`)

	let nativeArgs: string[]
	let iniPath = session.iniPath
	if (iniArg) {
		const customIni = path.resolve(iniArg)
		if (!fs.existsSync(customIni)) {
			console.warn(`[vpinball] --ini not found, falling back to session INI: ${iniArg}`)
		} else {
			iniPath = customIni
		}
	}
	if (extract) {
		if (iniArg) console.log('[vpinball] note: --ini ignored in -ExtractVBS mode (no -Ini flag)')
		nativeArgs = getNativeArgs(session.vpxPath, iniPath, 'extractvbs')
		console.log(`[vpinball] mode: -ExtractVBS (headless, lazy video init)`)
	} else if (audit) {
		if (iniArg) console.log('[vpinball] note: --ini ignored in -Audit mode (no -Ini flag)')
		nativeArgs = getNativeArgs(session.vpxPath, iniPath, 'audit')
	} else if (pov) {
		if (iniArg) console.log('[vpinball] note: --ini ignored in -Pov mode (no -Ini flag)')
		nativeArgs = getNativeArgs(session.vpxPath, iniPath, 'pov')
	} else {
		// Play mode — keep session INI (windowed 1280x900)
		nativeArgs = getNativeArgs(session.vpxPath, iniPath, 'play')
		console.log(`[vpinball] mode: -Play + -Ini ${iniPath}`)
		console.log(`[vpinball] ini:   ${iniPath}`)
		try {
			console.log(fs.readFileSync(iniPath, 'utf-8'))
		} catch {}
	}

	const env = { ...process.env, ...getDynamicLinkerEnv(binDir) }

	const { cmd, args } = buildSpawnArgs(binPath, nativeArgs, { headless: extract || audit || pov || headless })
	console.log(`[vpinball] exec: ${cmd} ${args.join(' ')}`)
	console.log(`[vpinball] ld:    ${env.LD_LIBRARY_PATH ?? env.DYLD_FALLBACK_LIBRARY_PATH ?? '(none)'}`)

	const cleanupIni = () => {
		try {
			if (iniPath.includes(os.tmpdir()) && fs.existsSync(iniPath)) {
				fs.rmSync(path.dirname(iniPath), { recursive: true, force: true })
			}
		} catch {}
	}
	process.once('exit', cleanupIni)
	process.once('SIGINT', () => {
		cleanupIni()
		process.exit(130)
	})
	process.once('SIGTERM', () => {
		cleanupIni()
		process.exit(143)
	})

	if (extract || audit || pov) {
		// Run to completion, capture output
		const result = spawnSync(cmd, args, { encoding: 'utf-8', env, timeout: 30000 })
		if (result.stdout) process.stdout.write(result.stdout)
		if (result.stderr) process.stderr.write(result.stderr)
		if (result.status !== 0) {
			console.error(`[vpinball] command failed with code ${result.status}`)
			if (result.error) console.error(result.error)
			cleanupIni()
			process.exit(result.status ?? 1)
		}
		// For extract, check output file
		if (extract) {
			const expected = session.vpxPath.replace(/\.(vpx|vpt)$/i, '.vbs')
			const candidates = [
				expected,
				path.join(
					path.dirname(session.vpxPath),
					`${path.basename(session.vpxPath, path.extname(session.vpxPath))}.vbs`,
				),
			]
			let found: string | null = null
			for (const candidate of candidates) {
				if (fs.existsSync(candidate)) {
					found = candidate
					break
				}
			}
			if (found) {
				const size = fs.statSync(found).size
				console.log(`[vpinball] extracted: ${found} (${(size / 1024).toFixed(1)} KB)`)
			} else {
				console.log(`[vpinball] note: expected output ${expected} not found (check table dir)`)
				// also check cwd
				const cwdCandidate = path.join(process.cwd(), path.basename(expected))
				if (fs.existsSync(cwdCandidate)) console.log(`[vpinball] found in cwd: ${cwdCandidate}`)
			}
		}
		cleanupIni()
		process.exit(0)
	}

	// Interactive GUI — spawn and pipe tagged
	const child = spawnTaggedProcess(cmd, args, env, 'vpx-native')

	child.on('close', code => {
		console.log(`[vpinball] native exited with code ${code}`)
		cleanupIni()
		process.exit(code ?? 0)
	})
	child.on('error', err => {
		console.error(`[vpinball] spawn error: ${err.message}`)
		cleanupIni()
		process.exit(1)
	})
}

main().catch(fatalError => {
	console.error('[vpinball] fatal', fatalError)
	process.exit(1)
})
