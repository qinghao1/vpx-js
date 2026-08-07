// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { DataTextureLoader, LoadingManager, PixelFormat, TextureDataType } from '../../../refs.node.js';

export interface RGBE {
	width: number;
	height: number;
	data: Float32Array | Uint8Array;
	header: string;
	gamma: number;
	exposure: number;
	format: PixelFormat;
	type: TextureDataType;
}

export /** RGBELoader. */
class RGBELoader extends DataTextureLoader {

	constructor( manager?: LoadingManager );
	type: TextureDataType;

	parse( buffer: ArrayBuffer ): RGBE;
	setDataType( type: TextureDataType ): this;

}
