// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { registry } from '../../io/global-registry.js'
import { VbsNotImplementedError } from '../vbs-api.js'
import { globalEnvironment, type WshEnvironment } from './wsh-environment.js'

/**
 * Provides access to the native Windows shell.
 *
 * @see https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/windows-scripting/aew9yb99(v=vs.84)?redirectedfrom=MSDN
 */
export class WshShell {
	/**
	 * Retrieves or changes the current active directory.
	 * @see https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/windows-scripting/3cc5edzd%28v%3dvs.84%29
	 */
	public CurrentDirectory: string = '.'

	/**
	 * Returns the WshEnvironment object (a collection of environment variables).
	 * @see https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/windows-scripting/fd7hxfdd%28v%3dvs.84%29
	 */
	public Environment: WshEnvironment = globalEnvironment

	/**
	 * Returns a SpecialFolders object (a collection of special folders).
	 * @see https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/windows-scripting/0ea7b5xe%28v%3dvs.84%29
	 * @ignore
	 */
	public SpecialFolders: {} = {}

	/** Activates an application window. (Not implemented.) */
	public AppActivate(_id: string | number): void {
		// only used in ultradmd which we currently ignore
		throw new VbsNotImplementedError()
	}

	/** Creates a new shortcut, or opens an existing shortcut. (Not implemented.) */
	public CreateShortcut(_strPathname: string): void {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/** Runs an application in a child command-shell. (Not implemented.) */
	public Exec(_strCommand: string): void {
		// no usages found (fortunately!)
		throw new VbsNotImplementedError()
	}

	/** Returns an environment variable's expanded value. (Not implemented.) */
	public ExpandEnvironmentStrings(_strString: string): void {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/** Adds an event entry to a log file. (Not implemented.) */
	public LogEvent(_intType: number, _strMessage: string, _strTarget?: string): void {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/** Displays text in a pop-up message box. (Not implemented.) */
	public Popup(
		_strText: string,
		_nSecondsToWait?: number,
		_strTitle?: string,
		_nType?: number,
		_intButton?: number,
	): void {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/** Deletes a key or one of its values from the registry. (Not implemented.) */
	public RegDelete(_strName: string): void {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/**
	 * Returns the value of a key or value-name from the registry.
	 * @param strName String value indicating the key or value-name whose value you want.
	 * @return Read value
	 * @see https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/windows-scripting/x05fawxd%28v%3dvs.84%29
	 */
	public RegRead(strName: string): unknown {
		return registry.regRead(strName)
	}

	/**
	 * Creates a new key, adds another value-name to an existing key (and assigns it a value), or changes the value of an existing value-name.
	 * @param strName String value indicating the key-name, value-name, or value you want to create, add, or change.
	 * @param anyValue The name of the new key you want to create, the name of the value you want to add to an existing key, or the new value you want to assign to an existing value-name.
	 * @param strType String value indicating the value's data type.
	 * @see https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/windows-scripting/yfdfhz1b%28v%3dvs.84%29
	 */
	public RegWrite(strName: string, anyValue: unknown, _strType?: string): void {
		registry.regWrite(strName, anyValue as string | number)
	}

	/** Runs a program in a new process. (Not implemented.) */
	public Run(_strCommand: string, _intWindowStyle?: number, _bWaitOnReturn?: boolean): void {
		// no usages found
		throw new VbsNotImplementedError()
	}

	/** Sends one or more keystrokes to the active window. (Not implemented.) */
	public SendKeys(_s: string): void {
		// no usages found
		throw new VbsNotImplementedError()
	}
}
