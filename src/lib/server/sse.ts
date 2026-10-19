import "server-only"

/** Minimal Server-Sent-Events helper over a Web ReadableStream. */
export function sseResponse(producer: (send: (event: string, data: unknown) => void) => Promise<void>) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      try {
        await producer(send)
      } catch (e) {
        send("error", { message: e instanceof Error ? e.message : String(e) })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
