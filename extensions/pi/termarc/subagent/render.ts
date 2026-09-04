import { getMarkdownTheme, keyHint } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { getFinalAssistantText } from "./runner-events.ts";
import { type SubagentResult, isResultError, isResultSuccess } from "./types.ts";

const COLLAPSED_ACTIVITY_COUNT = 8;
const COLLAPSED_OUTPUT_LINES = 3;
const MAX_TASK_PREVIEW_CHARS = 72;
const MAX_TEXT_PREVIEW_CHARS = 280;
const MAX_ERROR_PREVIEW_CHARS = 1200;
const MAX_INLINE_ERROR_PREVIEW_CHARS = 160;

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function preview(value: unknown, maxChars: number): string {
  if (typeof value !== "string" || !value.trim()) return "...";
  return truncate(value.replace(/\s+/g, " ").trim(), maxChars);
}

function textPreview(text: string, maxChars = MAX_TEXT_PREVIEW_CHARS): string {
  return truncate(text.trim().split(/\r?\n/).slice(0, COLLAPSED_OUTPUT_LINES).join("\n"), maxChars);
}

function inlinePreview(text: string, maxChars = MAX_INLINE_ERROR_PREVIEW_CHARS): string {
  return truncate(text.replace(/\s+/g, " ").trim(), maxChars);
}

function fmtCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function fmtModelProvider(result: SubagentResult): string {
  const provider = result.provider?.trim();
  const model = result.model?.trim();
  if (provider && model) return model.startsWith(`${provider}/`) ? model : `${provider}/${model}`;
  return model || provider || "";
}

function fmtUsage(result: SubagentResult): string {
  const usage = result.usage;
  if (!usage) return "";

  const parts: string[] = [];
  if (usage.turns) parts.push(`${usage.turns} turn${usage.turns === 1 ? "" : "s"}`);
  if (usage.input) parts.push(`↑${fmtCount(usage.input)}`);
  if (usage.output) parts.push(`↓${fmtCount(usage.output)}`);
  if (usage.cacheRead) parts.push(`R${fmtCount(usage.cacheRead)}`);
  if (usage.cacheWrite) parts.push(`W${fmtCount(usage.cacheWrite)}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(4)}`);
  const modelProvider = fmtModelProvider(result);
  if (modelProvider) parts.push(modelProvider);
  return parts.join(" ");
}

function getPrimaryResult(toolResult: any): SubagentResult | undefined {
  const results = toolResult?.details?.results;
  return Array.isArray(results) && results.length > 0 ? results[0] : undefined;
}

function getFallbackText(toolResult: any): string {
  const content = toolResult?.content;
  if (!Array.isArray(content)) return "(no output)";
  const text = content.find((part) => part?.type === "text" && typeof part.text === "string");
  return text?.text || "(no output)";
}

function status(result: SubagentResult): "running" | "success" | "error" {
  if (result.exitCode === -1) return "running";
  if (isResultSuccess(result)) return "success";
  if (isResultError(result)) return "error";
  return "error";
}

function statusIcon(result: SubagentResult, fg: (color: any, text: string) => string): string {
  const current = status(result);
  if (current === "running") return fg("warning", "…");
  if (current === "error") return fg("error", "×");
  return fg("success", "✓");
}

function statusLabel(current: "running" | "success" | "error"): string {
  if (current === "running") return "running";
  if (current === "success") return "completed";
  return "failed";
}

function toolIcon(tool: any, fg: (color: any, text: string) => string): string {
  if (tool?.status === "running") return fg("warning", "…");
  if (tool?.status === "error" || tool?.isError) return fg("error", "×");
  return fg("success", "✓");
}

function toolLabel(tool: any): string {
  return tool?.displayText || tool?.toolName || "tool";
}

function toolErrorSuffix(tool: any, fg: (color: any, text: string) => string): string {
  if (tool?.status !== "error" && !tool?.isError) return "";
  if (typeof tool.latestText !== "string" || !tool.latestText.trim()) return "";
  return fg("error", ` — ${inlinePreview(tool.latestText)}`);
}

