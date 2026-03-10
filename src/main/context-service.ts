import { readdir, readFile, stat } from 'fs/promises'
import { join, extname, basename } from 'path'

// Extensions to scan (docs, config, AND code)
const SCAN_EXTENSIONS = new Set([
  // Docs & config
  '.md', '.txt', '.json', '.yaml', '.yml', '.toml',
  // Code
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.rb', '.php',
  '.swift', '.kt', '.cs', '.cpp', '.c', '.h',
  '.vue', '.svelte', '.astro',
  '.css', '.scss', '.less',
  '.sql', '.graphql', '.proto',
  '.sh', '.zsh', '.bash',
  // Config-ish
  '.env.example', '.gitignore', '.eslintrc', '.prettierrc'
])

// Specific filenames always worth including
const ALWAYS_INCLUDE_NAMES = new Set([
  'Dockerfile', 'Makefile', 'justfile',
  'README', 'LICENSE', 'CHANGELOG',
  '.gitignore', '.env.example'
])

// Skip these files (generated/binary/lock)
const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
  '.DS_Store', 'thumbs.db'
])

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'out', 'build', '.next', '.nuxt',
  '.cache', '.turbo', 'coverage', '__pycache__', '.venv', 'venv',
  'target', '.idea', '.vscode', '.angular', '.svelte-kit',
  'assets', '.output', '.vercel', '.netlify'
])

export interface ScannedFile {
  relativePath: string
  absolutePath: string
  size: number
}

/**
 * Scan ALL project files (docs, config, code) and return their paths.
 * This is used to build a manifest for the AI to select from.
 */
export async function scanAllFiles(
  projectDir: string,
  excludeFile?: string
): Promise<ScannedFile[]> {
  const files: ScannedFile[] = []

  async function walk(dir: string, depth = 0): Promise<void> {
    if (depth > 4) return

    try {
      const entries = await readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        const relativePath = fullPath.slice(projectDir.length + 1)

        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            await walk(fullPath, depth + 1)
          }
        } else if (entry.isFile()) {
          if (excludeFile && fullPath === excludeFile) continue
          if (SKIP_FILES.has(entry.name)) continue
          if (entry.name.endsWith('.min.js') || entry.name.endsWith('.map')) continue

          const ext = extname(entry.name).toLowerCase()
          const name = basename(entry.name)

          if (
            SCAN_EXTENSIONS.has(ext) ||
            ALWAYS_INCLUDE_NAMES.has(name)
          ) {
            try {
              const fileStat = await stat(fullPath)
              if (fileStat.size <= 100 * 1024 && fileStat.size > 0) {
                files.push({ relativePath, absolutePath: fullPath, size: fileStat.size })
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch {
      // skip unreadable dirs
    }
  }

  await walk(projectDir)
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

/**
 * Read specific files by absolute path. Returns contents for each readable file.
 * Caps total read at maxTotalSize bytes.
 */
export async function readFiles(
  absolutePaths: string[],
  maxTotalSize = 200 * 1024
): Promise<{ path: string; content: string }[]> {
  const result: { path: string; content: string }[] = []
  let totalSize = 0

  for (const filePath of absolutePaths) {
    try {
      const fileStat = await stat(filePath)
      if (totalSize + fileStat.size > maxTotalSize) continue

      const content = await readFile(filePath, 'utf-8')
      result.push({ path: filePath, content })
      totalSize += fileStat.size
    } catch {
      // skip unreadable
    }
  }

  return result
}
