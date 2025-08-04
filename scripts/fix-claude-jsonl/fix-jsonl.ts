#!/usr/bin/env node
/* eslint-disable local-rules/no-relative-date */
/* eslint-disable no-console */

import { resolve } from 'path'
import { fixJsonlTimestampOrder } from './fix-jsonl-timestamp'
import { fixJsonlParentUuid } from './fix-jsonl-parent-uuid'

export function fixJsonl(filePath: string): void {
  // Apply all fixes in sequence
  fixJsonlTimestampOrder(filePath)
  fixJsonlParentUuid(filePath)
}

// Main execution (only if called directly)
if (require.main === module) {
  if (process.argv.length < 3) {
    process.exit(1)
  }

  const filePath = resolve(process.argv[2])
  fixJsonl(filePath)
}
