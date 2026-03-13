import { scanAllFiles, readFiles } from '../../main/context-service'

export async function scanProject(projectDir: string, excludeFile?: string) {
  const files = await scanAllFiles(projectDir, excludeFile)
  return {
    files: files.map((f) => ({ relativePath: f.relativePath, size: f.size })),
    total: files.length
  }
}

export async function readProjectFiles(filePaths: string[], maxTotalSize?: number) {
  const results = await readFiles(filePaths, maxTotalSize)
  return {
    files: results.map((f) => ({ path: f.path, content: f.content })),
    total: results.length
  }
}
