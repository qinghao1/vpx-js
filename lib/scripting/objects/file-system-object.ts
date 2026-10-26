// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { ERR } from '../stdlib/err.js'
import { VbsNotImplementedError } from '../vbs-api.js'
import type { Drive } from './drive.js'
import { File } from './file.js'
import { FS } from './file-system.js'
import { TextStream } from './text-stream.js'

/**
 * Provides access to a computer's file system.
 *
 * Probably gonna use something like https://github.com/jvilk/BrowserFS
 *
 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/filesystemobject-object
 */
export class FileSystemObject {
	private readonly SEP = `\\`

	private lastComponent(path: string): string {
		return (
			path
				.replace(/\\+/g, '/')
				.split('/')
				.filter(part => !!part)
				.at(-1) ?? ''
		)
	}

	/** Returns a Drives collection of all Drive objects on the local machine. (Not implemented.) */
	public get Drives(): Drive[] {
		throw new VbsNotImplementedError()
	}

	/**
	 * Appends a name to an existing path.
	 * @param path Existing path to which name is appended. Path can be absolute or relative and need not specify an existing folder.
	 * @param name Name being appended to the existing path.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/buildpath-method
	 */
	public BuildPath(path: string, name: string): string {
		return `${path}${path.endsWith(this.SEP) ? '' : this.SEP}${name}`
	}

	/** Copies one or more files from one location to another. (Not implemented.) */
	public CopyFile(_source: string, _destination: string, _overwrite = true): void {
		// only used in NVOffset(), which doesn't seem to be used very often.
		throw new VbsNotImplementedError()
	}

