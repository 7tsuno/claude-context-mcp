#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const templatePath = path.join(
  __dirname,
  '..',
  '.claude',
  'settings.json.template',
)
const outputPath = path.join(__dirname, '..', '.claude', 'settings.json')
const projectRoot = path.join(__dirname, '..')

if (!fs.existsSync(templatePath)) {
  // eslint-disable-next-line no-console
  console.error('Template file not found:', templatePath)
  process.exit(1)
}

try {
  const template = fs.readFileSync(templatePath, 'utf8')
  const settings = template.replace(/\$\{PROJECT_ROOT\}/g, projectRoot)

  // .claudeディレクトリが存在しない場合は作成
  const claudeDir = path.dirname(outputPath)
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true })
  }

  fs.writeFileSync(outputPath, settings, 'utf8')
  // eslint-disable-next-line no-console
  console.log('Generated .claude/settings.json')
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('Failed to generate .claude/settings.json:', error.message)
  process.exit(1)
}
