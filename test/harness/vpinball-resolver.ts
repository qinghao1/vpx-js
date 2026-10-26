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

function expandTilde(targetPath: string): string {
	if (targetPath === '~') return HOME
	if (targetPath.startsWith('~/')) return path.join(HOME, targetPath.slice(2))
	return targetPath
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

function existsFile(filePath: string): boolean {
	try {
		return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
	} catch {
		return false
	}
}

function firstExisting(paths: string[]): string | null {
	const found = paths.find(existsFile)
	return found ? path.resolve(found) : null
}

// Canonical CLI arg parsing for test/harness/* (`--name=value` only; no space form).
// Rule: last occurrence wins, so a later flag overrides an earlier one — the
// same rule as parseVpxArgs below. See vpinball-resolver.spec.ts.
export function getArg(args: string[], name: string, def: string | null): string | null {
	const prefix = `--${name}=`
	let found: string | null = null
	for (const token of args) {
		if (token.startsWith(prefix)) found = token.slice(prefix.length)
	}
	return found ?? def
}

export function hasFlag(args: string[], name: string): boolean {
	return args.includes(`--${name}`)
}

export interface VpxArgs {
	vpx: string | null
	rom: string | null
	url: string | null
	rest: string[]
}

// Canonical --vpx/--rom/--url extraction (accepts `--flag=value` and `--flag value`).
// Rule: last occurrence wins — same rule as getArg above. Unknown tokens go to rest.
// See vpinball-resolver.spec.ts.
export function parseVpxArgs(rawArgs: string[]): VpxArgs {
	let vpx: string | null = null
	let rom: string | null = null
	let url: string | null = null
	const rest: string[] = []
	for (let index = 0; index < rawArgs.length; index++) {
		const token = rawArgs[index]
		if (!token) continue
		if (token.startsWith('--vpx=')) vpx = token.slice(6)
		else if (token === '--vpx' && rawArgs[index + 1]) {
			index++
			vpx = rawArgs[index] ?? null
		} else if (token.startsWith('--rom=')) rom = token.slice(6)
		else if (token === '--rom' && rawArgs[index + 1]) {
			index++
			rom = rawArgs[index] ?? null
		} else if (token.startsWith('--url=')) url = token.slice(6)
		else if (token.startsWith('http://') || token.startsWith('https://')) url = token
		else rest.push(token)
	}
	return { vpx, rom, url, rest }
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
	const found = firstExisting(candidates)
	if (found) return found
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

export function extractGameName(script: string): string | null {
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
			const name = extractGameName(script)
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
	return firstExisting(getRomCandidates(gameName, tableDir))
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
	const candidates: Array<{ candidatePath: string; source: string }> = []
	const pushDir = (dir: string, source: string): void => {
		for (const name of ['VPinballX_GL', 'VPinballX_BGFX']) {
			candidates.push({ candidatePath: path.join(dir, name), source })
		}
	}
	if (process.env.VPINBALL_BIN) {
		const binEnv = expandTilde(process.env.VPINBALL_BIN)
		candidates.push({ candidatePath: binEnv, source: 'VPINBALL_BIN' })
		if (fs.existsSync(binEnv) && fs.statSync(binEnv).isDirectory()) {
			pushDir(binEnv, 'VPINBALL_BIN dir')
		}
	}
	if (process.env.VPINBALL_DIR) {
		pushDir(expandTilde(process.env.VPINBALL_DIR), 'VPINBALL_DIR')
	}
	const homeProjects = path.join(HOME, 'projects/vpinball')
	pushDir(path.join(homeProjects, 'build'), 'sister build')
	pushDir(path.join(homeProjects, 'bin'), 'sister bin')
	pushDir(path.join(REPO_ROOT, 'external/vpinball/build'), 'submodule build')
	pushDir(path.join(REPO_ROOT, 'external/vpinball/bin'), 'submodule bin')
	pushDir(path.join(HOME, '.cache/vpinball'), 'cache')
	pushDir(path.join(REPO_ROOT, '.cache/vpinball'), 'cache local')

	const toDiscovery = (candidatePath: string, source: string): VpinballDiscovery => ({
		binPath: path.resolve(candidatePath),
		binDir: path.dirname(path.resolve(candidatePath)),
		source,
	})
	const scan = (suffix: string): VpinballDiscovery | null => {
		for (const candidate of candidates) {
			try {
				if (existsFile(candidate.candidatePath))
					return toDiscovery(candidate.candidatePath, candidate.source + suffix)
			} catch {}
		}
		return null
	}
	const found = scan('')
	if (found) return found
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
					return scan(' (after init)') ?? { binPath: null, binDir: null, source: null }
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
	let pinmamePath = path.join(HOME, '.pinmame/roms')
	if (romPath) {
		try {
			pinmamePath = path.dirname(path.resolve(romPath))
		} catch {}
	} else if (vpxPath) {
		const tableDir = path.dirname(path.resolve(vpxPath))
		const tablePinmameRoms = path.join(tableDir, 'pinmame/roms')
		if (fs.existsSync(tablePinmameRoms)) pinmamePath = tablePinmameRoms
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
	const rawArgs: string[] = typeof args === 'string' ? [args] : args
	const parsedArgs = parseVpxArgs(rawArgs)
	let vpxInput: string | null = parsedArgs.vpx
	let romInput: string | null = parsedArgs.rom
	const explicitUrl: string | null = parsedArgs.url
	if (explicitUrl) {
		// Explicit --vpx/--rom flags win over the URL parts; single-source inputs are unchanged.
		const parsed = resolveUrlToPath(explicitUrl)
		vpxInput ??= parsed.vpxPath
		romInput ??= parsed.romPath
	}
	for (const token of parsedArgs.rest) {
		if (!token.startsWith('-') && /\.vp[xt]$/i.test(token)) {
			if (!vpxInput) vpxInput = token
		} else if (!token.startsWith('-') && token.length < 80 && !token.includes('/') && !token.includes('\\')) {
			// treat as fixture short name if not already set and not a flag
			if (!vpxInput) {
				const maybe = expandFixture(token)
				if (maybe) vpxInput = maybe
				else vpxInput = token
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
			romPath = resolveVpxPath(decoded) ?? path.resolve(decoded)
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