	/** Recursively copies a folder from one location to another. (Not implemented.) */
	public CopyFolder(_source: string, _destination: string, _overwrite = true): void {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/** Creates a folder. (Not implemented.) */
	public CreateFolder(_foldername: string): void {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/**
	 * Creates a specified file name and returns a {@link TextStream} object that can be used to read from or write to the file.
	 *
	 * @param filename String expression that identifies the file to create.
	 * @param overwrite Boolean value that indicates if an existing file can be overwritten. The value is True if the file can be overwritten; False if it can't be overwritten. If omitted, existing files can be overwritten.
	 * @param unicode Boolean value that indicates whether the file is created as a Unicode or ASCII file. The value is True if the file is created as a Unicode file; False if it's created as an ASCII file. If omitted, an ASCII file is assumed.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/createtextfile-method
	 */
	public CreateTextFile(filename: string, overwrite = true, unicode = false): TextStream | undefined {
		if (FS.fileExists(filename) && !overwrite) {
			return ERR.Raise(58, undefined, 'File already exists')
		}
		const textStream = new TextStream(filename, unicode, TextStream.MODE_APPEND)
		FS.addStream(filename, textStream)
		return textStream
	}

	/**
	 * Deletes a specified file.
	 * @param filespec The name of the file to delete. The filespec can contain wildcard characters in the last path component.
	 * @param force Boolean value that is True if files with the read-only attribute set are to be deleted; False (default) if they are not.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/deletefile-method
	 */
	public DeleteFile(filespec: string, _force = false): void {
		if (!FS.fileExists(filespec)) {
			return ERR.Raise(53, undefined, 'File not found')
		}
		FS.deleteFile(filespec)
	}

	/** Deletes a specified folder and its contents. (Not implemented.) */
	public DeleteFolder(_folderspec: string, _force = false): void {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/** Returns True if the specified drive exists; False if it does not. (Not implemented.) */
	public DriveExists(_drivespec: string): boolean {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/**
	 * Returns True if a specified file exists; False if it does not.
	 * @param filespec The name of the file whose existence is to be determined. A complete path specification (either absolute or relative) must be provided if the file isn't expected to exist in the current folder.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/fileexists-method
	 */
	public FileExists(filespec: string): boolean {
		return FS.fileExists(filespec)
	}

	/**
	 * Returns True if a specified folder exists; False if it does not.
	 * @param folderspec The name of the folder whose existence is to be determined. A complete path specification (either absolute or relative) must be provided if the folder isn't expected to exist in the current folder.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/folderexists-method
	 */
	public FolderExists(folderspec: string): boolean {
		return FS.folderExists(folderspec)
	}

	/**
	 * Returns a complete and unambiguous path from a provided path specification.
	 * @param pathspec Path specification to change to a complete and unambiguous path.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/getabsolutepathname-method
	 */
	public GetAbsolutePathName(pathspec: string): string {
		// unless we want to read real files like for ultradmd, we don't care about absolute paths.
		return pathspec
	}

	/**
	 * Returns a string containing the base name of the last component, less any file extension, in a path.
	 * @param path The path specification for the component whose base name is to be returned.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/getbasename-method
	 */
	public GetBaseName(path: string): string {
		const last = this.lastComponent(path)
		if (last.indexOf('.') >= 0) {
			return last.substr(0, last.lastIndexOf('.'))
		}
		return last
	}

	/** Returns a {@link Drive} object for the drive in a specified path. (Not implemented.) */
	public GetDrive(_drivespec: string): Drive {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/** Returns the drive name for a specified path. (Not implemented.) */
	public GetDriveName(_path: string): string {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/**
	 * Returns a string containing the extension name for the last component in a path.
	 * @param path The path specification for the component whose extension name is to be returned.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/getextensionname-method
	 */
	public GetExtensionName(path: string): string {
		const last = this.lastComponent(path)
		if (last.indexOf('.') >= 0) {
			return last.substr(last.lastIndexOf('.') + 1)
		}
		return ''
	}

	/**
	 * Returns a {@link File} object corresponding to the file in a specified path.
	 * @param filespec The filespec is the path (absolute or relative) to a specific file.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/getfile-method
	 */
	public GetFile(filespec: string): File | undefined {
		if (!FS.fileExists(filespec)) {
			return ERR.Raise(53, undefined, 'File not found')
		}
		return new File(filespec)
	}

	/**
	 * Returns the last component of a specified path that is not part of the drive specification.
	 * @param pathspec The path (absolute or relative) to a specific file.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/getfilename-method-visual-basic-for-applications
	 */
	public GetFileName(pathspec: string): string {
		return this.lastComponent(pathspec)
	}

	/** Returns a Folder object for the folder in a specified path. (Not implemented.) */
	public GetFolder(_folderspec: string): string {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/** Returns the parent folder name of the last path component. (Not implemented.) */
	public GetParentFolderName(_path: string): string {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/** Returns the special folder specified. (Not implemented.) */
	public GetSpecialFolder(_folderspec: number): {} {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/** Returns a randomly generated temporary file or folder name. (Not implemented.) */
	public GetTempName(): string {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/** Moves one or more files from one location to another. (Not implemented.) */
	public MoveFile(_source: string, _destination: string): void {
		// only used in NVOffset(), which doesn't seem to be used very often.
		throw new VbsNotImplementedError()
	}

	/** Moves one or more folders from one location to another. (Not implemented.) */
	public MoveFolder(_source: string, _destination: string): void {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/**
	 * Opens a specified file and returns a {@link TextStream} object that can be used to read from, write to, or append to the file.
	 * @param filename String expression that identifies the file to open.
	 * @param mode Indicates input/output mode. Can be one of three constants: ForReading, ForWriting, or ForAppending.
	 * @param create Boolean value that indicates whether a new file can be created if the specified filename doesn't exist. The value is True if a new file is created; False if it isn't created. The default is False.
	 * @param format One of three Tristate values used to indicate the format of the opened file. If omitted, the file is opened as ASCII.
	 * @see https://docs.microsoft.com/en-us/office/vba/language/reference/user-interface-help/opentextfile-method
	 */
	public OpenTextFile(filename: string, mode: number = 1, create = false, _format = 0): TextStream | undefined {
		if (!FS.fileExists(filename) && !create) {
			return ERR.Raise(53, undefined, 'File not found')
		}
		return FS.fileExists(filename)
			? FS.getStream(filename)
			: FS.addStream(filename, new TextStream(filename, false, mode))
	}
}
