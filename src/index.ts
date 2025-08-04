import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { ClaudeContextService } from './services/claude-context-service'

const server = new McpServer({
  name: 'claude-context',
  version: '1.0.0',
})

// 現在の作業ディレクトリを取得
const cwd = process.cwd()
const service = new ClaudeContextService(cwd)

// 現在のセッションログを取得
server.registerTool(
  'get-current-session-log',
  {
    title: '現在のセッションログを取得',
    description: '現在のClaudeセッションのログを範囲指定して取得します',
    inputSchema: {
      type: z
        .enum(['all', 'tail', 'slice'])
        .describe(
          '取得タイプ - all: 全件取得, tail: 最新N件取得, slice: 範囲指定取得',
        ),
      count: z.number().optional().describe('取得件数（tailの場合のみ必須）'),
      start: z
        .number()
        .optional()
        .describe('開始行番号（sliceの場合のみ必須、0から開始）'),
      end: z
        .number()
        .optional()
        .describe('終了行番号（sliceの場合のみ必須、この行を含む）'),
      includeDeleted: z
        .boolean()
        .optional()
        .describe('削除されたエントリも含めるか'),
      maxFieldSize: z
        .number()
        .optional()
        .describe(
          '各フィールドの最大文字数（デフォルト: 1000文字、0で制限なし）',
        ),
    },
  },
  async ({ type, count, start, end, includeDeleted, maxFieldSize }) => {
    try {
      const logs = service.getCurrentSessionLog({
        type,
        count,
        start,
        end,
        includeDeleted,
        maxFieldSize,
      })

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(logs, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `エラーが発生しました: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }
  },
)

// 現在のセッション内を検索
server.registerTool(
  'search-in-current-session',
  {
    title: '現在のセッション内を検索',
    description: 'キーワードで現在のセッション内を検索します',
    inputSchema: {
      keyword: z.string().describe('検索キーワード'),
      searchIn: z
        .enum(['content', 'type', 'all'])
        .optional()
        .describe('検索対象'),
      includeDeleted: z
        .boolean()
        .optional()
        .describe('削除されたエントリも含めるか'),
      maxFieldSize: z
        .number()
        .optional()
        .describe(
          '各フィールドの最大文字数（デフォルト: 1000文字、0で制限なし）',
        ),
    },
  },
  async ({ keyword, searchIn = 'all', includeDeleted, maxFieldSize }) => {
    try {
      const results = service.searchInCurrentSession({
        keyword,
        searchIn,
        includeDeleted,
        maxFieldSize,
      })

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `エラーが発生しました: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }
  },
)

// コンテキストから削除
server.registerTool(
  'delete-from-context',
  {
    title: 'コンテキストから削除',
    description:
      '指定した行番号のエントリの内容を<system-reminder>This content has been removed for context optimization.</system-reminder>に置き換えて論理削除します。削除しても行は残ります。linesまたはfromLineのどちらか一方は必須です。',
    inputSchema: {
      lines: z.array(z.number()).optional().describe('削除する行番号の配列'),
      fromLine: z.number().optional().describe('指定行以降をすべて削除する場合の開始行番号'),
      skipImported: z.boolean().optional().describe('importedフラグがあるエントリをスキップするか（デフォルト: false）'),
    },
  },
  async ({ lines, fromLine, skipImported }) => {
    try {
      const deletedCount = service.deleteFromContext({ lines, fromLine, skipImported })

      return {
        content: [
          {
            type: 'text',
            text: `${deletedCount}件のエントリをコンテキストから削除しました。`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `エラーが発生しました: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }
  },
)

// コンテキストに復元
server.registerTool(
  'restore-to-context',
  {
    title: 'コンテキストに復元',
    description: '削除されたエントリをバックアップから復元します',
    inputSchema: {
      lines: z.array(z.number()).describe('復元する行番号の配列'),
    },
  },
  async ({ lines }) => {
    try {
      const restoredCount = service.restoreToContext(lines)

      return {
        content: [
          {
            type: 'text',
            text: `${restoredCount}件のエントリをコンテキストに復元しました。`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `エラーが発生しました: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }
  },
)

// コンテキストの内容を置換
server.registerTool(
  'replace-in-context',
  {
    title: 'コンテキストの内容を置換',
    description:
      '指定した行の内容を新しい内容で置き換えます（長いログを要約など）',
    inputSchema: {
      line: z.number().describe('置き換える行番号'),
      newContent: z.string().describe('新しい内容'),
    },
  },
  async ({ line, newContent }) => {
    try {
      service.replaceInContext(line, newContent)

      return {
        content: [
          {
            type: 'text',
            text: `行 ${line} の内容を置き換えました。`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `エラーが発生しました: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }
  },
)

// プロジェクト横断検索
server.registerTool(
  'search-across-sessions',
  {
    title: 'プロジェクト横断検索',
    description: '現在のプロジェクトの全セッションからキーワードを検索します',
    inputSchema: {
      keyword: z.string().describe('検索キーワード'),
    },
  },
  async ({ keyword }) => {
    try {
      const results = service.searchAcrossSessions(keyword)

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `エラーが発生しました: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }
  },
)


// 現在のセッションの行数を数える
server.registerTool(
  'count-current-session-lines',
  {
    title: '現在のセッションの行数を数える',
    description: '現在のClaudeセッションの行数を数えます',
    inputSchema: {
      includeDeleted: z
        .boolean()
        .optional()
        .describe('隠されたエントリも含めて数えるか'),
    },
  },
  async ({ includeDeleted }) => {
    try {
      const count = service.countCurrentSessionLines({ includeDeleted })

      return {
        content: [
          {
            type: 'text',
            text: `現在のセッションの行数: ${count}`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `エラーが発生しました: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }
  },
)

// ファイル操作結果行を抽出
server.registerTool(
  'extract-file-read-results',
  {
    title: 'ファイル操作結果行を抽出',
    description:
      'セッションログからReadおよびEditツールの実行結果を含む行番号とファイル名を抽出します（コンテキスト圧縮用）',
    inputSchema: {
      type: z
        .enum(['all', 'tail', 'slice'])
        .describe(
          '取得タイプ - all: 全件取得, tail: 最新N件取得, slice: 範囲指定取得',
        ),
      count: z.number().optional().describe('取得件数（tailの場合のみ必須）'),
      start: z
        .number()
        .optional()
        .describe('開始行番号（sliceの場合のみ必須、0から開始）'),
      end: z
        .number()
        .optional()
        .describe('終了行番号（sliceの場合のみ必須、この行を含む）'),
      includeDeleted: z
        .boolean()
        .optional()
        .describe('削除されたエントリも含めるか'),
    },
  },
  async ({ type, count, start, end, includeDeleted }) => {
    try {
      const fileReadResults = service.extractFileReadResults({
        type,
        count,
        start,
        end,
        includeDeleted,
      })

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(fileReadResults, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `エラーが発生しました: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      }
    }
  },
)

// 他セッションの内容を読み取る
server.registerTool(
  'read-other-session',
  {
    title: '他セッションの内容を読み取る',
    description: '指定したセッションの内容を範囲指定して読み取ります（読み取り専用）',
    inputSchema: {
      sessionId: z.string().describe('読み取るセッションのID/パス'),
      type: z.enum(['all', 'tail', 'slice', 'around'])
        .describe('取得タイプ - around: 指定行の周辺を取得'),
      count: z.number().optional().describe('取得件数（tailの場合）'),
      start: z.number().optional().describe('開始行番号（sliceの場合）'),
      end: z.number().optional().describe('終了行番号（sliceの場合）'),
      targetLine: z.number().optional().describe('中心となる行番号（aroundの場合）'),
      radius: z.number().optional().default(10)
        .describe('前後何行取得するか（aroundの場合、デフォルト10行）'),
      maxFieldSize: z.number().optional()
        .describe('各フィールドの最大文字数'),
    },
  },
  async (params) => {
    try {
      const results = service.readOtherSession(params)

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `エラーが発生しました: ${
              error instanceof Error ? error.message : String(error)
          }`,
          },
        ],
      }
    }
  },
)

// カスタムコンパクト
server.registerTool(
  'custom-compact',
  {
    title: 'カスタムコンパクト',
    description: '指定されたまとめの内容で現在のセッションにコンテキスト圧縮エントリを追加します',
    inputSchema: {
      content: z.string().describe('まとめの内容'),
    },
  },
  async ({ content }) => {
    try {
      service.addCustomCompactEntry(content)

      return {
        content: [
          {
            type: 'text',
            text: 'コンテキストの内容を圧縮しました。',
          },
        ],
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const stackTrace = error instanceof Error ? error.stack : 'No stack trace available'
      
      return {
        content: [
          {
            type: 'text',
            text: `エラーが発生しました: ${errorMessage}\n\nスタックトレース:\n${stackTrace}`,
          },
        ],
      }
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // eslint-disable-next-line no-console
  console.error('🧠 claude-context-server running via stdio')
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Fatal error:', err)
  process.exit(1)
})