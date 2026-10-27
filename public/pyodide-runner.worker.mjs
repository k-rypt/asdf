// Module Web Worker that hosts Pyodide (Python compiled to WebAssembly) for
// the Run Code button. Running in a worker keeps the page responsive and lets
// the main thread kill a runaway program by terminating the worker.
//
// Plain JS served from public/ on purpose: Turbopack bundles workers into
// *classic* workers (its runtime loads chunks with importScripts), and
// Pyodide refuses to run in a classic worker. Started by
// packages/assessment-core/src/runners/pyodideRunner.ts with
// { type: "module" } -- see the message shapes there.
//
// In:  { type: "init", indexURL, maxOutputChars } | { type: "run", id, code }
// Out: { type: "ready" } | { type: "init-error", message } | { type: "result", id, success, output }

let pyodide = null
let indexURLForRuns = ""
let maxOutputChars = 10_000

function load(indexURL) {
  if (!pyodide) {
    pyodide = (async () => {
      // Served from this app's public/pyodide/<version>/ (scripts/copy-pyodide.mjs).
      const { loadPyodide } = await import(`${indexURL}pyodide.mjs`)
      const py = await loadPyodide({ indexURL })
      // input() would otherwise wait forever -- make it fail fast instead.
      py.setStdin({ error: true })
      return py
    })()
    pyodide.catch(() => {
      pyodide = null
    })
  }
  return pyodide
}

self.onmessage = async (event) => {
  const message = event.data

  if (message.type === "init") {
    indexURLForRuns = message.indexURL
    maxOutputChars = message.maxOutputChars
    try {
      await load(message.indexURL)
      self.postMessage({ type: "ready" })
    } catch (err) {
      self.postMessage({ type: "init-error", message: err instanceof Error ? err.message : String(err) })
    }
    return
  }

  const py = await load(indexURLForRuns)
  let output = ""
  let truncated = false
  const append = (text) => {
    if (truncated) return
    if (output.length + text.length > maxOutputChars) {
      output += text.slice(0, Math.max(0, maxOutputChars - output.length))
      truncated = true
      return
    }
    output += text
  }
  py.setStdout({ batched: (text) => append(`${text}\n`) })
  py.setStderr({ batched: (text) => append(`${text}\n`) })

  // A fresh namespace per run, so one run's variables can't leak into the next.
  const namespace = py.globals.get("dict")()
  let success = true
  try {
    await py.runPythonAsync(message.code, { globals: namespace })
  } catch (err) {
    success = false
    append(err instanceof Error ? err.message : String(err))
  } finally {
    namespace.destroy()
  }

  if (truncated) output += `\n… output cut off at ${maxOutputChars.toLocaleString()} characters.`
  self.postMessage({ type: "result", id: message.id, success, output })
}
