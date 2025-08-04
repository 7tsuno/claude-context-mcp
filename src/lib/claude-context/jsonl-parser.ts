export interface ParsedEntry {
  lineNumber: number
  entry: any
}

export class JsonlParser {
  /**
   * JSONL形式の文字列をパースして配列として返す
   */
  static parse(jsonlContent: string): any[] {
    if (!jsonlContent.trim()) {
      return []
    }

    const lines = jsonlContent.split('\n')
    const result: any[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) {
        continue // 空行をスキップ
      }

      try {
        const parsed = JSON.parse(line)
        result.push(parsed)
      } catch {
        throw new Error(`Invalid JSON at line ${i + 1}: ${line}`)
      }
    }

    return result
  }

  /**
   * オブジェクトの配列をJSONL形式の文字列に変換する
   */
  static stringify(entries: any[]): string {
    if (entries.length === 0) {
      return ''
    }

    return entries.map(entry => JSON.stringify(entry)).join('\n')
  }

  /**
   * JSONL形式の文字列をパースし、行番号と内容のペアを返す
   */
  static parseWithLineNumbers(jsonlContent: string): ParsedEntry[] {
    if (!jsonlContent.trim()) {
      return []
    }

    const lines = jsonlContent.split('\n')
    const result: ParsedEntry[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) {
        continue // 空行をスキップ
      }

      try {
        const parsed = JSON.parse(line)
        result.push({
          lineNumber: i,
          entry: parsed,
        })
      } catch {
        throw new Error(`Invalid JSON at line ${i + 1}: ${line}`)
      }
    }

    return result
  }

  /**
   * 指定した行番号のエントリを更新する
   * @param jsonlContent 元のJSONLコンテンツ
   * @param updates 行番号とその新しい内容のMap
   * @returns 更新されたJSONL文字列
   */
  static updateEntries(
    jsonlContent: string,
    updates: Map<number, any>,
  ): string {
    const lines = jsonlContent.split('\n')
    const updatedLines: string[] = []

    for (let i = 0; i < lines.length; i++) {
      if (updates.has(i)) {
        const newEntry = updates.get(i)
        updatedLines.push(JSON.stringify(newEntry))
      } else {
        updatedLines.push(lines[i])
      }
    }

    // 末尾の改行を保持
    const result = updatedLines.join('\n')

    // 元のコンテンツが改行で終わっていない場合、末尾の改行を削除
    if (!jsonlContent.endsWith('\n') && result.endsWith('\n')) {
      return result.slice(0, -1)
    }

    return result
  }
}
