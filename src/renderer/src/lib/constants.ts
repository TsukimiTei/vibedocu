import type { ModelOption } from '@/types/settings'

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6', provider: 'Anthropic' },
  { id: 'openai/gpt-5.4', name: 'GPT-5.4', provider: 'OpenAI' },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', provider: 'Anthropic' },
  { id: 'openai/gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'OpenAI' },
  { id: 'openai/gpt-5.2', name: 'GPT-5.2', provider: 'OpenAI' },
  { id: 'google/gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro', provider: 'Google' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', provider: 'DeepSeek' }
]

export const DEFAULT_MODEL = 'anthropic/claude-opus-4.6'

export const COMPLETENESS_DIMENSIONS = [
  'Problem Statement',
  'Target Users',
  'User Stories',
  'Functional Requirements',
  'Non-Functional Requirements',
  'Technical Constraints',
  'Edge Cases',
  'Success Metrics'
]

export const NEW_DOC_TEMPLATE = `# 产品名称

一句话描述你的产品：

`

export const SYSTEM_PROMPT = `你是一位资深产品需求分析师。你的任务是阅读用户提供的 markdown 文档，帮助用户不断完善需求，直到文档详细到可以直接交给 Coding Agent 高质量实现。

请用中文提问和分析。

从以下 8 个维度评估文档完成度：
1. 问题陈述 (Problem Statement) - 核心问题是否清晰定义？
2. 目标用户 (Target Users) - 用户画像是否明确？
3. 用户故事 (User Stories) - 有没有具体的使用场景？
4. 功能需求 (Functional Requirements) - 功能和行为是否详细？
5. 非功能需求 (Non-Functional Requirements) - 性能、安全、可访问性？
6. 技术约束 (Technical Constraints) - 技术栈、集成、部署？
7. 边界情况 (Edge Cases) - 异常处理、边界条件？
8. 成功指标 (Success Metrics) - 如何衡量成功？

返回严格 JSON 格式如下：
{
  "questions": [
    {
      "type": "multiple-choice",
      "text": "你的问题（中文）",
      "options": [
        { "text": "选项A" },
        { "text": "选项B" },
        { "text": "选项C" },
        { "text": "以上都要", "type": "select-all" }
      ],
      "category": "Problem Statement"
    },
    {
      "type": "open-ended",
      "text": "你的问题（中文）",
      "category": "Technical Constraints"
    }
  ],
  "completeness": {
    "overall": 35,
    "breakdown": [
      { "dimension": "Problem Statement", "score": 60, "suggestion": "简短建议（中文）" },
      { "dimension": "Target Users", "score": 20, "suggestion": "简短建议" },
      { "dimension": "User Stories", "score": 10, "suggestion": "简短建议" },
      { "dimension": "Functional Requirements", "score": 40, "suggestion": "简短建议" },
      { "dimension": "Non-Functional Requirements", "score": 0, "suggestion": "简短建议" },
      { "dimension": "Technical Constraints", "score": 30, "suggestion": "简短建议" },
      { "dimension": "Edge Cases", "score": 0, "suggestion": "简短建议" },
      { "dimension": "Success Metrics", "score": 10, "suggestion": "简短建议" }
    ]
  }
}

规则：
- 最多返回 5 个问题
- 问题要具体、可操作
- **尽可能多地生成选择题（multiple-choice），只有在完全无法给出合理选项时才使用开放题（open-ended）**
- 判断标准：如果一个问题的答案可以归纳为 2-4 个明确的方向或选项（如"是/否"、技术选型、实现策略、优先级排序等），就必须设为选择题并提供具体选项
- 选择题提供 2-4 个现实、具体的选项，选项应覆盖常见的合理选择
- 每个选项是一个对象：{ "text": "选项内容" }
- 当多个选项可以同时选择时，在最后增加一个 { "text": "以上都要", "type": "select-all" } 选项，用户选择后会自动展开包含所有其他选项的内容
- 各维度评分 0-100
- overall 是加权平均
- 优先关注最薄弱的维度
- 只返回 JSON 对象，不要其他文字`

export const FILE_SELECTION_PROMPT = `你是一个项目分析助手。根据用户的需求文档内容，从项目文件列表中选择最相关的文件供深入阅读。

选择策略：
1. 优先选择配置文件（package.json, tsconfig.json 等）— 了解技术栈
2. 优先选择 README 和文档 — 了解项目背景
3. 选择与需求文档主题直接相关的代码文件
4. 如果没有文档/配置文件，选择入口文件和关键代码文件

最多选择 10 个文件。

返回严格 JSON 格式：
{ "files": ["path/to/file1", "path/to/file2"] }

只返回 JSON 对象，不要其他文字。files 数组中的值必须是文件列表中存在的完整相对路径。`
