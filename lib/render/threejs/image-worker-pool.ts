// Browser-only pool (Node decodes inline): decode + resize off the main
// thread. Sized by CPU count, capped at 4; playfield maps take the
// least-busy worker, the rest stay round-robin (30s timeout; callers fall
// back to main-thread decode).

import { settleWorkerEntry, type WorkerPendingEntry, withWorkerTimeout } from '../../util/worker-pending.js'
import { WorkerLoadTracker } from './texture-dispatch.js'
import { isPlayfieldCap } from './texture-tags.js'

const pool: Worker[] = []
let next = 0
let seq = 0
const tracker = new WorkerLoadTracker()
const pending = new Map<number, WorkerPendingEntry<ImageBitmap>>()

const IMAGE_POOL_SIZE = 4

/**
 * Shared worker-pool sizing: finite core counts clamp to [1, cap];
 * missing/NaN/Infinity fall back to the cap default.
 */
export function poolSize(cores: unknown, cap: number): number {
	const n = typeof cores === 'number' ? cores : cap
	const finite = Number.isFinite(n) ? Math.floor(n) : cap
	return Math.max(1, Math.min(finite, cap))
}

function getSize(): number {
	return poolSize((globalThis as any).navigator?.hardwareConcurrency, IMAGE_POOL_SIZE)
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
	// Playfield maps take the least-busy worker (same bitmap either way);
	// round-robin resumes where it left off.
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
			// No replace: callers fall back to main-thread decode, unlike the float pool whose retry must land fresh.
			const entry = settleWorkerEntry(pending, id)
			if (entry) tracker.idle(worker)
			reject(e)
		}
	})
}
