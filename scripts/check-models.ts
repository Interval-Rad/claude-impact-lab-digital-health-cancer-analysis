// npm run models: lists the models this API key can use and checks the ids in src/lib/config.ts.
import { loadEnv } from "./env";
import { MODELS } from "../src/lib/config";
import { assertModelsAvailable } from "../src/lib/model";

loadEnv();
assertModelsAvailable()
  .then((available) => {
    console.log("Configured:", MODELS);
    console.log(available.length ? `All configured ids are available (${available.length} models on this key).` : "Replay mode: not checked.");
  })
  .catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
