// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE
import { readFileSync } from 'node:fs'
import { expect } from 'chai'

const css = readFileSync(new URL('./styles/app.css', import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const rule = (selector: string) => css.match(new RegExp(`(?:^|\\n)${selector} \\{[^}]*\\}`))?.[0]

describe('chrome layout', () => {
	it('top bar is one wrapping flex row whose brand never forces a wrap', () => {
		expect(rule('#topbar')).to.match(/flex-wrap:\s*wrap/)
		expect(rule('#brand')).to.match(/flex:\s*1 1 0/)
		expect(rule('#brand')).to.match(/min-width:\s*0/)
	})

	it('toolbar buttons are icon-only with accessible names and touch-sized targets', () => {
		for (const id of ['help-btn', 'reset', 'fullscreen-btn', 'sound-btn', 'exit-play']) {
			const tag = html.match(new RegExp(`<button\\s+id="${id}"[^>]*>`))?.[0]
			expect(tag, id).to.be.a('string')
			expect(tag).to.match(/aria-label="[^"]+"/)
		}
		expect(rule('\\.icon-btn')).to.match(/width:\s*var\(--tap\)/)
		expect(css).to.match(/@media \(pointer: coarse\) \{\s*:root \{\s*--tap:\s*44px/)
	})

	it('volume slider exists only for mouse users, overlaying instead of growing the row', () => {
		expect(rule('#sound-volume')).to.match(/display:\s*none/)
		const mouse = css.slice(css.indexOf('@media (hover: hover) and (pointer: fine)'))
		expect(mouse).to.match(/#sound-volume \{[^}]*display:\s*block[^}]*position:\s*absolute/)
	})

	it('screen edges respect safe areas', () => {
		expect(html).to.match(/viewport-fit=cover/)
		expect(css).to.match(/--edge-t:\s*max\(var\(--gap\), env\(safe-area-inset-top\)\)/)
	})

	it('nothing over the live canvas in play is blurred', () => {
		for (const selector of ['#hud-toggle', '#debug-panel', '\\.key-btn', '#stream-progress'])
			expect(rule(selector), selector).to.not.match(/backdrop-filter/)
		expect(rule('body\\.is-play \\.toolbar')).to.match(/backdrop-filter:\s*none/)
	})
})
