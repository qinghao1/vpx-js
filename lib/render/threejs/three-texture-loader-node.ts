// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	DataTexture,
	FloatType,
	HalfFloatType,
	LinearSRGBColorSpace,
	RGBAFormat,
	SRGBColorSpace,
	type Texture as ThreeTexture,
} from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { logger } from '../../util/logger.js'
import type { ITextureLoader } from '../irender-api.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let hdrWorkers: any[] = []
let hdrReady: Promise<any[]> | null = null
const hdrPending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()
let hdrNextId = 1
let hdrNextWorker = 0
const HDR_POOL_SIZE = 2

async function getHdrWorkers(): Promise<any[]> {
	if (hdrWorkers.length) return hdrWorkers
	if (hdrReady) return hdrReady
	hdrReady = (async () => {
		const { Worker } = await import('node:worker_threads')
		const { existsSync } = await import('node:fs')
		const workers: any[] = []
		for (let i = 0; i < HDR_POOL_SIZE; i++) {
			const tryCreate = (url: URL, withTsx: boolean) => {
				try {
					if (withTsx) return new Worker(url as any, { execArgv: ['--import', 'tsx/esm'] } as any)
					return new Worker(url as any)
				} catch {
					return null
				}
			}
			let w: any = null
			for (const [p, tsx] of [
				[`./hdr-decode.worker.node.js`, false],
				[`./hdr-decode.worker.node.js`, true],
				[`./hdr-decode.worker.node.ts`, true],
			] as const) {
				try {
					const u = new URL(p, import.meta.url) as any
					try {
						if (!existsSync(fileURLToPath(u))) continue
					} catch {}
					w = tryCreate(u, tsx)
					if (w) break
				} catch {}
			}
			if (!w) throw new Error('hdr worker not available - expected ./hdr-decode.worker.node.js')
			w.on('message', (m: any) => {
				const p = hdrPending.get(m.id)
				if (!p) return
				hdrPending.delete(m.id)
				m.ok ? p.resolve(m) : p.reject(new Error(m.error))
			})
			w.on('error', (e: any) => {
				for (const [, p] of hdrPending) p.reject(e)
				hdrPending.clear()
			})
			w.on('exit', () => {
				hdrWorkers = hdrWorkers.filter(x => x !== w)
				if (!hdrWorkers.length) hdrReady = null
			})
			try {
				;(w as any).unref?.()
			} catch {}
			workers.push(w)
		}
		hdrWorkers = workers
		return workers
	})()
	return hdrReady
}

async function decodeHdrViaWorker(buffer: ArrayBuffer, type: 'hdr' | 'exr', name?: string): Promise<any> {
	const workers = await getHdrWorkers()
	const w = workers[hdrNextWorker++ % workers.length]!
	return new Promise((resolve, reject) => {
		const id = hdrNextId++
		hdrPending.set(id, { resolve, reject })
		try {
			w.postMessage({ id, buffer, type, name }, [buffer] as any)
		} catch (e) {
			hdrPending.delete(id)
			reject(e)
		}
		setTimeout(() => {
			if (hdrPending.has(id)) {
				hdrPending.delete(id)
				reject(new Error('hdr worker timeout'))
			}
		}, 60000)
	})
}

export class ThreeTextureLoaderNode implements ITextureLoader<ThreeTexture> {
	async loadTexture(name: string, ext: string, data: Uint8Array): Promise<ThreeTexture> {
		const lowerExt = ext.toLowerCase()
		if (lowerExt === '.hdr' || lowerExt === '.exr') {
			try {
				return await this.loadHdrViaWorker(name, lowerExt as '.hdr' | '.exr', data)
			} catch (e) {
				logger().warn(
					'[Texture] hdr worker failed for %s: %s, falling back to main thread',
					name,
					(e as Error).message,
				)
			}
			return floatTex(
				lowerExt === '.hdr' ? HDRLoader : EXRLoader,
				lowerExt === '.hdr' ? HalfFloatType : FloatType,
				data,
			)
		}
		logger().warn(
			'[Texture] sharp removed – returning 1x1 placeholder for %s (%s, %s bytes)',
			name,
			ext,
			data.byteLength,
		)
		return tex(new Uint8Array([255, 255, 255, 255]), 1, 1, name)
	}

	async loadRawTexture(name: string, data: Uint8Array, w: number, h: number): Promise<ThreeTexture> {
		return tex(data, w, h, name)
	}

	async loadDefaultTexture(name: string, _: string, file: string): Promise<ThreeTexture> {
		const buf = await readFile(join(__dirname, '../../../res/maps', file))
		return this.loadTexture(name, 'png', buf as Uint8Array)
	}

	private async loadHdrViaWorker(name: string, ext: '.hdr' | '.exr', data: Uint8Array): Promise<ThreeTexture> {
		const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
		const res: any = await decodeHdrViaWorker(buffer, ext.slice(1) as 'hdr' | 'exr', name)
		const texData = res.data as any
		const width = res.width as number
		const height = res.height as number
		const type = res.type as any
		const format = res.format as any
		const t: any = new DataTexture(texData, width, height, format, type)
		t.colorSpace = res.colorSpace ?? LinearSRGBColorSpace
		t.flipY = false
		t.needsUpdate = true
		t.name = `texture:${name}`
		return t as ThreeTexture
	}
}

export function getMaxTextureSize(_name: string): number {
	return 2048
}

function tex(data: Uint8Array, w: number, h: number, name: string): ThreeTexture {
	const t = new DataTexture(data, w, h, RGBAFormat)
	t.flipY = false
	t.colorSpace = SRGBColorSpace
	t.needsUpdate = true
	t.name = `texture:${name}`
	return t as unknown as ThreeTexture
}

function floatTex(Loader: any, type: any, data: Uint8Array): Promise<ThreeTexture> {
	return new Promise((res, rej) =>
		new Loader()
			.setDataType(type as never)
			.load(
				data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as never,
				(v: any) => res(v as ThreeTexture),
				undefined,
				rej,
			),
	)
}
