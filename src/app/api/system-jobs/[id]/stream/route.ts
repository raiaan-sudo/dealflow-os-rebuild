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
    const actor = {
      userId: auth.userId,
      organizationId: auth.organizationId,
    };
    const job = jobId ? await getSystemJob(jobId, actor) : null;
    const logs = job ? await getSystemJobLogs(job.id, actor) : [];
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
      const payload = job
        ? { ...job, job, logs }
        : { job: null, logs: [], status: "failed", error_message: "System job was not found." };

      controller.enqueue(encoder.encode(`event: job\ndata: ${JSON.stringify(payload)}\n\n`));
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
