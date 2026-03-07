import { getScenario } from '@/data/scenarios'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const scenario = getScenario(id)

  if (!scenario) {
    return new Response('Scenario not found', { status: 404 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      for (const evt of scenario.events) {
        await new Promise<void>(r => setTimeout(r, evt.delayMs))
        // Strip delayMs from the emitted payload
        const { delayMs: _drop, ...payload } = evt
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }
      controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection:      'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
