import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PiState } from "./cli";

const TERMARC_OSC = 777;

export function shouldReportPiStatus(mode: string): boolean {
  return mode === "tui";
}

export function piStatusOsc(state: PiState): string {
  return `\x1b]${TERMARC_OSC};termarc;pi;${state}\x1b\\`;
}

/** OSC is stdout-safe only in the interactive TUI, never JSON/print/RPC. */
export function reportPiStatus(
  state: PiState,
  context: Pick<ExtensionContext, "mode">,
  write: (value: string) => unknown = (value) => process.stdout.write(value),
): void {
  if (shouldReportPiStatus(context.mode)) write(piStatusOsc(state));
}
