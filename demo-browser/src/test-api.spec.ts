// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { expect } from 'chai'
import { describe, it } from 'vitest'
import { createTestApi } from './test-api.js'
import type { Viewer } from './viewer.js'

function makeApi(calls: { nudge: [number, number][]; sendKey: [string, boolean][] }) {
	const viewer = {
		_nudge: (angle: number, force: number): void => {
			calls.nudge.push([angle, force])
		},
		_sendKey: (code: string, down: boolean): void => {
			calls.sendKey.push([code, down])
		},
	}
	return createTestApi(viewer as unknown as Viewer)
}

describe('test-api nudge routing', () => {
	it('routes api.nudge to viewer._nudge with the given angle and force', () => {
		const calls = { nudge: [] as [number, number][], sendKey: [] as [string, boolean][] }
		makeApi(calls).nudge(75, 2.0)
		expect(calls.nudge).to.deep.equal([[75, 2.0]])
	})

	it('defaults the nudge force like live input', () => {
		const calls = { nudge: [] as [number, number][], sendKey: [] as [string, boolean][] }
		makeApi(calls).nudge(90)
		expect(calls.nudge).to.deep.equal([[90, 2.6]])
	})

	it('forwards KeyZ presses to viewer._sendKey for the engine nudge key', () => {
		const calls = { nudge: [] as [number, number][], sendKey: [] as [string, boolean][] }
		const api = makeApi(calls)
		api.sendKey('KeyZ', true)
		api.sendKey('KeyZ', false)
		expect(calls.sendKey).to.deep.equal([
			['KeyZ', true],
			['KeyZ', false],
		])
		expect(calls.nudge).to.deep.equal([])
	})
})
