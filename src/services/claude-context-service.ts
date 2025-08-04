/* eslint-disable local-rules/no-relative-date */
import {
  SessionFileManager,
  SessionSearchResult,
} from '../lib/claude-context/session-file-manager'
import { JsonlParser } from '../lib/claude-context/jsonl-parser'
import { SessionConfigManager } from '../lib/claude-context/session-config-manager'
import * as path from 'path'

export interface LogEntry {
  [key: string]: any
}

export interface GetLogOptions {
  type: 'all' | 'tail' | 'slice'
  count?: number
  start?: number
  end?: number
  includeDeleted?: boolean
  maxFieldSize?: number
}

export interface SearchOptions {
  keyword: string
  searchIn?: 'content' | 'type' | 'all'
  includeDeleted?: boolean
  maxFieldSize?: number
}

export class ClaudeContextService {
  constructor(private projectPath: string) {}

  /**
   * フィールドの値を制限する
   * @param value - 制限対象の値
   * @param maxFieldSize - 最大文字数（0または負数で制限なし、undefinedでデフォルト1000文字）
   */
  private truncateField(value: any, maxFieldSize?: number): any {
    const limit = maxFieldSize === undefined ? 1000 : maxFieldSize

    // 制限なしの場合（0または負数）
    if (limit <= 0) {
      return value
    }

    if (typeof value === 'string' && value.length > limit) {
      return value.substring(0, limit) + '...[truncated]'
    }

    if (Array.isArray(value)) {
      return value.map(item => this.truncateField(item, maxFieldSize))
    }

    if (value && typeof value === 'object') {
      const result: any = {}
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.truncateField(val, maxFieldSize)
      }
      return result
    }

