import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export interface ResolvedVpxSession {
	vpxPath: string
	romPath: string | null
	tableName: string
	gameName: string | null
	browserUrl: string
	nativeArgs: string[]
	iniPath: string
}

const HOME = os.homedir()
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')

function expandTilde(p: string): string {
	if (p === '~') return HOME
	if (p.startsWith('~/')) return path.join(HOME, p.slice(2))
	if (p.startsWith('~')) return p.replace(/^~(?=\/)/, HOME)
	return p
}

function decodeViteFsParam(param: string): string {
	try {
		param = decodeURIComponent(param)
	} catch {}
	if (param.startsWith('/@fs')) param = param.slice(4)
	try {
		param = decodeURIComponent(param)
	} catch {}
	return expandTilde(param)
}

function existsFile(p: string): boolean {
	try {
		return fs.existsSync(p) && fs.statSync(p).isFile()
	} catch {
		return false
	}
}

export function expandFixture(input: string): string | null {
	const raw = input.trim()
	if (!raw) return null
	const candidates: string[] = []
	const hasSlash = raw.includes('/') || raw.includes('\\')
	const hasExt = /\.vp[xt]$/i.test(raw)
	const base = hasExt ? raw.slice(0, -4) : raw
	const stripped = base.replace(/^table-/, '')

	if (hasSlash) {
		const expanded = expandTilde(decodeViteFsParam(raw))
		if (existsFile(expanded)) return path.resolve(expanded)
		const abs = path.isAbsolute(expanded) ? expanded : path.resolve(expanded)
		if (existsFile(abs)) return abs
		// also try as fixture relative
		candidates.push(path.join(REPO_ROOT, 'test/fixtures', path.basename(expanded)))
	} else {
		// short name — try all fixture variants
		candidates.push(
			path.join(REPO_ROOT, 'test/fixtures', raw),
			path.join(REPO_ROOT, 'test/fixtures', `${raw}.vpx`),
			path.join(REPO_ROOT, 'test/fixtures', `table-${raw}.vpx`),
			path.join(REPO_ROOT, 'test/fixtures', `table-${stripped}.vpx`),
		)
		if (hasExt) {
			candidates.push(path.join(REPO_ROOT, 'test/fixtures', path.basename(raw)))
		}
	}
	for (const c of candidates) {
		if (existsFile(c)) return path.resolve(c)
	}
	// If input was already an absolute existing path, return it
	const tildeExpanded = expandTilde(raw)
	if (existsFile(tildeExpanded)) return path.resolve(tildeExpanded)
	return null
}

export function resolveVpxPath(input: string): string | null {
	if (!input) return null
	const trimmed = input.trim()
	if (!trimmed) return null
	if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return null
	let decoded = trimmed
	try {
		decoded = decodeURIComponent(trimmed)
	} catch {}
	// Vite /@fs prefix
	if (decoded.startsWith('/@fs/') || decoded.startsWith('/@fs')) {
		const p = decodeViteFsParam(decoded)
		if (existsFile(p)) return path.resolve(p)
		return path.resolve(p)
	}
	const tilde = expandTilde(decoded)
	if (existsFile(tilde)) return path.resolve(tilde)
	if (path.isAbsolute(tilde) && existsFile(tilde)) return path.resolve(tilde)
	// fixture expansion
	const fixture = expandFixture(decoded)
	if (fixture) return fixture
	// relative to repo or cwd
	const asAbs = path.isAbsolute(tilde) ? tilde : path.resolve(tilde)
	if (existsFile(asAbs)) return asAbs
	// try repo fixtures with raw name
	const repoTry = path.join(REPO_ROOT, 'test/fixtures', path.basename(tilde))
	if (existsFile(repoTry)) return path.resolve(repoTry)
	return path.resolve(tilde)
}

export function resolveUrlToPath(browserUrl: string): { vpxPath: string | null; romPath: string | null } {
	try {
		const url = new URL(browserUrl)
		const vpxParam = url.searchParams.get('vpx') ?? url.searchParams.get('table') ?? ''
		const romParam = url.searchParams.get('rom') ?? ''
		const vpxPath = vpxParam ? decodeViteFsParam(vpxParam) : null
		const romPath = romParam ? decodeViteFsParam(romParam) : null
		const resolvedVpx = vpxPath ? resolveVpxPath(vpxPath) : null
		const resolvedRom = romPath ? resolveVpxPath(romPath) : null
		return { vpxPath: resolvedVpx, romPath: resolvedRom }
	} catch {
		return { vpxPath: null, romPath: null }
	}
}

