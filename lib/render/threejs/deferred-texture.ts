import { RE_BAKE_MAP } from './scene-classify.js'

const LARGE_TEXTURE_PIXELS = 1_048_576

export type DeferredTexture = {
	getName(): string
	szPath?: string
	width: number
	height: number
	isHdr?: () => boolean
}

export const isDeferred = (tx: DeferredTexture, table: { getPlayfieldMap(): string }): boolean => {
	const texName = tx.getName().toLowerCase()
	const playfieldMap = table.getPlayfieldMap().toLowerCase()
	if (texName === playfieldMap) return false
	if (RE_BAKE_MAP.test(texName) || texName.includes('playfield')) return false
	const filePath = (tx.szPath ?? '').toLowerCase()
	if (filePath.endsWith('.exr') || filePath.endsWith('.hdr') || tx.isHdr?.()) return true
	return tx.width * tx.height > LARGE_TEXTURE_PIXELS
}
