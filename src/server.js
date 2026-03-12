import fs from "fs";
import app from "./app.js";
import { config, paths } from "./config/index.js";

const VERSION = "1.0.0";

[paths.uploads, paths.outputs, paths.decoded, paths.downloads].forEach(
  (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  },
);

app.listen(config.port, () => {
  console.log(
    `Server listening on port ${config.port} (env: ${config.env}) (version: ${VERSION})`,
  );
});
