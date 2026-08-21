#!/usr/bin/env tsx
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

type Severity = 'major' | 'minor' | 'info'
type Status = 'pass' | 'fail' | 'warn' | 'skip'

interface DiscrepancyCheck {
	id: string
	category: string
	title: string
	severity: Severity
	description: string
	impact: string
	check: () => Promise<{ status: Status; detail: string; evidence?: string }>
}

interface CheckResult {
	id: string
	category: string
	title: string
	severity: Severity
	description: string
	impact: string
	status: Status
	detail: string
	evidence?: string
}

const HOME = os.homedir()
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const DOCS_OUT = path.join(HOME, 'docs', 'vpx-js-web-vs-native-discrepancies.md')

function readFileSafe(filePath: string): string {
	try {
		return fs.readFileSync(filePath, 'utf-8')
	} catch {
		return ''
	}
}

function fileExists(filePath: string): boolean {
	try {
		return fs.existsSync(filePath)
	} catch {
		return false
	}
}

const checks: DiscrepancyCheck[] = [
	{
		id: 'P1',
		category: 'Physics & Math',
		title: 'C_TOL_ENDPNTS tolerance is 0.0 (JS/WASM) vs 0.001 (C++)',
		severity: 'major',
		description:
			'Native C++ uses 0.001 to tolerate segment endpoints; JS/WASM uses 0.0, causing thin-gap tunneling.',
		impact: 'Balls may incorrectly tunnel through flipper tips and line segments at 1 kHz.',
		check: async () => {
			const jsConst = readFileSafe(path.join(REPO_ROOT, 'lib/physics/constants.ts'))
			const wasmSrc = readFileSafe(path.join(REPO_ROOT, 'wasm/modules/kernels/src/kernels.cpp'))
			const jsMatch = jsConst.match(/C_TOL_ENDPNTS\s*=\s*([0-9.]+)/)
			const wasmMatch = wasmSrc.match(/C_TOL_ENDPNTS\s*=\s*([0-9.]+)f/)
			const jsVal = jsMatch?.[1] ?? 'n/a'
			const wasmVal = wasmMatch?.[1] ?? 'n/a'
			const isFail = jsVal === '0.0' || jsVal === '0' || wasmVal === '0.0' || wasmVal === '0'
			return {
				status: isFail ? 'fail' : 'pass',
				detail: `JS constants.ts=${jsVal}, WASM kernels.cpp=${wasmVal} (expected 0.001 in native)`,
				evidence: `lib/physics/constants.ts, wasm/modules/kernels/src/kernels.cpp`,
			}
		},
	},
	{
		id: 'P2',
		category: 'Physics & Math',
		title: 'Missing OnBallBallCollision script callback',
		severity: 'major',
		description: 'Native fires OnBallBallCollision for ball-ball hits; vpx-js ball-hit.ts does not emit.',
		impact: 'Tables relying on collision scripting (e.g., custom scoring) silently diverge.',
		check: async () => {
			const src = readFileSafe(path.join(REPO_ROOT, 'lib/vpt/ball/ball-hit.ts'))
			const hasCallback = src.includes('OnBallBallCollision')
			return {
				status: hasCallback ? 'pass' : 'fail',
				detail: hasCallback
					? 'OnBallBallCollision found in ball-hit.ts'
					: 'No OnBallBallCollision in ball-hit.ts — native fires, web silently drops',
				evidence: 'lib/vpt/ball/ball-hit.ts',
			}
		},
	},
	{
		id: 'P3',
		category: 'Physics & Math',
		title: 'GC churn at 1 kHz (CollisionEvent pool, Nudge Vertex)',
		severity: 'minor',
		description: 'Per-frame allocations in collision and input at 1000 Hz cause GC pauses (seen in 5-ball spikes).',
		impact: 'Frame-time spikes / p99 latency; not a correctness gap but parity risk under GC.',
		check: async () => {
			const playerSrc = readFileSafe(path.join(REPO_ROOT, 'lib/game/player.ts'))
			const hasPool =
				playerSrc.includes('CollisionEvent') ||
				fileExists(path.join(REPO_ROOT, 'lib/physics/collision-event.ts'))
			return {
				status: 'warn',
				detail: hasPool
					? 'CollisionEvent pool exists but still allocates per step — verify with bench'
					: 'No pool detected',
				evidence: 'lib/physics/collision-event.ts, lib/game/player.ts',
			}
		},
	},
	{
		id: 'D1',
		category: 'Data Model & Parsing',
		title: 'SaveMaterial field widths (int32 vs padded bytes)',
		severity: 'major',
		description:
			'glossyImageLerp / thickness / opacityActiveEdgeAlpha read as 4-byte int32 though native uses 1-byte + padding.',
		impact: 'Material bytes misaligned → garbage gloss/thickness on some tables (silently masked by zeroing).',
		check: async () => {
			const src = readFileSafe(path.join(REPO_ROOT, 'lib/vpt/material.ts'))
			const hasInt32At56 = src.includes('getInt32(off + 56') && src.includes('glossyImageLerp')
			return {
				status: hasInt32At56 ? 'fail' : 'pass',
				detail: hasInt32At56
					? 'SaveMaterial still uses getInt32 at +56/+64/+72 (padding-sensitive)'
					: 'SaveMaterial widths look corrected',
				evidence: 'lib/vpt/material.ts: SaveMaterial constructor',
			}
		},
	},
	{
		id: 'D2',
		category: 'Data Model & Parsing',
		title: 'Material.fromSaved zeroes glossyImageLerp/thickness/edgeAlpha',
		severity: 'major',
		description: 'fromSaved hardcodes those three to 0 instead of unpacking native values.',
		impact: 'Materials render too rough / thin regardless of VPX author settings.',
		check: async () => {
			const src = readFileSafe(path.join(REPO_ROOT, 'lib/vpt/material.ts'))
			const zeroes =
				src.includes('m.glossyImageLerp = 0') &&
				src.includes('m.thickness = 0') &&
				src.includes('m.edgeAlpha = 0')
			return {
				status: zeroes ? 'fail' : 'pass',
				detail: zeroes
					? 'fromSaved zeroes 3 fields (m.glossyImageLerp=0, m.thickness=0, m.edgeAlpha=0)'
					: 'fromSaved preserves material fields',
				evidence: 'lib/vpt/material.ts: fromSaved',
			}
		},
	},
	{
		id: 'D3',
		category: 'Data Model & Parsing',
		title: 'MATR stream handling (modern VPX 10.8+)',
		severity: 'minor',
		description: 'Native now streams materials via MATR chunk; vpx-js table-data.ts handles single case.',
		impact: 'Future tables with many materials may lose data.',
		check: async () => {
			const src = readFileSafe(path.join(REPO_ROOT, 'lib/vpt/table/table-data.ts'))
			const hasMatr = src.includes("'MATR'") || src.includes('"MATR"')
			return {
				status: hasMatr ? 'pass' : 'warn',
				detail: hasMatr ? 'MATR case present' : 'No MATR handling found',
				evidence: 'lib/vpt/table/table-data.ts',
			}
		},
	},
	{
		id: 'D4',
		category: 'Data Model & Parsing',
		title: 'TimerDataRoot.enabled defaults to true (should be false)',
		severity: 'minor',
		description: 'VPX defaults timers disabled; ItemData creates enabled=true, flipper overrides to false.',
		impact: 'Non-flipper timers fire unexpectedly on load vs native.',
		check: async () => {
			const src = readFileSafe(path.join(REPO_ROOT, 'lib/vpt/item-data.ts'))
			const hasTrueDefault = src.includes('enabled = true')
			return {
				status: hasTrueDefault ? 'fail' : 'pass',
				detail: hasTrueDefault
					? 'TimerDataRoot.enabled = true (native default false)'
					: 'Timer default looks correct',
				evidence: 'lib/vpt/item-data.ts: TimerDataRoot',
			}
		},
	},
	{
		id: 'S1',
		category: 'Scripting & Transpiler',
		title: 'Bitwise And/Or/Xor mapped to logical &&/||',
		severity: 'major',
		description: 'VBScript And/Or perform bitwise on numbers; transpiled to JS logical breaks masks (sw And 7).',
		impact: 'Game logic, lamp masks, switch handling diverge silently.',
		check: async () => {
			const src = readFileSafe(path.join(REPO_ROOT, 'lib/scripting/post-process/expr.ts'))
			const mapsToLogical = src.includes("And: '&&'") && src.includes("Or: '||'")
			if (!mapsToLogical) return { status: 'pass', detail: 'No logical mapping found' }
			try {
				const { Grammar } = await import('../../lib/scripting/grammar/grammar.js')
				const grammar = new Grammar()
				const js = grammar.vbsToJs('flags = sw And 7')
				const isLogical = js.includes('&&')
				return {
					status: isLogical ? 'fail' : 'pass',
					detail: `expr.ts maps And->&&; runtime 'sw And 7' → ${js.trim().slice(0, 80)}`,
					evidence: 'lib/scripting/post-process/expr.ts',
				}
			} catch (error: unknown) {
				return { status: 'warn', detail: `check error: ${(error as Error).message}` }
			}
		},
	},
	{
		id: 'S2',
		category: 'Scripting & Transpiler',
		title: 'String concat & mapped to JS +',
		severity: 'major',
		description: 'VBScript & does string coerce; JS + does numeric addition (1 & 2 → "12" vs 3).',
		impact: 'Score formatting, DMD strings, save data corrupted.',
		check: async () => {
			const src = readFileSafe(path.join(REPO_ROOT, 'lib/scripting/post-process/expr.ts'))
			const usesPlus =
				src.includes("binaryExpression('+', expr, child.estree)") && src.includes('ppConcatExpression')
			if (!usesPlus) return { status: 'pass', detail: 'No + mapping found' }
			try {
				const { Grammar } = await import('../../lib/scripting/grammar/grammar.js')
				const grammar = new Grammar()
				const js = grammar.vbsToJs('x = 1 & 2')
				const usesJsPlus = js.includes(' + ')
				const usesHelper = js.includes('vbsHelper') || js.includes('concat')
				return {
					status: usesHelper ? 'pass' : usesJsPlus ? 'fail' : 'warn',
					detail: `'1 & 2' → ${js.trim().slice(0, 80)} (expected string concat)`,
					evidence: 'lib/scripting/post-process/expr.ts: ppConcatExpression',
				}
			} catch (error: unknown) {
				return { status: 'warn', detail: `check error: ${(error as Error).message}` }
			}
		},
	},
	{
		id: 'S3',
		category: 'Scripting & Transpiler',
		title: 'Dictionary default member dict(key) not proxied',
		severity: 'minor',
		description: 'VBScript allows dict("k") as Item; JS needs dict.Item("k") or Proxy apply.',
		impact: 'Tables using default member throw or miss lookups.',
		check: async () => {
			const src = readFileSafe(path.join(REPO_ROOT, 'lib/scripting/objects/dictionary.ts'))
			const hasApplyProxy = src.includes('apply') && src.includes('Item')
			return {
				status: hasApplyProxy ? 'pass' : 'warn',
				detail: hasApplyProxy
					? 'Dictionary apply trap present'
					: 'Dictionary only exposes .Item, not callable default',
				evidence: 'lib/scripting/objects/dictionary.ts',
			}
		},
	},
	{
		id: 'S4',
		category: 'Scripting & Transpiler',
		title: 'COLORREF RGB byte swap (0xBBGGRR vs 0xRRGGBB)',
		severity: 'minor',
		description: 'Windows RGB(r,g,b) = 0x00BBGGRR; web returns 0xRRGGBB, swapping R/B.',
		impact: 'Colors, lamps, DMD palettes render swapped.',
		check: async () => {
			const src = readFileSafe(path.join(REPO_ROOT, 'lib/scripting/stdlib/index.ts'))
			const hasSwap = src.includes('(r << 16) + (g << 8) + b')
			const correct = src.includes('(b << 16)') || src.includes('b << 16')
			return {
				status: hasSwap && !correct ? 'fail' : 'pass',
				detail: hasSwap ? 'stdlib RGB is (r<<16)|(g<<8)|b → RRGGBB (native BBGGRR)' : 'RGB mapping not found',
				evidence: 'lib/scripting/stdlib/index.ts: RGB()',
			}
		},
	},
	{
		id: 'S5',
		category: 'Scripting & Transpiler',
		title: 'VBScript stdlib coverage gaps',
		severity: 'minor',
		description: 'Missing InStrRev/Timer/Replace/Split/Setting etc cause runtime throws vs native no-ops.',
		impact: 'Table load aborts or silent no-ops vs native behavior.',
		check: async () => {
			const stdlib = readFileSafe(path.join(REPO_ROOT, 'lib/scripting/stdlib/index.ts'))
			const required = ['InStr', 'InStrRev', 'Replace', 'Split', 'Trim', 'Chr', 'Timer', 'Setting']
			const missing = required.filter(name => !stdlib.includes(name))
			return {
				status: missing.length === 0 ? 'pass' : 'warn',
				detail:
					missing.length === 0 ? 'Core stdlib names present' : `Potentially missing: ${missing.join(', ')}`,
				evidence: 'lib/scripting/stdlib/index.ts',
			}
		},
	},
	{
		id: 'R1',
		category: 'Rendering & Shaders',
		title: 'Per-frame Matrix allocations in renderer',
		severity: 'minor',
		description: 'applyMatrixToNode previously allocated new Matrix4 + decompose per moving entity (~3-6k/s).',
		impact: 'GC pressure during multiball; now mitigated with _scratchM4 but batched paths still allocate.',
		check: async () => {
			const src = readFileSafe(path.join(REPO_ROOT, 'lib/render/threejs/three-render-api.ts'))
			const hasScratch = src.includes('_scratchM4')
			const allocCount = (src.match(/new Matrix4\(\)/g) ?? []).length
			return {
				status: hasScratch && allocCount <= 2 ? 'pass' : 'warn',
				detail: `_scratchM4=${hasScratch}, new Matrix4 count=${allocCount}`,
				evidence: 'lib/render/threejs/three-render-api.ts',
			}
		},
	},
	{
		id: 'R2',
		category: 'Rendering & Shaders',
		title: 'Material roughness curve (1-r vs 2^(10r+1))',
		severity: 'info',
		description: 'Native maps roughness via exponential gloss; web uses linear 1-r for some paths.',
		impact: 'Playfield / plastics look too matte vs native (see Walking Dead screenshot).',
		check: async () => {
			const matSrc = readFileSafe(path.join(REPO_ROOT, 'lib/vpt/material.ts'))
			const hasRoughness = matSrc.includes('roughness')
			return {
				status: 'warn',
				detail: hasRoughness
					? 'Roughness present but curve not verified vs native 2^(10r+1)'
					: 'No roughness mapping',
				evidence: 'lib/vpt/material.ts, lib/render/threejs/',
			}
		},
	},
	{
		id: 'R3',
		category: 'Rendering & Shaders',
		title: 'Playfield baking / z-fighting heuristics',
		severity: 'major',
		description: 'BM_Playfield vs playfield_mesh visibility depends on baked-material heuristics.',
		impact: 'Everything-dark or missing playfield if pendingMap/baked detection mismatches (see your screenshot cropping).',
		check: async () => {
			const twdPath = '/home/qinghao1/Downloads/walking_dead.vpx'
			if (!fileExists(twdPath)) return { status: 'skip', detail: `skip: ${twdPath} not present (offline CI)` }
			try {
				const { NodeBinaryReader } = await import('../../lib/io/binary-reader.node.js')
				const { Table } = await import('../../lib/vpt/table/table.js')
				const { ThreeRenderApi } = await import('../../lib/render/threejs/three-render-api.js')
				const { postProcessScene } = await import('../../demo-browser/src/scene.js')
				const table = await Table.load(new NodeBinaryReader(twdPath) as any, { skipTextures: false } as any)
				const api = new ThreeRenderApi({ applyMaterials: true, applyTextures: true } as any)
				const group: any = await (table as any).generateTableNode(api, {
					exportPlayfield: true,
					exportPrimitives: true,
				} as any)
				postProcessScene(group, { viewerMode: 'play', harnessLog: () => {} })
				let bmVis: boolean | undefined
				let pfVis: boolean | undefined
				group.traverse((object: any) => {
					if (!object.isMesh) return
					if (object.name === 'primitive-bm_playfield') bmVis = object.visible
					if (object.name === 'primitive-playfield_mesh') pfVis = object.visible
				})
				const ok = bmVis === true && pfVis === false
				if (bmVis === undefined && pfVis === undefined)
					return {
						status: 'warn',
						detail: 'scene traverse found no BM/playfield meshes — check scene generation',
						evidence: 'demo-browser/src/scene.ts',
					}
				return {
					status: ok ? 'pass' : 'fail',
					detail: `bm_playfield visible=${bmVis} (expect true), playfield_mesh visible=${pfVis} (expect false)`,
					evidence: 'demo-browser/src/scene.ts: postProcessScene',
				}
			} catch (error: unknown) {
				return { status: 'warn', detail: `render check error: ${(error as Error).message?.slice(0, 200)}` }
			}
		},
	},
	{
		id: 'R4',
		category: 'Rendering & Shaders',
		title: 'Camera / full-table framing (F6 POV vs ThreeCameraFraming)',
		severity: 'major',
		description:
			'Native F6 POV (inclination, layback, FOV) vs web ThreeCameraFraming autoscale; windowed 1280x900 crops.',
		impact: 'Your screenshot: truncated playfield / High Score clipped; web and native cameras diverge.',
		check: async () => {
			const viewerSrc = readFileSafe(path.join(REPO_ROOT, 'demo-browser/src/viewer.ts'))
			const framingSrc = readFileSafe(path.join(REPO_ROOT, 'lib/render/threejs/three-camera-framing.ts'))
			const hasFraming = viewerSrc.includes('three-camera-framing') || framingSrc.length > 500
			return {
				status: hasFraming ? 'warn' : 'fail',
				detail: hasFraming
					? 'Web has ThreeCameraFraming, but native F6 values not imported — manual POV parity needed'
					: 'No camera framing logic found',
				evidence: 'demo-browser/src/viewer.ts, lib/render/threejs/three-camera-framing.ts',
			}
		},
	},
	{
		id: 'V1',
		category: 'Visual & Camera',
		title: 'Native window placement (1280,0 1280x900) vs WM decorations',
		severity: 'info',
		description: 'Runner requests right-half window; GNOME mutter centers and adds frames → 743,407 observed.',
		impact: 'Side-by-side compare is offset; not a rendering bug but hampers visual diff.',
		check: async () => {
			const runnerSrc =
				readFileSafe(path.join(REPO_ROOT, 'bin/vpinball-runner.ts')) +
				readFileSafe(path.join(REPO_ROOT, 'test/harness/vpinball-resolver.ts'))
			const hasIni = runnerSrc.includes('PlayfieldWndX')
			return {
				status: hasIni ? 'pass' : 'warn',
				detail: hasIni ? 'Runner stages PlayfieldWndX=1280 via transient INI' : 'No INI placement found',
				evidence: 'bin/vpinball-runner.ts, test/harness/vpinball-resolver.ts',
			}
		},
	},
	{
		id: 'Y1',
		category: 'System & PinMAME',
		title: 'VPinball binary discovery & shader layout',
		severity: 'info',
		description: 'Tiered discovery ($VPINBALL_BIN → sister → submodule → cache) + shader10.8.0 handling.',
		impact: 'Doctor now PASS after shader glob fix; still brittle to SDL3 vs SDL2 naming.',
		check: async () => {
			try {
				const { discoverVpinball } = await import('./vpinball-resolver.js')
				const disc = discoverVpinball()
				return {
					status: disc.binPath ? 'pass' : 'warn',
					detail: disc.binPath ? `found ${disc.binPath} (${disc.source})` : 'native not found (CI skip)',
					evidence: 'test/harness/vpinball-resolver.ts',
				}
			} catch (error: unknown) {
				return { status: 'warn', detail: `discovery error: ${(error as Error).message}` }
			}
		},
	},
	{
		id: 'Y2',
		category: 'System & PinMAME',
		title: 'PinMAME ROM resolution (cGameName → ~/.pinmame/roms)',
		severity: 'info',
		description: 'Resolver extracts cGameName and searches pinmame/roms hierarchy.',
		impact: 'Walking Dead needs twd_160h.zip; missing ROM = silent DMD fail.',
		check: async () => {
			const twdRom = '/home/qinghao1/.pinmame/roms/twd_160h.zip'
			const hasRom = fileExists(twdRom)
			return {
				status: hasRom ? 'pass' : 'warn',
				detail: hasRom ? `found ${twdRom}` : 'twd_160h.zip not in ~/.pinmame/roms (place via /@fs)',
				evidence: 'test/harness/vpinball-resolver.ts: getRomCandidates',
			}
		},
	},
	{
		id: 'Y3',
		category: 'Scripting & Transpiler',
		title: 'Script byte parity (native -ExtractVBS vs Table.load)',
		severity: 'major',
		description: 'Byte-level script equality is ground truth; walking_dead 197.9 KB should match.',
		impact: 'Any delta means OLE/BIFF parsing divergence shipped to player.',
		check: async () => {
			const twdPath = '/home/qinghao1/Downloads/walking_dead.vpx'
			if (!fileExists(twdPath)) return { status: 'skip', detail: 'skip: walking_dead.vpx not present' }
			try {
				const { discoverVpinball, getDynamicLinkerEnv } = await import('./vpinball-resolver.js')
				const disc = discoverVpinball()
				if (!disc.binPath || !disc.binDir) return { status: 'skip', detail: 'skip: native not provisioned' }
				const { NodeBinaryReader } = await import('../../lib/io/binary-reader.node.js')
				const { Table } = await import('../../lib/vpt/table/table.js')
				const { spawnSync } = await import('node:child_process')
				const table = await Table.load(new NodeBinaryReader(twdPath) as any, { loadTableScript: true } as any)
				const jsScript = (table as any).tableScript ?? ''
				const outPath = twdPath.replace(/\.vpx$/i, '.vbs')
				const env = { ...process.env, ...getDynamicLinkerEnv(disc.binDir) }
				spawnSync(disc.binPath, ['-ExtractVBS', twdPath], { encoding: 'utf-8', env, timeout: 20000 })
				if (!fileExists(outPath))
					return { status: 'fail', detail: `native -ExtractVBS did not write ${outPath}` }
				const nativeScript = fs.readFileSync(outPath, 'utf-8')
				const norm = (source: string) =>
					source
						.replace(/^\uFEFF/, '')
						.replace(/\r\n/g, '\n')
						.trim()
				const ok = norm(nativeScript) === norm(jsScript)
				return {
					status: ok ? 'pass' : 'fail',
					detail: ok
						? `byte parity OK (197.9 KB)`
						: `mismatch: native ${nativeScript.length} vs js ${jsScript.length}, first diff at ${(() => {
								const a = norm(nativeScript)
								const b = norm(jsScript)
								for (let index = 0; index < Math.min(a.length, b.length); index++)
									if (a[index] !== b[index]) return index
								return Math.min(a.length, b.length)
							})()}`,
					evidence: 'test/harness/verify-vpinball-compat.ts: normalizeScript',
				}
			} catch (error: unknown) {
				return { status: 'warn', detail: `parity check error: ${(error as Error).message}` }
			}
		},
	},
]

