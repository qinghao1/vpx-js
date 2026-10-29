// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

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

import { DEFAULT_SYNTH_RATE, knockPcm, tonePcm } from './sound-synth-core.js'

// Generous because expiry degrades to the inline fallback instead of failing.
const SYNTH_TIMEOUT_MS = 5000

function hasSoundWorker(): boolean {
	return typeof Worker !== 'undefined' && typeof window !== 'undefined'
}

function getWorker(): Worker | null {
	if (!hasSoundWorker()) return null
	if (worker) return worker
	try {
		const w = new Worker(new URL('./workers/sound-synth.worker.js', import.meta.url), { type: 'module' } as never)
		w.onmessage = ({ data }: { data: { id: number; ok: boolean; pcm?: ArrayBuffer; error?: string } }) => {
			const p = pending.get(data.id)
			if (!p) return
			pending.delete(data.id)
			clearTimeout(p.timer)
			if (data.ok && data.pcm) p.resolve(new Float32Array(data.pcm))
			else p.reject(new Error(data.error ?? 'sound worker failed'))
		}
		w.onerror = (e: ErrorEvent) => {
			for (const [, p] of pending) {
				clearTimeout(p.timer)
				p.reject((e as ErrorEvent).error ?? new Error(String((e as ErrorEvent).message ?? e)))
			}
			pending.clear()
		}
		worker = w as unknown as Worker
		return worker
	} catch {
		return null
	}
}

async function request(kind: 'knock' | 'tone', payload: Record<string, number>): Promise<Float32Array> {
	const w = getWorker()
	const fallback = () =>
		kind === 'knock' ? knockPcm(payload.sampleRate) : tonePcm(payload.freq, payload.seconds, payload.sampleRate)
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
			w.postMessage({ id, kind, ...payload })
		} catch {
			pending.delete(id)
			clearTimeout(timer)
			resolve(fallback())
		}
	}).catch(() => fallback())
}

/** Knocker PCM synthesized off the main thread (inline fallback when workers are unavailable). */
export async function synthKnock(sampleRate = DEFAULT_SYNTH_RATE): Promise<Float32Array> {
	return request('knock', { sampleRate })
}

/** Sine-probe PCM synthesized off the main thread (inline fallback when workers are unavailable). */
export async function synthTone(freq = 440, seconds = 0.25, sampleRate = DEFAULT_SYNTH_RATE): Promise<Float32Array> {
	return request('tone', { freq, seconds, sampleRate })
}
