import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { SessionConfigManager } from './session-config-manager'

export interface SessionSearchResult {
  sessionPath: string
  matches: SessionSearchMatch[]
}

export interface SessionSearchMatch {
  lineNumber: number
  snippet: string
}

export class SessionFileManager {
  /**
   * 現在のセッションファイルのパスを取得する
   * @param cwd 現在の作業ディレクトリ
   * @returns セッションファイルのパス、見つからない場合はnull
   */
  static getCurrentSessionPath(cwd: string): string | null {
    // SessionConfigManagerからtranscript_pathを取得
    const transcriptPath = SessionConfigManager.getTranscriptPath()

    // transcript_pathが設定されている場合はそれを優先
    if (transcriptPath) {
      // ファイルが存在しない場合は作成
      if (!fs.existsSync(transcriptPath)) {
        const dir = path.dirname(transcriptPath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(transcriptPath, '')
      }
      return transcriptPath
    }

    // transcript_pathがない場合は従来の処理（後方互換性のため）
    const projectPath = this.getProjectPath(cwd)

    if (!fs.existsSync(projectPath)) {
      return null
    }

    // SessionConfigManagerから現在のセッションIDを取得
    const sessionId = SessionConfigManager.getSessionId()

    // Session IDが設定されている場合
    if (sessionId) {
      const sessionFile = path.join(projectPath, `${sessionId}.jsonl`)

      // ファイルが存在しない場合は作成
      if (!fs.existsSync(sessionFile)) {
        fs.writeFileSync(sessionFile, '')
      }

      return sessionFile
    }

    // Session IDが設定されていない場合は従来の処理
    // 現在のセッションファイルを探す
    const currentSessionFile = path.join(projectPath, 'current-session.jsonl')

    if (fs.existsSync(currentSessionFile)) {
      return currentSessionFile
    }

    // または最新のjsonlファイルを探す
    const files = fs
      .readdirSync(projectPath)
      .filter(file => file.endsWith('.jsonl'))
      .sort()
      .reverse()

    if (files.length > 0) {
      return path.join(projectPath, files[0])
    }

    return null
  }

  /**
   * プロジェクトの全セッションファイルを取得する
   * @param projectPath プロジェクトのパス
   * @returns セッションファイルのパスの配列
   */
  static getSessionFiles(projectPath: string): string[] {
    const claudeProjectPath = this.getProjectPath(projectPath)

    if (!fs.existsSync(claudeProjectPath)) {
      return []
    }

    const files = fs
      .readdirSync(claudeProjectPath)
      .filter(file => file.endsWith('.jsonl'))
      .map(file => path.join(claudeProjectPath, file))
      .sort()

    return files
  }

  /**
   * 作業ディレクトリパスをClaude形式のプロジェクトパスに変換する
   * @param cwd 作業ディレクトリパス
   * @returns Claudeのプロジェクトパス
   */
  static getProjectPath(cwd: string): string {
    // transcript_pathが利用可能な場合は、そのディレクトリを返す
    const transcriptPath = SessionConfigManager.getTranscriptPath()
    if (transcriptPath) {
      return path.dirname(transcriptPath)
    }

    // 従来の処理（後方互換性のため）
    const homeDir = os.homedir()
    const claudeDir = path.join(homeDir, '.claude', 'projects')

    // パスをClaude形式に変換（/を-に置換）
    const projectDirName = cwd.replace(/\//g, '-')

    return path.join(claudeDir, projectDirName)
  }

  /**
   * セッションファイルの内容を読み込む
   * @param filePath ファイルパス
   * @returns ファイルの内容
   */
  static readSessionFile(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8')
  }

  /**
   * セッションファイルに内容を書き込む
   * @param filePath ファイルパス
   * @param content 書き込む内容
   */
  static writeSessionFile(filePath: string, content: string): void {
    fs.writeFileSync(filePath, content, 'utf-8')
  }

  /**
   * キーワードを含むセッションを検索する
   * @param projectPath プロジェクトのパス
   * @param keyword 検索キーワード
   * @returns マッチしたセッションとその内容
   */
  static findSessionByKeyword(
    projectPath: string,
    keyword: string,
  ): SessionSearchResult[] {
    const sessionFiles = this.getSessionFiles(projectPath)
    const results: SessionSearchResult[] = []

    for (const sessionPath of sessionFiles) {
      const content = this.readSessionFile(sessionPath)
      const lines = content.split('\n').filter(line => line.trim())

      const matches: SessionSearchMatch[] = []

      lines.forEach((line, index) => {
        if (line.includes(keyword)) {
          try {
            // JSONLの行をパースして、tool_useとtool_resultを除外
            const parsed = JSON.parse(line)
            
            // tool_useまたはtool_resultを含むエントリを除外
            if (parsed.message?.content && Array.isArray(parsed.message.content)) {
              const hasToolContent = parsed.message.content.some((item: any) => 
                item.type === 'tool_use' || item.type === 'tool_result'
              )
              if (hasToolContent) {
                return // このエントリはスキップ
              }
            }

            let snippet = ''

            // 各フィールドをチェックして、キーワードを含む値を持つフィールドを見つける
            for (const [, value] of Object.entries(parsed)) {
              if (typeof value === 'string' && value.includes(keyword)) {
                snippet = value
                break
              }
            }

            // フィールドが見つからない場合は、JSON文字列全体から抽出
            if (!snippet) {
              const keywordIndex = line.indexOf(keyword)
              const start = Math.max(0, keywordIndex - 50)
              const end = Math.min(
                line.length,
                keywordIndex + keyword.length + 50,
              )
              snippet = line.substring(start, end)
              if (start > 0) snippet = '...' + snippet
              if (end < line.length) snippet = snippet + '...'
            }

            matches.push({
              lineNumber: index + 1,
              snippet,
            })
          } catch {
            // JSONパースに失敗した場合は元の行から抽出
            const keywordIndex = line.indexOf(keyword)
            const start = Math.max(0, keywordIndex - 50)
            const end = Math.min(
              line.length,
              keywordIndex + keyword.length + 50,
            )
            let snippet = line.substring(start, end)
            if (start > 0) snippet = '...' + snippet
            if (end < line.length) snippet = snippet + '...'

            matches.push({
              lineNumber: index + 1,
              snippet,
            })
          }
        }
      })

      if (matches.length > 0) {
        results.push({
          sessionPath,
          matches,
        })
      }
    }

    return results
  }
}
