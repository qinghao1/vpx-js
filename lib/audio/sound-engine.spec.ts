// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { resetWarnOnce } from '../emu/warn-once.js'
import { Logger } from '../util/logger.js'
import { NullSoundEngine } from './null-sound-engine.js'
import { effectiveGain, extractPcm, mapLoopCount, pitchFactor, uncurvePanFade } from './sound-engine.js'
import { knockPcm, tonePcm } from './sound-synth-core.js'
import { synthKnock, synthTone } from './sound-synth-pool.js'

function tone(name = 'probe'): { engine: NullSoundEngine; name: string } {
	const engine = new NullSoundEngine()
	engine.registerSample(name, tonePcm(440, 0.05, 8000), 8000)
	return { engine, name }
}

describe('Sound engine math', () => {
	it('should map native loop counts', () => {
		expect(mapLoopCount()).to.equal(0)
		expect(mapLoopCount(1)).to.equal(0)
		expect(mapLoopCount(0)).to.equal(0)
		expect(mapLoopCount(2)).to.equal(1)
		expect(mapLoopCount(5)).to.equal(4)
		expect(mapLoopCount(-1)).to.equal(-1)
		expect(mapLoopCount(-10)).to.equal(-1)
	})

	it('should undo the x^10 pan pre-emphasis', () => {
		expect(uncurvePanFade(0)).to.equal(0)
		expect(uncurvePanFade(1)).to.equal(1)
		expect(uncurvePanFade(-1)).to.equal(-1)
		expect(uncurvePanFade(0.5 ** 10)).to.be.closeTo(0.5, 1e-9)
		expect(uncurvePanFade(-(0.5 ** 10))).to.be.closeTo(-0.5, 1e-9)
		expect(uncurvePanFade(99)).to.equal(1)
	})

	it('should scale voices by sqrt of the clamped product', () => {
		expect(effectiveGain(1, 1)).to.equal(1)
		expect(effectiveGain(0.25, 1)).to.be.closeTo(0.5, 1e-9)
		expect(effectiveGain(0, 1)).to.equal(0)
		expect(effectiveGain(2, 2)).to.equal(1)
		expect(effectiveGain(0.25, 1, 2)).to.be.closeTo(1, 1e-9)
	})

	it('should convert Hz pitch offsets to playback rates', () => {
		expect(pitchFactor(44100)).to.equal(1)
		expect(pitchFactor(44100, 4410)).to.be.closeTo(1.1, 1e-9)
		expect(pitchFactor(0, 100)).to.equal(1)
		const detuned = pitchFactor(44100, 0, 0.2, () => 0.5)
		expect(detuned).to.be.within(0.9, 1.1)
		expect(pitchFactor(44100, 0, 0, () => 0.99)).to.equal(1)
	})
})

