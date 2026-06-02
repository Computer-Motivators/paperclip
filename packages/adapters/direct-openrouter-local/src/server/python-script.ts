import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const DIRECT_OPENROUTER_PYTHON_SCRIPT = readFileSync(
  join(here, "direct-openrouter-runner.py"),
  "utf8",
);
