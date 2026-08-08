import { CanvasTexture, LinearFilter, SRGBColorSpace } from '../../refs.browser.js'
import type { Texture as ThreeTexture } from '../../refs.browser.js'

type Entry = { name: string; tex: any; w: number; h: number; x: number; y: number }

export function createAtlas(textures: Map<string, any>, maxSize = 1024): { atlas: ThreeTexture; map: Map<string, { u: number; v: number; su: number; sv: number }> } | null {
  const entries: Entry[] = []
  for (const [name, tex] of textures) {
    const img: any = tex.image
    if (!img || img.data) continue
    const w = img.width || img.naturalWidth || 0
    const h = img.height || img.naturalHeight || 0
    if (!w || !h) continue
    if (Math.max(w, h) > 256) continue
    if (w * h === 0) continue
    entries.push({ name, tex, w, h, x: 0, y: 0 })
  }
  if (entries.length < 4) return null
  entries.sort((a, b) => b.h - a.h)
  let x = 0, y = 0, rowH = 0
  const pad = 2
  for (const e of entries) {
    if (x + e.w + pad > maxSize) { x = 0; y += rowH + pad; rowH = 0 }
    if (y + e.h + pad > maxSize) return null
    e.x = x; e.y = y
    x += e.w + pad
    rowH = Math.max(rowH, e.h)
  }
  const h = y + rowH + pad
  const canvas = document.createElement('canvas')
  canvas.width = maxSize
  canvas.height = Math.pow(2, Math.ceil(Math.log2(h)))
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (const e of entries) {
    const img: any = e.tex.image
    try { ctx.drawImage(img, e.x, e.y, e.w, e.h) } catch {}
  }
  const atlas: any = new CanvasTexture(canvas)
  atlas.colorSpace = SRGBColorSpace
  atlas.generateMipmaps = false
  atlas.minFilter = LinearFilter as any
  atlas.magFilter = LinearFilter as any
  atlas.needsUpdate = true
  atlas.name = 'atlas:small'
  const map = new Map<string, { u: number; v: number; su: number; sv: number }>()
  for (const e of entries) {
    map.set(e.name.toLowerCase(), { u: e.x / maxSize, v: e.y / canvas.height, su: e.w / maxSize, sv: e.h / canvas.height })
  }
  return { atlas: atlas as ThreeTexture, map }
}