describe('NullSoundEngine', () => {
	beforeEach(() => resetWarnOnce())

	it('should warn once and play nothing for missing samples', () => {
		const warns: unknown[][] = []
		const orig = Logger.logger()
		const noop = () => {}
		Logger.setLogger({
			wtf: noop,
			error: noop,
			warn: (...a: unknown[]) => void warns.push(a),
			info: noop,
			debug: noop,
		})
		try {
			const engine = new NullSoundEngine()
			expect(engine.playSound('missing')).to.equal(0)
			expect(engine.playSound('missing')).to.equal(0)
			expect(engine.isPlaying('missing')).to.equal(false)
			expect(warns.length).to.equal(1)
		} finally {
			Logger.setLogger(orig)
		}
	})

	it('should reuse the voice on restart and fan out without useSame', () => {
		const { engine, name } = tone()
		const first = engine.playSound(name, { volume: 0.5 })
		expect(first).to.be.above(0)
		expect(engine.isPlaying(name)).to.equal(true)
		const restarted = engine.playSound(name, { volume: 0.8 })
		expect(restarted).to.equal(first)
		const second = engine.playSound(name, { useSame: false, restart: false })
		expect(second).to.not.equal(first)
		expect(engine.isPlaying()).to.equal(true)
		engine.stopSound(name)
		expect(engine.isPlaying(name)).to.equal(false)
		expect(engine.isPlaying()).to.equal(false)
	})

	it('should ignore empty names and unknown stops', () => {
		const engine = new NullSoundEngine()
		expect(engine.playSound('')).to.equal(0)
		expect(() => engine.stopSound('never-registered')).to.not.throw()
		expect(() => engine.stopSound('')).to.not.throw()
	})

	it('should match sample names case-insensitively', () => {
		const { engine } = tone('FlipperUp')
		expect(engine.hasSample('flipperup')).to.equal(true)
		expect(engine.playSound('FLIPPERUP')).to.be.above(0)
	})

	it('should fire the knocker for knock names and FireKnocker', () => {
		const { engine } = tone()
		engine.playSound('knock')
		expect(engine.getKnockCount()).to.equal(1)
		engine.playSound('Knocker')
		expect(engine.getKnockCount()).to.equal(2)
		engine.fireKnocker(3)
		expect(engine.getKnockCount()).to.equal(5)
		engine.fireKnocker(0)
		engine.fireKnocker(-2)
		expect(engine.getKnockCount()).to.equal(5)
	})

	it('should ignore non-finite knocker counts without poisoning the count', () => {
		const { engine } = tone()
		engine.fireKnocker(2)
		engine.fireKnocker(NaN)
		engine.fireKnocker(Infinity)
		expect(engine.getKnockCount()).to.equal(2)
	})

	it('should warn on stopping missing samples but not on silent registered ones', () => {
		const warns: unknown[][] = []
		const orig = Logger.logger()
		const noop = () => {}
		Logger.setLogger({
			wtf: noop,
			error: noop,
			warn: (...a: unknown[]) => void warns.push(a),
			info: noop,
			debug: noop,
		})
		try {
			const { engine, name } = tone()
			engine.stopSound(name)
			expect(warns.length).to.equal(0)
			engine.stopSound('missing')
			engine.stopSound('missing')
			expect(warns.length).to.equal(1)
		} finally {
			Logger.setLogger(orig)
		}
	})

	it('should ignore non-finite volumes', () => {
		const { engine } = tone()
		engine.setVolume(0.4)
		engine.setMusicVolume(0.3)
		engine.setVolume(NaN)
		engine.setMusicVolume(NaN)
		expect(engine.getVolume()).to.be.closeTo(0.4, 1e-9)
		expect(engine.getMusicVolume()).to.be.closeTo(0.3, 1e-9)
	})

	it('should mute with volume restore', () => {
		const { engine } = tone()
		engine.setVolume(0.4)
		expect(engine.getVolume()).to.be.closeTo(0.4, 1e-9)
		engine.setMuted(true)
		expect(engine.isMuted()).to.equal(true)
		expect(engine.getVolume()).to.equal(0)
		engine.setMuted(false)
		expect(engine.getVolume()).to.be.closeTo(0.4, 1e-9)
		engine.setVolume(99)
		expect(engine.getVolume()).to.equal(1)
		engine.setVolume(-1)
		expect(engine.getVolume()).to.equal(0)
	})

	it('should stop music on an empty PlayMusic name', () => {
		const engine = new NullSoundEngine()
		engine.playMusic('theme', 0.7)
		expect(engine.getMusic()).to.deep.equal({ name: 'theme', volume: 0.7 })
		engine.playMusic('')
		expect(engine.getMusic()).to.equal(null)
	})

	it('should track music state and volume', () => {
		const engine = new NullSoundEngine()
		expect(engine.getMusic()).to.equal(null)
		engine.playMusic('theme', 0.7)
		expect(engine.getMusic()).to.deep.equal({ name: 'theme', volume: 0.7 })
		engine.setMusicVolume(0.3)
		expect(engine.getMusicVolume()).to.be.closeTo(0.3, 1e-9)
		engine.endMusic()
		expect(engine.getMusic()).to.equal(null)
	})

	it('should count emulator PCM frames and ignore junk', () => {
		const engine = new NullSoundEngine()
		expect(extractPcm(null)).to.equal(null)
		expect(extractPcm({})).to.equal(null)
		engine.pushEmuPcm(null)
		engine.pushEmuPcm({ samples: [] })
		expect(engine.getEmuFrames()).to.equal(0)
		engine.pushEmuPcm(new Float32Array(128))
		engine.pushEmuPcm({ samples: new Float32Array(64) })
		engine.pushEmuPcm({ pcm: [0.1, -0.1] })
		expect(engine.getEmuFrames()).to.equal(194)
	})

	it('should clear voices and samples on dispose', () => {
		const { engine, name } = tone()
		engine.playSound(name)
		engine.fireKnocker(1)
		engine.dispose()
		expect(engine.isPlaying(name)).to.equal(false)
		expect(engine.hasSample(name)).to.equal(false)
		expect(engine.playSound(name)).to.equal(0)
	})
})

describe('Sound synth pool', () => {
	it('should synthesize finite knocker and tone PCM inline', () => {
		const knock = knockPcm(8000)
		expect(knock.length).to.equal(Math.floor(8000 * 0.18))
		expect([...knock].every(v => Number.isFinite(v) && Math.abs(v) <= 1)).to.equal(true)
		expect(Math.abs(knock.at(0) ?? 0)).to.be.above(0)
		expect(Math.abs(knock.at(-1) ?? 1)).to.be.below(0.05)
		const toneBuffer = tonePcm(440, 0.05, 8000)
		expect(toneBuffer.length).to.equal(400)
		expect([...toneBuffer].every(v => Number.isFinite(v) && Math.abs(v) <= 0.5)).to.equal(true)
	})

	it('should synthesize knocker and tone PCM', async () => {
		const knock = await synthKnock(8000)
		expect(knock).to.be.instanceOf(Float32Array)
		expect(knock.length).to.be.above(0)
		const toneBuffer = await synthTone(440, 0.05, 8000)
		expect(toneBuffer.length).to.equal(400)
	})
})
