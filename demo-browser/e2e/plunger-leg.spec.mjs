// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { plungerChecks } from './helpers.mjs'

// Regression spec for the plunger leg's plunger selection.
//
// Walking Dead carries two plungers: an auto trough plunger parsed first
// and the script-driven manual `Plunger` second. The leg must judge the
// script-driven manual plunger, not blindly read plungers[0]. These tests
// drive the REAL leg against a fake page whose `window.vpx` mirrors the
// typed test API (state pulls, sendKey), replacing the old fake that poked
// the deleted `viewer.player` TS-player surface.

const makePlunger = (partIdx, name) => ({ partIdx, name, pull: 0 })

// Minimal window.vpx double: pulls mutate in place so every state read
// observes the current pull, like the engine-backed accessor.
const makeVpx = ({ plungers, balls = [], onKey }) => {
	const state = { mode: 'play', wasmReady: true, plungers, balls }
	return {
		get state() {
			return state
		},
		whenReady: async () => {},
		setMode: async mode => {
			state.mode = mode
		},
		sendKey: (code, down) => onKey?.(code, down, state),
		nudge: () => {},
		step: () => true,
		dmd: () => undefined,
	}
}

const runLeg = async api => {
	const prevWindow = globalThis.window
	globalThis.window = { vpx: api }
	try {
		// Puppeteer passes extra args through to the page function.
		const page = { evaluate: async (fn, ...args) => fn(...args) }
		return await plungerChecks(page)
	} finally {
		globalThis.window = prevWindow
	}
}

// TWD layout: auto plunger first, manual plunger second. Enter pulls the
// manual one (the script runs Plunger.Pullback / Plunger.Fire).
const makeTwdLike = () => {
	const auto = makePlunger(0, 'Plunger1')
	const manual = makePlunger(1, 'Plunger')
	const api = makeVpx({
		plungers: [auto, manual],
		onKey: code => {
			if (code === 'Enter') manual.pull = 0.9
		},
	})
	api.__release = () => {
		manual.pull = 0
	}
	const origSend = api.sendKey
	api.sendKey = (code, down) => {
		if (code === 'Enter' && !down) api.__release()
		else origSend(code, down)
	}
	return api
}

describe('plungerChecks leg', () => {
	it('passes when Enter pulls the manual plunger behind an auto plungers[0]', async () => {
		const out = await runLeg(makeTwdLike())
		assert.equal(out.pass, true, `expected pass, got ${JSON.stringify(out)}`)
		assert.ok(out.travel > 0.05, `expected travel, got ${JSON.stringify(out)}`)
		assert.equal(out.best, 'Plunger', `expected manual best, got ${JSON.stringify(out)}`)
		assert.ok(
			(out.measured || []).includes('Plunger'),
			`expected manual Plunger measured, got ${JSON.stringify(out)}`,
		)
	})

	it('still passes for a single manual plunger table', async () => {
		const manual = makePlunger(0, 'Plunger')
		const api = makeVpx({
			plungers: [manual],
			onKey: (code, down) => {
				if (code === 'Enter') manual.pull = down ? 0.85 : 0
			},
		})
		const out = await runLeg(api)
		assert.equal(out.pass, true, `expected pass, got ${JSON.stringify(out)}`)
	})

	it('falls back to all plungers when the table only has auto plungers', async () => {
		const auto = makePlunger(0, 'Plunger1')
		const api = makeVpx({ plungers: [auto], onKey: () => {} })
		// ROM solenoid fires the auto plunger mid-hold.
		setTimeout(() => {
			auto.pull = 0.8
		}, 200)
		const out = await runLeg(api)
		assert.equal(out.pass, true, `expected pass, got ${JSON.stringify(out)}`)
	})

	it('skips honestly when the table has no plunger', async () => {
		const out = await runLeg(makeVpx({ plungers: [] }))
		assert.equal(out.pass, 'skip', `expected skip, got ${JSON.stringify(out)}`)
	})
})
