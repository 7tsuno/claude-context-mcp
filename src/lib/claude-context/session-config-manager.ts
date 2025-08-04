import * as fs from 'fs'
import * as path from 'path'

interface SessionConfig {
  sessionId?: string
  transcript_path?: string
}

export class SessionConfigManager {
  private static CONFIG_FILE_NAME = 'session-config.json'
  private static cachedSessionId: string | null = null
  private static cachedTranscriptPath: string | null = null

  /**
   * 設定ファイルのパスを取得する
   */
  private static getConfigPath(): string {
    // プロジェクトルートの.claudeディレクトリに保存
    const cwd = process.cwd()
    return path.join(cwd, '.claude', this.CONFIG_FILE_NAME)
  }

  /**
   * 現在のSession IDを取得する
   * @returns Session ID、設定されていない場合はnull
   */
  static getSessionId(): string | null {
    // キャッシュがある場合はそれを返す
    if (this.cachedSessionId !== null) {
      return this.cachedSessionId
    }

    const configPath = this.getConfigPath()

    if (!fs.existsSync(configPath)) {
      return null
    }

    try {
      const configContent = fs.readFileSync(configPath, 'utf-8')
      const config: SessionConfig = JSON.parse(configContent)
      
      // transcript_pathからセッションIDを抽出
      if (config.transcript_path) {
        const fileName = path.basename(config.transcript_path, '.jsonl')
        // UUIDパターンにマッチする場合のみ使用
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (uuidPattern.test(fileName)) {
          this.cachedSessionId = fileName
          return this.cachedSessionId
        }
      }
      
      this.cachedSessionId = null
      return null
    } catch {
      // JSONパースエラーなどの場合
      return null
    }
  }

  /**
   * Session IDを設定する
   * @param sessionId 設定するSession ID
   */
  static setSessionId(sessionId: string): void {
    const configPath = this.getConfigPath()
    const configDir = path.dirname(configPath)

    // ディレクトリが存在しない場合は作成
    fs.mkdirSync(configDir, { recursive: true })

    const config: SessionConfig = { sessionId }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

    // キャッシュをクリア
    this.clearCache()
  }

  /**
   * Transcript Pathを取得する
   * @returns Transcript Path、設定されていない場合はnull
   */
  static getTranscriptPath(): string | null {
    // キャッシュがある場合はそれを返す
    if (this.cachedTranscriptPath !== null) {
      return this.cachedTranscriptPath
    }

    const configPath = this.getConfigPath()

    if (!fs.existsSync(configPath)) {
      return null
    }

    try {
      const configContent = fs.readFileSync(configPath, 'utf-8')
      const config: SessionConfig = JSON.parse(configContent)
      this.cachedTranscriptPath = config.transcript_path || null
      return this.cachedTranscriptPath
    } catch {
      // JSONパースエラーなどの場合
      return null
    }
  }

  /**
   * キャッシュをクリアする
   */
  static clearCache(): void {
    this.cachedSessionId = null
    this.cachedTranscriptPath = null
  }

  /**
   * 設定ファイルの変更を監視する
   * @param callback Session IDが変更されたときに呼ばれるコールバック
   * @returns 監視を停止する関数
   */
  static watchConfig(callback: (sessionId: string | null) => void): () => void {
    const configPath = this.getConfigPath()

    if (!fs.existsSync(configPath)) {
      // ファイルが存在しない場合は何もしない
      return () => {}
    }

    const watcher = fs.watch(configPath, eventType => {
      if (eventType === 'change') {
        // キャッシュをクリアして新しい値を読み込む
        this.clearCache()
        const newSessionId = this.getSessionId()
        callback(newSessionId)
      }
    })

    return () => {
      watcher.close()
    }
  }
}
