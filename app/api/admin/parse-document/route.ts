import { NextResponse } from "next/server"
import mammoth from "mammoth"
import { PDFParse } from "pdf-parse"
import { requireCapabilityAdminClient } from "@/lib/assessment/require-capability-admin-client"

export const runtime = "nodejs"

/**
 * Extracts plain text from an uploaded .docx/.pdf/.md/.txt file so it can
 * populate the job-description textarea in
 * components/protected/capabilities/add-questions/ai-generate-form.tsx
 * for review/editing before generation -- deliberately a separate step
 * from app/api/admin/capabilities/[capability]/generate-assessment rather
 * than folded into it, since it isn't capability-scoped and shouldn't be
 * trusted blind (a bad extraction should be something the capability owner
 * can see and fix, not something that silently feeds the AI prompt).
 */
export async function POST(request: Request) {
  const ctx = await requireCapabilityAdminClient()
  if (!ctx.ok) return ctx.response

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 })
  }

  const name = file.name.toLowerCase()
  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    let text: string

    if (name.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else if (name.endsWith(".pdf")) {
      const parser = new PDFParse({ data: buffer })
      try {
        const result = await parser.getText()
        text = result.text
      } finally {
        await parser.destroy()
      }
    } else if (name.endsWith(".md") || name.endsWith(".txt")) {
      text = buffer.toString("utf-8")
    } else {
      return NextResponse.json(
        { error: "Unsupported file type -- upload a .docx, .pdf, .md, or .txt file." },
        { status: 400 }
      )
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Couldn't find any text in that file (a scanned/image-only PDF won't extract) -- try pasting the text directly instead." },
        { status: 422 }
      )
    }

    return NextResponse.json({ text: text.trim() })
  } catch {
    return NextResponse.json(
      { error: "Failed to read that file -- it may be corrupted or password-protected. Try pasting the text directly instead." },
      { status: 422 }
    )
  }
}
