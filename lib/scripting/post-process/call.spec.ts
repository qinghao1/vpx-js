// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { expect } from 'chai'
import { Grammar } from '../grammar/grammar.js'

let grammar: Grammar

before(async () => {
	grammar = new Grammar()
})

describe('The VBScript transpiler - Call', () => {
	it('should transpile a subcall statement without params', () => {
		const vbs = `BallRelease`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('BallRelease();')
	})

	it('should transpile a subcall statement without params using empty param', () => {
		const vbs = `BallRelease()`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('BallRelease();')
	})

	it('should transpile a subcall statement without params using empty params', () => {
		const vbs = `BallRelease()()`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('BallRelease()();')
	})

	it('should transpile a subcall statement with params', () => {
		const vbs = `BallRelease 5, -2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('BallRelease(5, -2);')
	})

	it('should transpile an object.property subcall statement without params', () => {
		const vbs = `BallRelease.CreateBall`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('BallRelease.CreateBall();')
	})

	it('should transpile an object.property subcall statement with params', () => {
		const vbs = `BallRelease.KickBall 0, -2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('BallRelease.KickBall(0, -2);')
	})

	it('should transpile an object.property subcall statement with params', () => {
		const vbs = `BallRelease.KickBall (0), -2`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('BallRelease.KickBall(0, -2);')
	})

	it('should transpile an object.property subcall statement with params', () => {
		const vbs = `BallRelease.KickBall 0, (-2)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('BallRelease.KickBall(0, -2);')
	})

	it('should transpile an object.property subcall statement with params', () => {
		const vbs = `BallRelease.KickBall (0), (-2)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('BallRelease.KickBall(0, -2);')
	})

	it('should transpile an object.object.property subcall statement with params', () => {
		const vbs = `BallRelease.Kicker.KickBall (0), (-2)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('BallRelease.Kicker.KickBall(0, -2);')
	})

	it('should transpile an subcall statement with function call params', () => {
		const vbs = `PlaySound SoundFX("fx_flipperup",DOFFlippers), 0, .67, AudioPan(RightFlipper), 0.05,0,0,1,AudioFade(RightFlipper)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal(
			`PlaySound(SoundFX('fx_flipperup', DOFFlippers), 0, 0.67, AudioPan(RightFlipper), 0.05, 0, 0, 1, AudioFade(RightFlipper));`,
		)
	})

	it('should transpile a call statement with one param', () => {
		const vbs = `Call mQue(ii)`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('mQue(ii);')
	})

	it('should transpile a call statement with multiple params', () => {
		const vbs = `Call mQue(ii)(3)(mQue(ii)(2))`
		const js = grammar.vbsToJs(vbs)
		expect(js).to.equal('mQue(ii)(3)(mQue(ii)(2));')
	})
})
