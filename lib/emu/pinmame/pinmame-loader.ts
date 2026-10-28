import { logger } from '../../util/logger.js'
import type { PinmameModule } from './pinmame-module.js'

let cached: { module: PinmameModule; isMock: boolean } | null = null
let inflight: Promise<{ module: PinmameModule; isMock: boolean }> | null = null

const CANDIDATES = [
	'/wasm/libpinmame.js',
	'/wasm/libpinmame.mock.js',
	'/wasm/mock/libpinmame.mock.js',
	'../../../wasm/dist/libpinmame.js',
	'../../../../wasm/dist/libpinmame.js',
	'../../../wasm/mock/libpinmame.mock.js',
	'../../../../wasm/mock/libpinmame.mock.js',
]

export async function createPinmameModule(): Promise<{ module: PinmameModule; isMock: boolean }> {
	if (cached) return cached
	// Single-flight: concurrent callers share one import probe sequence.
	inflight ??= loadModule().catch(e => {
		inflight = null
		throw e
	})
	const found = await inflight
	cached = found
	return found
}

async function loadModule(): Promise<{ module: PinmameModule; isMock: boolean }> {
	for (const path of CANDIDATES) {
		try {
			const mod = (await import(/* @vite-ignore */ path)) as {
				default: () => Promise<PinmameModule>
				isMock?: boolean
			}
			const m = await mod.default()
			if (!m?.cwrap) {
				logger().debug('[pinmame] WASM candidate has no cwrap:', path)
				continue
			}
			const isMock = mod.isMock === true
			if (isMock) logger().warn('[pinmame] mock — run npm run build:wasm')
			return { module: m, isMock }
		} catch (e) {
			// Log each miss at debug so a wrong candidate order is diagnosable.
			logger().debug('[pinmame] WASM candidate failed:', path, e)
		}
	}
	throw new Error('PinMAME module not found — build wasm or mock')
}

export async function isPinmameMock(): Promise<boolean> {
	return (await createPinmameModule()).isMock
}

export function resetPinmameModuleCache(): void {
	cached = null
	inflight = null
}
