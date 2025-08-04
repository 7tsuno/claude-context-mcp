/* eslint-disable local-rules/no-relative-date */
/* eslint-disable no-console */

import { readFileSync, writeFileSync } from 'fs'

interface JsonlEntry {
  timestamp?: string
  [key: string]: any
}

export function fixJsonlTimestampOrder(filePath: string): void {
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.trim().split('\n')

  const entries: { line: string; entry: JsonlEntry; lineNumber: number }[] = []

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

  // Check and fix out-of-order timestamps
  let fixedCount = 0
  const fixedEntries = [...entries]
  let hasMoreViolations = true
  let maxIterations = 10 // Prevent infinite loops

  // Repeat until all violations are fixed
  while (hasMoreViolations && maxIterations > 0) {
    hasMoreViolations = false
    maxIterations--

    for (let i = 1; i < fixedEntries.length; i++) {
      const prevEntry = fixedEntries[i - 1]
      const currEntry = fixedEntries[i]
      const nextEntry = fixedEntries[i + 1]

      const prevTimestamp = prevEntry.entry.timestamp
      const currTimestamp = currEntry.entry.timestamp

      if (prevTimestamp && currTimestamp) {
        const prevDate = new Date(prevTimestamp)
        const currDate = new Date(currTimestamp)

        if (prevDate > currDate) {
          // Calculate middle timestamp
          let newTimestamp: Date
          if (nextEntry && nextEntry.entry.timestamp) {
            // If there's a next entry, use the middle point between prev and next
            const nextDate = new Date(nextEntry.entry.timestamp)
            const prevTime = prevDate.getTime()
            const nextTime = nextDate.getTime()

            if (nextTime > prevTime) {
              // Use middle point
              newTimestamp = new Date((prevTime + nextTime) / 2)
            } else {
              // If next is also out of order, just add 1 second to previous
              newTimestamp = new Date(prevTime + 1000)
            }
          } else {
            // No next entry, just add 1 second to previous
            newTimestamp = new Date(prevDate.getTime() + 1000)
          }

          // Update the entry
          const updatedEntry = { ...currEntry.entry }
          updatedEntry.timestamp = newTimestamp.toISOString()
          const updatedLine = JSON.stringify(updatedEntry)

          fixedEntries[i] = {
            ...currEntry,
            entry: updatedEntry,
            line: updatedLine,
          }

          fixedCount++
          hasMoreViolations = true // Continue checking for more violations
        }
      }
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
