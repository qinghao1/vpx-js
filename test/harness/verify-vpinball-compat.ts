import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vm from 'node:vm'
import { discoverVpinball, getDynamicLinkerEnv } from './vpinball-resolver.js'

function parseArgs(rawArgs: string[]): { all: boolean; vpx: string | null; auditOnly: boolean; help: boolean } {
	let all = false
	let vpx: string | null = null
	let auditOnly = false
	let help = false
	for (let index = 0; index < rawArgs.length; index++) {
		const arg = rawArgs[index]
		if (!arg) continue
		if (arg === '--all-fixtures' || arg === '--all') all = true
		else if (arg.startsWith('--vpx=')) vpx = arg.slice(6)
		else if (arg === '--vpx' && rawArgs[index + 1]) {
			index++
			vpx = rawArgs[index] ?? null
		} else if (arg === '--audit' || arg === '--audit-only') auditOnly = true
		else if (arg === '--help' || arg === '-h') help = true
		else if (arg.endsWith('.vpx') && !arg.startsWith('-')) vpx = arg
	}
	if (!vpx && !all && !help) all = true
	return { all, vpx, auditOnly, help }
}

function printHelp() {
	console.log(`verify-vpinball-compat — script extraction, table structure & AST parity vs native VPinballX

Usage:
  npx tsx test/harness/verify-vpinball-compat.ts --all-fixtures
  npx tsx test/harness/verify-vpinball-compat.ts --vpx=table-flipper
  npx tsx test/harness/verify-vpinball-compat.ts --vpx=/path/to/walking_dead.vpx
  npx tsx test/harness/verify-vpinball-compat.ts --audit

Steps per table:
  1. Native: VPinballX -ExtractVBS <fixture.vpx> (headless)
  2. vpx-js: Table.load() structure & script extraction
  3. Byte-level + normalized script parity assert
  4. Grammar.vbsToJs AST transpile (error-free)
  5. Table structure & physics constants audit (flippers, bumpers, rubbers, timers)
  6. Native: VPinballX -Audit <fixture.vpx> (headless consistency check)

Options:
  --all-fixtures, --all   Audit all 25 test fixtures
  --vpx=<name|path>       Target specific table fixture
  --audit                 Run table structure & physics constants audit
  --help, -h              Show this help
`)
}

function normalizeScript(s: string): string {
	return s
		.replace(/^\uFEFF/, '')
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		.trim()
}

export interface TableStructureAudit {
	itemCounts: {
		bumpers: number
		decals: number
		dispReels: number
		flashers: number
		flippers: number
		gates: number
		hitTargets: number
		kickers: number
		lights: number
		lightSeqs: number
		plungers: number
		primitives: number
		ramps: number
		rubbers: number
		spinners: number
		surfaces: number
		textboxes: number
		timers: number
		triggers: number
		textures: number
		collections: number
		totalItems: number
	}
	dimensions: {
		width: number
		height: number
		glassTop: number
		glassBottom: number
		inclination: number
	}
	physics: {
		flipperCount: number
		bumperCount: number
		rubberCount: number
		allPhysicsValid: boolean
		issues: string[]
	}
	warnings: string[]
	errors: string[]
}

