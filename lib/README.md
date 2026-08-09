# Modules

This library is written in Typescript, so in the code, we use ES2015 imports.
That's great, but we finally want to ship JavaScript code. That's when things
get hairy. What we would like to do is the following: 

- Ship JavaScript as tree-shakable ES2015 module using [`pkg.module`](https://github.com/rollup/rollup/wiki/pkg.module)
- Also ship JavaScript as CommonJS module for Node.js
- Include typings
- Ship code that works on both Node.js and in the browser

The last point is a bit tricky because Node.js and the browser don't have the
same APIs. What we do is use [`pkg.browser`](https://docs.npmjs.com/files/package.json#browser)
which will switch out a file when compiling for a browser environment.

The switched out file is [`refs.node.ts`](refs.node.ts), which is replaced by 
[`refs.browser.ts`](refs.browser.ts). Here we reference stuff we only want in 
one environment.

## Three.js

Three.js comes in three flavors.

1. As an CommonJS module (`build/three.js`)
2. As an ES2015 module (`build/three.module.js`)
3. As individual files (`src/*`)

In Typescript, when importing `from 'three'`, definitions point to the modules.
In the browser, that means the entire `three.module.js` is referenced and hence
included in the build. On Node.js, the CommonJS module is used (where we care less 
about tree-shaking).

We can [solve the tree-shaking problem](https://github.com/mrdoob/three.js/issues/9403)
by not importing `from 'three'` but from each file individually. So

```ts
import { Object3D } from 'three'; 
```
becomes
```ts
import { Object3D } from 'three/src/core/Object3D';
```

However, that will bork Node.js, because the source files use ES2015 imports
among each other, which isn't supported by Node.js. So we need to handle the two
separately.

What we ended up with are object exports in our reference files above. In
`refs.node.ts`, we have:

```ts
export { Object3D } from 'three';
```

In `refs.browser.ts`, we have:
```ts
export { Object3D } from 'three/src/core/Object3D';
```

And in our code we have:

```ts
import { Object3D } from '../refs.node';
```

So in Node.js, all three.js references point to the CommonJS module, while 
during browser builds they get they get switched out to tree-shakable `src` 
links. This works pretty well for the main three.js library.

### Three.js Example Code

Add-on loaders are imported directly from `three`:

```ts
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
```

`RGBELoader` was renamed to `HDRLoader` in three.js r180 and is no longer used.
No vendored copy is needed — Node ≥24 runs ESM natively, so `three/examples/jsm/*`
works in both Node and browser. All three.js core imports go through `refs.node.ts`
/ `refs.browser.ts` for platform switching.