export function resolvePathToUrl(
	vpxPath: string,
	romPath: string | null,
	options: { host?: string; mode?: string } = {},
): string {
	const host = (options.host ?? 'http://localhost:3000').replace(/\/$/, '')
	const mode = options.mode ?? 'play'
	const absVpx = path.resolve(vpxPath)
	const vpxParam = `/@fs${absVpx}`
	const romParam = romPath ? `/@fs${path.resolve(romPath)}` : null
	let url = `${host}/?vpx=${encodeURI(vpxParam)}`
	if (romParam) url += `&rom=${encodeURI(romParam)}`
	if (mode) url += `&mode=${encodeURIComponent(mode)}`
	return url
}

function extractGameNameFromScript(script: string): string | null {
	const clean = script.replace(/^\uFEFF/, '')
	const patterns = [
		/cGameName\s*=\s*["']([^"']+)["']/i,
		/Controller\.GameName\s*=\s*["']([^"']+)["']/i,
		/\.GameName\s*=\s*["']([^"']+)["']/i,
		/GameName\s*=\s*["']([^"']+)["']/i,
	]
	for (const re of patterns) {
		const m = clean.match(re)
		if (m?.[1]) return m[1].trim()
	}
	return null
}

export async function detectGameName(vpxPath: string): Promise<string | null> {
	try {
		const { NodeBinaryReader } = await import('../../lib/io/binary-reader.node.js')
		const { Table } = await import('../../lib/vpt/table/table.js')
		const table = await Table.load(new NodeBinaryReader(vpxPath), {
			loadTableScript: true,
			tableDataOnly: true,
		} as any)
		const script = (table as any).tableScript ?? (table as any).getTableScript?.() ?? ''
		if (script) {
			const name = extractGameNameFromScript(script)
			if (name) return name
		}
	} catch {}
	return null
}

export function getRomCandidates(gameName: string, tableDir: string): string[] {
	const zip = gameName.endsWith('.zip') ? gameName : `${gameName}.zip`
	const candidates: string[] = []
	if (tableDir) {
		candidates.push(path.join(tableDir, 'pinmame/roms', zip))
		candidates.push(path.join(tableDir, zip))
	}
	candidates.push(path.join(HOME, '.pinmame/roms', zip))
	candidates.push(path.join(HOME, 'pinmame/roms', zip))
	candidates.push(path.join(HOME, 'Downloads', zip))
	candidates.push(path.resolve(REPO_ROOT, 'test/fixtures/roms', zip))
	candidates.push(path.resolve('test/fixtures/roms', zip))
	// also try lowercased
	const lower = zip.toLowerCase()
	if (lower !== zip) {
		candidates.push(path.join(HOME, '.pinmame/roms', lower))
		candidates.push(path.join(HOME, 'Downloads', lower))
	}
	return candidates
}

export function findRomForGameName(gameName: string, tableDir: string): string | null {
	for (const c of getRomCandidates(gameName, tableDir)) {
		if (existsFile(c)) return path.resolve(c)
	}
	return null
}

export async function resolveRomPath(
	explicitRom: string | null,
	gameName: string | null,
	tableDir: string,
): Promise<string | null> {
	if (explicitRom) {
		const p = resolveVpxPath(explicitRom)
		if (p && existsFile(p)) return p
		const decoded = decodeViteFsParam(explicitRom)
		if (existsFile(decoded)) return path.resolve(decoded)
		if (existsFile(explicitRom)) return path.resolve(explicitRom)
		return p
	}
	if (gameName) {
		return findRomForGameName(gameName, tableDir)
	}
	return null
}

export interface VpinballDiscovery {
	binPath: string | null
	binDir: string | null
	source: string | null
}

