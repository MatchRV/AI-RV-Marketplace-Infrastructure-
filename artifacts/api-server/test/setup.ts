// Runs before test modules load: point the embedded database at a throwaway
// directory so tests never touch (or lock against) the dev database.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.PGLITE_DATA_DIR = join(mkdtempSync(join(tmpdir(), "matchrv-test-")), "pglite");
delete process.env.DATABASE_URL;
