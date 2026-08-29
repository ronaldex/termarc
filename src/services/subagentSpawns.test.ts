import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubagentSpawnRequest } from "../api/subagentSpawns";

const transport = vi.hoisted(() => ({
  listener: undefined as ((event: { payload: SubagentSpawnRequest }) => void) | undefined,
  register: vi.fn(async () => undefined),
  unlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_name: string, listener: typeof transport.listener) => {
    transport.listener = listener;
    return transport.unlisten;
  }),
}));
vi.mock("../api/subagentSpawns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/subagentSpawns")>()),
  registerTopLevelTerminals: transport.register,
  acknowledgeSubagentSpawn: vi.fn(async () => undefined),
}));
import type { TerminalTab, TerminalTabState } from "../types/terminal";
import {
  createSubagentSpawnService,
  handleSubagentSpawnRequest,
  topLevelTerminalMetadata,
} from "./subagentSpawns";

beforeEach(() => {
  transport.listener = undefined;
  transport.register.mockClear();
  transport.unlisten.mockClear();
});

const request: SubagentSpawnRequest = {
  subagentId: "subagent-1",
  parentTerminalId: "parent-1",
  projectId: "project-1",
  name: "Research authentication",
  command: "pi --mode rpc",
  cwd: "/tmp/project",
  processKind: "pi",
};

describe("top-level terminal registration", () => {
  it("excludes subagent terminals from the parent registry", () => {
    const tabs = [
      { id: "shell-1", projectId: "project-1", launch: { kind: "shell" } },
      {
        id: "child-1",
        projectId: "project-1",
        launch: {
          kind: "subagent",
          subagentId: "subagent-1",
          parentTerminalId: "shell-1",
          name: "Child",
          commandLine: "pi",
          processKind: "pi",
        },
      },
    ] as TerminalTabState[];

    expect(topLevelTerminalMetadata(tabs)).toEqual([
      { terminalId: "shell-1", projectId: "project-1" },
    ]);

    const shellChild = {
      id: "shell-child",
      projectId: "project-1",
      parentTerminalId: "shell-1",
      launch: { kind: "shell" },
    } as TerminalTabState;
    expect(topLevelTerminalMetadata([...tabs, shellChild])).toEqual([
      { terminalId: "shell-1", projectId: "project-1" },
    ]);
  });
});

describe("frontend subagent spawn handling", () => {
  it("crosses the real service listener boundary and rolls back an ack/start race", async () => {
    let releaseStart!: (result: { outcome: "failed"; error: string }) => void;
    const start = new Promise<{ outcome: "failed"; error: string }>((resolve) => {
      releaseStart = resolve;
    });
    const closeTab = vi.fn(async () => undefined);
    const acknowledge = vi.fn(async () => undefined);
    const service = createSubagentSpawnService({
      createTab: async () => ({ id: "child-terminal" }) as TerminalTab,
      startTab: async () => start,
      closeTab,
      acknowledge,
    });
    service.update([
      { id: "parent-1", projectId: "project-1", launch: { kind: "shell" } },
    ] as TerminalTabState[]);
    await service.start();
    await Promise.resolve();
    expect(transport.register).toHaveBeenCalledWith([
      { terminalId: "parent-1", projectId: "project-1" },
    ]);

    transport.listener!({ payload: request });
    releaseStart({ outcome: "failed", error: "PTY setup event won the start-command race" });
    await vi.waitFor(() => expect(acknowledge).toHaveBeenCalled());

    expect(closeTab).toHaveBeenCalledWith("child-terminal");
    expect(acknowledge).toHaveBeenCalledWith({
      subagentId: "subagent-1",
      success: false,
      error: "PTY setup event won the start-command race",
    });
    service.dispose();
    expect(transport.unlisten).toHaveBeenCalled();
  });

  it("creates a runtime subagent launch, starts it, and acknowledges success", async () => {
    const tab = { id: "child-terminal", detail: "running" } as TerminalTab;
    const createTab = vi.fn(async () => tab);
    const startTab = vi.fn(async () => ({
      outcome: "running" as const,
      session: { id: "pty-1", shell: "/bin/zsh" },
    }));
    const acknowledge = vi.fn(async () => undefined);

    await handleSubagentSpawnRequest(request, {
      createTab,
      startTab,
      closeTab: vi.fn(async () => undefined),
      acknowledge,
    });

    expect(createTab).toHaveBeenCalledWith("project-1", "/tmp/project", {
      launch: {
        kind: "subagent",
        subagentId: "subagent-1",
        parentTerminalId: "parent-1",
        name: "Research authentication",
        commandLine: "pi --mode rpc",
        processKind: "pi",
      },
      launchTitle: "Research authentication",
      start: false,
      activate: false,
    });
    expect(startTab).toHaveBeenCalledWith(tab);
    expect(acknowledge).toHaveBeenCalledWith({ subagentId: "subagent-1", success: true });
  });

  it("rejects a spawn whose parent was removed before the event was handled", async () => {
    const createTab = vi.fn(async () => undefined);
    const acknowledge = vi.fn(async () => undefined);

    await handleSubagentSpawnRequest(request, {
      createTab,
      startTab: vi.fn(async () => ({ outcome: "cancelled" as const })),
      closeTab: vi.fn(async () => undefined),
      acknowledge,
      isParentAvailable: () => false,
    });

    expect(createTab).not.toHaveBeenCalled();
    expect(acknowledge).toHaveBeenCalledWith({
      subagentId: "subagent-1",
      success: false,
      error: "parent terminal is no longer available",
    });
  });

  it("closes an attached tab if the acknowledgement arrives after backend rollback", async () => {
    const tab = { id: "child-terminal", detail: "running" } as TerminalTab;
    const closeTab = vi.fn(async () => undefined);

    await expect(
      handleSubagentSpawnRequest(request, {
        createTab: async () => tab,
        startTab: async () => ({
          outcome: "running",
          session: { id: "pty-1", shell: "/bin/zsh" },
        }),
        closeTab,
        acknowledge: async () => {
          throw new Error("unknown subagent");
        },
      }),
    ).rejects.toThrow("unknown subagent");
    expect(closeTab).toHaveBeenCalledWith("child-terminal");
  });

  it("accepts a process that starts and exits before acknowledgement", async () => {
    const acknowledge = vi.fn(async () => undefined);

    await handleSubagentSpawnRequest(request, {
      createTab: async () => ({ id: "child-terminal" }) as TerminalTab,
      startTab: async () => ({ outcome: "exited", exitCode: 0 }),
      closeTab: vi.fn(async () => undefined),
      acknowledge,
    });

    expect(acknowledge).toHaveBeenCalledWith({ subagentId: "subagent-1", success: true });
  });

  it("closes a failed tab and acknowledges failure", async () => {
    const tab = { id: "child-terminal", detail: "PTY failed" } as TerminalTab;
    const closeTab = vi.fn(async () => undefined);
    const acknowledge = vi.fn(async () => undefined);

    await handleSubagentSpawnRequest(request, {
      createTab: async () => tab,
      startTab: async () => ({ outcome: "failed", error: "PTY failed" }),
      closeTab,
      acknowledge,
    });

    expect(closeTab).toHaveBeenCalledWith("child-terminal");
    expect(acknowledge).toHaveBeenCalledWith({
      subagentId: "subagent-1",
      success: false,
      error: "PTY failed",
    });
  });
});