export function discoverVpinball(): VpinballDiscovery {
	const candidates: Array<{ p: string; source: string }> = []
	if (process.env.VPINBALL_BIN) {
		const v = expandTilde(process.env.VPINBALL_BIN)
		candidates.push({ p: v, source: 'VPINBALL_BIN' })
		if (fs.existsSync(v) && fs.statSync(v).isDirectory()) {
			candidates.push({ p: path.join(v, 'VPinballX_GL'), source: 'VPINBALL_BIN dir' })
			candidates.push({ p: path.join(v, 'VPinballX_BGFX'), source: 'VPINBALL_BIN dir' })
		}
	}
	if (process.env.VPINBALL_DIR) {
		const d = expandTilde(process.env.VPINBALL_DIR)
		candidates.push({ p: path.join(d, 'VPinballX_GL'), source: 'VPINBALL_DIR' })
		candidates.push({ p: path.join(d, 'VPinballX_BGFX'), source: 'VPINBALL_DIR' })
	}
	const homeProjects = path.join(HOME, 'projects/vpinball')
	candidates.push({ p: path.join(homeProjects, 'build/VPinballX_GL'), source: 'sister build' })
	candidates.push({ p: path.join(homeProjects, 'build/VPinballX_BGFX'), source: 'sister build' })
	candidates.push({ p: path.join(homeProjects, 'bin/VPinballX_GL'), source: 'sister bin' })
	candidates.push({ p: path.join(homeProjects, 'bin/VPinballX_BGFX'), source: 'sister bin' })
	candidates.push({ p: path.join(REPO_ROOT, 'external/vpinball/build/VPinballX_GL'), source: 'submodule build' })
	candidates.push({ p: path.join(REPO_ROOT, 'external/vpinball/build/VPinballX_BGFX'), source: 'submodule build' })
	candidates.push({ p: path.join(REPO_ROOT, 'external/vpinball/bin/VPinballX_GL'), source: 'submodule bin' })
	candidates.push({ p: path.join(REPO_ROOT, 'external/vpinball/bin/VPinballX_BGFX'), source: 'submodule bin' })
	candidates.push({ p: path.join(HOME, '.cache/vpinball/VPinballX_GL'), source: 'cache' })
	candidates.push({ p: path.join(HOME, '.cache/vpinball/VPinballX_BGFX'), source: 'cache' })
	candidates.push({ p: path.join(REPO_ROOT, '.cache/vpinball/VPinballX_GL'), source: 'cache local' })
	candidates.push({ p: path.join(REPO_ROOT, '.cache/vpinball/VPinballX_BGFX'), source: 'cache local' })

	for (const c of candidates) {
		try {
			if (fs.existsSync(c.p) && fs.statSync(c.p).isFile()) {
				try {
					fs.accessSync(c.p, fs.constants.X_OK)
				} catch {}
				return { binPath: path.resolve(c.p), binDir: path.dirname(path.resolve(c.p)), source: c.source }
			}
		} catch {}
	}
	// on-demand submodule init attempt (non-blocking, best-effort)
	try {
		if (
			fs.existsSync(path.join(REPO_ROOT, '.gitmodules')) &&
			!fs.existsSync(path.join(REPO_ROOT, 'external/vpinball/CMakeLists.txt'))
		) {
			const gitmodules = fs.readFileSync(path.join(REPO_ROOT, '.gitmodules'), 'utf-8')
			if (gitmodules.includes('external/vpinball')) {
				try {
					execSync('git submodule update --init --depth 1 external/vpinball', {
						cwd: REPO_ROOT,
						stdio: 'ignore',
						timeout: 15000,
					})
					for (const c of candidates) {
						if (fs.existsSync(c.p) && fs.statSync(c.p).isFile()) {
							return {
								binPath: path.resolve(c.p),
								binDir: path.dirname(path.resolve(c.p)),
								source: `${c.source} (after init)`,
							}
						}
					}
				} catch {}
			}
		}
	} catch {}
	return { binPath: null, binDir: null, source: null }
}

export function getDynamicLinkerEnv(binDir: string | null): NodeJS.ProcessEnv {
	if (!binDir) return {}
	const isMac = process.platform === 'darwin'
	const key = isMac ? 'DYLD_FALLBACK_LIBRARY_PATH' : 'LD_LIBRARY_PATH'
	const existing = process.env[key] ?? ''
	const parts = [binDir, path.join(binDir, 'lib'), path.join(binDir, 'plugins')]
	// also add sister plugins dir and runtime-libs if exists
	const altPlugins = path.join(binDir, '../plugins')
	if (fs.existsSync(altPlugins)) parts.unshift(altPlugins)
	const altRuntime = path.join(binDir, '../third-party/runtime-libs/linux-x64')
	if (fs.existsSync(altRuntime)) parts.unshift(altRuntime)
	if (existing) parts.push(existing)
	return { [key]: parts.join(':') } as NodeJS.ProcessEnv
}

export function createSessionIni(
	vpxPath: string,
	romPath: string | null,
	opts: { width?: number; height?: number; x?: number; y?: number } = {},
): string {
	const width = opts.width ?? 1280
	const height = opts.height ?? 900
	const x = opts.x ?? 1280
	const y = opts.y ?? 0
	let pinmamePath = path.join(HOME, '.pinmame')
	if (romPath) {
		try {
			const absRom = path.resolve(romPath)
			const parent = path.dirname(absRom)
			if (path.basename(parent).toLowerCase() === 'roms') {
				pinmamePath = path.dirname(parent)
			} else {
				pinmamePath = parent
			}
		} catch {}
	} else if (vpxPath) {
		const tableDir = path.dirname(path.resolve(vpxPath))
		const tablePinmame = path.join(tableDir, 'pinmame')
		if (fs.existsSync(path.join(tablePinmame, 'roms'))) pinmamePath = tablePinmame
	}
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpinball-'))
	const iniPath = path.join(tmpDir, 'VPinballX.ini')
	const content = `[Version]
VPinball = 10.8.1

[Player]
PlayfieldFullScreen = 0
PlayfieldWndX = ${x}
PlayfieldWndY = ${y}
PlayfieldWidth = ${width}
PlayfieldHeight = ${height}
SoundVolume = 100
MusicVolume = 100

[Plugin.PinMAME]
PinMAMEPath = ${pinmamePath}
`
	fs.writeFileSync(iniPath, content, 'utf-8')
	return iniPath
}