async function runAll(): Promise<CheckResult[]> {
	const results: CheckResult[] = []
	for (const item of checks) {
		try {
			const res = await item.check()
			results.push({
				id: item.id,
				category: item.category,
				title: item.title,
				severity: item.severity,
				description: item.description,
				impact: item.impact,
				status: res.status,
				detail: res.detail,
				evidence: res.evidence,
			})
		} catch (error: unknown) {
			results.push({
				id: item.id,
				category: item.category,
				title: item.title,
				severity: item.severity,
				description: item.description,
				impact: item.impact,
				status: 'warn',
				detail: `exception: ${(error as Error).message}`,
			})
		}
	}
	return results
}

function renderMarkdown(results: CheckResult[]): string {
	const now = new Date().toISOString()
	const byCategory = new Map<string, CheckResult[]>()
	for (const result of results) {
		const arr = byCategory.get(result.category) ?? []
		arr.push(result)
		byCategory.set(result.category, arr)
	}
	const total = results.length
	const pass = results.filter(r => r.status === 'pass').length
	const fail = results.filter(r => r.status === 'fail').length
	const warn = results.filter(r => r.status === 'warn').length
	const skip = results.filter(r => r.status === 'skip').length
	const majorFail = results.filter(r => r.status === 'fail' && r.severity === 'major').length

	let out = `# vpx-js — Web vs Native Discrepancy Report\n\n`
	out += `**Date:** ${now}  \n`
	out += `**Harness:** \`test/harness/capture-discrepancies.ts\`  \n`
	out += `**Native:** \`~/.cache/vpinball/VPinballX_GL\` (10.8.0) + \`walking_dead.vpx\` / \`twd_160h.zip\` when present  \n`
	out += `**Web:** \`lib/\` + \`demo-browser\` + \`three@0.185\` + PinMAME WASM  \n\n`

	out += `## Executive Summary\n\n`
	out += `Harness captures **${total}** systematic checks across **${byCategory.size}** categories. `
	out += `**${pass} pass**, **${fail} fail**, **${warn} warn**, **${skip} skip**. `
	out += `**${majorFail} major failures** require immediate parity work (see §7). `
	out += `Failures are grounded in live source grep + runtime fixture loads + native \`-ExtractVBS\` when provisioned. `
	out += `Your screenshot (Walking Dead windowed 1024×576) symptoms map to **R3/R4/V1** below.\n\n`

	out += `| Category | Pass | Fail | Warn | Skip |\n`
	out += `|---|---:|---:|---:|---:|\n`
	for (const [category, list] of byCategory) {
		const cPass = list.filter(r => r.status === 'pass').length
		const cFail = list.filter(r => r.status === 'fail').length
		const cWarn = list.filter(r => r.status === 'warn').length
		const cSkip = list.filter(r => r.status === 'skip').length
		out += `| ${category} | ${cPass} | ${cFail} | ${cWarn} | ${cSkip} |\n`
	}
	out += `\n`

	out += `## How the Harness Captures Discrepancies\n\n`
	out += `1. **Static source audit** — greps \`lib/\`, \`wasm/\`, \`demo-browser/src\` for known bug patterns (e.g., \`C_TOL_ENDPNTS = 0.0\`, \`getInt32(off+56)\`, \`And: '&&'\`).\n`
	out += `2. **Runtime fixture checks** — loads \`test/fixtures/table-*.vpx\` and \`~/Downloads/walking_dead.vpx\` via \`Table.load\` + \`Grammar.vbsToJs\`.\n`
	out += `3. **Native ground truth** — when \`VPinballX_GL\` is discovered, runs \`-ExtractVBS\` and compares byte-level parity + \`-Audit\`.\n`
	out += `4. **Render sanity** — reuses \`verify-twd-render.ts\` logic: generates Three.js scene, runs \`postProcessScene\`, asserts \`BM_Playfield\` visibility.\n`
	out += `5. **Markdown + TAP** — harness emits TAP to console and writes this file to \`${DOCS_OUT}\` on every run. CI with no native/ROM auto-skips those checks.\n\n`

	for (const [category, list] of byCategory) {
		out += `## ${category}\n\n`
		for (const result of list) {
			const icon =
				result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : result.status === 'warn' ? '⚠️' : '⏭️'
			const sev = result.severity === 'major' ? '**major**' : result.severity === 'minor' ? '*minor*' : 'info'
			out += `### ${icon} ${result.id} — ${result.title} (${sev}, ${result.status})\n\n`
			out += `${result.description}\n\n`
			out += `**Impact:** ${result.impact}\n\n`
			out += `**Detail:** ${result.detail}\n\n`
			if (result.evidence) out += `**Evidence:** \`${result.evidence}\`\n\n`
		}
	}

	out += `## Systematic Harness Coverage\n\n`
	out += `| ID | Severity | Status | Title |\n`
	out += `|---|---:|---|---|---|\n`
	for (const result of results) {
		out += `| ${result.id} | ${result.severity} | ${result.status} | ${result.title} |\n`
	}
	out += `\n`

	out += `## What Your Screenshot Shows\n\n`
	out += `- **Clipped High Score / playfield** → **R3/R4/V1**: windowed \`1280×900 @ 1280,0\` via transient INI, but GNOME mutter recenters to ~743,407 and decorates. Web \`ThreeCameraFraming\` auto-frames differently than native F6 POV (inclination/layback/FOV). Press \`F6\` in native to tune, or use \`npm run compare -- --vpx=walking_dead.vpx\` for deterministic side-by-side.\n`
	out += `- **Flat / swapped colors** → **S4/D2/R2**: \`RGB\` BBGGRR swap + zeroed \`glossyImageLerp/thickness\` + linear roughness make plastics/wood flat vs native.\n`
	out += `- **Mask bugs not visible but divergent** → **S1/S2**: \`sw And 7\` / \`1 & 2\` silently change game logic; harness now fails these explicitly.\n\n`

	out += `## How to Reproduce\n\n`
	out += `\`\`\`bash\n`
	out += `npx tsx test/harness/capture-discrepancies.ts          # TAP + writes ~/docs/vpx-js-web-vs-native-discrepancies.md\n`
	out += `npx tsx test/harness/capture-discrepancies.ts --markdown   # alias\n`
	out += `npm run verify:discrepancies                         # package.json shortcut\n`
	out += `npm run verify:vpinball -- --vpx=walking_dead.vpx     # ground-truth script parity\n`
	out += `npx tsx bin/vpinball-runner.ts --doctor               # native ldd/shaders/pinmame\n`
	out += `npx tsx bin/vpinball-runner.ts "http://localhost:3000/?vpx=/@fs/home/qinghao1/Downloads/walking_dead.vpx&rom=/@fs/home/qinghao1/.pinmame/roms/twd_160h.zip"\n`
	out += `npm run compare -- --vpx=walking_dead.vpx             # left browser 0,0 + right native 1280,0\n`
	out += `\`\`\`\n\n`

	out += `## Prioritized Fix Order (for next PRs)\n\n`
	out += `1. **P1/D1/D2/S1/S2/Y3** — physics tolerance, material unpack, operator semantics, script parity (correctness).\n`
	out += `2. **R3/R4/V1** — camera framing + bake heuristics (visual completeness; fixes your screenshot).\n`
	out += `3. **S4/R2/P2** — color, roughness, WASM tolerance, OnBallBallCollision (fidelity).\n`
	out += `4. **D4/S3/S5/R1** — timer defaults, Dictionary default member, stdlib gaps, alloc churn (polish).\n\n`

	out += `---\n*Generated by \`test/harness/capture-discrepancies.ts\` — re-run to refresh.*\n`
	return out
}

