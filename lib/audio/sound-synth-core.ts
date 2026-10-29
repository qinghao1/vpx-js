// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Shared synthesis kernels: imported by sound-synth-pool.ts (main-thread
// fallback) and workers/sound-synth.worker.ts (off-thread synthesis).
// Single source of truth so the two copies cannot drift. Intentionally
// dependency-free so the worker bundle stays lean.
export const DEFAULT_SYNTH_RATE = 44100

/** Tuned approximation — native drives hardware (`ushock_output_knock`),
 * so there is no faithful source; fixed LCG seed for stability. */
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

/** Faded sine probe (tests/E2E sample registration) with a click-suppressing edge fade. */
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
