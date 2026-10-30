// Browser-only pool (Node decodes inline): image decode + resize runs off the
// main thread so texture preload does not jank the first frames. Sized by
// CPU count, capped at 4; playfield maps dispatch to the least-busy worker
// while the rest stay round-robin, with a 30s per-image timeout and
// main-thread fallback when workers are unavailable.

import { settleWorkerEntry, type WorkerPendingEntry, withWorkerTimeout } from '../../util/worker-pending.js'
import { WorkerLoadTracker } from './texture-dispatch.js'
import { isPlayfieldCap } from './texture-tags.js'

const pool: Worker[] = []
let next = 0
let seq = 0
const tracker = new WorkerLoadTracker()
const pending = new Map<number, WorkerPendingEntry<ImageBitmap>>()

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
				const entry = settleWorkerEntry(pending, data.id)
				if (!entry) return
				tracker.idle(w)
				data.ok && data.bitmap
					? entry.resolve(data.bitmap as ImageBitmap)
					: entry.reject(new Error(data.error ?? 'image worker failed'))
			}
			w.onerror = (e: any) => {
				tracker.resetAll()
				for (const [, entry] of pending) {
					if (entry.timer) clearTimeout(entry.timer)
					entry.reject(e.error ?? new Error(String(e.message ?? e)))
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
	// Playfield maps jump to the least-busy worker; the bitmap is identical.
	// Round-robin resumes where it left off — the playfield detour does not
	// consume a turn.
	const preferLeastBusy = isPlayfieldCap(name)
	const picked = tracker.pick(workers, preferLeastBusy, next)
	next = picked.next
	const worker = picked.worker
	const id = ++seq
	const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
	return new Promise<ImageBitmap>((resolve, reject) => {
		pending.set(id, { resolve, reject })
		withWorkerTimeout(pending, id, 30000, 'image worker timeout', () => tracker.idle(worker))
		try {
			tracker.busy(worker)
			worker.postMessage({ id, buffer, mime, max, name }, [buffer] as any)
		} catch (e) {
			const entry = settleWorkerEntry(pending, id)
			if (entry) tracker.idle(worker)
			reject(e)
		}
	})
}