    return value
  }

  /**
   * 現在のセッションログを取得
   */
  getCurrentSessionLog(
    options: GetLogOptions,
  ): Array<{ lineNumber: number; content: string }> {
    const sessionPath = SessionFileManager.getCurrentSessionPath(
      this.projectPath,
    )
    if (!sessionPath) {
      return []
    }

    const content = SessionFileManager.readSessionFile(sessionPath)
    const allEntries = JsonlParser.parseWithLineNumbers(content)

    // 削除されたエントリをフィルタ（includeDeletedがfalseの場合）
    const visibleParsedEntries = options.includeDeleted
      ? allEntries
      : allEntries.filter(
          pe => !pe.entry['claude-context-service-mcp']?.deleted,
        )

    // tool_useとtool_resultを除外し、contentのみを抽出
    const contentOnlyEntries = visibleParsedEntries
      .filter(pe => {
        const entry = pe.entry

        // tool_useまたはtool_resultを含むエントリを除外
        if (entry.message?.content && Array.isArray(entry.message.content)) {
          return !entry.message.content.some(
            (item: any) =>
              item.type === 'tool_use' || item.type === 'tool_result',
          )
        }

        return true
      })
      .map(pe => {
        const entry = pe.entry
        let contentText = ''

        // エントリから実際のコンテンツテキストを抽出
        if (entry.message?.content) {
          if (Array.isArray(entry.message.content)) {
            // text要素からテキストを抽出
            const textItems = entry.message.content.filter(
              (item: any) => item.type === 'text',
            )
            contentText = textItems.map((item: any) => item.text).join('')
          } else if (typeof entry.message.content === 'string') {
            contentText = entry.message.content
          }
        } else if (entry.content) {
          contentText = entry.content
        } else if (entry.summary) {
          contentText = entry.summary
        }

        return {
          lineNumber: pe.lineNumber,
          content: contentText,
        }
      })

    // maxFieldSizeが指定されている場合はコンテンツを制限
    const finalEntries =
      options.maxFieldSize !== undefined && options.maxFieldSize > 0
        ? contentOnlyEntries.map(entry => ({
            lineNumber: entry.lineNumber,
            content:
              entry.content.length > options.maxFieldSize!
                ? entry.content.substring(0, options.maxFieldSize!) +
                  '...[truncated]'
                : entry.content,
          }))
        : contentOnlyEntries

    switch (options.type) {
      case 'all':
        return finalEntries
      case 'tail': {
        const count = options.count || 10
        return finalEntries.slice(-count)
      }
      case 'slice': {
        const start = options.start || 0
        const end =
          options.end !== undefined ? options.end : finalEntries.length - 1
        return finalEntries.filter(
          entry => entry.lineNumber >= start && entry.lineNumber <= end,
        )
      }
      default:
        return finalEntries
    }
  }

  /**
   * 現在のセッション内を検索
   */
  searchInCurrentSession(
    options: SearchOptions,
  ): Array<{ lineNumber: number; content: string }> {
    const sessionPath = SessionFileManager.getCurrentSessionPath(
      this.projectPath,
    )
    if (!sessionPath) {
      return []
    }

    const content = SessionFileManager.readSessionFile(sessionPath)
    const allEntries = JsonlParser.parseWithLineNumbers(content)

    // キーワードで検索（大文字小文字を区別しない）
    const keyword = options.keyword.toLowerCase()
    const results = allEntries.filter(pe => {
      const entry = pe.entry

      // tool_useまたはtool_resultを含むエントリを除外
      if (entry.message?.content && Array.isArray(entry.message.content)) {
        const hasToolContent = entry.message.content.some(
          (item: any) =>
            item.type === 'tool_use' || item.type === 'tool_result',
        )
        if (hasToolContent) {
          return false
        }
      }

      // contentのみを検索対象とする
      let searchableContent = ''
      if (entry.message?.content) {
        if (Array.isArray(entry.message.content)) {
          const textItems = entry.message.content.filter(
            (item: any) => item.type === 'text',
          )
          searchableContent = textItems.map((item: any) => item.text).join('')
        } else if (typeof entry.message.content === 'string') {
          searchableContent = entry.message.content
        }
      } else if (entry.content) {
        searchableContent = entry.content
      } else if (entry.summary) {
        searchableContent = entry.summary
      }

      return searchableContent.toLowerCase().includes(keyword)
    })

    // 削除されたエントリをフィルタ（includeDeletedがfalseの場合）
    const filteredResults = !options.includeDeleted
      ? results.filter(pe => !pe.entry['claude-context-service-mcp']?.deleted)
      : results

    // contentのみを抽出
    const contentOnlyResults = filteredResults.map(pe => {
      const entry = pe.entry
      let contentText = ''

      // エントリから実際のコンテンツテキストを抽出
      if (entry.message?.content) {
        if (Array.isArray(entry.message.content)) {
          // text要素からテキストを抽出
          const textItems = entry.message.content.filter(
            (item: any) => item.type === 'text',
          )
          contentText = textItems.map((item: any) => item.text).join('')
        } else if (typeof entry.message.content === 'string') {
          contentText = entry.message.content
        }
      } else if (entry.content) {
        contentText = entry.content
      } else if (entry.summary) {
        contentText = entry.summary
      }

      return {
        lineNumber: pe.lineNumber,
        content: contentText,
      }
    })

    // maxFieldSizeが指定されている場合はコンテンツを制限
    const finalResults =
      options.maxFieldSize !== undefined && options.maxFieldSize > 0
        ? contentOnlyResults.map(entry => ({
            lineNumber: entry.lineNumber,
            content:
              entry.content.length > options.maxFieldSize!
                ? entry.content.substring(0, options.maxFieldSize!) +
                  '...[truncated]'
                : entry.content,
          }))
        : contentOnlyResults

    return finalResults
  }

  /**
   * 指定した行をコンテキストから削除する（内容を[deleted]に置き換える）
   * @param options.lines - 削除する行番号の配列
   * @param options.fromLine - 指定行以降をすべて削除する場合の開始行番号
   * @param options.skipImported - importedフラグがあるエントリをスキップするか（デフォルト: false）
   * @returns 実際に削除されたエントリ数
   */
  deleteFromContext(options: {
    lines?: number[]
    fromLine?: number
    skipImported?: boolean
  }): number {
    // パラメータ検証
    if (!options.lines && options.fromLine === undefined) {
      throw new Error('Either lines or fromLine must be specified')
    }

    const sessionPath = SessionFileManager.getCurrentSessionPath(
      this.projectPath,
    )
    if (!sessionPath) {
      throw new Error('No current session found')
    }

    const content = SessionFileManager.readSessionFile(sessionPath)
    const entries = JsonlParser.parse(content)

    const updates = new Map<number, any>()
    let actuallyDeletedCount = 0

    // 削除対象の行番号を決定
    let targetLines: number[] = []

    if (options.lines) {
      targetLines = options.lines
    }

    if (options.fromLine !== undefined) {
      // fromLine以降のすべての行を削除対象に追加
      const fromLineTargets = Array.from(
        { length: entries.length - options.fromLine },
        (_, i) => options.fromLine! + i,
      ).filter(lineNumber => lineNumber < entries.length)

      targetLines = [...targetLines, ...fromLineTargets]
    }

    // 重複を除去
    const uniqueLines = Array.from(new Set(targetLines))

    uniqueLines.forEach(lineNumber => {
      const entry = entries[lineNumber]
      if (!entry) return

      // 既に削除済みの場合はスキップ
      if (entry['claude-context-service-mcp']?.deleted) return

      // skipImportedがtrueでimportedフラグがある場合はスキップ
      if (options.skipImported && entry['claude-context-service-mcp']?.imported)
        return

      // 元の内容をバックアップして削除マークを付ける
      const deletedEntry = this.createDeletedEntry(entry)

      // tool_useなどでスキップされた場合は何もしない
      if (deletedEntry === null) {
        return
      }

      updates.set(lineNumber, deletedEntry)
      actuallyDeletedCount++
    })

    // ファイルを更新
    const updatedContent = JsonlParser.updateEntries(content, updates)
    SessionFileManager.writeSessionFile(sessionPath, updatedContent)

    return actuallyDeletedCount
  }

  /**
   * エントリの内容を操作する共通処理
   * @param entry - 操作対象のエントリ
   * @param newContent - 新しい内容
   * @param options - 操作オプション
   */
  private manipulateEntryContent(
    entry: any,
    newContent: string,
    options: {
      saveOriginal?: boolean
      deleted?: boolean
    } = {},
  ): any {
    const result = { ...entry }
    const originalFields: any = {}

    // 元の内容をバックアップ（必要な場合）
    if (options.saveOriginal) {
      if (entry.type === 'user') {
        if (entry.message?.content) {
          originalFields.message = {
            content: Array.isArray(entry.message.content)
              ? [...entry.message.content]
              : entry.message.content,
          }
        }
        if (entry.toolUseResult) {
          originalFields.toolUseResult = { ...entry.toolUseResult }
        }
      } else if (entry.type === 'assistant' && entry.message?.content) {
        originalFields.message = {
          content: Array.isArray(entry.message.content)
            ? [...entry.message.content]
            : entry.message.content,
        }
      } else if (entry.type === 'summary') {
        originalFields.summary = entry.summary
      }
    }

    // 内容の更新
    switch (entry.type) {
      case 'user':
        if (Array.isArray(entry.message?.content)) {
          // 配列の場合 - tool_resultがある場合はそのcontentを更新
          const content = entry.message.content
          const updatedContent = [...content]

          const toolResultIndex = updatedContent.findIndex(
            item => item.type === 'tool_result',
          )
          if (toolResultIndex !== -1) {
            // tool_result要素のcontentを更新
            updatedContent[toolResultIndex] = {
              ...updatedContent[toolResultIndex],
              content: newContent,
            }
            result.message = { ...entry.message, content: updatedContent }
          } else {
            // tool_resultがない場合は文字列に置き換え
            result.message = { ...entry.message, content: newContent }
          }
        } else {
          // 文字列の場合はそのまま置き換え
          result.message = { ...entry.message, content: newContent }
        }

        // toolUseResultは変更しない（実際のツール実行結果なので保持）
        if (entry.toolUseResult) {
          result.toolUseResult = entry.toolUseResult
        }
        break

      case 'assistant':
        if (Array.isArray(entry.message?.content)) {
          const content = entry.message.content
          const updatedContent = [...content]

          // text要素があるかチェック
          const textIndex = updatedContent.findIndex(
            item => item.type === 'text',
          )
          if (textIndex !== -1) {
            // text要素を更新
            updatedContent[textIndex] = {
              ...updatedContent[textIndex],
              text: newContent,
            }
          } else {
            // thinking要素があるかチェック
            const thinkingIndex = updatedContent.findIndex(
              item => item.type === 'thinking',
            )
            if (thinkingIndex !== -1) {
              // thinking要素を更新
              updatedContent[thinkingIndex] = {
                ...updatedContent[thinkingIndex],
                thinking: newContent,
              }
            } else {
              // tool_useのみの場合の処理
              const toolUseIndex = updatedContent.findIndex(
                item => item.type === 'tool_use',
              )
              if (toolUseIndex !== -1) {
                // tool_useが含まれている場合
                if (options.deleted) {
                  // 削除の場合は、inputフィールドの内容を削除マーカーで置き換え
                  const toolUseItem = updatedContent[toolUseIndex]
                  if (toolUseItem.input) {
                    updatedContent[toolUseIndex] = {
                      ...toolUseItem,
                      input: {
                        content:
                          '<system-reminder>This content has been removed for context optimization.</system-reminder>',
                      },
                    }
                  }
                } else {
                  // replaceの場合は処理をスキップ（書き換えを避ける）
                  return null
                }
              } else {
                // その他の場合は、textエントリに置き換え
                updatedContent.splice(0, updatedContent.length, {
                  type: 'text',
                  text: newContent,
                })
              }
            }
          }

          result.message = { ...entry.message, content: updatedContent }
        } else {
          // 文字列の場合（古い形式）
          result.message = { ...entry.message, content: newContent }
        }
        break

      case 'summary':
        result.summary = newContent
        break

      default:
        // 未知のタイプ（systemタイプなど）は処理をスキップ
        if (!options.deleted) {
          return null
        }
        break
    }

    // バックアップ情報を追加（必要な場合）
    if (options.saveOriginal) {
      result['claude-context-service-mcp'] = {
        ...(entry['claude-context-service-mcp'] || {}), // 既存のフラグを保持
        original: originalFields,
        ...(options.deleted ? { deleted: true } : {}),
      }
    }

    return result
  }

  /**
   * エントリを削除済み状態に変換する
   */
  private createDeletedEntry(entry: any): any {
    return this.manipulateEntryContent(
      entry,
      '<system-reminder>This content has been removed for context optimization.</system-reminder>',
      {
        saveOriginal: true,
        deleted: true,
      },
    )
  }

  /**
   * エントリを復元状態に変換する
   */
  private createRestoredEntry(entry: any): any {
    const result = { ...entry }
    const backup = entry['claude-context-service-mcp']?.original

    if (!backup) {
      return result // バックアップがない場合はそのまま返す
    }

    // バックアップから内容を復元
    switch (entry.type) {
      case 'user':
        if (backup.message) {
          result.message = { ...entry.message, ...backup.message }
        }
        if (backup.toolUseResult) {
          result.toolUseResult = backup.toolUseResult
        }
        break

      case 'assistant':
        if (backup.message) {
          result.message = { ...entry.message, ...backup.message }
        }
        break

      case 'summary':
        if (backup.summary !== undefined) {
          result.summary = backup.summary
        }
        break
    }

    // claude-context-service-mcpフィールドを削除
    delete result['claude-context-service-mcp']

    return result
  }

  /**
   * 削除されたエントリを復元
   * @returns 実際に復元されたエントリ数
   */
  restoreToContext(lines: number[]): number {
    const sessionPath = SessionFileManager.getCurrentSessionPath(
      this.projectPath,
    )
    if (!sessionPath) {
      throw new Error('No current session found')
    }

    const content = SessionFileManager.readSessionFile(sessionPath)
    const entries = JsonlParser.parse(content)

    const updates = new Map<number, any>()
    let actuallyRestoredCount = 0

    lines.forEach(lineNumber => {
      const entry = entries[lineNumber]
      if (!entry) return

      // バックアップが存在するかチェック
      const backup = entry['claude-context-service-mcp']?.original
      if (!backup) return

      // エントリの内容を復元
      const restoredEntry = this.createRestoredEntry(entry)
      updates.set(lineNumber, restoredEntry)
      actuallyRestoredCount++
    })

    // ファイルを更新
    const updatedContent = JsonlParser.updateEntries(content, updates)
    SessionFileManager.writeSessionFile(sessionPath, updatedContent)

    return actuallyRestoredCount
  }

  /**
   * 指定した行の内容を置き換え
   */
  replaceInContext(line: number, newContent: string): void {
    const sessionPath = SessionFileManager.getCurrentSessionPath(
      this.projectPath,
    )
    if (!sessionPath) {
      throw new Error('No current session found')
    }

    const content = SessionFileManager.readSessionFile(sessionPath)
    const entries = JsonlParser.parse(content)

    if (!entries[line]) {
      throw new Error(`Line ${line} not found`)
    }

    const entry = entries[line]
    const updatedEntry = this.replaceContentInEntry(entry, newContent)

    // スキップされた場合（nullが返された場合）は更新しない
    if (updatedEntry === null) {
      return
    }

    const updates = new Map([[line, updatedEntry]])

    // ファイルを更新
    const updatedContent = JsonlParser.updateEntries(content, updates)
    SessionFileManager.writeSessionFile(sessionPath, updatedContent)
  }

  private replaceContentInEntry(entry: any, newContent: string): any {
    return this.manipulateEntryContent(entry, newContent, {
      saveOriginal: true,
      deleted: false,
    })
  }

  /**
   * プロジェクト内の全セッションを検索
   */
  searchAcrossSessions(keyword: string): SessionSearchResult[] {
    return SessionFileManager.findSessionByKeyword(this.projectPath, keyword)
  }

  /**
   * 現在のセッションの行数を数える
   */
  countCurrentSessionLines(options?: { includeDeleted?: boolean }): number {
    const sessionPath = SessionFileManager.getCurrentSessionPath(
      this.projectPath,
    )
    if (!sessionPath) {
      return 0
    }

    const content = SessionFileManager.readSessionFile(sessionPath)
    if (!content || content.trim() === '') {
      return 0
    }

    const entries = JsonlParser.parse(content)

    if (options?.includeDeleted === false) {
      return entries.filter(
        entry => !entry['claude-context-service-mcp']?.deleted,
      ).length
    }

    return entries.length
  }

  /**
   * ファイル読み取り結果を抽出
   */
  extractFileReadResults(
    options: GetLogOptions,
  ): Array<{ lineNumber: number; filePath: string }> {
    const sessionPath = SessionFileManager.getCurrentSessionPath(
      this.projectPath,
    )
    if (!sessionPath) {
      return []
    }

    const content = SessionFileManager.readSessionFile(sessionPath)
    const allEntries = JsonlParser.parseWithLineNumbers(content)

    // 削除されたエントリをフィルタ（includeDeletedがfalseの場合）
    const visibleParsedEntries = options.includeDeleted
      ? allEntries
      : allEntries.filter(
          pe => !pe.entry['claude-context-service-mcp']?.deleted,
        )

    // Readツールの結果を含む行を特定
    const fileReadResults: Array<{ lineNumber: number; filePath: string }> = []

    for (const pe of visibleParsedEntries) {
      const entry = pe.entry

      // userタイプでtoolUseResultがある場合（tool_resultの結果）
      if (entry.type === 'user' && entry.toolUseResult) {
        // 対応するassistantエントリを探してReadまたはEditツールかどうか確認
        const assistantEntry = this.findCorrespondingAssistantEntry(
          allEntries,
          entry,
        )
        if (assistantEntry && this.isFileToolUse(assistantEntry.entry)) {
          const filePath = this.extractFilePathFromFileTool(
            assistantEntry.entry,
          )
          if (filePath) {
            fileReadResults.push({
              lineNumber: pe.lineNumber,
              filePath,
            })
          }
        }
      }
    }

    // 範囲指定に応じてフィルタ
    let filteredResults = fileReadResults
    switch (options.type) {
      case 'all':
        break
      case 'tail': {
        const count = options.count || 10
        filteredResults = fileReadResults.slice(-count)
        break
      }
      case 'slice': {
        const start = options.start || 0
        const end =
          options.end !== undefined ? options.end : fileReadResults.length - 1
        filteredResults = fileReadResults.filter(
          result => result.lineNumber >= start && result.lineNumber <= end,
        )
        break
      }
    }

    return filteredResults
  }

  private findCorrespondingAssistantEntry(
    allEntries: Array<{ lineNumber: number; entry: LogEntry }>,
    userEntry: LogEntry,
  ): { lineNumber: number; entry: LogEntry } | null {
    // userEntryのparentUuidに対応するassistantエントリを探す
    for (const pe of allEntries) {
      if (
        pe.entry.uuid === userEntry.parentUuid &&
        pe.entry.type === 'assistant'
      ) {
        return pe
      }
    }
    return null
  }

  private isFileToolUse(entry: LogEntry): boolean {
    if (entry.type !== 'assistant' || !entry.message?.content) {
      return false
    }

    // message.contentが配列の場合、tool_use要素を探す
    if (Array.isArray(entry.message.content)) {
      return entry.message.content.some(
        (item: any) =>
          item.type === 'tool_use' &&
          (item.name === 'Read' || item.name === 'Edit'),
      )
    }

    return false
  }

  private extractFilePathFromFileTool(entry: LogEntry): string | null {
    if (entry.type !== 'assistant' || !entry.message?.content) {
      return null
    }

    // message.contentが配列の場合、tool_use要素からfile_pathを取得
    if (Array.isArray(entry.message.content)) {
      for (const item of entry.message.content) {
        if (
          item.type === 'tool_use' &&
          (item.name === 'Read' || item.name === 'Edit') &&
          item.input?.file_path
        ) {
          return item.input.file_path
        }
      }
    }

    return null
  }

  /**
   * 他のセッションの内容を読み取る（読み取り専用）
   */
  readOtherSession(options: {
    sessionId: string
    type: 'all' | 'tail' | 'slice' | 'around'
    count?: number
    start?: number
    end?: number
    targetLine?: number
    radius?: number
    maxFieldSize?: number
  }): Array<{ lineNumber: number; content: string }> {
    const {
      sessionId,
      type,
      count,
      start,
      end,
      targetLine,
      radius = 10,
      maxFieldSize,
    } = options

    // パラメータバリデーション
    if (type === 'tail' && count === undefined) {
      throw new Error('count is required for tail type')
    }
    if (type === 'slice' && (start === undefined || end === undefined)) {
      throw new Error('start and end are required for slice type')
    }
    if (type === 'around' && targetLine === undefined) {
      throw new Error('targetLine is required for around type')
    }

    // sessionIdからファイルパスを構築
    const projectPath = SessionFileManager.getProjectPath(this.projectPath)
    const sessionFilePath = path.join(projectPath, `${sessionId}.jsonl`)

    // セッションファイルを読み込む
    const content = SessionFileManager.readSessionFile(sessionFilePath)
    if (!content) {
      return []
    }

    // パースして行番号付きで取得
    const entries = JsonlParser.parseWithLineNumbers(content)

    // tool_useとtool_resultを除外してcontentのみを取得
    const contentOnlyEntries = entries
      .filter(pe => {
        const entry = pe.entry

        // tool_useまたはtool_resultを含むエントリを除外
        if (entry.message?.content && Array.isArray(entry.message.content)) {
          return !entry.message.content.some(
            (item: any) =>
              item.type === 'tool_use' || item.type === 'tool_result',
          )
        }

        return true
      })
      .map(pe => {
        const entry = pe.entry
        let contentText = ''

        // エントリから実際のコンテンツテキストを抽出
        if (entry.message?.content) {
          if (Array.isArray(entry.message.content)) {
            // text要素からテキストを抽出
            const textItems = entry.message.content.filter(
              (item: any) => item.type === 'text',
            )
            contentText = textItems.map((item: any) => item.text).join('')
          } else if (typeof entry.message.content === 'string') {
            contentText = entry.message.content
          }
        } else if (entry.content) {
          contentText = entry.content
        } else if (entry.summary) {
          contentText = entry.summary
        }

        return {
          lineNumber: pe.lineNumber,
          content: contentText,
        }
      })

    // タイプに応じてフィルタリング
    let filteredEntries: Array<{ lineNumber: number; content: string }>
    switch (type) {
      case 'all':
        filteredEntries = contentOnlyEntries
        break
      case 'tail':
        filteredEntries = contentOnlyEntries.slice(-count!)
        break
      case 'slice':
        filteredEntries = contentOnlyEntries.filter(
          e => e.lineNumber >= start! && e.lineNumber <= end!,
        )
        break
      case 'around': {
        const startLine = Math.max(0, targetLine! - radius)
        const endLine = Math.min(
          contentOnlyEntries.length - 1,
          targetLine! + radius,
        )
        filteredEntries = contentOnlyEntries.filter(
          e => e.lineNumber >= startLine && e.lineNumber <= endLine,
        )
        break
      }
    }

    // maxFieldSizeが指定されている場合はコンテンツを制限
    if (maxFieldSize !== undefined && maxFieldSize > 0) {
      return filteredEntries.map(entry => ({
        lineNumber: entry.lineNumber,
        content:
          entry.content.length > maxFieldSize
            ? entry.content.substring(0, maxFieldSize) + '...[truncated]'
            : entry.content,
      }))
    }

    return filteredEntries
  }

  /**
   * カスタムコンパクトエントリを追加
   * 指定されたまとめの内容で現在のセッションにコンテキスト圧縮エントリを追加する
   * tool_useの直前に挿入してtool_use/resultペアの整合性を保つ
   */
  addCustomCompactEntry(content: string): void {
    const sessionPath = SessionFileManager.getCurrentSessionPath(
      this.projectPath,
    )
    if (!sessionPath) {
      throw new Error('No current session found')
    }

    // 既存のセッション内容を読み込む
    let existingContent: string
    try {
      existingContent = SessionFileManager.readSessionFile(sessionPath)
    } catch (error) {
      throw new Error(
        `Failed to read session file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    if (!existingContent.trim()) {
      // 空のファイルの場合は従来通り末尾に追加
      this.appendCompactEntryToEnd(content, sessionPath, existingContent)
      return
    }

    // 既存のログエントリを解析
    let entries: any[]
    try {
      const lines = existingContent.trim().split('\n')
      entries = lines.map(line => JSON.parse(line))
    } catch (error) {
      throw new Error(
        `Failed to parse session file entries: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    // 最後のtool_useエントリを探す
    const lastToolUseIndex = this.findLastToolUseIndex(entries)

    if (lastToolUseIndex === -1) {
      // tool_useが見つからない場合は従来通り末尾に追加
      this.appendCompactEntryToEnd(content, sessionPath, existingContent)
      return
    }

    // compactエントリを作成
    let compactEntry: any
    try {
      compactEntry = this.createCompactEntry(content)
    } catch (error) {
      throw new Error(
        `Failed to create compact entry: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    // tool_useの直前に挿入し、parentUuidを調整
    let updatedEntries: any[]
    try {
      updatedEntries = this.insertCompactEntryBeforeToolUse(
        entries,
        compactEntry,
        lastToolUseIndex,
      )
    } catch (error) {
      throw new Error(
        `Failed to insert compact entry: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    // 更新されたエントリをJSONL形式で書き込み
    try {
      const updatedContent =
        updatedEntries.map(entry => JSON.stringify(entry)).join('\n') + '\n'
      SessionFileManager.writeSessionFile(sessionPath, updatedContent)
    } catch (error) {
      throw new Error(
        `Failed to write updated session file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  /**
   * 最後のtool_useエントリのインデックスを探す
   */
  private findLastToolUseIndex(entries: any[]): number {
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]
      if (
        entry.type === 'assistant' &&
        entry.message?.content &&
        Array.isArray(entry.message.content) &&
        entry.message.content.some(
          (content: any) => content.type === 'tool_use',
        )
      ) {
        return i
      }
    }
    return -1
  }

  /**
   * compactエントリを作成
   */
  private createCompactEntry(content: string): any {
    // 必要なフィールドを準備
    const sessionId = SessionConfigManager.getSessionId() || ''

    // Git branchを取得
    let gitBranch = ''
    try {
      const { execSync } = require('child_process')
      gitBranch = execSync('git branch --show-current', {
        encoding: 'utf8',
        cwd: this.projectPath,
      }).trim()
    } catch {
      // Git repositoryでない場合は空文字
    }

    // バージョンを取得（package.jsonから読み取るか、固定値を使用）
    let version = '1.0.0'
    try {
      const packageJsonPath = require('path').join(
        this.projectPath,
        'package.json',
      )
      const fs = require('fs')
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
        version = packageJson.version || version
      }
    } catch {
      // エラーの場合はデフォルト値を使用
    }

    return {
      parentUuid: null,
      isSidechain: false,
      userType: 'external',
      cwd: this.projectPath,
      sessionId,
      version,
      gitBranch,
      type: 'user',
      message: {
        role: 'user',
        content: content,
      },
      isCompactSummary: true,
      uuid: require('crypto').randomUUID(),
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * tool_useの直前にcompactエントリを挿入し、parentUuidを調整
   */
  private insertCompactEntryBeforeToolUse(
    entries: any[],
    compactEntry: any,
    toolUseIndex: number,
  ): any[] {
    const result = [...entries]

    // tool_useの直前に挿入
    result.splice(toolUseIndex, 0, compactEntry)

    // tool_useのparentUuidをcompactエントリのuuidに更新
    result[toolUseIndex + 1].parentUuid = compactEntry.uuid

    return result
  }

  /**
   * 従来通り末尾にcompactエントリを追加
   */
  private appendCompactEntryToEnd(
    content: string,
    sessionPath: string,
    existingContent: string,
  ): void {
    const compactEntry = this.createCompactEntry(content)
    const newLine = JSON.stringify(compactEntry)
    const updatedContent = existingContent.trim()
      ? existingContent.trim() + '\n' + newLine + '\n'
      : newLine + '\n'

    SessionFileManager.writeSessionFile(sessionPath, updatedContent)
  }
}
