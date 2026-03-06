#!/usr/bin/env node
/**
 * Sync icon SVG files from art-kit/icons to all package public folders
 * Run this after adding new icons or before building
 */

import { cp, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = join(__dirname, '..')

const ICON_SOURCE = join(ROOT, 'art-kit', 'icons')
const PACKAGES_WITH_PUBLIC = [
  'packages/showcase-web/public',
  'packages/dag-editor/public',
]

async function syncIcons() {
  console.log('🎨 Syncing icon SVG files...\n')

  for (const packagePublic of PACKAGES_WITH_PUBLIC) {
    const dest = join(ROOT, packagePublic, 'art-kit', 'icons')
    
    try {
      // Create target directory structure
      await mkdir(dest, { recursive: true })
      
      // Copy all icons
      await cp(ICON_SOURCE, dest, { recursive: true, force: true })
      
      console.log(`✓ ${packagePublic}/art-kit/icons/`)
    } catch (err) {
      console.error(`✗ Failed to sync to ${packagePublic}:`, err.message)
      process.exit(1)
    }
  }

  console.log('\n✨ Icon sync complete!')
}

syncIcons()
