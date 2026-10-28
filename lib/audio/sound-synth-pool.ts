// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Knocker/tone synthesis in a plain Worker, off the main thread (mirrors
// image-worker-pool.ts: singleton, id-keyed pending map, timeout, inline
// fallback). The WebAudio render thread owns the actual output, so synthesis
// here never blocks playback. The worker file duplicates knockPcm/tonePcm —
// workers run as isolated modules, so keep both copies in sync.

let worker: Worker | null = null
let seq = 0
const pending = new Map<
	number,
	{ resolve: (p: Float32Array) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
>()

// Generous because expiry degrades to the inline fallback instead of failing.
const SYNTH_TIMEOUT_MS = 5000
const DEFAULT_RATE = 44100

export function hasSoundWorker(): boolean {
	return typeof Worker !== 'undefined' && typeof window !== 'undefined'
}

/** 0.18 s knocker thock: noise click plus a 160 Hz body, both exponentially decayed.
 * Tuned approximation (decay 220/45, mix 0.7/0.6, fixed LCG seed for stability) —
 * native drives hardware (`ushock_output_knock`), so there is no faithful source. */
export function knockPcm(sampleRate = DEFAULT_RATE): Float32Array {
	const frames = Math.floor(sampleRate * 0.18)
	const out = new Float32Array(frames)
	let seed = 0x2f6e2b1
	const rnd = () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
		return seed / 0xffffffff - 0.5
	}
	for (let i = 0; i < frames; i++) {
		const t = i / sampleRate
		const click = rnd() * 2 * Math.exp(-t * 220)
		const body = Math.sin(2 * Math.PI * 160 * t) * Math.exp(-t * 45)
		out[i] = Math.max(-1, Math.min(1, 0.7 * click + 0.6 * body))
	}
	return out
}

/** Faded sine probe (tests/E2E sample registration): 0.5 headroom with a
 * click-suppressing edge fade (1/8 of the buffer, capped at 10 ms). */
export function tonePcm(freq = 440, seconds = 0.25, sampleRate = DEFAULT_RATE): Float32Array {
	const frames = Math.max(1, Math.floor(sampleRate * seconds))
	const out = new Float32Array(frames)
	const fade = Math.min(frames >> 3, Math.floor(sampleRate * 0.01))
	for (let i = 0; i < frames; i++) {
		const edge = Math.min(1, i / Math.max(1, fade), (frames - 1 - i) / Math.max(1, fade))
		out[i] = (0.5 * Math.sin(2 * Math.PI * freq * (i / sampleRate)) * edge) as number
	}
	return out
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
export async function synthKnock(sampleRate = DEFAULT_RATE): Promise<Float32Array> {
	return request('knock', { sampleRate })
}

/** Sine-probe PCM synthesized off the main thread (inline fallback when workers are unavailable). */
export async function synthTone(freq = 440, seconds = 0.25, sampleRate = DEFAULT_RATE): Promise<Float32Array> {
	return request('tone', { freq, seconds, sampleRate })
}
