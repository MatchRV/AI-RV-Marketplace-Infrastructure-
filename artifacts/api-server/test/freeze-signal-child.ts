/**
 * Tiny process for the SIGTERM flush test. It does not load the inventory snapshot.
 * The parent sets SESSION_MEMORY_PATH and sends SIGTERM after stdout says ready.
 */
import { installDataDirShutdownHandlers } from "../src/services/data-dir-freeze";
import { resolveScope, writableScope } from "../src/services/learned-store";

const scope = resolveScope(null, `mrs_${"b".repeat(24)}`);
writableScope(scope).learnVehicle("Signal Truck", { towRatingLbs: 4200 }, "signal-test");
installDataDirShutdownHandlers();
process.stdout.write("ready\n");
setInterval(() => {}, 60_000);
