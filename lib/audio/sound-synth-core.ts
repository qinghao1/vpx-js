// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Synthesis kernels: knockPcm feeds the engine inline, tonePcm is a faded
// sine probe for sample-registration tests. Intentionally dependency-free.
export const DEFAULT_SYNTH_RATE = 44100

/** Knocker hit: hardware has no faithful source; fixed LCG seed keeps it stable. */
export function knockPcm(sampleRate = DEFAULT_SYNTH_RATE): Float32Array {
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

/** Sine probe for tests/E2E registration; edge-faded. */
export function tonePcm(freq = 440, seconds = 0.25, sampleRate = DEFAULT_SYNTH_RATE): Float32Array {
	const frames = Math.max(1, Math.floor(sampleRate * seconds))
	const out = new Float32Array(frames)
	const fade = Math.min(frames >> 3, Math.floor(sampleRate * 0.01))
	for (let i = 0; i < frames; i++) {
		const edge = Math.min(1, i / Math.max(1, fade), (frames - 1 - i) / Math.max(1, fade))
		out[i] = 0.5 * Math.sin(2 * Math.PI * freq * (i / sampleRate)) * edge
	}
	return out
}
