import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import type { Settings } from "./types.ts";

const SETTINGS_KEY = "subagent";

function readJsonSafe(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {};
  }
}

function isPackageSource(value: string): boolean {
  return value.startsWith("npm:") || value.startsWith("git:");
}

export function resolveConfiguredPath(value: string, baseDir: string): string {
  if (!value) return value;
  if (isPackageSource(value)) return value;
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  if (path.isAbsolute(value)) return value;
  return path.resolve(baseDir, value);
}

function parseEnvironment(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const environment: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (
      !key ||
      key.includes("=") ||
      key.includes("\0") ||
      typeof rawValue !== "string" ||
      rawValue.includes("\0")
    )
      continue;
    environment[key] = rawValue;
  }
  return environment;
}

function mergeEnvironment(
  base: Record<string, string> | undefined,
  overrides: Record<string, string> | undefined,
): Record<string, string> {
  const environment = { ...(base ?? {}) };
  if (!overrides) return environment;

  if (process.platform === "win32") {
    for (const [overrideKey, overrideValue] of Object.entries(overrides)) {
      const normalizedKey = overrideKey.toLowerCase();
      for (const key of Object.keys(environment)) {
        if (key.toLowerCase() === normalizedKey) delete environment[key];
      }
      environment[overrideKey] = overrideValue;
    }
    return environment;
  }

  return {
    ...environment,
    ...overrides,
  };
}

function readSettings(filePath: string, baseDir: string): Partial<Settings> {
  const raw = readJsonSafe(filePath)[SETTINGS_KEY];
  if (!raw || typeof raw !== "object") return {};

  const config = raw as Record<string, unknown>;
  const settings: Partial<Settings> = {};

  if (typeof config.model === "string" && config.model.trim()) {
    settings.model = config.model;
  } else if (config.model === null) {
    settings.model = null;
  }

  if (config.extensions === null) {
    settings.extensions = null;
  } else if (Array.isArray(config.extensions)) {
    settings.extensions = config.extensions
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => resolveConfiguredPath(entry.trim(), baseDir));
  }

  const environment = parseEnvironment(config.environment);
  if (environment) {
    settings.environment = environment;
  }

  return settings;
}

export function resolveSettings(cwd: string): Settings {
  const globalDir = getAgentDir();
  const projectDir = path.join(cwd, CONFIG_DIR_NAME);
  const globalSettings = readSettings(path.join(globalDir, "settings.json"), globalDir);
  const projectSettings = readSettings(path.join(projectDir, "settings.json"), projectDir);

  return {
    model: null,
    extensions: null,
    ...globalSettings,
    ...projectSettings,
    environment: mergeEnvironment(globalSettings.environment, projectSettings.environment),
  };
}
