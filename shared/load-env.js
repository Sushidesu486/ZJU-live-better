import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const sharedDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(sharedDir, "..");

dotenv.config({ path: path.join(projectRoot, ".env") });

export { projectRoot };
