#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import { openDocument, writeDocument, addPage } from './tools/document'
import { scanProject, readProjectFiles } from './tools/context'
import { getAnalysisSchema, saveAnalysis } from './tools/analysis'

const server = new Server(
  { name: 'vibedocs', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'vibedocs_open_document',
      description:
        'Read a VibeDocs markdown document. Returns paginated content and existing analysis sessions.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the .md document' }
        },
        required: ['file_path']
      }
    },
    {
      name: 'vibedocs_write_document',
      description:
        'Write content to a VibeDocs document. Can write the entire document or update a single page by index.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the .md document' },
          content: { type: 'string', description: 'Content to write' },
          page_index: {
            type: 'number',
            description: 'If provided, only update this page (0-based index)'
          }
        },
        required: ['file_path', 'content']
      }
    },
    {
      name: 'vibedocs_add_page',
      description: 'Add a new feature page to a VibeDocs document.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the .md document' },
          page_name: { type: 'string', description: 'Name for the new page' }
        },
        required: ['file_path', 'page_name']
      }
    },
    {
      name: 'vibedocs_scan_project',
      description:
        'Scan a project directory and return a file manifest (docs, config, code files). Skips node_modules, .git, etc.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          project_dir: { type: 'string', description: 'Absolute path to the project root' },
          exclude_file: {
            type: 'string',
            description: 'Optional file path to exclude from results'
          }
        },
        required: ['project_dir']
      }
    },
    {
      name: 'vibedocs_read_project_files',
      description: 'Read the contents of specific project files by their absolute paths.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          file_paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of absolute file paths to read'
          },
          max_total_size: {
            type: 'number',
            description: 'Max total bytes to read (default 200KB)'
          }
        },
        required: ['file_paths']
      }
    },
    {
      name: 'vibedocs_get_analysis_schema',
      description:
        'Get the VibeDocs analysis framework: system prompt, 8 completeness dimensions, and expected JSON response format. Use this to understand how to analyze a PRD document.',
      inputSchema: {
        type: 'object' as const,
        properties: {}
      }
    },
    {
      name: 'vibedocs_save_analysis',
      description:
        'Save a PRD analysis result (questions + completeness scores) for a specific page. Data is shared with the VibeDocs Electron app.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          file_path: { type: 'string', description: 'Absolute path to the .md document' },
          page_index: { type: 'number', description: 'Page index (0-based)' },
          analysis: {
            type: 'object',
            description: 'Analysis result with questions and completeness scores',
            properties: {
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['open-ended', 'multiple-choice'] },
                    text: { type: 'string' },
                    category: { type: 'string' },
                    options: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          text: { type: 'string' },
                          type: { type: 'string', enum: ['select-all'] }
                        },
                        required: ['text']
                      }
                    }
                  },
                  required: ['type', 'text', 'category']
                }
              },
              completeness: {
                type: 'object',
                properties: {
                  overall: { type: 'number' },
                  breakdown: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        dimension: { type: 'string' },
                        score: { type: 'number' },
                        suggestion: { type: 'string' }
                      },
                      required: ['dimension', 'score', 'suggestion']
                    }
                  }
                },
                required: ['overall', 'breakdown']
              }
            },
            required: ['questions', 'completeness']
          }
        },
        required: ['file_path', 'page_index', 'analysis']
      }
    }
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'vibedocs_open_document': {
        const result = await openDocument(args!.file_path as string)
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }
      case 'vibedocs_write_document':
      case 'vibedocs_add_page':
        // These tools are defined for future use but not currently in the ALLOWED_TOOLS whitelist.
        return {
          content: [{ type: 'text', text: `Tool ${name} is not enabled in this context.` }],
          isError: true
        }
      case 'vibedocs_scan_project': {
        const result = await scanProject(
          args!.project_dir as string,
          args!.exclude_file as string | undefined
        )
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }
      case 'vibedocs_read_project_files': {
        const result = await readProjectFiles(
          args!.file_paths as string[],
          args!.max_total_size as number | undefined
        )
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }
      case 'vibedocs_get_analysis_schema': {
        const result = getAnalysisSchema()
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      }
      case 'vibedocs_save_analysis': {
        const result = await saveAnalysis(
          args!.file_path as string,
          args!.page_index as number,
          args!.analysis as Parameters<typeof saveAnalysis>[2]
        )
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      }
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true
        }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true
    }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('MCP server failed to start:', err)
  process.exit(1)
})
