# Claude Code CLI 集成指南

VibeDocs 通过 `claude` CLI 实现 AI 分析功能。本文档记录了所有验证过的 CLI 用法、踩过的坑和最佳实践。

## 1. CLI 启动参数

```ts
const args = [
  '-p',                          // 非交互模式（pipe mode）
  '--verbose',                   // 输出详细事件（system/init 等）
  '--output-format', 'stream-json',  // 逐行 JSON 事件流
  '--include-partial-messages',  // token 级流式（stream_event）
  '--tools', '',                 // 禁用所有工具（防止意外调用）
  '--system-prompt', PROMPT,     // 分析框架放 system prompt，不塞 user message
  '--max-turns', '1',            // 限制为 1 轮对话（只需要一次输出）
  '--strict-mcp-config',         // 禁用 MCP
  '--plugin-dir', '/dev/null',   // 禁用插件
  '--setting-sources', '',       // 忽略用户本地设置
  '--disable-slash-commands'     // 禁用斜杠命令
]
```

### 关键规则

- **不要硬编码 `--model`** — 模型由用户自己的 Claude Code 配置决定
- **不要用 `--no-session-persistence`** — 加了之后 session 无法 `--resume`
- **不要用 `--allowedTools`** — 正确参数是 `--tools`
- **插件/hooks/MCP 全禁** — 保持 cache prefix 稳定，有利于 prompt caching

## 2. 流式事件解析

`--output-format stream-json --include-partial-messages` 产出的事件流：

```
1. {"type":"system","subtype":"init",...}                    → 初始化信息（model, session_id）
2. {"type":"stream_event","event":{"type":"content_block_delta",
     "delta":{"type":"text_delta","text":"天"}}}             → 逐 token 流式
3. {"type":"assistant","message":{"content":[...]}}          → 完整消息块
4. {"type":"result","result":"...","session_id":"...","usage":{...}} → 最终结果
```

### 解析代码

```ts
for (const line of lines) {
  const evt = JSON.parse(line)

  if (evt.type === 'stream_event') {
    const inner = evt.event
    if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
      // 逐 token 增量，用于流式展示摘要
      send({ step: 'delta', text: inner.delta.text })
    }
    continue
  }

  if (evt.type === 'result') {
    // 完整结果，包含 session_id 和 usage 统计
    const resultText = evt.result
    const sessionId = evt.session_id
    const usage = evt.usage  // { input_tokens, output_tokens, cache_read_input_tokens, ... }
  }
}
```

### 注意事项

- `stream_event` 只在加了 `--include-partial-messages` 时才有
- `assistant` 块是完整消息，可以用来提取 thinking 块
- `result` 是最终结果，`evt.result` 是完整文本
- `system` 和 `rate_limit_event` 类型直接跳过

## 3. Session 复用（--resume）

### 原理

首次分析后，`result` 事件包含 `session_id`。后续分析用 `--resume <session_id>` 复用对话历史，只发增量 prompt。

### 效果

| 场景 | input tokens | 耗时 |
|------|-------------|------|
| 首次分析（cold） | ~2400 | ~32s |
| resume 分析 | ~3 | ~20s |

### 实现

```ts
// 内存缓存 session（key = "docPath:pageIndex"）
const claudeSessionsMap = new Map<string, {
  sessionId: string
  contextHash: string      // 项目上下文 hash，变化时 invalidate
  analysisCount: number    // 达到阈值时强制刷新
}>()

// 构建参数时加 --resume
if (resumeSessionId) {
  args.push('--resume', resumeSessionId)
}
```

### Invalidation 规则

| 条件 | 行为 |
|------|------|
| contextHash 变化 | 清除 session，走完整 prompt |
| analysisCount >= 50 | 清除 session，防对话膨胀 |
| resume 进程退出非零 | 清除 session，fallback 完整 prompt |

### Prompt 设计

首次 prompt 包含完整上下文（页面内容 + 基础 PRD + 项目上下文）。
Resume prompt 只发增量：

```
用户更新了文档。以下是第 N 页的最新完整内容（替换之前的版本）：
{pageContent}
请重新进行 8 维度分析...
```

## 4. Prompt Caching

### 工作原理

- Claude Code 自动对 prompt 前缀做缓存（ephemeral, 5 分钟 TTL）
- `--system-prompt` 的内容是稳定前缀，天然利于缓存
- resume 时，历史对话也成为缓存前缀的一部分
- **瓶颈不在 input/TTFT，而在 output 生成**（~45-50 tok/s）

### 验证方法

看 `result` 事件的 `usage` 字段：

```json
{
  "cache_creation_input_tokens": 5071,  // 本轮创建的缓存
  "cache_read_input_tokens": 5071,      // 本轮命中的缓存（> 0 表示命中）
}
```

第一轮 resume 创建缓存，第二轮 resume 开始命中。

## 5. 精简 JSON 格式

### 目的

减少 output tokens（~2400 → ~1200），直接省约一半生成时间。

### 格式映射

