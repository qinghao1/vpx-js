#!/usr/bin/env tsx
import { execSync, spawn, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
	discoverVpinball,
	getDynamicLinkerEnv,
	getNativeArgs,
	resolveVpxSession,
} from '../test/harness/vpinball-resolver.js'

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
  --headless                Force xvfb-run wrapper if DISPLAY unset

Options:
  --headless                Wrap in xvfb-run for CI
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

async function runDoctor(): Promise<boolean> {
	console.log('# vpinball doctor — pre-flight diagnostics')
	const disc = discoverVpinball()
	console.log(`\n[discovery] ${disc.binPath ? `found ${disc.binPath} (${disc.source})` : 'NOT FOUND'}`)
	if (!disc.binPath || !disc.binDir) {
		console.log('  → run: npm run vpinball:setup  or  bash scripts/setup-vpinball.sh')
		console.log('  → or set VPINBALL_BIN=/path/to/VPinballX_GL')
		console.log('  → or clone: git clone https://github.com/vpinball/vpinball.git ~/projects/vpinball')
		return false
	}
	let ok = true
	const binPath = disc.binPath
	const binDir = disc.binDir
	const stat = fs.statSync(binPath)
	console.log(`\n[perm] ${binPath}`)
	console.log(
		`  size: ${(stat.size / 1024 / 1024).toFixed(2)} MB  mode: ${(stat.mode & 0o777).toString(8)}  x_ok: ${(() => {
			try {
				fs.accessSync(binPath, fs.constants.X_OK)
				return 'yes'
			} catch {
				return 'no'
			}
		})()}`,
	)
	try {
		const fileOut = execSync(`file "${binPath}" 2>&1`, { encoding: 'utf-8' }).trim()
		console.log(`  file: ${fileOut}`)
	} catch {}
	console.log('\n[linker] shared deps')
	if (process.platform === 'linux') {
		try {
			const ldd = execSync(`ldd "${binPath}" 2>&1`, { encoding: 'utf-8' })
			const missing = ldd.split('\n').filter(l => l.includes('not found'))
			if (missing.length) {
				ok = false
				console.log('  MISSING:')
				for (const missingDep of missing) console.log(`    ${missingDep.trim()}`)
				console.log(
					'  Hint: sudo apt update && sudo apt install libsdl3-0 libsdl3-image0 libsdl3-ttf0 libfreeimage3 libhidapi-hidraw0 libopenal1 || sudo apt install libSDL3* libfreeimage*',
				)
			} else {
				console.log('  all deps resolved (ldd)')
			}
			const lines = ldd.split('\n').slice(0, 12)
			for (const line of lines) if (line.trim()) console.log(`    ${line.trim()}`)
		} catch (err: unknown) {
			console.log(`  ldd failed: ${(err as Error).message}`)
		}
	} else if (process.platform === 'darwin') {
		try {
			const otool = execSync(`otool -L "${binPath}" 2>&1`, { encoding: 'utf-8' })
			console.log(otool.split('\n').slice(0, 20).join('\n'))
		} catch (err: unknown) {
			console.log(`  otool failed: ${(err as Error).message}`)
		}
	}
	console.log('\n[layout] shaders / scripts / plugins')
	const shaderCandidates = [
		path.join(binDir, 'shaders-10.8.1'),
		path.join(binDir, 'shaders'),
		path.join(binDir, '../shaders-10.8.1'),
	]
	let shaderFound = false
	for (const candidate of shaderCandidates) {
		if (fs.existsSync(candidate)) {
			const count = fs.readdirSync(candidate).length
			console.log(`  shaders: ${candidate} (${count} files)`)
			shaderFound = true
			break
		}
	}
	if (!shaderFound) {
		for (const dir of [binDir, path.join(binDir, '..')]) {
			try {
				for (const entry of fs.readdirSync(dir)) {
					if (!entry.toLowerCase().startsWith('shader')) continue
					const full = path.join(dir, entry)
					try {
						if (
							fs.statSync(full).isDirectory() &&
							fs.readdirSync(full).some(f => f.endsWith('.glfx') || f.endsWith('.fxh'))
						) {
							console.log(`  shaders: ${full} (${fs.readdirSync(full).length} files)`)
							shaderFound = true
							break
						}
					} catch {}
				}
			} catch {}
			if (shaderFound) break
		}
	}
	if (!shaderFound) {
		ok = false
		console.log('  shaders: NOT FOUND (expected shaders-10.8.1/ with SMAA.glfx etc.)')
	}
	const scriptCandidates = [
		path.join(binDir, 'scripts/core.vbs'),
		path.join(binDir, '../scripts/core.vbs'),
		path.join(binDir, 'scripts/vpmkeys.vbs'),
	]
	let scriptFound = false
	for (const s of scriptCandidates) {
		if (fs.existsSync(s)) {
			console.log(`  scripts: ${s}`)
			scriptFound = true
			break
		}
	}
	if (!scriptFound) console.log('  scripts: not found (optional — scripts/core.vbs)')
	const pluginCandidates = [path.join(binDir, 'plugins'), path.join(binDir, '../plugins')]
	for (const p of pluginCandidates) {
		if (fs.existsSync(p)) {
			const entries = fs.readdirSync(p)
			console.log(`  plugins: ${p} (${entries.join(', ')})`)
			break
		}
	}
	console.log('\n[pinmame] ROM search')
	const pinmamePaths = [
		path.join(os.homedir(), '.pinmame/roms'),
		path.join(os.homedir(), 'pinmame/roms'),
		path.join(os.homedir(), 'Downloads'),
	]
	for (const r of pinmamePaths) {
		const exists = fs.existsSync(r)
		const count = exists ? fs.readdirSync(r).filter(f => f.endsWith('.zip')).length : 0
		console.log(`  ${r}: ${exists ? `${count} zips` : 'not found'}`)
	}
	console.log('\n[env] dynamic linker')
	const env = getDynamicLinkerEnv(binDir)
	for (const [k, v] of Object.entries(env)) console.log(`  ${k}=${v}`)
	console.log(`\n[result] ${ok ? 'PASS' : 'FAIL — see hints above'}`)
	return ok
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
	const resolverArgs = raw.filter(
		a =>
			![
				'--headless',
				'--doctor',
				'--help',
				'-h',
				'--extractvbs',
				'--extractVBS',
				'--extract',
				'--audit',
				'--pov',
			].includes(a),
	)

	if (resolverArgs.length === 0) {
		printHelp()
		console.error('\nerror: no VPX input provided')
		process.exit(1)
	}

	let session
	try {
		session = await resolveVpxSession(resolverArgs)
	} catch (e: unknown) {
		console.error(`[vpinball] resolve failed: ${(e as Error).message}`)
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
	if (extract) {
		nativeArgs = getNativeArgs(session.vpxPath, iniPath, 'extractvbs')
		console.log(`[vpinball] mode: -ExtractVBS (headless, lazy video init)`)
	} else if (audit) {
		nativeArgs = getNativeArgs(session.vpxPath, iniPath, 'audit')
	} else if (pov) {
		nativeArgs = getNativeArgs(session.vpxPath, iniPath, 'pov')
	} else {
		// Play mode — keep session INI (windowed 1280x900)
		nativeArgs = session.nativeArgs
		// Allow --ini override
		const iniIdx = raw.indexOf('--ini')
		const iniArg = iniIdx !== -1 ? raw[iniIdx + 1] : undefined
		if (iniArg) {
			const customIni = path.resolve(iniArg)
			if (fs.existsSync(customIni)) {
				iniPath = customIni
				nativeArgs = getNativeArgs(session.vpxPath, iniPath, 'play')
			}
		}
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
			const expected = session.vpxPath.replace(/\.vpx$/i, '.vbs')
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
	const child = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'], env })

	child.stdout.on('data', (chunk: Buffer) => process.stdout.write(`[vpx-native] ${chunk}`))
	child.stderr.on('data', (chunk: Buffer) => process.stderr.write(`[vpx-native] ${chunk}`))

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
