// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { expect } from 'chai'
import { createFrameMeter, type FrameReading } from './frame-meter.js'

/** Drive a meter with `ticks` of [timestamp, presented]; return every reading it produced. */
function run(ticks: [number, boolean][]): FrameReading[] {
	const meter = createFrameMeter(0)
	return ticks.flatMap(([t, presented]) => meter(t, presented) ?? [])
}
const frames = (from: number, to: number, stepMs: number, presented = true): [number, boolean][] =>
	Array.from({ length: Math.floor((to - from) / stepMs) + 1 }, (_, i) => [from + i * stepMs, presented])

describe('createFrameMeter', () => {
	it('reads the present rate once per window', () => {
		const readings = run(frames(0, 1050, 1000 / 60))
		expect(readings).to.have.length(2)
		expect(readings[0]).to.deep.equal({ fps: 60, busy: true })
	})

	it('reads idle (0) when nothing presents, and is not busy', () => {
		expect(run(frames(0, 600, 1000 / 60, false))[0]).to.deep.equal({ fps: 0, busy: false })
	})

	it('measures only back-to-back presents, not the idle gaps between them', () => {
		// 10 frames at 60 Hz, then idle for the rest of the window.
		const reading = run([...frames(0, 150, 1000 / 60), ...frames(200, 600, 1000 / 60, false)])[0]
		expect(reading.fps).to.equal(60)
		expect(reading.busy, 'mostly idle: no GPU signal').to.equal(false)
	})

	it('ignores a stall instead of reading it as one very slow frame', () => {
		// Steady 60 Hz, a 5 s main-thread stall, then 60 Hz again.
		const ticks = [...frames(0, 400, 1000 / 60), ...frames(5400, 6400, 1000 / 60)]
		for (const { fps } of run(ticks)) expect(fps).to.be.within(59, 61)
	})

	it('still reports a genuinely slow GPU as busy, so quality can step down', () => {
		expect(run(frames(0, 1000, 100))[0]).to.deep.equal({ fps: 10, busy: true })
	})
})
