import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type PiState = "processing" | "waiting" | "stopped";

const OSC = 777;

function report(state: PiState): void {
  // OSC 777 is a private, Termdeck-owned control sequence. ST terminates the
  // sequence without producing visible terminal output.
  process.stdout.write(`\x1b]${OSC};termdeck;pi;${state}\x1b\\`);
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", () => report("waiting"));
  pi.on("agent_start", () => report("processing"));
  pi.on("agent_settled", () => report("waiting"));
  pi.on("session_shutdown", () => report("stopped"));
}
