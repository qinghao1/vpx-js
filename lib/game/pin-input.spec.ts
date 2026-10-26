// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import * as sinon from 'sinon'
import sinonChai from 'sinon-chai'
import { TableBuilder } from '../../test/table-builder.js'
import type { FlipperMover } from '../vpt/flipper/flipper-mover.js'
import type { Table } from '../vpt/table/table.js'
import type { IEmulator } from './iemulator.js'
import { AssignKey } from './key-code.js'
import { PinInput } from './pin-input.js'
import { Player } from './player.js'

chai.use((sinonChai as any).default ?? sinonChai)

describe('The VPinball input handler', () => {
	let table: Table
	let player: Player
	let scope: any

	beforeEach(() => {
		scope = {}
		// this just writes the key code to the scope so we can assert it later
		const vbs = `Sub Table1_KeyDown(ByVal keycode)\nkeyDown = keycode\nEnd Sub\nSub Table1_KeyUp(ByVal keycode)\nkeyUp = keycode\nEnd Sub\n`
		table = new TableBuilder().withTableScript(vbs).build('Table1')
		player = new Player(table).init(scope)
	})

	it('should react on left flipper key down', () => {
		player.onKeyDown({ code: 'ShiftLeft', key: 'Shift' })
		player.updatePhysics(20)
		expect(scope.keyDown).to.be.equal(player.getKey(AssignKey.LeftFlipperKey))
	})

	it('should react on plunger key down', () => {
		player.onKeyDown({ code: 'Enter', key: 'Enter' })
		player.updatePhysics(20)
		expect(scope.keyDown).to.be.equal(player.getKey(AssignKey.PlungerKey))
	})

	it('should react on some other key down', () => {
		player.onKeyDown({ code: 'KeyG', key: 'g' })
		player.updatePhysics(20)
		expect(scope.keyDown).to.be.equal(0x22)
	})

	it('should react on a key up', () => {
		player.onKeyUp({ code: 'ShiftRight', key: 'Shift' })
		player.updatePhysics(20)
		expect(scope.keyUp).to.be.equal(player.getKey(AssignKey.RightFlipperKey))
	})

	it('should not fire script events for unmapped keys', () => {
		// keyEventToDirectInputKey returns 0 when nothing maps; upstream
		// PushButtonEvent drops dik == 0 instead of firing KeyDown/KeyUp.
		player.onKeyDown({ code: '', key: 'Unidentified' })
		player.onKeyUp({ code: '', key: 'Unidentified' })
		player.updatePhysics(20)
		expect(scope.keyDown).to.equal(undefined)
		expect(scope.keyUp).to.equal(undefined)
	})
})

describe('flipper and plunger keys stay script-only', () => {
	function moverOf(table: Table, name: string): FlipperMover {
		const flipper = table.flippers[name]
		const api = flipper.getApi() as unknown as { mover: FlipperMover }
		return api.mover
	}

	it('should not rotate flippers when the script declines', () => {
		const vbs = `Sub Table1_KeyDown(ByVal keycode)\nkeyDown = keycode\nEnd Sub\nSub Table1_KeyUp(ByVal keycode)\nkeyUp = keycode\nEnd Sub\n`
		const table = new TableBuilder().withTableScript(vbs).addFlipper('LeftFlipper').build('Table1')
		const scope: any = {}
		const player = new Player(table).init(scope)
		const mover = moverOf(table, 'LeftFlipper')

		player.onKeyDown({ code: 'ShiftLeft', key: 'Shift' })
		player.updatePhysics(20)

		expect(scope.keyDown).to.be.equal(player.getKey(AssignKey.LeftFlipperKey))
		expect(mover.enableRotateEvent).to.be.equal(0)
	})

	it('should not rotate flippers on key release either', () => {
		const vbs = `Sub Table1_KeyDown(ByVal keycode)\nkeyDown = keycode\nEnd Sub\nSub Table1_KeyUp(ByVal keycode)\nkeyUp = keycode\nEnd Sub\n`
		const table = new TableBuilder().withTableScript(vbs).addFlipper('RightFlipper').build('Table1')
		const scope: any = {}
		const player = new Player(table).init(scope)
		const mover = moverOf(table, 'RightFlipper')

		player.onKeyDown({ code: 'ShiftRight', key: 'Shift' })
		player.onKeyUp({ code: 'ShiftRight', key: 'Shift' })
		player.updatePhysics(20)

		expect(mover.enableRotateEvent).to.be.equal(0)
	})

	it('should not pull or fire the plunger directly', () => {
		const vbs = `Sub Table1_KeyDown(ByVal keycode)\nkeyDown = keycode\nEnd Sub\nSub Table1_KeyUp(ByVal keycode)\nkeyUp = keycode\nEnd Sub\n`
		const table = new TableBuilder().withTableScript(vbs).build('Table1')
		const scope: any = {}
		const player = new Player(table).init(scope)
		const plungerApi = { PullBack: sinon.spy(), Fire: sinon.spy() }
		table.plungers.WatchedPlunger = { getApi: () => plungerApi } as any

		player.onKeyDown({ code: 'Enter', key: 'Enter' })
		player.updatePhysics(20)
		player.onKeyUp({ code: 'Enter', key: 'Enter' })
		player.updatePhysics(20)

		expect(scope.keyDown).to.be.equal(player.getKey(AssignKey.PlungerKey))
		expect(plungerApi.PullBack).to.not.have.been.called
		expect(plungerApi.Fire).to.not.have.been.called
	})

	it('should still rotate flippers when the script commands it', () => {
		const vbs = `Sub Table1_KeyDown(ByVal keycode)\nIf keycode = LeftFlipperKey Then LeftFlipper.RotateToEnd()\nEnd Sub\n`
		const table = new TableBuilder().withTableScript(vbs).addFlipper('LeftFlipper').build('Table1')
		const scope: any = {}
		const player = new Player(table).init(scope)
		scope.LeftFlipperKey = player.getKey(AssignKey.LeftFlipperKey)
		const mover = moverOf(table, 'LeftFlipper')

		player.onKeyDown({ code: 'ShiftLeft', key: 'Shift' })
		player.updatePhysics(20)

		expect(mover.enableRotateEvent).to.be.equal(1)
	})
})

