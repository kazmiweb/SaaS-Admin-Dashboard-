import { runScheduledHealthSweep } from "./apiHealth.service.js";
import { logWarn } from "../../shared/observability/logger.js";

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startApiHealthScheduler() {
  const enabled = (process.env.API_HEALTH_SCHEDULER_ENABLED ?? "false").toLowerCase() === "true";
  if (!enabled || timer) return;

  const intervalMs = Math.max(60_000, Number(process.env.API_HEALTH_SCHEDULER_INTERVAL_MS ?? 5 * 60_000));

  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runScheduledHealthSweep();
    } catch (error) {
      logWarn({
        scope: "api-health",
        event: "scheduled-sweep-failed",
        error,
      });
    } finally {
      running = false;
    }
  }, intervalMs);

  timer.unref?.();
}
