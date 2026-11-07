// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { readFileSync } from 'node:fs'
import { expect } from 'chai'

const css = readFileSync(new URL('./styles/app.css', import.meta.url), 'utf8')

describe('responsive toolbar never reflows', () => {
	it('volume slider overlays instead of growing the row', () => {
		const block = css.match(/#actions \.sound-control #sound-volume \{[^}]*\}/)?.[0]
		expect(block, 'slider rule exists').to.be.a('string')
		expect(block).to.match(/position:\s*absolute/)
	})

	it('touch and small screens get a mute toggle (no slider to reveal)', () => {
		expect(css).to.match(
			/@media\s*\(hover:\s*none\),\s*\(max-width:\s*640px\)[\s\S]*?#sound-volume\s*\{[^}]*display:\s*none/,
		)
	})

	it('no tap-reveal class grows the row', () => {
		expect(css, '.expanded must not drive the slider').to.not.match(/\.expanded[^{]*#sound-volume/)
	})

	it('toolbar is bounded with shrinkable labels and 44px targets', () => {
		const actions = css.match(/#actions \{[^}]*\}/)?.[0]
		expect(actions, '#actions rule exists').to.be.a('string')
		expect(actions).to.match(/max-width:/)
		expect(actions).to.match(/min-width:\s*0/)
		expect(css).to.match(/@media\s*\(max-width:\s*640px\)[\s\S]*?min-height:\s*44px/)
		expect(css).to.match(/@media\s*\(max-width:\s*640px\)[\s\S]*?min-width:\s*44px/)
	})
})