describe('free-play helpers (vpx-js-only)', () => {
	const coinScript = 'Const swCoin1 = 10\nSub Table1_KeyDown(ByVal keycode)\nEnd Sub\n'

	type SwitchCall = { nr: number; enable: boolean | undefined }

	function fakeEmu(log: SwitchCall[]): IEmulator {
		return {
			isMock: true,
			isInitialized: () => false,
			emuSimulateCycle: () => 0,
			setSwitchInput: (nr: number, enable?: boolean) => {
				log.push({ nr, enable })
				return true
			},
		} as unknown as IEmulator
	}

	function enablesOf(log: SwitchCall[], nr: number): number {
		return log.filter(call => call.nr === nr && call.enable === true).length
	}

	it('delivers all auto-credits by advancing physics time alone', () => {
		const table = new TableBuilder().withTableScript(coinScript).build('Table1')
		const player = new Player(table).init({})
		const log: SwitchCall[] = []
		player.setEmulator(fakeEmu(log))
		player.updatePhysics(4000)
		expect(enablesOf(log, 10)).to.be.equal(7)
	})

	it('releases pulsed coin switches on physics time', () => {
		const table = new TableBuilder().withTableScript(coinScript).build('Table1')
		const player = new Player(table).init({})
		const log: SwitchCall[] = []
		player.getPhysics().emu = fakeEmu(log)
		player.onKeyDown({ code: 'Digit1', key: '1' })
		player.updatePhysics(20)
		expect(enablesOf(log, 10)).to.be.equal(1)
		player.updatePhysics(400)
		expect(log.filter(call => call.nr === 10 && call.enable === false).length).to.be.equal(1)
	})

	it('schedules auto-credits only once', () => {
		const table = new TableBuilder().withTableScript(coinScript).build('Table1')
		const player = new Player(table).init({})
		const log: SwitchCall[] = []
		player.setEmulator(fakeEmu(log))
		player.setEmulator(fakeEmu(log))
		player.updatePhysics(4000)
		expect(enablesOf(log, 10)).to.be.equal(7)
	})

	function setupTroughKick(): { player: Player; kicks: Array<[number, number]> } {
		const table = new TableBuilder().withTableScript(coinScript).addKicker('TroughExit').build('Table1')
		const player = new Player(table).init({})
		player.getPhysics().emu = fakeEmu([])
		const kickers = Object.values(table.kickers) as unknown as Array<{
			hit?: { ball?: unknown }
			getApi(): { Kick(angle: number, speed: number): void }
		}>
		const kicker = kickers[0]
		if (!kicker) throw new Error('expected trough kicker')
		kicker.hit = { ball: {} }
		const kicks: Array<[number, number]> = []
		// Assign without reading first: Player wraps script APIs in a proxy that caches methods on read.
		kicker.getApi().Kick = (angle: number, speed: number) => {
			kicks.push([angle, speed])
		}
		return { player, kicks }
	}

	function pressStart(player: Player): void {
		player.onKeyDown({ code: 'Digit1', key: '1' })
		player.updatePhysics(20)
	}

	it('ejects a trough ball on start with a mock emu by default', () => {
		const { player, kicks } = setupTroughKick()
		pressStart(player)
		expect(kicks).to.deep.equal([[60, 10]])
	})

	it('does not eject a trough ball when free play is disabled', () => {
		PinInput.freePlayDefault = false
		try {
			const { player, kicks } = setupTroughKick()
			pressStart(player)
			expect(kicks).to.deep.equal([])
		} finally {
			PinInput.freePlayDefault = true
		}
	})
})

