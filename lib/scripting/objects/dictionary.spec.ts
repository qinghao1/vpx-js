// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { ERR } from '../stdlib/err.js'
import { Dictionary } from './dictionary.js'

chai.use((sinonChai as any).default ?? sinonChai)
describe('The VBScript dictionary', () => {
	before(() => {
		ERR.OnErrorResumeNext()
	})

	after(() => {
		ERR.OnErrorGoto0()
	})

	it('should read and write values', () => {
		const d = new Dictionary()
		d.Add('myKey', 'myValue')

		expect(d.Item['myKey']).to.equal('myValue')
	})

	it('should read and write values via property', () => {
		const d = new Dictionary()
		d.Item['myKey'] = 'myValue'
		expect(d.Item['myKey']).to.equal('myValue')
		expect(d.Count).to.equal(1)
	})

	it('should check if a value exists', () => {
		const d = new Dictionary()
		d.Add('myKey2', 'myValue')

		expect(d.Exists('myKey')).to.equal(false)
		expect(d.Exists('myKey2')).to.equal(true)
	})

	it('should count the items', () => {
		const d = new Dictionary()
		d.Add('a', 'Athens')
		d.Add('b', 'Belgrade')
		d.Add('c', 'Cairo')

		expect(d.Count).to.equal(3)
	})

	it('should remove one item', () => {
		const d = new Dictionary()
		d.Add('a', 'Athens')
		d.Add('b', 'Belgrade')
		d.Add('c', 'Cairo')

		d.Remove('b')
		expect(d.Count).to.equal(2)
	})

	it('should remove all items', () => {
		const d = new Dictionary()
		d.Add('a', 'Athens')
		d.Add('b', 'Belgrade')
		d.Add('c', 'Cairo')

		d.RemoveAll()
		expect(d.Count).to.equal(0)
	})

	it('should count change a key', () => {
		const d = new Dictionary()
		d.Add('a', 'Athens')
		d.Add('b', 'Belgrade')
		d.Add('c', 'Cairo')

		d.Key['a'] = 'aa'
		expect(d.Item['aa']).to.equal('Athens')
	})

	it('should retrieve all keys', () => {
		const d = new Dictionary()
		d.Add('a', 'Athens')
		d.Add('b', 'Belgrade')
		d.Add('c', 'Cairo')

		expect(d.Keys()).to.eql(['a', 'b', 'c'])
	})

	it('should retrieve all items', () => {
		const d = new Dictionary()
		d.Add('a', 'Athens')
		d.Add('b', 'Belgrade')
		d.Add('c', 'Cairo')

		expect(d.Items()).to.eql(['Athens', 'Belgrade', 'Cairo'])
	})

	it('should create an empty value', () => {
		const d = new Dictionary()
		const n = d.Item['new']

		expect(n).to.be.null
		expect(d.Item['new']).to.be.null
	})

	it('should fail adding an existing item', () => {
		const d = new Dictionary()
		d.Add('a', 'Athens')
		d.Add('b', 'Belgrade')
		d.Add('b', 'Cairo')

		expect(ERR.Number).to.equal(457)
	})

	it('should fail changing a non-existing key', () => {
		const d = new Dictionary()
		d.Add('a', 'Athens')
		d.Add('b', 'Belgrade')

		d.Key['bb'] = 'bbb'
		expect(ERR.Number).to.equal(32811)
	})

	it('should fail removing a non-existing item', () => {
		const d = new Dictionary()
		d.Add('a', 'Athens')
		d.Add('b', 'Belgrade')
		d.Add('c', 'Cairo')

		d.Remove('nonexistent')
		expect(ERR.Number).to.equal(32811)
	})
})
