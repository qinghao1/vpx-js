import type { Texture as ThreeTexture } from '../../refs.browser.js'
import { CanvasTexture, LinearFilter, SRGBColorSpace } from '../../refs.browser.js'

type Entry = { name: string; tex: unknown; w: number; h: number; x: number; y: number }

export function createAtlas(
	textures: Map<string, unknown>,
	maxSize = 2048,
): { atlas: ThreeTexture; map: Map<string, { u: number; v: number; su: number; sv: number }> } | null {
	const entries = collectSmallEntries(textures, maxSize)
	if (entries.length < 4) return null
	if (!packEntries(entries, maxSize)) return null
	const { canvas, map } = buildAtlas(entries, maxSize)
	return { atlas: canvasTexture(canvas), map }
}

function collectSmallEntries(textures: Map<string, unknown>, maxSize: number): Entry[] {
	const out: Entry[] = []
	for (const [name, tex] of textures) {
		const img = (tex as { image?: unknown })?.image as { width?: number; naturalWidth?: number; height?: number; naturalHeight?: number; data?: unknown } | undefined
		if (!img || img.data) continue
		const w = img.width ?? img.naturalWidth ?? 0
		const h = img.height ?? img.naturalHeight ?? 0
		if (!w || !h || w * h === 0 || Math.max(w, h) > 256) continue
		out.push({ name, tex, w, h, x: 0, y: 0 })
	}
	out.sort((a, b) => b.h - a.h)
	return out
}

function packEntries(entries: Entry[], maxSize: number): boolean {
	let x = 0
	let y = 0
	let rowH = 0
	const pad = 2
	for (const e of entries) {
		if (x + e.w + pad > maxSize) {
			x = 0
			y += rowH + pad
			rowH = 0
		}
		if (y + e.h + pad > maxSize) return false
		e.x = x
		e.y = y
		x += e.w + pad
		rowH = Math.max(rowH, e.h)
	}
	return true
}

function buildAtlas(entries: Entry[], maxSize: number) {
	const neededH = Math.max(...entries.map((e) => e.y + e.h)) + 2
	const h = 2 ** Math.ceil(Math.log2(neededH))
	const canvas = document.createElement('canvas')
	canvas.width = maxSize
	canvas.height = h
	const ctx = canvas.getContext('2d')!
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	for (const e of entries) {
		const img = (e.tex as { image: CanvasImageSource }).image as CanvasImageSource
		try {
			ctx.drawImage(img as CanvasImageSource, e.x, e.y, e.w, e.h)
		} catch {}
	}
	const map = new Map<string, { u: number; v: number; su: number; sv: number }>()
	for (const e of entries) {
		map.set(e.name.toLowerCase(), {
			u: e.x / maxSize,
			v: 1 - (e.y + e.h) / canvas.height,
			su: e.w / maxSize,
			sv: e.h / canvas.height,
		})
	}
	return { canvas, map }
}

function canvasTexture(canvas: HTMLCanvasElement): ThreeTexture {
	const tex = new CanvasTexture(canvas as unknown as HTMLCanvasElement)
	tex.colorSpace = SRGBColorSpace
	tex.flipY = true
	tex.generateMipmaps = false
	tex.minFilter = LinearFilter as unknown as ThreeTexture['minFilter']
	tex.magFilter = LinearFilter as unknown as ThreeTexture['magFilter']
	tex.needsUpdate = true
	tex.name = 'atlas:small'
	return tex as unknown as ThreeTexture
}

export function applyAtlas(root: unknown, atlas: ThreeTexture, map: Map<string, { u: number; v: number; su: number; sv: number }>): number {
	let patched = 0
	const traverse = (root as { traverse?: (cb: (o: unknown) => void) => void })?.traverse
	if (typeof traverse !== 'function') return 0
	;(root as { traverse: (cb: (o: unknown) => void) => void }).traverse((o: unknown) => {
		const obj = o as {
			isMesh?: boolean
			material?: unknown
			geometry?: { attributes?: { uv?: { array: Float32Array; needsUpdate?: boolean } }; clone?: () => unknown } & Record<string, unknown>
		}
		if (!obj.isMesh || !obj.material) return
		const mats = Array.isArray(obj.material) ? (obj.material as unknown[]) : [obj.material as unknown]
		let entry: { u: number; v: number; su: number; sv: number } | undefined
		let idx = -1
		for (let i = 0; i < mats.length; i++) {
			const m = mats[i] as { map?: { name?: string } }
			const raw = (m.map?.name ?? '').toLowerCase()
			const clean = raw.replace(/^texture:/, '').replace(/:placeholder/, '')
			const e = map.get(clean)
			if (e) {
				entry = e
				idx = i
				break
			}
		}
		if (!entry || idx < 0) return
		const orig = mats[idx] as { clone?: () => unknown; userData?: Record<string, unknown>; map?: unknown; needsUpdate?: boolean }
		let cloned: unknown
		try {
			cloned = orig.clone?.() ?? { ...orig }
		} catch {
			cloned = { ...orig }
		}
		const c = cloned as { map?: unknown; needsUpdate?: boolean; userData?: Record<string, unknown> }
		c.map = atlas as unknown
		c.needsUpdate = true
		c.userData ??= {}
		c.userData.originalMap = (orig as { map?: unknown }).map
		c.userData.atlased = true
		if (Array.isArray(obj.material)) (obj.material as unknown[])[idx] = c
		else (obj as { material: unknown }).material = c
		const geom = obj.geometry as
			| {
					attributes?: { uv?: { array: Float32Array; needsUpdate?: boolean } }
					clone?: () => { attributes?: { uv?: { array: Float32Array; needsUpdate?: boolean } } } & Record<string, unknown>
			  }
			| undefined
		if (!geom?.attributes?.uv) {
			patched++
			return
		}
		let newGeom: { attributes?: { uv?: { array: Float32Array; needsUpdate?: boolean } } } & Record<string, unknown>
		try {
			newGeom = (geom.clone?.() as typeof newGeom) ?? (geom as typeof newGeom)
		} catch {
			patched++
			return
		}
		const uv = newGeom.attributes?.uv
		if (!uv) {
			;(obj as { geometry: unknown }).geometry = newGeom
			patched++
			return
		}
		const arr = uv.array as Float32Array
		const { u, v, su, sv } = entry
		for (let j = 0; j < arr.length; j += 2) {
			arr[j] = u + (arr[j] as number) * su
			arr[j + 1] = v + (arr[j + 1] as number) * sv
		}
		uv.needsUpdate = true
		;(obj as { geometry: unknown }).geometry = newGeom
		patched++
	})
	return patched
}
