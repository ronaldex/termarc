/**
 * Helpers for parsing Pi JSON mode events and summarizing subagent results.
 */

import type { Message } from "@earendil-works/pi-ai";
import type { SubagentResult } from "./types.ts";

type JsonRecord = Record<string, any>;
type InternalSubagentResult = SubagentResult & {
  __activityOrder?: number;
  __seenForkToolResultSignatures?: Set<string>;
  __seenMessageSignatures?: Set<string>;
};

const MAX_TOOL_PREVIEW_CHARS = 1200;
const MAX_TOOL_ARGS_PREVIEW_CHARS = 300;
const MAX_INLINE_ERROR_PREVIEW_CHARS = 160;
const MAX_STORED_TOOL_EXECUTIONS = 25;
const MAX_STORED_ACTIVITIES = 50;

function getSeenMessageSignatures(result: InternalSubagentResult): Set<string> {
  if (!Object.prototype.hasOwnProperty.call(result, "__seenMessageSignatures")) {
    Object.defineProperty(result, "__seenMessageSignatures", {
      value: new Set(),
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return result.__seenMessageSignatures!;
}

function getSeenForkToolResultSignatures(result: InternalSubagentResult): Set<string> {
  if (!Object.prototype.hasOwnProperty.call(result, "__seenForkToolResultSignatures")) {
    Object.defineProperty(result, "__seenForkToolResultSignatures", {
      value: new Set(),
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return result.__seenForkToolResultSignatures!;
}

function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(",")}}`;
}

function truncateMiddle(text: string, maxChars: number): string {
  if (typeof text !== "string" || text.length <= maxChars) return text;
  const keep = Math.max(0, maxChars - 15);
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return `${text.slice(0, head)}\n… truncated …\n${text.slice(text.length - tail)}`;
}

function truncateTail(text: string, maxChars: number): string {
  if (typeof text !== "string" || text.length <= maxChars) return text;
  return `… truncated …\n${text.slice(text.length - maxChars)}`;
}

function truncateInline(text: string, maxChars: number): string {
  if (typeof text !== "string") return "";
  const singleLine = text.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxChars) return singleLine;
  return `${singleLine.slice(0, Math.max(0, maxChars - 1))}…`;
}

function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function stringifyPreview(value: unknown, maxChars: number): string {
  if (value === undefined) return "";
  if (typeof value === "string") return truncateMiddle(value, maxChars);

  try {
    return truncateMiddle(JSON.stringify(value), maxChars);
  } catch {
    return "";
  }
}

function shortPath(value: unknown): string {
  if (typeof value !== "string" || !value) return "...";
  return value.replace(/^\/home\/[^/]+/, "~");
}

function formatToolCallPreview(toolName: string, args: JsonRecord | undefined): string {
  if (!args || typeof args !== "object") return toolName || "tool";

  switch (toolName) {
    case "bash": {
      const command = typeof args.command === "string" ? args.command : "...";
      return `bash $ ${truncateInline(command, 80)}`;
    }
    case "read": {
      const filePath = shortPath(args.path || args.file_path);
      const offset = args.offset;
      const limit = args.limit;
      const range =
        offset !== undefined || limit !== undefined
          ? `:${offset ?? 1}${limit !== undefined ? `-${(offset ?? 1) + limit - 1}` : ""}`
          : "";
      return `read ${filePath}${range}`;
    }
    case "write":
      return `write ${shortPath(args.path || args.file_path)}`;
    case "edit":
      return `edit ${shortPath(args.path || args.file_path)}`;
    case "ls":
      return `ls ${shortPath(args.path || ".")}`;
    case "find":
      return `find ${truncateInline(stringifyPreview(args.pattern || "*", 60), 60)} in ${shortPath(args.path || ".")}`;
    case "grep":
      return `grep ${truncateInline(stringifyPreview(args.pattern || "", 60), 60)} in ${shortPath(args.path || ".")}`;
    case "fork": {
      const task = typeof args.task === "string" ? args.task : stringifyPreview(args, 80);
      return `fork ${truncateInline(task, 80)}`;
    }
    default: {
      const argsPreview = truncateInline(stringifyPreview(args, 70), 70);
      return argsPreview ? `${toolName} ${argsPreview}` : toolName || "tool";
    }
  }
}

function extractTextFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const part of content as any[]) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "text" && typeof part.text === "string") {
      parts.push(part.text);
    } else if (part.type === "image") {
      parts.push("[image]");
    }
  }

  return parts.join("\n").trim();
}

function extractResultText(toolResult: any): string {
  if (!toolResult || typeof toolResult !== "object") return "";

  const contentText = extractTextFromContent(toolResult.content);
  if (contentText) return truncateTail(contentText, MAX_TOOL_PREVIEW_CHARS);

  if (typeof toolResult.text === "string") {
    return truncateTail(toolResult.text.trim(), MAX_TOOL_PREVIEW_CHARS);
  }

  if (typeof toolResult.message === "string") {
    return truncateTail(toolResult.message.trim(), MAX_TOOL_PREVIEW_CHARS);
  }

  return "";
}

function updateAssistantMetadata(result: SubagentResult, message: any): void {
  if (!message || message.role !== "assistant") return;
  if (!result.provider && message.provider) result.provider = message.provider;
  if (!result.model && message.model) result.model = message.model;
  if (message.stopReason) result.stopReason = message.stopReason;
  if (message.errorMessage) result.errorMessage = message.errorMessage;
}

function sanitizeAssistantMessage(message: any): Message {
  const sanitized = { ...message };
  delete sanitized.thinking;
  delete sanitized.reasoning;
  delete sanitized.reasoning_content;

  if (Array.isArray(message.content)) {
    sanitized.content = message.content
      .filter((part: any) => part?.type !== "thinking")
      .map((part: any) => {
        if (!part || typeof part !== "object") return part;
        const cleanPart = { ...part };
        delete cleanPart.thinking;
        delete cleanPart.reasoning;
        delete cleanPart.reasoning_content;
        return cleanPart;
      });
  }

  return sanitized;
}

function addAssistantMessage(result: InternalSubagentResult, message: any): boolean {
  if (!message || message.role !== "assistant") return false;

  const sanitizedMessage = sanitizeAssistantMessage(message);
  updateAssistantMetadata(result, sanitizedMessage);

  const signature = stableStringify(sanitizedMessage);
  const seen = getSeenMessageSignatures(result);
  if (seen.has(signature)) return false;
  seen.add(signature);

  result.messages.push(sanitizedMessage);

  result.usage.turns++;
  const usage = message.usage;
  if (usage) {
    result.usage.input += usage.input || 0;
    result.usage.output += usage.output || 0;
    result.usage.cacheRead += usage.cacheRead || 0;
    result.usage.cacheWrite += usage.cacheWrite || 0;
    result.usage.cost += usageCost(usage.cost);
    result.usage.contextTokens = usage.totalTokens || 0;
  }

  return true;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function usageCost(cost: any): number {
  if (!cost || typeof cost !== "object") return finiteNumber(cost);
  return (
    finiteNumber(cost.total) ||
    finiteNumber(cost.input) +
      finiteNumber(cost.output) +
      finiteNumber(cost.cacheRead) +
      finiteNumber(cost.cacheWrite)
  );
}

function addNestedForkUsage(result: InternalSubagentResult, message: any): boolean {
  if (!message || message.role !== "toolResult") return false;
  if (message.toolName !== "fork" && message.toolName !== "subagent") return false;

  const results = message.details?.results;
  if (!Array.isArray(results)) return false;

  const signature =
    typeof message.toolCallId === "string" && message.toolCallId
      ? `toolCallId:${message.toolCallId}`
      : stableStringify({ toolName: message.toolName, details: message.details });
  const seen = getSeenForkToolResultSignatures(result);
  if (seen.has(signature)) return false;

  let changed = false;
  for (const forkResult of results) {
    const usage = forkResult?.usage;
    if (!usage || typeof usage !== "object") continue;

    const input = finiteNumber(usage.input);
    const output = finiteNumber(usage.output);
    const cacheRead = finiteNumber(usage.cacheRead);
    const cacheWrite = finiteNumber(usage.cacheWrite);
    const cost = usageCost(usage.cost);
    const turns = finiteNumber(usage.turns);
    const contextTokens = finiteNumber(usage.contextTokens) || finiteNumber(usage.totalTokens);

    if (!(input || output || cacheRead || cacheWrite || cost || turns || contextTokens)) continue;

    result.usage.input += input;
    result.usage.output += output;
    result.usage.cacheRead += cacheRead;
    result.usage.cacheWrite += cacheWrite;
    result.usage.cost += cost;
    result.usage.turns += turns;
    result.usage.contextTokens = Math.max(result.usage.contextTokens || 0, contextTokens);
    changed = true;
  }

  if (changed) seen.add(signature);
  return changed;
}

function addMessageUsage(result: InternalSubagentResult, message: any): boolean {
  return addAssistantMessage(result, message) || addNestedForkUsage(result, message);
}

function addMessagesUsage(result: InternalSubagentResult, messages: unknown): boolean {
  if (!Array.isArray(messages)) return false;
  let changed = false;
  for (const message of messages) {
    if (addMessageUsage(result, message)) changed = true;
  }
  return changed;
}

function maxActivityOrder(result: SubagentResult): number {
  const orders: number[] = [];
  if (typeof result?.thinking?.activityOrder === "number")
    orders.push(result.thinking.activityOrder);
  if (Array.isArray(result?.activities)) {
    for (const activity of result.activities) {
      if (typeof activity?.activityOrder === "number") orders.push(activity.activityOrder);
    }
  }
  if (Array.isArray(result?.toolExecutions)) {
    for (const tool of result.toolExecutions) {
      if (typeof tool?.activityOrder === "number") orders.push(tool.activityOrder);
    }
  }
  return orders.length > 0 ? Math.max(...orders) : 0;
}

function nextActivityOrder(result: InternalSubagentResult): number {
  if (!Object.prototype.hasOwnProperty.call(result, "__activityOrder")) {
    Object.defineProperty(result, "__activityOrder", {
      value: maxActivityOrder(result),
      enumerable: false,
      configurable: false,
      writable: true,
    });
  }
  result.__activityOrder = (result.__activityOrder ?? 0) + 1;
  return result.__activityOrder;
}

function ensureActivities(result: SubagentResult): NonNullable<SubagentResult["activities"]> {
  if (!Array.isArray(result.activities)) result.activities = [];
  return result.activities;
}

function addActivity(result: SubagentResult, activity: any): any {
  const activities = ensureActivities(result);
  const totalBefore =
    typeof result.activityCount === "number" ? result.activityCount : activities.length;
  result.activityCount = totalBefore + 1;
  activities.push(activity);
  while (activities.length > MAX_STORED_ACTIVITIES) {
    activities.shift();
  }
  return activity;
}

function findToolActivity(result: SubagentResult, toolCallId: string | undefined): any | undefined {
  if (!toolCallId || !Array.isArray(result.activities)) return undefined;
  return result.activities.find(
    (activity) => activity?.type === "tool" && activity.toolCallId === toolCallId,
  );
}

function syncToolActivity(result: InternalSubagentResult, tool: any): any | undefined {
  if (!tool || typeof tool !== "object") return undefined;
  let activity = findToolActivity(result, tool.toolCallId);
  if (!activity) {
    activity = {
      type: "tool",
      ...tool,
      activityOrder: tool.activityOrder || nextActivityOrder(result),
    };
    addActivity(result, activity);
  } else {
    Object.assign(activity, tool, { type: "tool" });
  }
  return activity;
}

function latestActivity(result: SubagentResult): any | undefined {
  const activities = Array.isArray(result.activities) ? result.activities : [];
  return activities[activities.length - 1];
}

function latestRunningThinkingActivity(result: SubagentResult): any | undefined {
  const activities = Array.isArray(result.activities) ? result.activities : [];
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i];
    if (activity?.type === "thinking" && activity.status === "running") return activity;
  }
  return undefined;
}

function createThinkingActivity(result: InternalSubagentResult): any {
  return addActivity(result, {
    type: "thinking",
    status: "running",
    chars: 0,
    activityOrder: nextActivityOrder(result),
  });
}

function ensureLatestThinkingActivity(result: InternalSubagentResult): any {
  return latestRunningThinkingActivity(result) || createThinkingActivity(result);
}

function syncThinkingState(
  result: SubagentResult,
  activity: any,
): NonNullable<SubagentResult["thinking"]> {
  result.thinking = {
    status: activity.status,
    chars: activity.chars,
    activityOrder: activity.activityOrder,
  };
  return result.thinking;
}

function ensureToolExecutions(
  result: SubagentResult,
): NonNullable<SubagentResult["toolExecutions"]> {
  if (!Array.isArray(result.toolExecutions)) result.toolExecutions = [];
  return result.toolExecutions;
}

function findToolExecution(
  result: InternalSubagentResult,
  event: JsonRecord,
): NonNullable<SubagentResult["toolExecutions"]>[number] {
  const toolExecutions = ensureToolExecutions(result);
  const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : undefined;

  let tool = toolCallId
    ? toolExecutions.find((entry) => entry.toolCallId === toolCallId)
    : undefined;

  if (!tool) {
    const totalBefore =
      typeof result.toolExecutionCount === "number"
        ? result.toolExecutionCount
        : toolExecutions.length;
    result.toolExecutionCount = totalBefore + 1;
    tool = {
      toolCallId: toolCallId || `unknown-${result.toolExecutionCount}`,
      toolName: typeof event.toolName === "string" ? event.toolName : "tool",
      status: "running",
      updates: 0,
      activityOrder: nextActivityOrder(result),
    };
    toolExecutions.push(tool);
    while (toolExecutions.length > MAX_STORED_TOOL_EXECUTIONS) {
      toolExecutions.shift();
    }
  }

  if (typeof event.toolName === "string") tool.toolName = event.toolName;
  if (Object.prototype.hasOwnProperty.call(event, "args")) {
    tool.argsPreview = stringifyPreview(event.args, MAX_TOOL_ARGS_PREVIEW_CHARS);
    tool.displayText = formatToolCallPreview(tool.toolName, event.args);
  }

  if (!tool.displayText) tool.displayText = tool.toolName;

  return tool;
}

function processToolExecutionEvent(event: JsonRecord, result: InternalSubagentResult): boolean {
  const tool = findToolExecution(result, event);

  switch (event.type) {
    case "tool_execution_start":
      tool.status = "running";
      tool.isError = false;
      tool.latestText = "";
      syncToolActivity(result, tool);
      return true;

    case "tool_execution_update": {
      tool.status = "running";
      tool.isError = false;
      tool.updates = (tool.updates || 0) + 1;
      const latestText = extractResultText(event.partialResult);
      if (latestText) tool.latestText = latestText;
      syncToolActivity(result, tool);
      return true;
    }

    case "tool_execution_end": {
      tool.status = event.isError ? "error" : "completed";
      tool.isError = Boolean(event.isError);
      const latestText = extractResultText(event.result);
      if (latestText) tool.latestText = latestText;
      syncToolActivity(result, tool);
      return true;
    }

    default:
      return false;
  }
}

function processMessageUpdateEvent(event: JsonRecord, result: InternalSubagentResult): boolean {
  const assistantEvent = event.assistantMessageEvent;
  if (!assistantEvent || typeof assistantEvent !== "object") return false;

  switch (assistantEvent.type) {
    case "thinking_start": {
      const currentLatest = latestActivity(result);
      const activity =
        currentLatest?.type === "thinking" && currentLatest.status === "running"
          ? currentLatest
          : createThinkingActivity(result);
      activity.status = "running";
      syncThinkingState(result, activity);
      return true;
    }

    case "thinking_delta": {
      const activity = ensureLatestThinkingActivity(result);
      activity.status = "running";
      if (typeof assistantEvent.delta === "string") {
        activity.chars += assistantEvent.delta.length;
      }
      syncThinkingState(result, activity);
      return true;
    }

    case "thinking_end": {
      const activity = ensureLatestThinkingActivity(result);
      activity.status = "completed";
      if (typeof assistantEvent.content === "string") {
        activity.chars = assistantEvent.content.length;
      }
      syncThinkingState(result, activity);
      return true;
    }

    default:
      return false;
  }
}

export function processPiEvent(event: any, result: SubagentResult): boolean {
  if (!event || typeof event !== "object") return false;

  switch (event.type) {
    case "message_update":
      return processMessageUpdateEvent(event, result);

    case "message_end":
      return addMessageUsage(result, event.message);

    case "turn_end": {
      let changed = false;
      if (addMessageUsage(result, event.message)) changed = true;
      if (addMessagesUsage(result, event.toolResults)) changed = true;
      return changed;
    }

    case "agent_end":
      result.sawAgentEnd = true;
      return addMessagesUsage(result, event.messages);

    case "tool_execution_start":
    case "tool_execution_update":
    case "tool_execution_end":
      return processToolExecutionEvent(event, result);

    default:
      return false;
  }
}

export function processPiJsonLine(line: string, result: SubagentResult): boolean {
  if (!line.trim()) return false;

  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return false;
  }

  return processPiEvent(event, result);
}

export function getFinalAssistantText(messages: Message[]): string {
  if (!Array.isArray(messages)) return "";

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.role !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }

    const text = message.content
      .flatMap((part) =>
        part?.type === "text" && typeof part.text === "string" && part.text.length > 0
          ? [part.text]
          : [],
      )
      .join("");
    if (text) return text;
  }

  return "";
}

function getLatestRelevantToolExecution(result: SubagentResult): any | undefined {
  const activities = Array.isArray(result?.activities) ? result.activities : [];
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i];
    if (activity?.type === "tool" && activity.status === "running") return activity;
  }
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i];
    if (activity?.type === "tool") return activity;
  }

  const toolExecutions = Array.isArray(result?.toolExecutions) ? result.toolExecutions : [];
  for (let i = toolExecutions.length - 1; i >= 0; i--) {
    if (toolExecutions[i]?.status === "running") return toolExecutions[i];
  }

  return toolExecutions[toolExecutions.length - 1];
}

function formatToolStatusIcon(tool: any): string {
  if (tool?.status === "running") return "…";
  if (tool?.status === "error") return "×";
  return "✓";
}

function formatToolErrorSuffix(tool: any): string {
  if (tool?.status !== "error" && !tool?.isError) return "";
  if (typeof tool.latestText !== "string" || !tool.latestText.trim()) return "";
  return ` — ${truncateInline(tool.latestText, MAX_INLINE_ERROR_PREVIEW_CHARS)}`;
}

function formatThinkingActivityProgress(thinking: any): string {
  if (!thinking || typeof thinking !== "object") return "";
  const icon = thinking.status === "running" ? "…" : "✓";
  const chars = typeof thinking.chars === "number" ? thinking.chars : 0;
  const label =
    chars > 0
      ? `thinking ${formatCount(chars)} chars`
      : thinking.status === "running"
        ? "thinking..."
        : "thinking";
  return `${icon} ${label}`;
}

function getActivityOrder(item: any, fallback: number): number {
  return typeof item?.activityOrder === "number" ? item.activityOrder : fallback;
}

function formatActivityProgress(activity: any): string {
  if (activity?.type === "thinking") return formatThinkingActivityProgress(activity);
  if (activity?.type === "tool") {
    return `${formatToolStatusIcon(activity)} ${activity.displayText || activity.toolName || "tool"}${formatToolErrorSuffix(activity)}`;
  }
  return "";
}

function legacyActivities(result: SubagentResult): any[] {
  const activities: any[] = [];
  if (result?.thinking) activities.push({ ...result.thinking, type: "thinking" });
  const toolExecutions = Array.isArray(result?.toolExecutions) ? result.toolExecutions : [];
  for (const tool of toolExecutions) activities.push({ ...tool, type: "tool" });
  activities.sort((a, b) => getActivityOrder(a, 0) - getActivityOrder(b, 0));
  return activities;
}

function getStoredActivities(result: SubagentResult): any[] {
  const activities =
    Array.isArray(result?.activities) && result.activities.length > 0
      ? result.activities
      : legacyActivities(result);
  return activities.filter((activity) => activity && typeof activity === "object");
}

function totalActivities(result: SubagentResult, storedActivities: any[]): number {
  if (typeof result?.activityCount === "number") {
    return Math.max(result.activityCount, storedActivities.length);
  }
  if (Array.isArray(result?.activities) && result.activities.length > 0)
    return storedActivities.length;
  const totalTools =
    typeof result?.toolExecutionCount === "number"
      ? Math.max(
          result.toolExecutionCount,
          Array.isArray(result?.toolExecutions) ? result.toolExecutions.length : 0,
        )
      : Array.isArray(result?.toolExecutions)
        ? result.toolExecutions.length
        : 0;
  return totalTools + (result?.thinking ? 1 : 0);
}

function formatToolProgress(result: SubagentResult): string {
  const storedActivities = getStoredActivities(result);
  const lines: string[] = [];

  const toShow = storedActivities.slice(-10);
  const skipped = Math.max(0, totalActivities(result, storedActivities) - toShow.length);
  if (skipped > 0) lines.push(`... ${skipped} earlier activit${skipped === 1 ? "y" : "ies"}`);

  for (const activity of toShow) {
    const line = formatActivityProgress(activity);
    if (line) lines.push(line);
  }

  const activeTool = getLatestRelevantToolExecution(result);
  if (activeTool?.latestText && activeTool.status !== "error" && !activeTool.isError) {
    lines.push(activeTool.latestText);
  }

  return lines.join("\n").trim();
}

export function getForkProgressText(result: SubagentResult): string {
  const finalText = getFinalAssistantText(result?.messages);
  if (finalText) return finalText;

  const toolProgress = formatToolProgress(result);
  if (toolProgress) return toolProgress;

  if (typeof result?.errorMessage === "string" && result.errorMessage.trim()) {
    return result.errorMessage.trim();
  }

  return "(running...)";
}

export const getSubagentProgressText = getForkProgressText;

export function getResultSummaryText(result: SubagentResult): string {
  const finalText = getFinalAssistantText(result?.messages);
  if (finalText) return finalText;

  if (typeof result?.errorMessage === "string" && result.errorMessage.trim()) {
    return result.errorMessage.trim();
  }

  const isError =
    (typeof result?.exitCode === "number" && result.exitCode > 0) ||
    result?.stopReason === "error" ||
    result?.stopReason === "aborted";

  if (isError && typeof result?.stderr === "string" && result.stderr.trim()) {
    return result.stderr.trim();
  }

  return "(no output)";
}
