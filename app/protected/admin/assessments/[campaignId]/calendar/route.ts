import { NextResponse } from "next/server"

interface RouteParams {
  params: Promise<{ campaignId: string }>
}

export async function GET(request: Request, { params }: RouteParams) {
  const { campaignId } = await params
  const url = new URL(request.url)
  return NextResponse.redirect(new URL(`/protected/admin/assessments/${campaignId}/schedule`, url.origin))
}
