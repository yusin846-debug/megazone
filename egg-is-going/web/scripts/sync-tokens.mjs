// egg-is-going/tokens.css (디자인 시스템 원본) 를 앱으로 복사
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
copyFileSync(path.join(here, "../../tokens.css"), path.join(here, "../src/styles/tokens.css"));
console.log("tokens.css synced");
