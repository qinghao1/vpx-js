// Script-extraction & AST-parity driver vs native VPinballX (split from verify-vpinball-compat.ts).
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vm from 'node:vm'
import { auditTableStructure, type TableStructureAudit } from './audit-table.js'
import { tapComment, tapNotOk, tapOk, tapSkip } from './tap.js'
import { discoverVpinball, getDynamicLinkerEnv, resolveVpxPath } from './vpinball-resolver.js'

function normalizeScript(s: string): string {
	return s
		.replace(/^\uFEFF/, '')
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
		.trim()
}
async function loadAndAuditVpxJs(vpxPath: string): Promise<{ script: string; table: any; audit: TableStructureAudit }> {
	const { NodeBinaryReader } = await import('../../lib/io/binary-reader.node.js')
	const { Table } = await import('../../lib/vpt/table/table.js')
	const table = await Table.load(new NodeBinaryReader(vpxPath), { loadTableScript: true })
	const script = (table as any).tableScript ?? ''
	const audit = auditTableStructure(table)
	return { script, table, audit }
}

function spawnNative(
	binPath: string,
	binDir: string,
	flag: string,
	vpxPath: string,
): { stdout: string; stderr: string; status: number | null } {
	const env = { ...process.env, ...getDynamicLinkerEnv(binDir) }
	const result = spawnSync(binPath, [flag, path.resolve(vpxPath)], { encoding: 'utf-8', env, timeout: 30000 })
	return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status }
}

async function extractViaNative(
	binPath: string,
	binDir: string,
	vpxPath: string,
): Promise<{ script: string | null; outPath: string; stdout: string; stderr: string; status: number | null }> {
	const outPath = path.resolve(vpxPath).replace(/\.vpx$/i, '.vbs')
	// ExtractVBS is lazy-init safe — no xvfb needed even without DISPLAY
	const { stdout, stderr, status } = spawnNative(binPath, binDir, '-ExtractVBS', vpxPath)
	// spawnSync is blocking: native has finished writing the adjacent .vbs, read it directly.
	let script: string | null = null
	if (fs.existsSync(outPath)) {
		try {
			script = fs.readFileSync(outPath, 'utf-8')
		} catch {}
	}
	return { script, outPath, stdout, stderr, status }
}

async function runNativeAudit(
	binPath: string,
	binDir: string,
	vpxPath: string,
): Promise<{ stdout: string; stderr: string; status: number | null }> {
	return spawnNative(binPath, binDir, '-Audit', vpxPath)
}

export function firstDiffIndex(a: string, b: string): number {
	const minLen = Math.min(a.length, b.length)
	for (let charIndex = 0; charIndex < minLen; charIndex++) {
		if (a[charIndex] !== b[charIndex]) return charIndex
	}
	return a.length === b.length ? -1 : minLen
}

function diffContext(value: string, diffIdx: number, contextLen = 120): string {
	return value.slice(Math.max(0, diffIdx - contextLen), diffIdx + contextLen).replace(/\n/g, '\\n')
}

/**
 * Golden AST snapshot: the transpiled JS per fixture is pinned under
 * test/harness/__snapshots__/vpinball-compat/. A drift fails the gate, and a
 * missing golden fails too — only --update-snapshots blesses a baseline, so
 * a first run can never silently auto-pass.
 */
function checkAstSnapshot(
	snapshotDir: string,
	fixtureName: string,
	js: string,
	update: boolean,
): { ok: boolean; detail: string } {
	const goldenPath = path.join(snapshotDir, `${fixtureName}.transpiled.js`)
	if (update) {
		fs.mkdirSync(snapshotDir, { recursive: true })
		fs.writeFileSync(goldenPath, js, 'utf-8')
		return { ok: true, detail: 'AST snapshot updated' }
	}
	if (!fs.existsSync(goldenPath)) {
		return { ok: false, detail: `no AST golden for ${fixtureName} — re-run with --update-snapshots to bless one` }
	}
	const golden = fs.readFileSync(goldenPath, 'utf-8')
	if (golden === js) return { ok: true, detail: 'AST snapshot match' }
	const diffIdx = firstDiffIndex(golden, js)
	return {
		ok: false,
		detail:
			`AST snapshot drift at ${diffIdx} (golden ${golden.length} vs ${js.length}):\n` +
			`    golden: …${diffContext(golden, diffIdx)}…\n` +
			`    actual: …${diffContext(js, diffIdx)}…`,
	}
}

