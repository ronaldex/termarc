import type { ProjectCommand } from "../types/project";
import { moveId, type DropPlacement } from "./terminalOrdering";

export type CommandOrderingResult =
  | {
      ok: true;
      orderedIds: string[];
      globalCommands: ProjectCommand[];
      localCommands: ProjectCommand[];
    }
  | { ok: false; reason: string };

function validRank(value: number | undefined): value is number {
  return Number.isSafeInteger(value) && value! >= 0;
}

export function validateCommandStore(
  commands: readonly ProjectCommand[],
  label: string,
): string | undefined {
  const ids = new Set<string>();
  const ranks = new Map<number, string>();
  for (const command of commands) {
    if (!command.id.trim()) return `${label} command IDs must not be empty`;
    if (ids.has(command.id)) return `duplicate ${label} command ID: ${command.id}`;
    ids.add(command.id);
    if (command.order === undefined) continue; // Legacy lists are ranked during the next write.
    if (!validRank(command.order)) return `invalid ${label} command rank for ${command.id}`;
    const ranked = ranks.get(command.order);
    if (ranked && ranked !== command.id) return `duplicate ${label} command rank ${command.order}`;
    ranks.set(command.order, command.id);
  }
}

/** Merges overrides and gives legacy/unranked commands deterministic positions. */
export function effectiveCommandOrder(
  globalCommands: readonly ProjectCommand[],
  localCommands: readonly ProjectCommand[],
): CommandOrderingResult {
  const failure =
    validateCommandStore(globalCommands, "global") ?? validateCommandStore(localCommands, "local");
  if (failure) return { ok: false, reason: failure };

  const effective = globalCommands.map((command, index) => ({ command, legacy: index }));
  for (const [index, command] of localCommands.entries()) {
    const existing = effective.findIndex((item) => item.command.id === command.id);
    const item = { command, legacy: globalCommands.length + index };
    if (existing >= 0) effective[existing] = { ...item, legacy: effective[existing]!.legacy };
    else effective.push(item);
  }
  const explicitRanks = new Map<number, string>();
  for (const { command } of effective) {
    if (!validRank(command.order)) continue;
    const rankedId = explicitRanks.get(command.order);
    if (rankedId && rankedId !== command.id)
      return { ok: false, reason: `duplicate mixed command rank ${command.order}` };
    explicitRanks.set(command.order, command.id);
  }

  effective.sort((left, right) => {
    const leftRank = validRank(left.command.order) ? left.command.order : Number.MAX_SAFE_INTEGER;
    const rightRank = validRank(right.command.order)
      ? right.command.order
      : Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.legacy - right.legacy;
  });
  const orderedIds = effective.map((item) => item.command.id);
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  const ranked = (commands: readonly ProjectCommand[]) =>
    commands
      .map((command) => ({ ...command, order: rank.get(command.id) }))
      .sort((left, right) => left.order! - right.order!);
  return {
    ok: true,
    orderedIds,
    globalCommands: ranked(globalCommands),
    localCommands: ranked(localCommands),
  };
}

export function reorderCommands(
  globalCommands: readonly ProjectCommand[],
  localCommands: readonly ProjectCommand[],
  movedId: string,
  targetId: string,
  placement: DropPlacement,
): CommandOrderingResult {
  const normalized = effectiveCommandOrder(globalCommands, localCommands);
  if (!normalized.ok) return normalized;
  const orderedIds = moveId(normalized.orderedIds, movedId, targetId, placement);
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  const rerank = (commands: ProjectCommand[]) =>
    commands
      .map((command) => ({ ...command, order: rank.get(command.id) }))
      .sort((left, right) => left.order! - right.order!);
  return {
    ok: true,
    orderedIds,
    globalCommands: rerank(normalized.globalCommands),
    localCommands: rerank(normalized.localCommands),
  };
}