export function auditTableStructure(table: any): TableStructureAudit {
	const itemCounts = {
		bumpers: Object.keys(table.bumpers ?? {}).length,
		decals: Object.keys(table.decals ?? {}).length,
		dispReels: Object.keys(table.dispReels ?? {}).length,
		flashers: Object.keys(table.flashers ?? {}).length,
		flippers: Object.keys(table.flippers ?? {}).length,
		gates: Object.keys(table.gates ?? {}).length,
		hitTargets: Object.keys(table.hitTargets ?? {}).length,
		kickers: Object.keys(table.kickers ?? {}).length,
		lights: Object.keys(table.lights ?? {}).length,
		lightSeqs: Object.keys(table.lightSeqs ?? {}).length,
		plungers: Object.keys(table.plungers ?? {}).length,
		primitives: Object.keys(table.primitives ?? {}).length,
		ramps: Object.keys(table.ramps ?? {}).length,
		rubbers: Object.keys(table.rubbers ?? {}).length,
		spinners: Object.keys(table.spinners ?? {}).length,
		surfaces: Object.keys(table.surfaces ?? {}).length,
		textboxes: Object.keys(table.textboxes ?? {}).length,
		timers: Object.keys(table.timers ?? {}).length,
		triggers: Object.keys(table.triggers ?? {}).length,
		textures: Object.keys(table.textures ?? {}).length,
		collections: Object.keys(table.collections ?? {}).length,
		totalItems: Object.keys(table.items ?? {}).length,
	}

	const dimensions = {
		width: table.data?.tableWidth ?? 0,
		height: table.data?.tableHeight ?? 0,
		glassTop: table.data?.glassTopHeight ?? 0,
		glassBottom: table.data?.glassBottomHeight ?? 0,
		inclination: table.data?.inclination ?? 0,
	}

	const warnings: string[] = []
	const errors: string[] = []
	const physicsIssues: string[] = []

	if (dimensions.width <= 0 || dimensions.height <= 0) {
		warnings.push(`Non-standard table dimensions: ${dimensions.width}x${dimensions.height}`)
	}
	if (dimensions.glassBottom > dimensions.glassTop) {
		warnings.push(`Glass bottom (${dimensions.glassBottom}) is higher than top (${dimensions.glassTop})`)
	}

	// Flippers physics validation
	for (const [name, flipper] of Object.entries(table.flippers ?? {})) {
		const flipperData = (flipper as any).data
		if (!flipperData) continue
		if (typeof flipperData.mass !== 'number' || flipperData.mass <= 0)
			physicsIssues.push(`Flipper '${name}' invalid mass: ${flipperData.mass}`)
		if (typeof flipperData.strength !== 'number' || flipperData.strength <= 0)
			physicsIssues.push(`Flipper '${name}' invalid strength: ${flipperData.strength}`)
		if (typeof flipperData.baseRadius !== 'number' || flipperData.baseRadius <= 0)
			physicsIssues.push(`Flipper '${name}' invalid baseRadius: ${flipperData.baseRadius}`)
		if (typeof flipperData.endRadius !== 'number' || flipperData.endRadius <= 0)
			physicsIssues.push(`Flipper '${name}' invalid endRadius: ${flipperData.endRadius}`)
		if (typeof flipperData.flipperRadiusMax !== 'number' || flipperData.flipperRadiusMax <= 0)
			physicsIssues.push(`Flipper '${name}' invalid flipperRadiusMax: ${flipperData.flipperRadiusMax}`)
		if (flipperData.center && (Number.isNaN(flipperData.center.x) || Number.isNaN(flipperData.center.y)))
			physicsIssues.push(`Flipper '${name}' center coordinate is NaN`)
	}

	// Bumpers physics validation
	for (const [name, bumper] of Object.entries(table.bumpers ?? {})) {
		const bumperData = (bumper as any).data
		if (!bumperData) continue
		if (typeof bumperData.radius !== 'number' || bumperData.radius <= 0)
			physicsIssues.push(`Bumper '${name}' invalid radius: ${bumperData.radius}`)
		if (typeof bumperData.force !== 'number' || bumperData.force < 0)
			physicsIssues.push(`Bumper '${name}' invalid force: ${bumperData.force}`)
		if (bumperData.center && (Number.isNaN(bumperData.center.x) || Number.isNaN(bumperData.center.y)))
			physicsIssues.push(`Bumper '${name}' center coordinate is NaN`)
	}

	// Rubbers validation
	for (const [name, rubber] of Object.entries(table.rubbers ?? {})) {
		const rubberData = (rubber as any).data
		if (!rubberData) continue
		if (typeof rubberData.hitHeight === 'number' && rubberData.hitHeight < 0)
			physicsIssues.push(`Rubber '${name}' negative hitHeight: ${rubberData.hitHeight}`)
		if (typeof rubberData.elasticity === 'number' && rubberData.elasticity < 0)
			physicsIssues.push(`Rubber '${name}' negative elasticity: ${rubberData.elasticity}`)
	}

	// Gates validation
	for (const [name, gate] of Object.entries(table.gates ?? {})) {
		const gateData = (gate as any).data
		if (!gateData) continue
		if (typeof gateData.damping === 'number' && gateData.damping < 0)
			physicsIssues.push(`Gate '${name}' negative damping: ${gateData.damping}`)
		if (typeof gateData.friction === 'number' && gateData.friction < 0)
			physicsIssues.push(`Gate '${name}' negative friction: ${gateData.friction}`)
		if (typeof gateData.elasticity === 'number' && gateData.elasticity < 0)
			physicsIssues.push(`Gate '${name}' negative elasticity: ${gateData.elasticity}`)
	}

	// Spinners validation
	for (const [name, spinner] of Object.entries(table.spinners ?? {})) {
		const spinnerData = (spinner as any).data
		if (!spinnerData) continue
		if (typeof spinnerData.damping === 'number' && spinnerData.damping < 0)
			physicsIssues.push(`Spinner '${name}' negative damping: ${spinnerData.damping}`)
		if (typeof spinnerData.elasticity === 'number' && spinnerData.elasticity < 0)
			physicsIssues.push(`Spinner '${name}' negative elasticity: ${spinnerData.elasticity}`)
	}

	// Timers frame-pacing check (< 17ms below 60fps)
	for (const [name, timer] of Object.entries(table.timers ?? {})) {
		const timerData = (timer as any).data
		if (!timerData) continue
		if (timerData.timerEnabled && timerData.timerInterval > 0 && timerData.timerInterval < 17) {
			warnings.push(`Timer '${name}' interval ${timerData.timerInterval}ms is below 60FPS frame pacing threshold`)
		}
	}

	// Lights intensity check
	for (const [name, light] of Object.entries(table.lights ?? {})) {
		const lightData = (light as any).data
		if (!lightData) continue
		if (typeof lightData.intensity === 'number' && lightData.intensity < 0) {
			warnings.push(`Light '${name}' negative intensity: ${lightData.intensity}`)
		}
	}

	// Script keyword diagnostics (matches native AuditTable)
	const script = (table as any).tableScript ?? ''
	if (script) {
		const lowerScript = script.toLowerCase()
		if (/\bexecute\b/.test(lowerScript)) {
			warnings.push("Script uses 'Execute' command (may trigger security/performance checks)")
		}
		const hasLoadVpm = lowerScript.includes('loadvpm')
		const hasPinMameTimer = Boolean(table.timers?.pinmametimer || table.timers?.PinMAMETimer)
		if (hasLoadVpm && !hasPinMameTimer) {
			warnings.push("VPM controller is used but table is missing a Timer object named 'PinMAMETimer'")
		}
		const hasVpmTimer = lowerScript.includes('vpmtimer')
		const hasPulseTimer = Boolean(table.timers?.pulsetimer || table.timers?.PulseTimer)
		if (hasVpmTimer && !hasPulseTimer) {
			warnings.push("Script references 'vpmTimer' but table is missing a Timer object named 'PulseTimer'")
		}
	}

	return {
		itemCounts,
		dimensions,
		physics: {
			flipperCount: itemCounts.flippers,
			bumperCount: itemCounts.bumpers,
			rubberCount: itemCounts.rubbers,
			allPhysicsValid: physicsIssues.length === 0,
			issues: physicsIssues,
		},
		warnings,
		errors,
	}
}