/** C0 control bytes other than tab/CR/LF: binary junk, not transpileable VBS. */
const NON_TEXT_BYTES = /[\x00-\x08\x0B\x0C\x0E-\x1F]/

/** Guards against blessing a vacuous (empty/trivial) constructs golden. */
const VBS_CONSTRUCTS_MIN_JS = 500
const VBS_CONSTRUCTS_MARKERS = [
	'function AddScore',
	'function DoubleIt',
	'TestLoop',
	'TestLogic',
	'TestWith',
	'twd_160h',
]

/**
 * Real-construct AST leg: fixture table scripts are `Option Explicit` one-liners
 * (or loader junk), so this pins the transpiler against a dedicated VBS fixture
 * covering subs, functions, branches, loops, Select Case, arrays, concat and
 * bitwise/logical operators. The golden lives next to the per-fixture goldens.
 */
async function checkVbsConstructs(repoRoot: string, update: boolean): Promise<boolean> {
	console.log('\n# [constructs] vbs-constructs.vbs')
	const snapshotDir = path.join(repoRoot, 'test/harness/__snapshots__/vpinball-compat')
	const srcPath = path.join(snapshotDir, 'vbs-constructs.vbs')
	if (!fs.existsSync(srcPath)) {
		console.log(
			'  not ok — constructs fixture missing (expected test/harness/__snapshots__/vpinball-compat/vbs-constructs.vbs)',
		)
		return false
	}
	try {
		const { Grammar } = await import('../../lib/scripting/grammar/grammar.js')
		const { normalizeNewCall } = await import('../../lib/scripting/transpiler.js')
		const grammar = new Grammar()
		const js = grammar.vbsToJs(normalizeNewCall(fs.readFileSync(srcPath, 'utf-8')))
		if (typeof js !== 'string' || js.length < VBS_CONSTRUCTS_MIN_JS) {
			console.log(
				`  not ok — constructs transpiled to ${typeof js === 'string' ? js.length : 'non-string'} chars (need >${VBS_CONSTRUCTS_MIN_JS})`,
			)
			return false
		}
		const missing = VBS_CONSTRUCTS_MARKERS.filter(marker => !js.includes(marker))
		if (missing.length > 0) {
			console.log(`  not ok — constructs markers missing from transpiled JS: ${missing.join(', ')}`)
			return false
		}
		try {
			new vm.Script(js)
		} catch (v8Err: unknown) {
			console.log(`  not ok — constructs JS failed V8 syntax validation: ${(v8Err as Error).message}`)
			return false
		}
		console.log(`  ✓ vbs-constructs transpile & V8 syntax OK (${(js.length / 1024).toFixed(1)} KB JS)`)
		const snapshot = checkAstSnapshot(snapshotDir, 'vbs-constructs.vbs', js, update)
		if (snapshot.ok) {
			console.log(`  ✓ ${snapshot.detail}`)
			return true
		}
		console.log(`  not ok — ${snapshot.detail}`)
		return false
	} catch (err: unknown) {
		console.log(`  not ok — vbsToJs failed on constructs fixture: ${(err as Error).message?.slice(0, 500)}`)
		return false
	}
}