function totalToolExecutions(result: SubagentResult): number {
  const stored = Array.isArray(result.toolExecutions) ? result.toolExecutions.length : 0;
  return typeof result.toolExecutionCount === "number"
    ? Math.max(result.toolExecutionCount, stored)
    : stored;
}

function hasUnifiedActivities(result: SubagentResult): boolean {
  return Array.isArray(result.activities) && result.activities.length > 0;
}

function latestToolWithPreview(result: SubagentResult): any | undefined {
  const activities = hasUnifiedActivities(result) ? result.activities! : [];
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i];
    if (activity?.type === "tool" && activity.status === "running" && activity.latestText)
      return activity;
  }

  const tools = Array.isArray(result.toolExecutions) ? result.toolExecutions : [];
  for (let i = tools.length - 1; i >= 0; i--) {
    const tool = tools[i];
    if (tool?.status === "running" && tool.latestText) return tool;
  }
  return undefined;
}

function thinkingLine(thinking: any, fg: (color: any, text: string) => string): string {
  if (!thinking) return "";
  const icon = thinking.status === "running" ? fg("warning", "…") : fg("success", "✓");
  const chars = typeof thinking.chars === "number" ? thinking.chars : 0;
  const label =
    chars > 0
      ? `thinking ${fmtCount(chars)} chars`
      : thinking.status === "running"
        ? "thinking..."
        : "thinking";
  return `${icon} ${fg("toolOutput", label)}`;
}

function activityOrder(item: any, fallback: number): number {
  return typeof item?.activityOrder === "number" ? item.activityOrder : fallback;
}

function legacyActivities(result: SubagentResult): any[] {
  const activities: any[] = [];
  if (result.thinking) activities.push({ ...result.thinking, type: "thinking" });
  const tools = Array.isArray(result.toolExecutions) ? result.toolExecutions : [];
  for (const tool of tools) activities.push({ ...tool, type: "tool" });
  activities.sort((a, b) => activityOrder(a, 0) - activityOrder(b, 0));
  return activities;
}

function storedActivities(result: SubagentResult): any[] {
  return hasUnifiedActivities(result) ? result.activities! : legacyActivities(result);
}

function totalActivityCount(result: SubagentResult, stored: any[]): number {
  if (typeof result.activityCount === "number")
    return Math.max(result.activityCount, stored.length);
  if (hasUnifiedActivities(result)) return stored.length;
  return totalToolExecutions(result) + (result.thinking ? 1 : 0);
}

function activityLine(activity: any, fg: (color: any, text: string) => string): string {
  if (activity?.type === "thinking") return thinkingLine(activity, fg);
  if (activity?.type === "tool") {
    return `${toolIcon(activity, fg)} ${fg(activity?.status === "error" ? "error" : "toolOutput", toolLabel(activity))}${toolErrorSuffix(activity, fg)}`;
  }
  return "";
}

function renderActivityLines(
  result: SubagentResult,
  fg: (color: any, text: string) => string,
  limit?: number,
): string {
  const activities = storedActivities(result);
  const lines: string[] = [];

  const toShow = limit ? activities.slice(-limit) : activities;
  const skipped = Math.max(0, totalActivityCount(result, activities) - toShow.length);
  if (skipped > 0)
    lines.push(fg("muted", `... ${skipped} earlier activit${skipped === 1 ? "y" : "ies"}`));

  for (const activity of toShow) {
    const line = activityLine(activity, fg);
    if (line) lines.push(line);
  }

  const previewTool = latestToolWithPreview(result);
  if (previewTool?.latestText) {
    lines.push("");
    lines.push(fg("toolOutput", textPreview(previewTool.latestText, MAX_TEXT_PREVIEW_CHARS)));
  }

  return lines.join("\n").trimEnd();
}

function errorText(result: SubagentResult): string {
  const message = result.errorMessage?.trim() || result.stderr?.trim() || "";
  return message ? truncate(message, MAX_ERROR_PREVIEW_CHARS) : "";
}

function addSection(
  container: any,
  title: string,
  child: any,
  fg: (color: any, text: string) => string,
) {
  container.addChild(new Spacer(1));
  container.addChild(new Text(fg("muted", title), 0, 0));
  container.addChild(child);
}