```
完整格式                     精简格式
questions                → q
  type: "multiple-choice" → t: "mc"
  type: "open-ended"      → t: "oe"
  text                    → x
  category                → c (维度索引 0-7)
  options: [{text}]       → o: ["选项A", "选项B"]
completeness.overall      → s.o
completeness.breakdown    → s.b (8个分数的数组)
  suggestion              → s.g (8个建议的数组)
```

### expandCompactJSON

主进程收到精简 JSON 后，用 `expandCompactJSON()` 还原为完整格式再保存：

```ts
const DIMENSIONS = [
  'Problem Statement', 'Target Users', 'User Stories', 'Functional Requirements',
  'Non-Functional Requirements', 'Technical Constraints', 'Edge Cases', 'Success Metrics'
]

function expandCompactJSON(compact) {
  if (compact.questions) return compact  // 兼容完整格式

  const questions = (compact.q || []).map(q => ({
    type: q.t === 'mc' ? 'multiple-choice' : 'open-ended',
    text: q.x,
    category: DIMENSIONS[q.c] || DIMENSIONS[0],
    options: q.o ? q.o.map(text => ({ text })) : undefined
  }))

  const breakdown = DIMENSIONS.map((dim, i) => ({
    dimension: dim,
    score: compact.s?.b?.[i] ?? 0,
    suggestion: compact.s?.g?.[i] ?? ''
  }))

  return { questions, completeness: { overall: compact.s?.o ?? 0, breakdown } }
}
```

## 6. 流式摘要 + JSON 分隔

### 输出格式

```
文档对核心问题描述清晰，但功能需求不够具体...  ← 流式展示给用户
---JSON---
{"q":[...],"s":{...}}                              ← 解析成问题卡片
```

### extractJSON

先按 `---JSON---` 切分，再找 `{}`，避免摘要文字中的大括号干扰：

```ts
function extractJSON(text) {
  const sepIdx = text.indexOf('---JSON---')
  let jsonPart = sepIdx >= 0 ? text.slice(sepIdx + '---JSON---'.length) : text
  let cleaned = jsonPart.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1)
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')
  try {
    return JSON.parse(cleaned)
  } catch {
    return JSON.parse(repairJSON(cleaned))  // fallback 修复
  }
}
```

## 7. LLM JSON 修复（repairJSON）

LLM 生成的 JSON 常见问题及修复：

| 问题 | 示例 | 修复方式 |
|------|------|---------|
| 未转义双引号 | `提示"暂未配置"` | 状态机检测 + 自动 `\"` |
| 未转义反斜杠 | `C:\path` | 检测无效转义序列 + `\\` |
| 字符串内换行 | 实际换行符 | 替换为 `\n` |
| 控制字符 | `\x00-\x1f` | 直接删除 |

### 核心逻辑

状态机遍历 JSON 字符串，区分"在字符串内"和"在字符串外"：
- 遇到 `"` 时，看下一个非空白字符是否是 `:,]}` 来判断是关闭引号还是内容引号
- 在字符串内遇到 `\` 时，检查下一个字符是否是合法转义序列

### Prompt 端预防

在 system prompt 规则里加：
```
JSON 字符串值中禁止使用双引号，用单引号或「」代替
```

## 8. 数据流时序

### 正确的时序（当前实现）

```
Main process:
  saveAnalysis() → readAgentData() → resolve({ success, stats, agentData })

Renderer (handleAnalysisResult):
  _loadRaw(result.agentData)         → 更新 currentQuestions（同步）
  pushMcpEvent({ step: 'result' })   → isLoading = false（同步）
  // React 批量渲染：问题卡片和 loading 状态同时更新，无空挡
```

### 踩过的坑

1. **不要通过 `mcp:progress` 发 `step: 'result'`** — 它比 promise resolve 先到，会导致 loading 关了但问题还没更新，出现空挡
2. **不要在 `handleAnalysisResult` 里用 async** — 调用者不 await，`finally { unsubProgress() }` 会在 `loadFromFile` 完成前执行
3. **新建文档要调 `loadFromFile`** — `createNew` 只调了 `reset()`，没注册 `agent:changed` IPC 监听
4. **agentData 直接放在 resolve 返回值里** — 不依赖 `agent:changed` IPC 推送，更可靠

## 9. 不兼容的 CLI 参数

| 参数 | 问题 |
|------|------|
| `--json-schema` | 内部触发工具调用，需要 `--max-turns 2`，结果在 `evt.structured_output` |
| `--no-session-persistence` | 加了后 session 无法 resume |
| `--model opus` | 不应硬编码，由用户配置决定 |
| `--effort` | 可用（low/medium/high/max）但未采用 |

## 10. 环境隔离

```ts
function makeCleanEnv() {
  const env = { ...process.env }
  // 删除可能影响 Claude CLI 行为的变量
  delete env.CLAUDE_CODE_ENTRYPOINT
  delete env.CLAUDE_CODE_PARENT_SESSION_ID
  return env
}
```

spawn 时用 `makeCleanEnv()` 确保子进程不受父进程环境变量影响。
