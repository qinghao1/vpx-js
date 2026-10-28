// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Isolated synthesis worker: duplicates knockPcm/tonePcm from sound-synth-pool.ts
// (workers cannot share its module scope, so keep both copies in sync).
self.onmessage = (e: MessageEvent) => {
	const {
		id,
		kind,
		sampleRate = 44100,
		freq = 440,
		seconds = 0.25,
	} = e.data as {
		id: number
		kind: 'knock' | 'tone'
		sampleRate?: number
		freq?: number
		seconds?: number
	}
	try {
		const pcm = kind === 'tone' ? tonePcm(freq, seconds, sampleRate) : knockPcm(sampleRate)
		self.postMessage({ id, ok: true, pcm: pcm.buffer }, [pcm.buffer] as never)
	} catch (err) {
		self.postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) })
	}
}

function knockPcm(sampleRate: number): Float32Array {
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

function tonePcm(freq: number, seconds: number, sampleRate: number): Float32Array {
	const frames = Math.max(1, Math.floor(sampleRate * seconds))
	const out = new Float32Array(frames)
	const fade = Math.min(frames >> 3, Math.floor(sampleRate * 0.01))
	for (let i = 0; i < frames; i++) {
		const edge = Math.min(1, i / Math.max(1, fade), (frames - 1 - i) / Math.max(1, fade))
		out[i] = 0.5 * Math.sin(2 * Math.PI * freq * (i / sampleRate)) * edge
	}
	return out
}
