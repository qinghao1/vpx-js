// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

/**
 * Provides access to the collection of Windows environment variables.
 *
 * @see https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/windows-scripting/6s7w15a0%28v%3dvs.84%29
 */
export class WshEnvironment {
	/**
	 * Exposes a specified item from a collection.
	 * @see https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/windows-scripting/yzefkb42%28v%3dvs.84%29
	 */
	public Item: { [key: string]: string } = {}

	/**
	 * Returns the number of Windows environment variables on the local computer system (the number of items in an Environment collection).
	 * @see https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/windows-scripting/6kz722cz%28v%3dvs.84%29
	 */
	get length() {
		return Object.keys(this.Item).length
	}

	/**
	 * Returns the number of members in an object.
	 * @see https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/windows-scripting/6x47fysb%28v%3dvs.84%29
	 */
	public Count(): number {
		return this.length
	}

	/**
	 * Removes an existing environment variable.
	 * @param strName String value indicating the name of the environment variable you want to remove.
	 * @see https://docs.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/windows-scripting/218yba97%28v%3dvs.84%29
	 */
	public Remove(strName: string): void {
		delete this.Item[strName]
	}
}

export const globalEnvironment = new WshEnvironment()
