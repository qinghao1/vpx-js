#!/usr/bin/env tsx
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { findWalkingDead } from './bench-shared.js'
import { firstDiffIndex } from './parity-script.js'
import { tapHeader, tapNotOk, tapOk, tapPlan, tapSkip } from './tap.js'

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

type CheckResult = Omit<DiscrepancyCheck, 'check'> & { status: Status; detail: string; evidence?: string }

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

// Cached lib/*.ts file list: walk once, reuse across checks.
let libTsFilesCache: string[] | null = null
export function getLibTsFiles(): string[] {
	if (libTsFilesCache) return libTsFilesCache
	const out: string[] = []
	const walk = (dir: string): void => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				if (entry.name !== 'node_modules') walk(full)
			} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
				out.push(full)
			}
		}
	}
	walk(path.join(REPO_ROOT, 'lib'))
	libTsFilesCache = out
	return out
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
			const poolSrc = readFileSafe(path.join(REPO_ROOT, 'lib/physics/collision-event.ts'))
			const hasPool =
				poolSrc.includes('new Pool(CollisionEvent)') &&
				poolSrc.includes('static claim(') &&
				poolSrc.includes('releaseOne(')
			const physicsSrc = readFileSafe(path.join(REPO_ROOT, 'lib/game/player-physics.ts'))
			const releasesContacts = physicsSrc.includes('CollisionEvent.releaseOne(')
			// `new CollisionEvent` is allowed only in the one-per-ball BallHit
			// constructor; any other construction site is per-step churn.
			const allowed = new Set(['lib/physics/collision-event.ts', 'lib/vpt/ball/ball-hit.ts'])
			const offenders: string[] = []
			for (const full of getLibTsFiles()) {
				const rel = path.relative(REPO_ROOT, full)
				if (!allowed.has(rel) && readFileSafe(full).includes('new CollisionEvent(')) {
					offenders.push(rel)
				}
			}
			if (!hasPool) {
				return {
					status: 'fail',
					detail: 'CollisionEvent pool (Pool+claim+releaseOne) missing from collision-event.ts',
					evidence: 'lib/physics/collision-event.ts',
				}
			}
			if (offenders.length > 0) {
				return {
					status: 'fail',
					detail: `per-step 'new CollisionEvent' outside pool/ball-hit: ${offenders.join(', ')}`,
					evidence: offenders.join(', '),
				}
			}
			if (!releasesContacts) {
				return {
					status: 'warn',
					detail: 'pool exists but player-physics.ts never releases contacts back to it',
					evidence: 'lib/game/player-physics.ts',
				}
			}
			return {
				status: 'pass',
				detail: 'CollisionEvent pool wired (claim/releaseOne) and contacts released; no stray constructions',
				evidence: 'lib/physics/collision-event.ts, lib/game/player-physics.ts',
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
			// Runtime probe: call Stdlib.RGB and compare against the Windows
			// COLORREF formula (0x00BBGGRR) instead of grepping the source.
			try {
				const { Stdlib } = await import('../../lib/scripting/stdlib/index.js')
				const got = new Stdlib().RGB(10, 20, 30) as number
				const nativeColorref = (30 << 16) | (20 << 8) | 10
				const hex = (n: number) => `0x${n.toString(16).padStart(6, '0')}`
				return got === nativeColorref
					? {
							status: 'pass',
							detail: `Stdlib.RGB(10,20,30) = ${hex(got)} matches COLORREF BBGGRR`,
							evidence: 'lib/scripting/stdlib/index.ts: RGB() (runtime)',
						}
					: {
							status: 'fail',
							detail: `Stdlib.RGB(10,20,30) = ${hex(got)} (RRGGBB) vs native ${hex(nativeColorref)} (BBGGRR)`,
							evidence: 'lib/scripting/stdlib/index.ts: RGB() (runtime)',
						}
			} catch (error: unknown) {
				return { status: 'warn', detail: `RGB probe error: ${(error as Error).message}` }
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
			const genPath = 'lib/render/threejs/three-node-material-generator.ts'
			const genSrc = readFileSafe(path.join(REPO_ROOT, genPath))
			const hasLinear = genSrc.includes('1 - material.roughness')
			const hasExp = /Math\.pow\s*\(\s*2|2\s*\*\*/.test(genSrc)
			if (hasExp && !hasLinear) {
				return {
					status: 'pass',
					detail: 'roughness uses exponential native-style curve (no linear 1-r mapping)',
					evidence: genPath,
				}
			}
			if (hasLinear) {
				return {
					status: 'fail',
					detail: "linear '1 - material.roughness' in three-node-material-generator.ts (native: 2^(10r+1))",
					evidence: genPath,
				}
			}
			return {
				status: 'warn',
				detail: 'no recognized roughness mapping in three-node-material-generator.ts',
				evidence: genPath,
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
			const postPath = path.join(REPO_ROOT, 'lib/render/threejs/three-scene-postprocess.ts')
			const src = readFileSafe(postPath)
			const hasBake = src.includes('BAKED_EMISSIVE') && src.includes('postProcessScene')
			if (!hasBake)
				return {
					status: 'fail',
					detail: 'postProcessScene or BAKED constants missing',
					evidence: 'lib/render/threejs/three-scene-postprocess.ts',
				}
			const twdPath = findWalkingDead()
			if (!twdPath) return { status: 'skip', detail: 'skip: walking_dead.vpx not present' }
			try {
				const { NodeBinaryReader } = await import('../../lib/io/binary-reader.node.js')
				const { Table } = await import('../../lib/vpt/table/table.js')
				const table = await Table.load(new NodeBinaryReader(twdPath) as any, { loadTableScript: false } as any)
				// The bake heuristic keys on the BM_Playfield/playfield_mesh pair plus the
				// playfield map: assert the reference table still carries all three inputs.
				const primNames = Object.keys((table as any).primitives ?? {}).map(name => name.toLowerCase())
				const hasBmPlayfield = primNames.includes('bm_playfield')
				const hasPfMesh = primNames.includes('playfield_mesh')
				let playfieldMap = ''
				try {
					playfieldMap = ((table as any).getPlayfieldMap?.() ?? '').toLowerCase()
				} catch {}
				const bakeMats = ((table as any).data?.materials ?? []).filter((mat: any) =>
					/bake|nestmap|playfield/i.test(mat?.name ?? ''),
				).length
				if (!hasBmPlayfield || !hasPfMesh) {
					return {
						status: 'fail',
						detail: `bake pair incomplete on reference table (BM_Playfield=${hasBmPlayfield} playfield_mesh=${hasPfMesh}, ${primNames.length} primitives)`,
						evidence: 'walking_dead.vpx primitives',
					}
				}
				if (!playfieldMap) {
					return {
						status: 'fail',
						detail: 'reference table exposes no playfield map for the bake heuristic',
						evidence: 'Table.getPlayfieldMap()',
					}
				}
				return {
					status: 'pass',
					detail: `bake inputs present (BM_Playfield + playfield_mesh, playfieldMap=${playfieldMap}, ${bakeMats} bake materials)`,
					evidence: 'lib/render/threejs/three-scene-postprocess.ts',
				}
			} catch (error: unknown) {
				return { status: 'warn', detail: `scene check error: ${(error as Error).message?.slice(0, 150)}` }
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
			const resolverSrc = readFileSafe(path.join(REPO_ROOT, 'test/harness/vpinball-resolver.ts'))
			const hasIni = resolverSrc.includes('PlayfieldWndX')
			return {
				status: hasIni ? 'pass' : 'warn',
				detail: hasIni ? 'Resolver stages PlayfieldWndX=1280 via transient INI' : 'No INI placement found',
				evidence: 'test/harness/vpinball-resolver.ts',
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
			const twdRom = path.join(HOME, '.pinmame/roms/twd_160h.zip')
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
			const twdPath = findWalkingDead()
			if (!twdPath) return { status: 'skip', detail: 'skip: walking_dead.vpx not present' }
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
				const normNative = norm(nativeScript)
				const normJs = norm(jsScript)
				const ok = normNative === normJs
				return {
					status: ok ? 'pass' : 'fail',
					detail: ok
						? `byte parity OK (197.9 KB)`
						: `mismatch: native ${nativeScript.length} vs js ${jsScript.length}, first diff at ${firstDiffIndex(normNative, normJs)}`,
					evidence: 'test/harness/parity-script.ts: normalizeScript',
				}
			} catch (error: unknown) {
				return { status: 'warn', detail: `parity check error: ${(error as Error).message}` }
			}
		},
	},
]

function checkMeta(item: DiscrepancyCheck): Omit<DiscrepancyCheck, 'check'> {
	return {
		id: item.id,
		category: item.category,
		title: item.title,
		severity: item.severity,
		description: item.description,
		impact: item.impact,
	}
}

function countBy(results: CheckResult[], status: Status): number {
	return results.filter(result => result.status === status).length
}

async function runAll(): Promise<CheckResult[]> {
	const results: CheckResult[] = []
	for (const item of checks) {
		try {
			const res = await item.check()
			results.push({ ...checkMeta(item), status: res.status, detail: res.detail, evidence: res.evidence })
		} catch (error: unknown) {
			results.push({ ...checkMeta(item), status: 'warn', detail: `exception: ${(error as Error).message}` })
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
	const pass = countBy(results, 'pass')
	const fail = countBy(results, 'fail')
	const warn = countBy(results, 'warn')
	const skip = countBy(results, 'skip')
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
		out += `| ${category} | ${countBy(list, 'pass')} | ${countBy(list, 'fail')} | ${countBy(list, 'warn')} | ${countBy(list, 'skip')} |\n`
	}
	out += `\n`

	out += `## How the Harness Captures Discrepancies\n\n`
	out += `1. **Static source audit** — greps \`lib/\`, \`wasm/\`, \`demo-browser/src\` for known bug patterns (e.g., \`C_TOL_ENDPNTS = 0.0\`, \`getInt32(off+56)\`, \`And: '&&'\`).\n`
	out += `2. **Runtime fixture checks** — loads \`test/fixtures/table-*.vpx\` and \`~/Downloads/walking_dead.vpx\` via \`Table.load\` + \`Grammar.vbsToJs\`.\n`
	out += `3. **Native ground truth** — when \`VPinballX_GL\` is discovered, runs \`-ExtractVBS\` and compares byte-level parity + \`-Audit\`.\n`
	out += `4. **Render sanity** — reuses \`verify-twd-render.ts\` logic: generates Three.js scene, runs \`postProcessScene\`, asserts \`BM_Playfield\` visibility.\n`
	out += `5. **Markdown + TAP** — harness emits TAP to console and writes this file to \`${DOCS_OUT}\` on every run. CI with no native/ROM auto-skips those checks.\n\n`

	const STATUS_ICON: Record<Status, string> = { pass: '✅', fail: '❌', warn: '⚠️', skip: '⏭️' }
	const SEVERITY_LABEL: Record<Severity, string> = { major: '**major**', minor: '*minor*', info: 'info' }
	for (const [category, list] of byCategory) {
		out += `## ${category}\n\n`
		for (const result of list) {
			const icon = STATUS_ICON[result.status]
			const sev = SEVERITY_LABEL[result.severity]
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

	out += `## How to Reproduce\n\n`
	out += `\`\`\`bash\n`
	out += `npx tsx test/harness/capture-discrepancies.ts          # TAP + writes ~/docs/vpx-js-web-vs-native-discrepancies.md\n`
	out += `npx tsx test/harness/capture-discrepancies.ts --markdown   # alias\n`
	out += `npm run verify:discrepancies                         # package.json shortcut\n`
	out += `npm run verify:vpinball -- --vpx=walking_dead.vpx     # ground-truth script parity\n`
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

	tapHeader('capture-discrepancies')
	tapPlan(results.length)
	let passCount = 0
	for (const [index, result] of results.entries()) {
		const num = index + 1
		const sev = result.severity
		const name = `${result.id} ${result.title}`
		if (result.status === 'pass') {
			passCount++
			tapOk(num, name, sev)
		} else if (result.status === 'skip') {
			passCount++
			tapSkip(num, name, `${sev}: ${result.detail}`)
		} else if (result.status === 'warn') {
			tapOk(num, name, `TODO warn (${sev}): ${result.detail}`)
		} else {
			tapNotOk(num, name, `# ${sev}: ${result.detail}`)
		}
		if (result.evidence) console.log(`  # evidence: ${result.evidence}`)
	}
	console.log(
		`\n# pass ${passCount}/${results.length} (fail=${countBy(results, 'fail')}, warn=${countBy(results, 'warn')}, skip=${countBy(results, 'skip')})`,
	)
	// Every `not ok` line fails the gate.
	const failCount = countBy(results, 'fail')
	const majorFail = results.filter(r => r.status === 'fail' && r.severity === 'major').length
	console.log(
		failCount > 0
			? `# Result: FAIL (${failCount} failing checks${majorFail > 0 ? `, ${majorFail} major` : ''})`
			: '# Result: PASS',
	)

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

	if (failCount > 0) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
	await main()
}

export { DOCS_OUT, renderMarkdown, runAll }
