// Runs once when the server starts. Checks every configured model id against the API key
// and stops the server with a clear message if one is missing.
export async function register() {
  // Written this way so the bundler drops the Node-only import from the edge build.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkModelsAtStart } = await import("./instrumentation.node");
    await checkModelsAtStart();
  }
}
