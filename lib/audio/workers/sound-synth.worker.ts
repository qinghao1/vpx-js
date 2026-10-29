// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

// Isolated synthesis worker: kernels imported from sound-synth-core.js
// (shipped side-by-side in dist-esm, so the relative import resolves).
import { DEFAULT_SYNTH_RATE, knockPcm, tonePcm } from '../sound-synth-core.js'

addEventListener('message', (e: MessageEvent) => {
	const {
		id,
		kind,
		sampleRate = DEFAULT_SYNTH_RATE,
		freq = 440,
		seconds = 0.25,
	} = e.data as {
		id: number
		kind: string
		sampleRate?: number
		freq?: number
		seconds?: number
	}
	try {
		let pcm: Float32Array
		if (kind === 'tone') pcm = tonePcm(freq, seconds, sampleRate)
		else if (kind === 'knock') pcm = knockPcm(sampleRate)
		else throw new Error(`unknown synth kind "${kind}"`)
		// Transfer list: valid in workers, but DOM lib types this global as window.postMessage.
		postMessage({ id, ok: true, pcm: pcm.buffer }, [pcm.buffer] as never)
	} catch (err) {
		postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) })
	}
})
