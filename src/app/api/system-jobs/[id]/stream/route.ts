import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { getSystemJob, getSystemJobLogs } from "@/lib/services/system-job-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
    const auth = await getAuthenticatedContext();
    const { id } = await context.params;
    const jobId = id?.trim();
    const job = jobId ? await getSystemJob(jobId, auth.userId) : null;
    const logs = job ? await getSystemJobLogs(job.id, auth.userId) : [];
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: job\ndata: ${JSON.stringify(
            job
              ? { job, logs }
              : { job: null, logs: [], status: "failed", error_message: "System job was not found." },
          )}\n\n`,
        ),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
