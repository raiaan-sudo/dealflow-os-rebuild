import { getAuthenticatedContext } from "@/lib/services/authenticated-context";
import { getSystemJob, getSystemJobLogs } from "@/lib/services/system-job-service";
import {
  classifyCreativeRenderJob,
} from "@/lib/services/creative-render-state";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 2_000;
const MAX_STREAM_POLLS = 150;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
    const auth = await getAuthenticatedContext();
    const { id } = await context.params;
    const jobId = id?.trim();
    const encoder = new TextEncoder();

    const encodeJobEvent = async () => {
      const job = jobId ? await getSystemJob(jobId, auth.userId) : null;
      const logs = job ? await getSystemJobLogs(job.id, auth.userId) : [];

      return encoder.encode(
        `event: job\ndata: ${JSON.stringify(
          job
            ? { ...job, logs, renderState: classifyCreativeRenderJob(job) }
            : { job: null, logs: [], status: "failed", error_message: "System job was not found." },
        )}\n\n`,
      );
    };

    const stream = new ReadableStream({
      async start(controller) {
        for (let poll = 0; poll < MAX_STREAM_POLLS; poll += 1) {
          const payload = await encodeJobEvent();
          controller.enqueue(payload);

          const job = jobId ? await getSystemJob(jobId, auth.userId) : null;
          if (
            !job ||
            job.status === "completed" ||
            job.status === "failed"
          ) {
            controller.close();
            return;
          }

          await sleep(POLL_INTERVAL_MS);
        }

        controller.enqueue(
          encoder.encode(
            `event: job\ndata: ${JSON.stringify({
              status: "failed",
              error_message: "Creative rendering is still taking longer than expected. Refresh this page to check again.",
            })}\n\n`,
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