export async function verifyVpinballCompat(
	opts: { vpx?: string | null; all?: boolean; auditOnly?: boolean; updateSnapshots?: boolean } = {},
): Promise<boolean> {
	const disc = discoverVpinball()
	const hasNative = Boolean(disc.binPath && disc.binDir)

	if (!hasNative && !opts.auditOnly) {
		tapSkip(1, 'vpinball-compat', 'native vpinball not found (run npm run vpinball:setup)')
		return true
	}

	// --audit-only is real: vpx-js-only pipeline (extract, audit, transpile,
	// snapshot) even when a native binary is present — no native steps run.
	const doNative = hasNative && !opts.auditOnly
	if (doNative) {
		tapComment(`vpinball-compat — native ${disc.binPath} (${disc.source})`)
	} else {
		tapComment('vpinball-compat — running in vpx-js standalone table structure & physics audit mode')
	}

	const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
	let fixtures: string[] = []
	if (opts.vpx) {
		const targetVpx = resolveVpxPath(opts.vpx)
		if (!targetVpx || !fs.existsSync(targetVpx)) {
			tapNotOk(1, 'vpinball-compat', `— VPX not found: ${opts.vpx}`)
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
			tapNotOk(1, 'vpinball-compat', '— no fixtures found')
			return false
		}
	}

	const binPath = disc.binPath ?? ''
	const binDir = disc.binDir ?? path.dirname(binPath)
	tapComment(`checking ${fixtures.length} fixture(s)`)
	const constructsOk = await checkVbsConstructs(repoRoot, opts.updateSnapshots === true)
	let pass = 0
	let fail = 0

	for (const [fixtureIndex, vpxPath] of fixtures.entries()) {
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

			// If native binary is present (and not --audit-only), perform full dual parity verification
			if (doNative) {
				// 2. Native script extraction
				nativeOutPath = vpxPath.replace(/\.vpx$/i, '.vbs')
				hadBefore = fs.existsSync(nativeOutPath)
				const nativeRes = await extractViaNative(binPath, binDir, vpxPath)
				nativeOutPath = nativeRes.outPath
				nativeScript = nativeRes.script
				if (nativeRes.status !== 0) {
					// Native must exit 0 before any "agree": never compare against a
					// possibly stale sidecar .vbs from a failed extraction.
					console.log(`  not ok — native -ExtractVBS exited ${nativeRes.status} (need status 0)`)
					if (nativeRes.stdout) console.log(`  stdout: ${nativeRes.stdout.slice(0, 800)}`)
					if (nativeRes.stderr) console.log(`  stderr: ${nativeRes.stderr.slice(0, 800)}`)
					fail++
					continue
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
						const diffIdx = firstDiffIndex(normNative, normJs)
						if (diffIdx !== -1) {
							console.log(`  first diff at ${diffIdx}:`)
							console.log(`    native: …${diffContext(normNative, diffIdx)}…`)
							console.log(`    vpx-js: …${diffContext(normJs, diffIdx)}…`)
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

			// 5. AST transpilation (+ golden snapshot)
			const scriptToTranspile = doNative ? (nativeScript ?? jsScript) : jsScript
			if (NON_TEXT_BYTES.test(scriptToTranspile)) {
				// Binary junk (e.g. BIFF trailer bytes) is not VBS: nothing to
				// transpile. Dual mode still judges extraction via byte parity above.
				console.log('  ✓ script: (non-text bytes — probable loader artifact, AST transpile skipped)')
			} else if (scriptToTranspile.trim().length > 0) {
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
					const snapshot = checkAstSnapshot(
						path.join(repoRoot, 'test/harness/__snapshots__/vpinball-compat'),
						name,
						js,
						opts.updateSnapshots === true,
					)
					if (snapshot.ok) {
						console.log(`  ✓ ${snapshot.detail}`)
					} else {
						console.log(`  not ok — ${snapshot.detail}`)
						fail++
						continue
					}
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
			// Always remove the sidecar .vbs this run created; never delete a pre-existing file.
			try {
				if (!hadBefore && nativeOutPath && fs.existsSync(nativeOutPath)) fs.rmSync(nativeOutPath)
			} catch {}
		}
	}

	console.log('')
	tapComment(
		`vpinball-compat: pass ${pass}/${fixtures.length}, fail ${fail}/${fixtures.length}, constructs ${constructsOk ? 'pass' : 'fail'}`,
	)
	if (fail === 0 && constructsOk) {
		tapOk(1, `vpinball-compat (${pass}/${fixtures.length} fixtures + vbs-constructs)`)
		return true
	}
	tapNotOk(1, `vpinball-compat (${fail} failures${constructsOk ? '' : ' + vbs-constructs'})`)
	return false
}
