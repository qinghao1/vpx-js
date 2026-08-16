import * as fs from 'node:fs'
import { DataUtils, HalfFloatType } from 'three'
import { describe, expect, it } from 'vitest'
import { downscaleHdrData, getMaxTextureSize as getMaxWorker } from './hdr-decode.worker.node.js'
import { effectiveMax } from './three-texture-loader-browser.js'
import { getMaxTextureSize as getMaxNode } from './three-texture-loader-node.js'

describe('regression: texture stripe artifacts', () => {
	it('playfield cap must be 4096 not 16384', () => {
		expect(getMaxNode('VLM.Nestmap0'), 'node loader playfield cap').toEqual(4096)
		expect(getMaxNode('playfield'), 'node playfield').toEqual(4096)
		expect(getMaxNode('nestmap'), 'nestmap').toEqual(4096)
		expect(getMaxNode('bake_something'), 'bake').toEqual(4096)
		expect(getMaxNode('diffuse'), 'non-playfield cap 2048').toEqual(2048)
		expect(getMaxNode('wall'), 'wall 2048').toEqual(2048)

		expect(getMaxWorker('VLM.Nestmap0'), 'worker playfield').toEqual(4096)
		expect(getMaxWorker('other'), 'worker other 2048').toEqual(2048)
	})

	it('browser effectiveMax must cap playfield to 4096', () => {
		expect(effectiveMax(false, 'VLM.Nestmap0')).toEqual(4096)
		expect(effectiveMax(false, 'playfield'), 'playfield').toEqual(4096)
		expect(effectiveMax(true, 'VLM.Nestmap0'), 'float playfield').toEqual(4096)
		expect(effectiveMax(true, 'playfield'), 'float playfield 4096').toEqual(4096)
		// non-playfield should be 2048 on swift or 4096 otherwise, but never >4096 for float without playfield?
		// In node env hwMax defaults 4096, so non-playfield float also 4096 but limited by cap
		const nonPf = effectiveMax(false, 'some_wall')
		expect(nonPf, 'non-playfield should be <=4096').toBeLessThanOrEqual(4096)
		// Ensure source does not contain old 16384 cap
		const browserSrc = fs.readFileSync('lib/render/threejs/three-texture-loader-browser.ts', 'utf-8')
		expect(browserSrc, 'must not contain 16384 cap').not.toContain('16384')
		const workerSrc = fs.readFileSync('lib/render/threejs/hdr-decode.worker.node.ts', 'utf-8')
		expect(workerSrc).toContain('4096')
	})

	it('playfield downscale must use box-average not point sample', () => {
		// Create 4x4 with 2x2 blocks of distinct values, downscale to 2x2 via averaging
		// comps=1 for simplicity, values are half-float or float
		const w = 4,
			h = 4,
			comps = 3
		const data = new Float32Array(w * h * comps)
		// Fill with pattern where each 2x2 quad has different color
		// quad (0,0) => 0, quad (1,0) => 100, quad (0,1)=> 200, quad (1,1)=>300
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++)
				for (let c = 0; c < comps; c++) {
					const qx = Math.floor(x / 2),
						qy = Math.floor(y / 2)
					const base = (qy * 2 + qx) * 100
					data[(y * w + x) * comps + c] = base + c
				}
		const max = 2 // force downscale to 2x2
		const out = downscaleHdrData(data as any, w, h, max, 'playfield', HalfFloatType)
		// playfield should average 2x2 blocks: each output pixel is average of 4 source pixels
		// Since all pixels in a quad are same value, average == value
		expect(out.width).toEqual(2)
		expect(out.height).toEqual(2)
		// check values: (0,0) avg = 0, (1,0)=100, (0,1)=200, (1,1)=300
		for (let y = 0; y < 2; y++)
			for (let x = 0; x < 2; x++)
				for (let c = 0; c < comps; c++) {
					const expected = (y * 2 + x) * 100 + c
					const actual = (out.data as Float32Array)[(y * 2 + x) * comps + c]
					expect(actual, `playfield avg at ${x},${y} c${c}`).toBeCloseTo(expected, 0.01)
				}
	})

	it('playfield half-float averaging must be correct', () => {
		const w = 4,
			h = 4,
			comps = 1
		const data = new Uint16Array(w * h)
		// fill 0 and 1 half-float pattern
		for (let i = 0; i < w * h; i++) data[i] = DataUtils.toHalfFloat(i % 2 === 0 ? 0 : 2)
		const out = downscaleHdrData(data as any, w, h, 2, 'VLM.Nestmap0', HalfFloatType)
		expect(out.width).toEqual(2)
		// every 2x2 block contains two 0s and two 2s => avg 1
		for (let i = 0; i < out.data.length; i++) {
			const v = DataUtils.fromHalfFloat((out.data as Uint16Array)[i])
			expect(v, 'half-float avg must be 1').toBeCloseTo(1, 0.1)
		}
	})

	it('non-playfield downscale must use point sampling (stripes would appear with averaging if bug)', () => {
		const w = 4,
			h = 4,
			comps = 1
		const data = new Float32Array(w * h)
		for (let i = 0; i < w * h; i++) data[i] = i
		const out = downscaleHdrData(data as any, w, h, 2, 'some_wall', 0)
		expect(out.width).toEqual(2)
		// point sampling: chooses sy=floor(y/nh * h), sx=floor(x/nw * w)
		// for 4->2: (0,0)->0, (1,0)->2, (0,1)->8, (1,1)->10
		const expected = [0, 2, 8, 10]
		for (let i = 0; i < 4; i++) expect((out.data as Float32Array)[i]).toEqual(expected[i])
	})

	it('6080x8192 playfield must downscale to <=4096', () => {
		const w = 6080,
			h = 8192
		const comps = 4
		const fake = new Uint8Array(w * h * comps) // small but we just test max calc, not full alloc? Use smaller proxy
		// Real large alloc would OOM, so test math: scale = min(4096/6080, 4096/8192)=0.5
		const max = getMaxWorker('VLM.Nestmap0')
		expect(max).toEqual(4096)
		const scale = Math.min(max / w, max / h)
		const nw = Math.floor(w * scale)
		const nh = Math.floor(h * scale)
		expect(nw, 'nw <=4096').toBeLessThanOrEqual(4096)
		expect(nh, 'nh <=4096').toBeLessThanOrEqual(4096)
		expect(nw).toEqual(3040) // 6080*0.5
		expect(nh).toEqual(4096) // 8192*0.5
		// ensure not 16384 (old bug would have allowed 6080x8192 without downscale on hw 16384)
		expect(max, 'old bug cap 16384 must not be used').not.toEqual(16384)
	})

	it('polygonOffset must be negative to avoid z-fighting stripes', () => {
		const src = fs.readFileSync('lib/render/threejs/three-scene-postprocess.ts', 'utf-8')
		// main bake should be -1, overlay -2/-4
		expect(src).toMatch(/polygonOffsetFactor\s*=\s*-1/)
		expect(src).toMatch(/polygonOffsetFactor\s*=\s*-2/)
		// baked materials must use negative polygonOffset (old bug used 0)
		expect(src, 'baked polygonOffset must be negative').toMatch(/isMainBake[\s\S]*?polygonOffsetFactor\s*=\s*-1/)
		expect(src, 'overlay polygonOffset must be -2/-4').toMatch(/isOverlay[\s\S]*?polygonOffsetFactor\s*=\s*-2/)
	})
})
