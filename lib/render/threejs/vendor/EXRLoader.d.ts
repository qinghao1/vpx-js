// Copyright (C) 2019 freezy <freezy@vpdb.io> — GPL-2.0 — see LICENSE
// Copyright (C) 2026 Chu Qinghao <6337103+qinghao1@users.noreply.github.com> — GPL-2.0 — see LICENSE

import { DataTextureLoader, LoadingManager, PixelFormat, TextureDataType } from '../../../refs.node.js';

export interface EXR {
	header: object;
	width: number;
	height: number;
	data: Float32Array;
	format: PixelFormat;
	type: TextureDataType;
}

/** EXRLoader. */
export class EXRLoader extends DataTextureLoader {

	constructor( manager?: LoadingManager );
	type: TextureDataType;

	parse( buffer: ArrayBuffer ) : EXR;
	setDataType( type: TextureDataType ): this;

}
