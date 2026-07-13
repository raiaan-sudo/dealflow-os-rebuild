export type IsolatedStageResult<T> =
  | { status: "passed"; value: T; errorCode: null }
  | { status: "failed"; value: null; errorCode: string };

type StageDefinition<T> = {
  name: string;
  run: () => Promise<T>;
};

function safeErrorCode(error: unknown) {
  const candidate = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "system_job_stage_failed";
  return /^[a-z0-9_]{3,100}$/.test(candidate)
    ? candidate
    : "system_job_stage_failed";
}

export async function runIsolatedSystemJobStages(
  stages: StageDefinition<unknown>[],
  options: {
    canStart: (stage: string) => void;
    onFailure: (input: { stage: string; errorCode: string }) => void;
  },
) {
  const results: Record<string, IsolatedStageResult<unknown>> = {};
  for (const stage of stages) {
    options.canStart(stage.name);
    try {
      results[stage.name] = {
        status: "passed",
        value: await stage.run(),
        errorCode: null,
      };
    } catch (error) {
      const errorCode = safeErrorCode(error);
      if (errorCode === "system_jobs_safe_deadline_exhausted") throw error;
      options.onFailure({ stage: stage.name, errorCode });
      results[stage.name] = { status: "failed", value: null, errorCode };
    }
  }
  return results;
}
