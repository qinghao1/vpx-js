// Vite worker URL imports: `import url from './x?worker&url'` yields the bundled worker file URL.
declare module '*?worker&url' {
	const src: string
	export default src
}