async function loadAndAuditVpxJs(vpxPath: string): Promise<{ script: string; table: any; audit: TableStructureAudit }> {
	const { NodeBinaryReader } = await import('../../lib/io/binary-reader.node.js')
	const { Table } = await import('../../lib/vpt/table/table.js')
	const table = await Table.load(new NodeBinaryReader(vpxPath), { loadTableScript: true })
	const script = (table as any).tableScript ?? ''
	const audit = auditTableStructure(table)
	return { script, table, audit }
}

async function extractViaNative(
	binPath: string,
	binDir: string,
	vpxPath: string,
): Promise<{ script: string | null; outPath: string; stdout: string; stderr: string; status: number | null }> {
	const absVpx = path.resolve(vpxPath)
	const outPath = absVpx.replace(/\.vpx$/i, '.vbs')
	const hadBefore = fs.existsSync(outPath)
	const beforeStat = hadBefore ? fs.statSync(outPath) : null
	const env = { ...process.env, ...getDynamicLinkerEnv(binDir) }
	// ExtractVBS is lazy-init safe — no xvfb needed even without DISPLAY
	const cmd = binPath
	const args = ['-ExtractVBS', absVpx]
	const result = spawnSync(cmd, args, { encoding: 'utf-8', env, timeout: 30000 })
	let script: string | null = null
	// Native writes adjacent .vbs; wait briefly and read
	for (let i = 0; i < 10; i++) {
		if (fs.existsSync(outPath)) {
			try {
				const stat = fs.statSync(outPath)
				// If file was overwritten or newly created, read it
				if (!hadBefore || stat.mtimeMs !== beforeStat?.mtimeMs || stat.size !== beforeStat?.size) {
					script = fs.readFileSync(outPath, 'utf-8')
					break
				}
				// Still same file but maybe updated quickly — check after small delay
				await new Promise(r => setTimeout(r, 100))
				script = fs.readFileSync(outPath, 'utf-8')
				break
			} catch {}
		}
		await new Promise(r => setTimeout(r, 100))
	}
	// Fallback: also check cwd-adjacent
	if (!script && fs.existsSync(outPath)) {
		try {
			script = fs.readFileSync(outPath, 'utf-8')
		} catch {}
	}
	return { script, outPath, stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status }
}

