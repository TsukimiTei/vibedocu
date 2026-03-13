import { build } from 'esbuild'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

await build({
  entryPoints: [resolve(root, 'src/mcp-server/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: resolve(root, 'out/mcp-server/index.mjs'),
  // Bundle everything including @modelcontextprotocol/sdk for production packaging
  alias: {
    '@': resolve(root, 'src/renderer/src')
  },
  banner: {
    js: "import{createRequire}from'module';const require=createRequire(import.meta.url);"
  }
})

console.log('MCP server built → out/mcp-server/index.mjs')
