#!/usr/bin/env node
/**
 * pdfjs-dist のローカル静的アセット（Worker / CMap / 標準フォント / ICC / 非WASMデコーダ）を
 * public/pdfjs/ へ同期する（外部CDN通信ゼロ・CSP 'self' 準拠のため .wasm はコピーしない）。
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const PDFJS_DIR = path.join(ROOT, 'node_modules', 'pdfjs-dist')
const OUT_DIR = path.join(ROOT, 'public', 'pdfjs')

function copyDirFiltered(srcDir, destDir, filterFn = () => true) {
  if (!fs.existsSync(srcDir)) return
  fs.mkdirSync(destDir, { recursive: true })
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      copyDirFiltered(srcPath, destPath, filterFn)
    } else if (filterFn(entry.name)) {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

export function syncPdfjsAssets() {
  if (!fs.existsSync(PDFJS_DIR)) {
    throw new Error('node_modules/pdfjs-dist not found. Run npm install first.')
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const workerSrc = path.join(PDFJS_DIR, 'build', 'pdf.worker.min.mjs')
  if (!fs.existsSync(workerSrc)) {
    throw new Error('pdfjs-dist/build/pdf.worker.min.mjs not found.')
  }
  fs.copyFileSync(workerSrc, path.join(OUT_DIR, 'pdf.worker.min.mjs'))

  copyDirFiltered(path.join(PDFJS_DIR, 'cmaps'), path.join(OUT_DIR, 'cmaps'))
  copyDirFiltered(
    path.join(PDFJS_DIR, 'standard_fonts'),
    path.join(OUT_DIR, 'standard_fonts')
  )
  copyDirFiltered(path.join(PDFJS_DIR, 'iccs'), path.join(OUT_DIR, 'iccs'))

  // useWasm: false で必要な非WASM JSフォールバックとライセンスファイルのみをコピーする
  const ALLOWED_WASM_DIR_FILES = new Set([
    'jbig2_nowasm_fallback.js',
    'openjpeg_nowasm_fallback.js',
    'LICENSE_JBIG2',
    'LICENSE_OPENJPEG',
    'LICENSE_PDFJS_JBIG2',
    'LICENSE_PDFJS_OPENJPEG',
  ])
  copyDirFiltered(
    path.join(PDFJS_DIR, 'wasm'),
    path.join(OUT_DIR, 'wasm'),
    (name) => ALLOWED_WASM_DIR_FILES.has(name)
  )
}

syncPdfjsAssets()
