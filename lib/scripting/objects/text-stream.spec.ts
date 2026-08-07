// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { VbsNotImplementedError } from '../vbs-api.js'
import type { File } from './file.js'
import { FileSystemObject } from './file-system-object.js'
import { TextStream } from './text-stream.js'

chai.use((sinonChai as any).default ?? sinonChai)
describe('The VBScript native text stream object', () => {
	it('should write and read a line', () => {
		const fs = new FileSystemObject()
		fs.CreateTextFile('test1.txt')
		const f = fs.GetFile('test1.txt') as File

		let ts = f.OpenAsTextStream(TextStream.MODE_WRITE, -2)
		ts.Write('Hello World')
		ts.Close()

		ts = f.OpenAsTextStream(TextStream.MODE_READ, -2)
		ts.Skip(3)
		expect(ts.ReadLine()).to.equal('lo World')
	})

	it('should have the cursor at the end of the stream when writing', () => {
		const fs = new FileSystemObject()
		fs.CreateTextFile('test1.txt')
		const f = fs.GetFile('test1.txt') as File

		const ts = f.OpenAsTextStream(TextStream.MODE_WRITE, -2)
		ts.Write('Hello World')

		expect(ts.AtEndOfStream).to.equal(true)
	})

	it('should read a given number of characters', () => {
		const fs = new FileSystemObject()
		fs.CreateTextFile('test1.txt')
		const f = fs.GetFile('test1.txt') as File

		let ts = f.OpenAsTextStream(TextStream.MODE_WRITE, -2)
		ts.Write('Hello World')

		ts = f.OpenAsTextStream(TextStream.MODE_READ, -2)
		expect(ts.Read(5)).to.equal('Hello')
	})

	it('should read a line', () => {
		const fs = new FileSystemObject()
		fs.CreateTextFile('test1.txt')
		const f = fs.GetFile('test1.txt') as File

		let ts = f.OpenAsTextStream(TextStream.MODE_WRITE, -2)
		ts.WriteLine('Line1')
		ts.WriteLine('Line2')

		ts = f.OpenAsTextStream(TextStream.MODE_READ, -2)
		expect(ts.ReadLine()).to.equal('Line1')
		expect(ts.ReadLine()).to.equal('Line2')
	})

	it('should skip a line while reading', () => {
		const fs = new FileSystemObject()
		fs.CreateTextFile('test1.txt')
		const f = fs.GetFile('test1.txt') as File

		let ts = f.OpenAsTextStream(TextStream.MODE_WRITE, -2)
		ts.WriteLine('Line1')
		ts.WriteLine('Line2')

		ts = f.OpenAsTextStream(TextStream.MODE_READ, -2)
		ts.SkipLine()
		expect(ts.ReadLine()).to.equal('Line2')
	})

	it('should read the entire file', () => {
		const fs = new FileSystemObject()
		fs.CreateTextFile('test1.txt')
		const f = fs.GetFile('test1.txt') as File

		let ts = f.OpenAsTextStream(TextStream.MODE_WRITE, -2)
		ts.WriteLine('Line1')
		ts.WriteLine('Line2')

		ts = f.OpenAsTextStream(TextStream.MODE_READ, -2)
		ts.SkipLine()
		expect(ts.ReadAll()).to.equal('Line1\r\nLine2\r\n')
	})

	it('should fail reading when mode is write', () => {
		const fs = new FileSystemObject()
		fs.CreateTextFile('test1.txt')
		const f = fs.GetFile('test1.txt') as File

		const ts = f.OpenAsTextStream(TextStream.MODE_WRITE, -2)
		expect(() => ts.Read(1)).to.throw('Bad file mode')
		expect(() => ts.ReadAll()).to.throw('Bad file mode')
		expect(() => ts.ReadLine()).to.throw('Bad file mode')
		expect(() => ts.Skip(1)).to.throw('Bad file mode')
		expect(() => ts.SkipLine()).to.throw('Bad file mode')
	})

	it('should throw an exception when using non-implemented APIs', () => {
		const ts = new TextStream('test.txt', true, 0)
		expect(() => ts.AtEndOfLine).to.throw(VbsNotImplementedError)
		expect(() => ts.WriteBlankLines(1)).to.throw(VbsNotImplementedError)
		expect(() => ts.Column).to.throw(VbsNotImplementedError)
		expect(() => ts.Line).to.throw(VbsNotImplementedError)
		expect(() => ts.Close()).not.to.throw(VbsNotImplementedError)
	})
})
