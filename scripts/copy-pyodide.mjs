// Copies the Pyodide runtime (in-browser Python for the code-exercise Run
// button) from node_modules into public/pyodide/<version>/, so it's served
// from this app instead of an outside CDN. Runs before `dev` and `build`;
// public/pyodide/ is gitignored. The version folder lets next.config.ts
// cache these files for a year -- an upgrade changes the URL.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const source = join(root, "node_modules", "pyodide")
const { version } = JSON.parse(readFileSync(join(source, "package.json"), "utf8"))
const target = join(root, "public", "pyodide", version)

const FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]

mkdirSync(target, { recursive: true })
let copied = 0
for (const file of FILES) {
  const from = join(source, file)
  const to = join(target, file)
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue
  copyFileSync(from, to)
  copied++
}
console.log(`pyodide ${version}: ${copied} file(s) copied to public/pyodide/${version}/`)