describe('key repeat and debug keys', () => {
	it('should suppress key repeat but fire again after release', () => {
		const vbs = `Sub Table1_KeyDown(ByVal keycode)\nkeyDownCount = keyDownCount + 1\nEnd Sub\n`
		const table = new TableBuilder().withTableScript(vbs).build('Table1')
		const scope: any = { keyDownCount: 0 }
		const player = new Player(table).init(scope)

		player.onKeyDown({ code: 'ShiftLeft', key: 'Shift' })
		player.onKeyDown({ code: 'ShiftLeft', key: 'Shift' })
		player.updatePhysics(20)
		expect(scope.keyDownCount).to.equal(1)

		player.onKeyUp({ code: 'ShiftLeft', key: 'Shift' })
		player.onKeyDown({ code: 'ShiftLeft', key: 'Shift' })
		player.updatePhysics(40)
		expect(scope.keyDownCount).to.equal(2)
	})

	it('should deliver FrameCount, Enable3D and DBGBalls keys to the script', () => {
		// Upstream parity (InputManager::PushButtonEvent): every keyboard key
		// reaches script KeyDown/KeyUp — nothing is swallowed.
		const vbs = `Sub Table1_KeyDown(ByVal keycode)\nkeyDown = keycode\nEnd Sub\n`
		const table = new TableBuilder().withTableScript(vbs).build('Table1')
		const scope: any = {}
		const player = new Player(table).init(scope)

		const cases = [
			{ code: 'F11', assign: AssignKey.FrameCount },
			{ code: 'F10', assign: AssignKey.Enable3D },
			{ code: 'KeyO', assign: AssignKey.DBGBalls },
		] as const
		let time = 0
		for (const { code, assign } of cases) {
			player.onKeyDown({ code, key: code })
			player.updatePhysics((time += 20))
			expect(scope.keyDown).to.equal(player.getKey(assign))
			player.onKeyUp({ code, key: code })
			player.updatePhysics((time += 20))
		}
	})
})

describe('keyboard nudge guard', () => {
	it('should apply a left-tilt impulse when the script does not nudge', () => {
		const table = new TableBuilder().withTableScript('').build('Table1')
		const player = new Player(table).init({})
		const handler = player.getNudgeHandler()
		const spy = sinon.spy(handler, 'applyImpulse')
		try {
			player.onKeyDown({ code: 'KeyZ', key: 'z' })
			player.updatePhysics(20)
			expect(spy).to.have.been.calledOnce
			const [angle, force] = spy.args[0] as [number, number]
			expect(angle).to.be.within(60, 90)
			expect(force).to.be.within(1.2, 2.8)
		} finally {
			spy.restore()
		}
	})

	it('should skip the keyboard impulse when the script already nudged', () => {
		const vbs = `Sub Table1_KeyDown(ByVal keycode)\nNudge 90, 2\nEnd Sub\n`
		const table = new TableBuilder().withTableScript(vbs).build('Table1')
		const player = new Player(table).init({})
		const handler = player.getNudgeHandler()
		const spy = sinon.spy(handler, 'applyImpulse')
		try {
			player.onKeyDown({ code: 'KeyZ', key: 'z' })
			player.updatePhysics(20)
			expect(spy).to.have.been.calledOnceWithExactly(90, 2)
		} finally {
			spy.restore()
		}
	})
})

describe('flipper keys drive cabinet switches', () => {
	type SwitchCall = { nr: number; enable: boolean | undefined }

	function setupFlipperSwitches(): { player: Player; log: SwitchCall[] } {
		const table = new TableBuilder().withTableScript('').build('Table1')
		const player = new Player(table).init({})
		const log: SwitchCall[] = []
		player.getPhysics().emu = {
			isMock: true,
			emuSimulateCycle: () => 0,
			setSwitchInput: (nr: number, enable?: boolean) => {
				log.push({ nr, enable })
				return true
			},
		} as unknown as IEmulator
		return { player, log }
	}

	function callsOf(log: SwitchCall[]): Array<[number, boolean | undefined]> {
		return log.map(call => [call.nr, call.enable])
	}

	it('should pulse left flipper switches on key down and up', () => {
		const { player, log } = setupFlipperSwitches()
		player.onKeyDown({ code: 'ShiftLeft', key: 'Shift' })
		player.updatePhysics(20)
		expect(callsOf(log)).to.deep.equal([
			[84, true],
			[114, true],
			[112, true],
		])
		player.onKeyUp({ code: 'ShiftLeft', key: 'Shift' })
		player.updatePhysics(40)
		expect(callsOf(log)).to.deep.equal([
			[84, true],
			[114, true],
			[112, true],
			[84, false],
			[114, false],
			[112, false],
		])
	})

	it('should pulse right flipper switches on key down', () => {
		const { player, log } = setupFlipperSwitches()
		player.onKeyDown({ code: 'ShiftRight', key: 'Shift' })
		player.updatePhysics(20)
		expect(callsOf(log)).to.deep.equal([
			[82, true],
			[86, true],
			[112, true],
			[116, true],
		])
	})
})
