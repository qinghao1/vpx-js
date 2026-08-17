let pool: Worker[] = []
let next = 0
let seq = 0
const pending = new Map<
	number,
	{ resolve: (b: ImageBitmap) => void; reject: (e: any) => void; timer: ReturnType<typeof setTimeout> }
>()

function getSize(): number {
	const c = (globalThis as any).navigator?.hardwareConcurrency
	return Math.max(1, Math.min(typeof c === 'number' ? c : 4, 4))
}

function ensurePool(): Worker[] | null {
	if (typeof Worker === 'undefined') return null
	if (pool.length) return pool
	try {
		for (let i = 0; i < getSize(); i++) {
			const w = new Worker(new URL('./workers/image-decode.worker.js', import.meta.url), {
				type: 'module',
			} as any)
			w.onmessage = ({ data }: any) => {
				const p = pending.get(data.id)
				if (!p) return
				pending.delete(data.id)
				clearTimeout(p.timer)
				data.ok && data.bitmap
					? p.resolve(data.bitmap as ImageBitmap)
					: p.reject(new Error(data.error ?? 'image worker failed'))
			}
			w.onerror = (e: any) => {
				for (const [, p] of pending) {
					clearTimeout(p.timer)
					p.reject(e.error ?? new Error(String(e.message ?? e)))
				}
				pending.clear()
			}
			pool.push(w)
		}
		return pool
	} catch {
		return null
	}
}

export function hasImageWorker(): boolean {
	if (typeof Worker === 'undefined') return false
	if (typeof window === 'undefined' || typeof document === 'undefined') return false
	return typeof createImageBitmap !== 'undefined' || typeof (globalThis as any).ImageDecoder !== 'undefined'
}

export async function decodeInWorker(data: Uint8Array, mime: string, max: number, name: string): Promise<ImageBitmap> {
	const workers = ensurePool()
	if (!workers?.length) throw new Error('no image worker')
	const w = workers[next++ % workers.length]!
	const id = ++seq
	const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
	return new Promise<ImageBitmap>((resolve, reject) => {
		const timer = setTimeout(() => {
			if (pending.has(id)) {
				pending.delete(id)
				reject(new Error('image worker timeout'))
			}
		}, 30000)
		pending.set(id, { resolve, reject, timer })
		try {
			w.postMessage({ id, buffer, mime, max, name }, [buffer] as any)
		} catch (e) {
			pending.delete(id)
			clearTimeout(timer)
			reject(e)
		}
	})
}

export function terminateImageWorkers(): void {
	for (const w of pool)
		try {
			w.terminate()
		} catch {}
	pool = []
	pending.clear()
	next = 0
	seq = 0
}