export function getNativeArgs(
	vpxPath: string,
	iniPath: string,
	mode: 'play' | 'extractvbs' | 'audit' | 'pov' = 'play',
): string[] {
	const absVpx = path.resolve(vpxPath)
	switch (mode) {
		case 'extractvbs':
			return ['-ExtractVBS', absVpx]
		case 'audit':
			return ['-Audit', absVpx]
		case 'pov':
			return ['-Pov', absVpx]
		default:
			return ['-Play', absVpx, '-Ini', iniPath, '-DisableTrueFullscreen']
	}
}

export async function resolveVpxSession(args: string[] | string): Promise<ResolvedVpxSession> {
	const rawArgs: string[] = typeof args === 'string' ? [args] : [...args]
	let vpxInput: string | null = null
	let romInput: string | null = null
	let explicitUrl: string | null = null

	for (let i = 0; i < rawArgs.length; i++) {
		const a = rawArgs[i]
		if (!a) continue
		if (a.startsWith('http://') || a.startsWith('https://')) {
			explicitUrl = a
			const parsed = resolveUrlToPath(a)
			if (parsed.vpxPath) vpxInput = parsed.vpxPath
			if (parsed.romPath) romInput = parsed.romPath
		} else if (a.startsWith('--url=')) {
			explicitUrl = a.slice(6)
			const parsed = resolveUrlToPath(explicitUrl)
			if (parsed.vpxPath) vpxInput = parsed.vpxPath
			if (parsed.romPath) romInput = parsed.romPath
		} else if (a.startsWith('--vpx=')) {
			vpxInput = a.slice(6)
		} else if (a === '--vpx' && rawArgs[i + 1]) {
			i++
			vpxInput = rawArgs[i] ?? null
		} else if (a.startsWith('--rom=')) {
			romInput = a.slice(6)
		} else if (a === '--rom' && rawArgs[i + 1]) {
			i++
			romInput = rawArgs[i] ?? null
		} else if (!a.startsWith('-') && /\.vp[xt]$/i.test(a)) {
			if (!vpxInput) vpxInput = a
		} else if (!a.startsWith('-') && a.length < 80 && !a.includes('/') && !a.includes('\\')) {
			// treat as fixture short name if not already set and not a flag
			if (!vpxInput) {
				const maybe = expandFixture(a)
				if (maybe) vpxInput = maybe
				else vpxInput = a
			}
		}
	}

	if (!vpxInput) {
		throw new Error('no VPX input — provide --vpx=<path|fixture|url> or a browser URL')
	}

	let vpxPath = resolveVpxPath(vpxInput)
	if (!vpxPath || !existsFile(vpxPath)) {
		// try fixture expansion one more time with raw input
		const alt = expandFixture(vpxInput)
		if (alt) vpxPath = alt
		else vpxPath = path.resolve(expandTilde(vpxInput))
	}
	if (!existsFile(vpxPath)) {
		throw new Error(`VPX not found: ${vpxInput} → ${vpxPath}`)
	}
	vpxPath = path.resolve(vpxPath)
	const tableName = path.basename(vpxPath, path.extname(vpxPath))
	const tableDir = path.dirname(vpxPath)

	let gameName: string | null = null
	try {
		gameName = await detectGameName(vpxPath)
	} catch {}

	let romPath: string | null = null
	if (romInput) {
		romPath = await resolveRomPath(romInput, null, tableDir)
		if (!romPath) {
			const decoded = decodeViteFsParam(romInput)
			const tryPath = resolveVpxPath(decoded) ?? path.resolve(decoded)
			if (existsFile(tryPath)) romPath = tryPath
			else romPath = tryPath
		}
	} else if (gameName) {
		romPath = findRomForGameName(gameName, tableDir)
	}

	let browserUrl: string
	if (explicitUrl?.includes('localhost:3000')) {
		browserUrl = explicitUrl
	} else {
		browserUrl = resolvePathToUrl(vpxPath, romPath)
	}

	const iniPath = createSessionIni(vpxPath, romPath)
	const nativeArgs = getNativeArgs(vpxPath, iniPath, 'play')

	return { vpxPath, romPath, tableName, gameName, browserUrl, nativeArgs, iniPath }
}
