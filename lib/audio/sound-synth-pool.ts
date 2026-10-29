// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { DEFAULT_SYNTH_RATE, knockPcm, tonePcm } from './sound-synth-core.js'

// Knocker/tone synthesis in a plain Worker, off the main thread (mirrors
// image-worker-pool.ts: singleton, id-keyed pending map, timeout, inline
// fallback). The WebAudio render thread owns the actual output, so synthesis
// here never blocks playback. Kernels live in sound-synth-core.js, imported
// by both this pool and the worker.

let worker: Worker | null = null
let seq = 0
const pending = new Map<
	number,
	{ resolve: (p: Float32Array) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
>()

type SynthRequest =
	| { kind: 'knock'; sampleRate: number }
	| { kind: 'tone'; freq: number; seconds: number; sampleRate: number }

// Generous because expiry degrades to the inline fallback instead of failing.
const SYNTH_TIMEOUT_MS = 5000

function hasSoundWorker(): boolean {
	return typeof Worker !== 'undefined' && typeof window !== 'undefined'
}

/** Settle one pending request: drop the timeout and run the resolver. */
function settle(
	id: number,
	run: (p: { resolve: (p: Float32Array) => void; reject: (e: Error) => void }) => void,
): void {
	const p = pending.get(id)
	if (!p) return
	pending.delete(id)
	clearTimeout(p.timer)
	run(p)
}

function getWorker(): Worker | null {
	if (!hasSoundWorker()) return null
	if (worker) return worker
	try {
		const w = new Worker(new URL('./workers/sound-synth.worker.js', import.meta.url), { type: 'module' })
		w.onmessage = ({ data }: { data: { id: number; ok: boolean; pcm?: ArrayBuffer; error?: string } }) => {
			settle(data.id, p => {
				if (data.ok && data.pcm) p.resolve(new Float32Array(data.pcm))
				else p.reject(new Error(data.error ?? 'sound worker failed'))
			})
		}
		w.onerror = (e: ErrorEvent) => {
			for (const p of pending.values()) {
				clearTimeout(p.timer)
				p.reject(e.error ?? new Error(String(e.message ?? e)))
			}
			pending.clear()
		}
		worker = w
		return worker
	} catch {
		return null
	}
}

async function request(req: SynthRequest): Promise<Float32Array> {
	const w = getWorker()
	const fallback = () =>
		req.kind === 'knock' ? knockPcm(req.sampleRate) : tonePcm(req.freq, req.seconds, req.sampleRate)
	if (!w) return fallback()
	const id = ++seq
	return new Promise<Float32Array>((resolve, reject) => {
		const timer = setTimeout(() => {
			if (pending.has(id)) {
				pending.delete(id)
				resolve(fallback())
			}
		}, SYNTH_TIMEOUT_MS)
		pending.set(id, { resolve, reject, timer })
		try {
			w.postMessage({ id, ...req })
		} catch {
			pending.delete(id)
			clearTimeout(timer)
			resolve(fallback())
		}
	}).catch(() => fallback())
}

/** Knocker PCM synthesized off the main thread (inline fallback when workers are unavailable). */
export async function synthKnock(sampleRate = DEFAULT_SYNTH_RATE): Promise<Float32Array> {
	return request({ kind: 'knock', sampleRate })
}

/** Sine-probe PCM synthesized off the main thread (inline fallback when workers are unavailable). */
export async function synthTone(freq = 440, seconds = 0.25, sampleRate = DEFAULT_SYNTH_RATE): Promise<Float32Array> {
	return request({ kind: 'tone', freq, seconds, sampleRate })
}