export function renderSubagentCall(args: any, theme: any) {
  const fg = theme.fg.bind(theme);
  const name = typeof args?.name === "string" && args.name.trim() ? args.name.trim() : "subagent";
  const agent =
    typeof args?.agent === "string" && args.agent.trim() ? ` (${args.agent.trim()})` : "";
  const cwd = typeof args?.cwd === "string" && args.cwd.trim() ? ` @ ${args.cwd.trim()}` : "";
  const text = `${fg("toolTitle", theme.bold(name))}${fg("dim", agent)}${fg("muted", cwd)} ${fg("dim", preview(args?.task, MAX_TASK_PREVIEW_CHARS))}`;
  return new Text(text, 0, 0);
}

export function renderSubagentResult(
  toolResult: any,
  { expanded }: { expanded: boolean },
  theme: any,
) {
  const result = getPrimaryResult(toolResult);
  if (!result) return new Text(getFallbackText(toolResult), 0, 0);

  const fg = theme.fg.bind(theme);
  const currentStatus = status(result);
  const icon = statusIcon(result, fg);
  const finalOutput = getFinalAssistantText(result.messages);
  const usage = fmtUsage(result);
  const activityText = renderActivityLines(
    result,
    fg,
    expanded ? undefined : COLLAPSED_ACTIVITY_COUNT,
  );
  const mdTheme = getMarkdownTheme();

  if (expanded) {
    const container = new Container();
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        `${icon} ${fg("toolTitle", theme.bold(statusLabel(currentStatus)))} ${fg("dim", result.agent)}`,
        0,
        0,
      ),
    );

    addSection(
      container,
      "─── Agent ───",
      new Text(
        fg("dim", `${result.agent}${result.agentSource ? ` (${result.agentSource})` : ""}`),
        0,
        0,
      ),
      fg,
    );
    if (result.cwd)
      addSection(container, "─── Working directory ───", new Text(fg("dim", result.cwd), 0, 0), fg);
    addSection(container, "─── Task ───", new Text(fg("dim", result.task || "..."), 0, 0), fg);

    if (activityText) addSection(container, "─── Activity ───", new Text(activityText, 0, 0), fg);

    if (finalOutput) {
      addSection(container, "─── Output ───", new Markdown(finalOutput.trim(), 0, 0, mdTheme), fg);
    } else if (currentStatus !== "running") {
      addSection(
        container,
        "─── Output ───",
        new Text(fg("muted", "(no final response)"), 0, 0),
        fg,
      );
    }

    const err = currentStatus === "error" ? errorText(result) : "";
    if (err) addSection(container, "─── Error ───", new Text(fg("error", err), 0, 0), fg);

    if (usage) {
      container.addChild(new Spacer(1));
      container.addChild(new Text(fg("dim", usage), 0, 0));
    }

    return container;
  }

  const collapsedStatusPrefix = currentStatus === "running" ? "" : "\n";
  let text = `${collapsedStatusPrefix}${icon} ${fg("toolTitle", theme.bold(statusLabel(currentStatus)))} ${fg("dim", result.agent)}`;

  if (activityText) {
    text += `\n${activityText}`;
    if (finalOutput) text += `\n\n${fg("toolOutput", textPreview(finalOutput))}`;
  } else if (finalOutput) {
    text += `\n${fg("toolOutput", textPreview(finalOutput))}`;
  } else if (currentStatus === "running") {
    text += `\n${fg("muted", "(running...)")}`;
  } else {
    text += `\n${fg("muted", "(no final response)")}`;
  }

  if (currentStatus === "error") {
    const err = errorText(result);
    if (err) text += `\n${fg("error", textPreview(err))}`;
  }

  if (usage) text += `\n${fg("dim", usage)}`;

  const activities = storedActivities(result);
  const totalActivities = totalActivityCount(result, activities);
  if (
    !expanded &&
    (totalActivities > COLLAPSED_ACTIVITY_COUNT || finalOutput || currentStatus !== "running")
  ) {
    text += `\n(${keyHint("app.tools.expand", "to expand")})`;
  }

  return new Text(text, 0, 0);
}
