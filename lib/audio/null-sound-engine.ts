// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { BaseSoundEngine, type SoundSample, type SoundVoice } from './sound-engine.js'

/** Silent engine (Node/tests/player default): full voice bookkeeping, no audible output. */
export class NullSoundEngine extends BaseSoundEngine {
	protected emitVoice(_voice: SoundVoice, _sample: SoundSample, _rate: number): void {}
	protected emitKnock(): void {}
	protected emitEmuPcm(_pcm: Float32Array): void {}
}
