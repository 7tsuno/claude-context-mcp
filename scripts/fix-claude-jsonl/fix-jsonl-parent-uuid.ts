/* eslint-disable local-rules/no-relative-date */
/* eslint-disable no-console */

import { readFileSync, writeFileSync } from 'fs'

interface JsonlEntry {
  uuid?: string
  parentUuid?: string
  [key: string]: any
}

export function fixJsonlParentUuid(filePath: string): void {
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.trim().split('\n')

  const entries: {
    line: string
    entry: JsonlEntry
    lineNumber: number
  }[] = []

  // Parse each line
  lines.forEach((line, index) => {
    if (!line.trim()) return

    try {
      const entry = JSON.parse(line) as JsonlEntry
      entries.push({ line, entry, lineNumber: index + 1 })
    } catch {
      // Skip invalid lines silently
    }
  })

  // Check and fix parentUuid
  let fixedCount = 0
  const fixedEntries = [...entries]

  for (let i = 1; i < fixedEntries.length; i++) {
    const prevEntry = fixedEntries[i - 1]
    const currEntry = fixedEntries[i]

    const prevUuid = prevEntry.entry.uuid
    const currParentUuid = currEntry.entry.parentUuid

    // If current entry has parentUuid but it doesn't match previous uuid
    if (currParentUuid && prevUuid && currParentUuid !== prevUuid) {
      // Update the entry
      const updatedEntry = { ...currEntry.entry }
      updatedEntry.parentUuid = prevUuid
      const updatedLine = JSON.stringify(updatedEntry)

      fixedEntries[i] = {
        ...currEntry,
        entry: updatedEntry,
        line: updatedLine,
      }

      fixedCount++
    }
  }

  if (fixedCount === 0) {
    return
  }

  // Write fixed content
  const fixedContent = fixedEntries.map(e => e.line).join('\n') + '\n'
  writeFileSync(filePath, fixedContent)
}

// Export for use in other modules
export { JsonlEntry }