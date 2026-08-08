import { logger } from '../../util/logger.js'
import type { PinmameModule } from './pinmame-module.js'

let cached: { module: PinmameModule; isMock: boolean } | null = null

const CANDIDATES = [
	'../../../wasm/dist/libpinmame.js',
	'../../../wasm/mock/libpinmame.mock.js',
	'/wasm/libpinmame.js',
	'/wasm/libpinmame.mock.js',
]

export async function createPinmameModule(): Promise<{ module: PinmameModule; isMock: boolean }> {
	if (cached) return cached
	for (const path of CANDIDATES) {
		try {
			const mod = (await import(/* @vite-ignore */ path)) as {
				default: () => Promise<PinmameModule>
				isMock?: boolean
			}
			const m = await mod.default()
			if (!m?.cwrap) continue
			const isMock = mod.isMock === true
			if (isMock) logger().warn('[pinmame] mock — run npm run build:wasm')
			cached = { module: m, isMock }
			return cached
		} catch (e) {
			logger().debug(`[pinmame] ${path} unavailable`, (e as Error)?.message)
		}
	}
	throw new Error('PinMAME module not found — build wasm or mock')
}

export async function isPinmameMock(): Promise<boolean> {
	return (await createPinmameModule()).isMock
}

export function resetPinmameModuleCache(): void {
	cached = null
}