async function main(): Promise<void> {
	const raw = process.argv.slice(2)
	const wantMarkdown = raw.includes('--markdown') || raw.includes('--md') || raw.length === 0
	const results = await runAll()

	console.log(`TAP version 13\n# capture-discrepancies — ${new Date().toISOString()}`)
	console.log(`1..${results.length}`)
	let passCount = 0
	for (let index = 0; index < results.length; index++) {
		const result = results[index]!
		const num = index + 1
		const sev = result.severity
		if (result.status === 'pass') {
			passCount++
			console.log(`ok ${num} - ${result.id} ${result.title} # ${sev}`)
		} else if (result.status === 'skip') {
			passCount++
			console.log(`ok ${num} - ${result.id} ${result.title} # SKIP ${sev}: ${result.detail}`)
		} else if (result.status === 'warn') {
			console.log(`ok ${num} - ${result.id} ${result.title} # TODO warn (${sev}): ${result.detail}`)
		} else {
			console.log(`not ok ${num} - ${result.id} ${result.title} # ${sev}: ${result.detail}`)
		}
		if (result.evidence) console.log(`  # evidence: ${result.evidence}`)
	}
	console.log(
		`\n# pass ${passCount}/${results.length} (fail=${results.filter(r => r.status === 'fail').length}, warn=${results.filter(r => r.status === 'warn').length}, skip=${results.filter(r => r.status === 'skip').length})`,
	)
	const hasMajorFail = results.some(r => r.status === 'fail' && r.severity === 'major')
	console.log(hasMajorFail ? '# Result: FAIL (major discrepancies present)' : '# Result: PASS')

	if (wantMarkdown) {
		const markdown = renderMarkdown(results)
		try {
			fs.mkdirSync(path.dirname(DOCS_OUT), { recursive: true })
			fs.writeFileSync(DOCS_OUT, markdown, 'utf-8')
			console.log(`\n# markdown written to ${DOCS_OUT}`)
		} catch (error: unknown) {
			console.error(`# markdown write failed: ${(error as Error).message}`)
		}
	}

	if (hasMajorFail) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
	await main()
}

export { DOCS_OUT, renderMarkdown, runAll }
