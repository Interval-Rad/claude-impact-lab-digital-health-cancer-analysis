// Node-only start-up check. Imported by instrumentation.ts when the server runs on Node.
export async function checkModelsAtStart(): Promise<void> {
  const { isReplay } = await import("./lib/config");
  if (isReplay()) {
    console.log("[scanshift] DEMO_MODE=replay: serving recorded responses from data/cache. No model is called.");
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[scanshift] ANTHROPIC_API_KEY is not set. Stored cases can be viewed. New runs will fail until it is in .env.local.");
    return;
  }
  const { assertModelsAvailable } = await import("./lib/model");
  try {
    const available = await assertModelsAvailable();
    console.log(`[scanshift] Model ids checked: all configured ids are available (${available.length} models on this key).`);
  } catch (e) {
    const message = String((e as Error).message ?? e);
    // A wrong model id is a configuration error: stop. A network failure is not: warn and carry on.
    if (message.startsWith("Model id(s) not available")) {
      console.error(`[scanshift] ${message}`);
      process.exit(1);
    }
    console.warn(`[scanshift] Could not check model ids at start: ${message}`);
  }
}
