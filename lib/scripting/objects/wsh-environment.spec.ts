// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { WshEnvironment } from './wsh-environment.js'

chai.use((sinonChai as any).default ?? sinonChai)
describe('The VBScript windows environment object', () => {
	it('should write and read values', () => {
		const env = new WshEnvironment()
		env.Item.key = 'Value'
		expect(env.Item.key).to.equal('Value')
	})

	it('should count the values', () => {
		const env = new WshEnvironment()
		env.Item.key = 'Value'
		expect(env.Count()).to.equal(1)
	})

	it('should remove a value', () => {
		const env = new WshEnvironment()
		env.Item.key = 'Value'
		env.Remove('key')
		expect(env.Count()).to.equal(0)
	})
})
