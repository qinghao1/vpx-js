import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { plungerChecks } from './helpers.mjs'

// Regression spec for the plunger leg's plunger selection.
//
// Walking Dead carries two plungers: `Plunger1` (auto, ROM-solenoid-fired,
// parsed first) and `Plunger` (manual, pulled by the table script on
// PlungerKey/Enter). The leg must judge the script-driven manual plunger,
// not blindly read plungers[0]. These tests drive the REAL leg against a
// fake page whose viewer mirrors that layout.

const makePlunger = (name, { auto }) => {
	let pos = 0.25
	return {
		getName: () => name,
		__set: v => {
			pos = v
		},
		getApi: () => ({ Position: () => pos, AutoPlunger: auto }),
	}
}

const runLeg = async viewer => {
	const prevWindow = globalThis.window
	globalThis.window = { viewer }
	try {
		const page = { evaluate: async fn => fn() }
		return await plungerChecks(page)
	} finally {
		globalThis.window = prevWindow
	}
}

// TWD layout: auto plunger first, manual plunger second. Enter pulls the
// manual one (the script runs Plunger.Pullback / Plunger.Fire).
const makeTwdLike = () => {
	const auto = makePlunger('Plunger1', { auto: true })
	const manual = makePlunger('Plunger', { auto: false })
	const viewer = {
		viewerMode: 'play',
		player: {
			balls: [],
			onKeyDown: () => {
				manual.__set(22)
			},
			onKeyUp: () => {
				manual.__set(0.25)
			},
		},
		table: { plungers: { Plunger1: auto, Plunger: manual } },
	}
	viewer.player.getPhysics = () => ({ emu: {} })
	return viewer
}

describe('plungerChecks leg', () => {
	it('passes when Enter pulls the manual plunger behind an auto plungers[0]', async () => {
		const out = await runLeg(makeTwdLike())
		assert.equal(out.pass, true, `expected pass, got ${JSON.stringify(out)}`)
		assert.ok(out.travel > 0.5, `expected travel, got ${JSON.stringify(out)}`)
		assert.ok(
			(out.measured || []).includes('Plunger'),
			`expected manual Plunger measured, got ${JSON.stringify(out)}`,
		)
	})

	it('still passes for a single manual plunger table', async () => {
		const manual = makePlunger('Plunger', { auto: false })
		const viewer = {
			viewerMode: 'play',
			player: {
				balls: [],
				onKeyDown: () => {
					manual.__set(22)
				},
				onKeyUp: () => {
					manual.__set(0.25)
				},
			},
			table: { plungers: { Plunger: manual } },
		}
		viewer.player.getPhysics = () => ({ emu: {} })
		const out = await runLeg(viewer)
		assert.equal(out.pass, true, `expected pass, got ${JSON.stringify(out)}`)
	})

	it('falls back to all plungers when the table only has auto plungers', async () => {
		const auto = makePlunger('Plunger1', { auto: true })
		const viewer = {
			viewerMode: 'play',
			player: {
				balls: [],
				onKeyDown: () => {},
				onKeyUp: () => {
					auto.__set(0.25)
				},
			},
			table: { plungers: { Plunger1: auto } },
		}
		viewer.player.getPhysics = () => ({ emu: {} })
		// ROM solenoid fires the auto plunger mid-hold.
		setTimeout(() => auto.__set(18), 200)
		const out = await runLeg(viewer)
		assert.equal(out.pass, true, `expected pass, got ${JSON.stringify(out)}`)
	})
})
