// Copyright (C) 2026 Chu Qinghao — GPL-2.0 — see LICENSE
import { expect } from 'chai'
import { isPlaySurface, ownsKey } from './input-manager.js'

class FakeElement {
	constructor(
		private tag: string,
		private hit: (selectors: string) => boolean = () => false,
	) {}
	get tagName(): string {
		return this.tag
	}
	closest(selectors: string): unknown {
		return this.hit(selectors) ? this : null
	}
}

const RealElement = (globalThis as any).Element
beforeAll(() => {
	;(globalThis as any).Element = FakeElement
})
afterAll(() => {
	// Restoring `undefined` (when there was none) is enough: spec files run isolated per worker.
	;(globalThis as any).Element = RealElement
})

describe('isPlaySurface', () => {
	it('accepts the canvas and the page body', () => {
		expect(isPlaySurface(new FakeElement('CANVAS') as any)).to.equal(true)
		expect(isPlaySurface(new FakeElement('canvas') as any)).to.equal(true)
		expect(isPlaySurface(new FakeElement('BODY') as any)).to.equal(true)
		expect(isPlaySurface(new FakeElement('body') as any)).to.equal(true)
	})

	it('rejects controls, panels, and non-elements', () => {
		expect(isPlaySurface(new FakeElement('BUTTON') as any)).to.equal(false)
		expect(isPlaySurface(new FakeElement('INPUT') as any)).to.equal(false)
		expect(isPlaySurface(new FakeElement('DIV') as any)).to.equal(false)
		expect(isPlaySurface(null)).to.equal(false)
		expect(isPlaySurface({} as any)).to.equal(false)
	})
})

describe('ownsKey', () => {
	it('lets form fields and activating keys on buttons keep their keys', () => {
		const onInput = (selectors: string) => selectors.split(',').some(s => s.trim() === 'input')
		const onButton = (selectors: string) => selectors.includes('button')
		expect(ownsKey(new FakeElement('INPUT', onInput) as any, 'ShiftLeft')).to.equal(true)
		expect(ownsKey(new FakeElement('BUTTON', onButton) as any, 'Space')).to.equal(true)
		expect(ownsKey(new FakeElement('BUTTON', () => false) as any, 'Space')).to.equal(false)
		expect(ownsKey(new FakeElement('BUTTON', onButton) as any, 'ShiftLeft')).to.equal(false)
		expect(ownsKey(null, 'Space')).to.equal(false)
	})
})
