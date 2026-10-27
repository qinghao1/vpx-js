// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import * as chai from 'chai'
import { expect } from 'chai'
import sinonChai from 'sinon-chai'
import { VbsNotImplementedError } from '../vbs-api.js'
import { FS } from './file-system.js'
import { FileSystemObject } from './file-system-object.js'
import { TextStream } from './text-stream.js'

chai.use((sinonChai as any).default ?? sinonChai)
describe('The VBScript file system object', () => {
	beforeEach(() => {
		FS.clearAll()
	})

	it('should build a path', () => {
		const fso = new FileSystemObject()
		const path1 = fso.BuildPath('C:\\folder', 'file.txt')
		const path2 = fso.BuildPath('C:\\folder\\', 'file.txt')
		expect(path1).to.equal('C:\\folder\\file.txt')
		expect(path2).to.equal('C:\\folder\\file.txt')
	})

	it('should create a new text file', () => {
		const fso = new FileSystemObject()
		const textFile = fso.CreateTextFile('test.txt')
		expect(textFile).to.be.ok
		expect(FS.fileExists('TEST.txt')).to.equal(true)
	})

	it('should fail creating a new text file if already exists', () => {
		const fso = new FileSystemObject()
		fso.CreateTextFile('test.txt')
		expect(() => fso.CreateTextFile('test.txt', false)).to.throw('Error 58: File already exists')
	})

	it('should delete a file', () => {
		const fso = new FileSystemObject()
		fso.CreateTextFile('test.txt')
		fso.DeleteFile('test.txt')
		expect(FS.fileExists('TEST.txt')).to.equal(false)
	})

	it('should fail deleting a non-existent file', () => {
		const fso = new FileSystemObject()
		expect(() => fso.DeleteFile('test.txt')).to.throw('Error 53: File not found')
	})

	it('should check if a file exists', () => {
		const fso = new FileSystemObject()
		fso.CreateTextFile('test.txt')
		expect(fso.FileExists('TEST.txt')).to.equal(true)
		expect(fso.FileExists('TEST2.txt')).to.equal(false)
	})

	it('should check if a folder exists', () => {
		const fso = new FileSystemObject()
		fso.CreateTextFile('c:\\test\\test.txt')
		expect(fso.FolderExists('c:\\test')).to.equal(true)
		expect(fso.FolderExists('c:\\test2')).to.equal(false)
	})

	it('should return something as absolute path', () => {
		const fso = new FileSystemObject()
		expect(fso.GetAbsolutePathName('.')).to.equal('.')
	})

	it('should return the base name of a path', () => {
		const fso = new FileSystemObject()
		expect(fso.GetBaseName('c:\\a\\folder\\file.a.ext')).to.equal('file.a')
		expect(fso.GetBaseName('c:\\a\\folder\\file.ext')).to.equal('file')
		expect(fso.GetBaseName('c:\\a\\folder\\file')).to.equal('file')
		expect(fso.GetBaseName('c:\\a\\folder\\')).to.equal('folder')
	})

	it('should return the extension name of a path', () => {
		const fso = new FileSystemObject()
		expect(fso.GetExtensionName('c:\\a\\folder\\file.a.ext')).to.equal('ext')
		expect(fso.GetExtensionName('c:\\a\\folder\\file.ext')).to.equal('ext')
		expect(fso.GetExtensionName('c:\\a\\folder\\file')).to.equal('')
		expect(fso.GetExtensionName('c:\\a\\folder\\')).to.equal('')
	})

	it('should return an existing file', () => {
		const fso = new FileSystemObject()
		fso.CreateTextFile('c:\\test\\test.txt')
		expect(fso.GetFile('c:\\test\\test.txt')).to.be.ok
	})

	it('should fail returning a non-existent file', () => {
		const fso = new FileSystemObject()
		expect(() => fso.GetFile('c:\\test\\test.txt')).to.throw('Error 53: File not found')
	})

	it('should return the file name of a path', () => {
		const fso = new FileSystemObject()
		expect(fso.GetFileName('c:\\a\\folder\\file.a.ext')).to.equal('file.a.ext')
		expect(fso.GetFileName('c:\\a\\folder\\file.ext')).to.equal('file.ext')
		expect(fso.GetFileName('c:\\a\\folder\\file')).to.equal('file')
		expect(fso.GetFileName('c:\\a\\folder\\')).to.equal('folder')
	})

	it('should return empty strings for an empty path', () => {
		const fso = new FileSystemObject()
		expect(fso.GetBaseName('')).to.equal('')
		expect(fso.GetExtensionName('')).to.equal('')
		expect(fso.GetFileName('')).to.equal('')
	})

	it('should open a bundled text file', () => {
		const fso = new FileSystemObject()
		expect(fso.OpenTextFile('controller.vbs')).to.be.ok
	})

	it('should open an existing file', () => {
		const fso = new FileSystemObject()
		fso.CreateTextFile('test.txt')
		expect(fso.OpenTextFile('test.txt')).to.be.ok
	})

	it('should open an non-existent file', () => {
		const fso = new FileSystemObject()
		expect(fso.OpenTextFile('test.txt', 1, true)).to.be.ok
	})

	it('should fail with a non-existing file', () => {
		const fso = new FileSystemObject()
		expect(() => fso.OpenTextFile('test.txt', 1, false)).to.throw('Error 53: File not found')
	})

	it('should honor the open mode for existing files', () => {
		const fso = new FileSystemObject()
		;(fso.CreateTextFile('mode.txt') as TextStream).Write('Hello')
		const writer = fso.OpenTextFile('mode.txt', TextStream.MODE_WRITE) as TextStream
		expect(() => writer.Read(1)).to.throw('Error 54: Bad file mode')
	})

	it('should truncate when opening an existing file ForWriting', () => {
		const fso = new FileSystemObject()
		;(fso.CreateTextFile('truncate.txt') as TextStream).Write('Hello')
		const writer = fso.OpenTextFile('truncate.txt', TextStream.MODE_WRITE) as TextStream
		writer.Write('AB')
		const reader = fso.OpenTextFile('truncate.txt', TextStream.MODE_READ) as TextStream
		expect(reader.ReadAll()).to.equal('AB')
	})

	it('should position at the end when opening ForAppending', () => {
		const fso = new FileSystemObject()
		;(fso.CreateTextFile('append.txt') as TextStream).Write('Hello')
		const appender = fso.OpenTextFile('append.txt', TextStream.MODE_APPEND) as TextStream
		expect(appender.AtEndOfStream).to.equal(true)
		expect(() => appender.Read(1)).to.throw('Error 54: Bad file mode')
		appender.Write('!')
		expect((fso.OpenTextFile('append.txt', TextStream.MODE_READ) as TextStream).ReadAll()).to.equal('Hello!')
	})

	it('should fail writing when mode is read', () => {
		const fso = new FileSystemObject()
		fso.CreateTextFile('readonly.txt')
		const reader = fso.OpenTextFile('readonly.txt', TextStream.MODE_READ) as TextStream
		expect(() => reader.Write('x')).to.throw('Error 54: Bad file mode')
	})

	it('should throw an exception when using non-implemented APIs', () => {
		const fso = new FileSystemObject()
		expect(() => fso.Drives).to.throw(VbsNotImplementedError)
		expect(() => fso.CopyFile('a', 'b')).to.throw(VbsNotImplementedError)
		expect(() => fso.CopyFolder('a', 'b')).to.throw(VbsNotImplementedError)
		expect(() => fso.CreateFolder('a')).to.throw(VbsNotImplementedError)
		expect(() => fso.DeleteFolder('a')).to.throw(VbsNotImplementedError)
		expect(() => fso.DriveExists('a')).to.throw(VbsNotImplementedError)
		expect(() => fso.GetDrive('a')).to.throw(VbsNotImplementedError)
		expect(() => fso.GetDriveName('a')).to.throw(VbsNotImplementedError)
		expect(() => fso.GetFolder('a')).to.throw(VbsNotImplementedError)
		expect(() => fso.GetParentFolderName('a')).to.throw(VbsNotImplementedError)
		expect(() => fso.GetSpecialFolder(0)).to.throw(VbsNotImplementedError)
		expect(() => fso.GetTempName()).to.throw(VbsNotImplementedError)
		expect(() => fso.MoveFile('a', 'b')).to.throw(VbsNotImplementedError)
		expect(() => fso.MoveFolder('a', 'b')).to.throw(VbsNotImplementedError)
	})
})
