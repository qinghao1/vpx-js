// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { WorkerLoadTracker } from './texture-dispatch.js'

function workers3(): [object, object, object] {
	return [{}, {}, {}]
}

describe('WorkerLoadTracker', () => {
	it('round-robins without playfield preference', () => {
		const tracker = new WorkerLoadTracker()
		const [a, b, c] = workers3()
		const workers = [a, b, c]
		expect(tracker.pick(workers, false, 0).worker).to.equal(a)
		expect(tracker.pick(workers, false, 1).worker).to.equal(b)
		expect(tracker.pick(workers, false, 2).worker).to.equal(c)
		expect(tracker.pick(workers, false, 3).worker).to.equal(a)
	})

	it('sends playfield work to the least-loaded worker without consuming a turn', () => {
		const tracker = new WorkerLoadTracker()
		const [a, b, c] = workers3()
		const workers = [a, b, c]
		tracker.busy(a)
		tracker.busy(a)
		tracker.busy(c)
		const picked = tracker.pick(workers, true, 1)
		expect(picked.worker).to.equal(b)
		expect(picked.next).to.equal(1)
	})

	it('floors counts at zero and forgets dropped workers', () => {
		const tracker = new WorkerLoadTracker()
		const [a, b] = workers3()
		tracker.idle(a)
		expect(tracker.pick([a, b], true, 0).worker).to.equal(a)
		tracker.busy(a)
		tracker.drop(a)
		expect(tracker.pick([b], true, 0).worker).to.equal(b)
	})

	it('throws on an empty pool in either branch', () => {
		const tracker = new WorkerLoadTracker()
		expect(() => tracker.pick([], false, 0)).to.throw('no decode worker')
		expect(() => tracker.pick([], true, 0)).to.throw('no decode worker')
	})

	it('resetAll clears the stale-bias error path', () => {
		const tracker = new WorkerLoadTracker()
		const [a, b] = workers3()
		const workers = [a, b]
		tracker.busy(a)
		tracker.busy(a)
		tracker.busy(b)
		tracker.resetAll()
		expect(tracker.pick(workers, true, 0).worker).to.equal(a)
	})
})
