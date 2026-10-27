import { version } from "pyodide/package.json"

/**
 * Where the self-hosted Pyodide runtime is served from. scripts/copy-pyodide.mjs
 * copies node_modules/pyodide into public/pyodide/<version>/ using the same
 * installed version, so this URL always matches the copied files.
 */
export const PYODIDE_BASE_URL = `/pyodide/${version}/`

/** Plain-JS module worker that hosts Pyodide (public/pyodide-runner.worker.mjs, committed -- not generated). */
export const PYODIDE_WORKER_URL = "/pyodide-runner.worker.mjs"

/** Files the runtime fetches on first load -- prefetched ahead of time on the employee portal. */
export const PYODIDE_PREFETCH_FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"].map(
  (file) => `${PYODIDE_BASE_URL}${file}`
)