async function runNativeAudit(
	binPath: string,
	binDir: string,
	vpxPath: string,
): Promise<{ stdout: string; stderr: string; status: number | null }> {
	const absVpx = path.resolve(vpxPath)
	const env = { ...process.env, ...getDynamicLinkerEnv(binDir) }
	const cmd = binPath
	const args = ['-Audit', absVpx]
	const result = spawnSync(cmd, args, { encoding: 'utf-8', env, timeout: 30000 })
	return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status }
}

export async function verifyVpinballCompat(
	opts: { vpx?: string | null; all?: boolean; auditOnly?: boolean } = {},
): Promise<boolean> {
	const disc = discoverVpinball()
	const hasNative = Boolean(disc.binPath && disc.binDir)

	if (!hasNative && !opts.auditOnly) {
		console.log('ok 1 - vpinball-compat # SKIP native vpinball not found (run npm run vpinball:setup)')
		return true
	}

	if (hasNative) {
		console.log(`# vpinball-compat — native ${disc.binPath} (${disc.source})`)
	} else {
		console.log('# vpinball-compat — running in vpx-js standalone table structure & physics audit mode')
	}

	const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
	let fixtures: string[] = []
	if (opts.vpx) {
		let targetVpx = opts.vpx
		// expand fixture short name
		if (!targetVpx.includes('/') && !path.isAbsolute(targetVpx)) {
			const candidates = [
				path.join(repoRoot, 'test/fixtures', targetVpx),
				path.join(repoRoot, 'test/fixtures', `${targetVpx}.vpx`),
				path.join(repoRoot, 'test/fixtures', `table-${targetVpx}.vpx`),
				path.join(repoRoot, 'test/fixtures', `table-${targetVpx.replace(/^table-/, '')}.vpx`),
				path.resolve(targetVpx),
			]
			let found: string | null = null
			for (const candidate of candidates) {
				if (fs.existsSync(candidate)) {
					found = candidate
					break
				}
			}
			if (found) targetVpx = found
			else targetVpx = path.resolve(targetVpx)
		} else {
			targetVpx = path.resolve(targetVpx)
		}
		if (!fs.existsSync(targetVpx)) {
			console.log(`not ok 1 - vpinball-compat — VPX not found: ${opts.vpx}`)
			return false
		}
		fixtures = [targetVpx]
	} else {
		const dir = path.join(repoRoot, 'test/fixtures')
		fixtures = fs
			.readdirSync(dir)
			.filter(f => f.startsWith('table-') && f.endsWith('.vpx'))
			.map(f => path.join(dir, f))
			.sort()
		if (fixtures.length === 0) {
			console.log('not ok 1 - vpinball-compat — no fixtures found')
			return false
		}
	}

	const binPath = disc.binPath ?? ''
	const binDir = disc.binDir ?? path.dirname(binPath)
	console.log(`# checking ${fixtures.length} fixture(s)`)
	let pass = 0
	let fail = 0

	for (let fixtureIndex = 0; fixtureIndex < fixtures.length; fixtureIndex++) {
		const vpxPath = fixtures[fixtureIndex]
		if (!vpxPath) continue
		const name = path.basename(vpxPath)
		console.log(`\n# [${fixtureIndex + 1}/${fixtures.length}] ${name}`)
		let nativeScript: string | null = null
		let nativeOutPath = ''
		let hadBefore = false
		try {
			// 1. vpx-js extraction & structure audit
			const { script: jsScript, audit } = await loadAndAuditVpxJs(vpxPath)
			console.log(`  vpx-js: ${(jsScript.length / 1024).toFixed(1)} KB`)
			console.log(
				`  ✓ structure: ${audit.dimensions.width}x${audit.dimensions.height} — ${audit.itemCounts.totalItems} items ` +
					`(${audit.itemCounts.flippers} flippers, ${audit.itemCounts.bumpers} bumpers, ${audit.itemCounts.rubbers} rubbers, ` +
					`${audit.itemCounts.lights} lights, ${audit.itemCounts.primitives} primitives, ${audit.itemCounts.textures} textures)`,
			)

			// Physics constants validation
			if (audit.physics.allPhysicsValid) {
				console.log(
					`  ✓ physics constants valid: ${audit.physics.flipperCount} flipper(s), ${audit.physics.bumperCount} bumper(s), ${audit.physics.rubberCount} rubber(s)`,
				)
			} else {
				console.log(`  not ok — physics validation failed: ${audit.physics.issues.join('; ')}`)
				fail++
				continue
			}

			// Report non-critical audit warnings if present
			if (audit.warnings.length > 0) {
				for (const warning of audit.warnings) console.log(`  note: ${warning}`)
			}

			// If native binary is present, perform full dual parity verification
			if (hasNative) {
				// 2. Native script extraction
				nativeOutPath = vpxPath.replace(/\.vpx$/i, '.vbs')
				hadBefore = fs.existsSync(nativeOutPath)
				const nativeRes = await extractViaNative(binPath, binDir, vpxPath)
				nativeOutPath = nativeRes.outPath
				nativeScript = nativeRes.script
				if (nativeRes.status !== 0) {
					console.log(`  not ok — native -ExtractVBS exited ${nativeRes.status}`)
					if (nativeRes.stdout) console.log(`  stdout: ${nativeRes.stdout.slice(0, 800)}`)
					if (nativeRes.stderr) console.log(`  stderr: ${nativeRes.stderr.slice(0, 800)}`)
					if (!nativeScript && fs.existsSync(nativeOutPath)) {
						try {
							nativeScript = fs.readFileSync(nativeOutPath, 'utf-8')
						} catch {}
					}
				}
				if (!nativeScript) {
					if (!jsScript) {
						console.log('  ✓ script: (no script in table — native & vpx-js agree)')
					} else {
						console.log(`  not ok — native script not produced at ${nativeOutPath}`)
						if (nativeRes.stdout) console.log(`  stdout: ${nativeRes.stdout.slice(0, 500)}`)
						if (nativeRes.stderr) console.log(`  stderr: ${nativeRes.stderr.slice(0, 500)}`)
						fail++
						continue
					}
				} else {
					console.log(`  native: ${(nativeScript.length / 1024).toFixed(1)} KB → ${nativeOutPath}`)

					// 3. Script Parity check
					const normNative = normalizeScript(nativeScript)
					const normJs = normalizeScript(jsScript)
					if (normNative === normJs) {
						console.log('  ✓ byte-level parity (normalized)')
					} else {
						const lenDiff = Math.abs(normNative.length - normJs.length)
						console.log(
							`  byte-level diff: native ${normNative.length} vs js ${normJs.length} (Δ ${lenDiff})`,
						)
						let diffIdx = -1
						const minLen = Math.min(normNative.length, normJs.length)
						for (let charIndex = 0; charIndex < minLen; charIndex++) {
							if (normNative[charIndex] !== normJs[charIndex]) {
								diffIdx = charIndex
								break
							}
						}
						if (diffIdx === -1 && normNative.length !== normJs.length) diffIdx = minLen
						if (diffIdx !== -1) {
							const contextLen = 120
							const nativeContext = normNative
								.slice(Math.max(0, diffIdx - contextLen), diffIdx + contextLen)
								.replace(/\n/g, '\\n')
							const jsContext = normJs
								.slice(Math.max(0, diffIdx - contextLen), diffIdx + contextLen)
								.replace(/\n/g, '\\n')
							console.log(`  first diff at ${diffIdx}:`)
							console.log(`    native: …${nativeContext}…`)
							console.log(`    vpx-js: …${jsContext}…`)
						}
						const semNative = normNative.replace(/\s+/g, ' ').trim()
						const semJs = normJs.replace(/\s+/g, ' ').trim()
						if (semNative === semJs) {
							console.log('  ✓ semantic parity (whitespace-normalized)')
						} else {
							console.log('  not ok — script parity failed')
							fail++
							continue
						}
					}
				}

				// 4. Native -Audit parity check
				const nativeAuditRes = await runNativeAudit(binPath, binDir, vpxPath)
				if (nativeAuditRes.status === 0) {
					console.log('  ✓ native -Audit consistent (exit 0)')
				} else {
					console.log(`  note: native -Audit returned status ${nativeAuditRes.status}`)
				}
			}

			// 5. AST transpilation
			const scriptToTranspile = nativeScript ?? jsScript
			if (scriptToTranspile.trim().length > 0) {
				try {
					const { Grammar } = await import('../../lib/scripting/grammar/grammar.js')
					const { normalizeNewCall } = await import('../../lib/scripting/transpiler.js')
					const grammar = new Grammar()
					const processedScript = normalizeNewCall(scriptToTranspile)
					const js = grammar.vbsToJs(processedScript)
					if (typeof js !== 'string') {
						console.log('  not ok — vbsToJs did not return a string')
						fail++
						continue
					}
					// Validate JS syntax in V8 engine
					try {
						new vm.Script(js)
					} catch (v8Err: unknown) {
						console.log(`  not ok — transpiled JS failed V8 syntax validation: ${(v8Err as Error).message}`)
						fail++
						continue
					}
					console.log(`  ✓ vbs2js AST & V8 syntax OK (${(js.length / 1024).toFixed(1)} KB JS)`)
				} catch (err: unknown) {
					console.log(`  not ok — vbsToJs failed: ${(err as Error).message?.slice(0, 500)}`)
					fail++
					continue
				}
			} else {
				console.log('  ✓ script: (empty table script)')
			}
			pass++
			console.log(`  ok — ${name}`)
		} catch (err: unknown) {
			console.log(`  not ok — exception: ${(err as Error).message?.slice(0, 800)}`)
			fail++
		} finally {
			// Cleanup native output if created
			try {
				if (!hadBefore && nativeOutPath && fs.existsSync(nativeOutPath)) {
					if (fixtures.length > 1) {
						fs.rmSync(nativeOutPath)
					}
				}
			} catch {}
		}
	}

	console.log(`\n# vpinball-compat: pass ${pass}/${fixtures.length}, fail ${fail}/${fixtures.length}`)
	if (fail === 0) {
		console.log(`ok 1 - vpinball-compat (${pass}/${fixtures.length} fixtures)`)
		return true
	}
	console.log(`not ok 1 - vpinball-compat (${fail} failures)`)
	return false
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const raw = process.argv.slice(2)
	const { all, vpx, auditOnly, help } = parseArgs(raw)
	if (help) {
		printHelp()
		process.exit(0)
	}
	const ok = await verifyVpinballCompat({ vpx, all, auditOnly })
	process.exit(ok ? 0 : 1)
}
