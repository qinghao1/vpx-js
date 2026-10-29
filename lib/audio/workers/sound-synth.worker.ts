// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Isolated synthesis worker: kernels imported from sound-synth-core.js
// (shipped side-by-side in dist-esm, so the relative import resolves).
import { knockPcm, tonePcm } from '../sound-synth-core.js'

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
