import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notificationPermissionGranted: vi.fn(),
  playAgentReadySound: vi.fn(),
  requestNotificationAccess: vi.fn(),
  sendDesktopNotification: vi.fn(),
  sendNativeAgentReadyNotification: vi.fn(),
  emit: vi.fn(),
  listen: vi.fn(),
  show: vi.fn(),
  unminimize: vi.fn(),
  setFocus: vi.fn(),
}));

vi.mock("../api/notifications", () => ({
  notificationPermissionGranted: mocks.notificationPermissionGranted,
  playAgentReadySound: mocks.playAgentReadySound,
  requestNotificationAccess: mocks.requestNotificationAccess,
  sendDesktopNotification: mocks.sendDesktopNotification,
  sendNativeAgentReadyNotification: mocks.sendNativeAgentReadyNotification,
}));
vi.mock("@tauri-apps/api/event", () => ({ emit: mocks.emit, listen: mocks.listen }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    show: mocks.show,
    unminimize: mocks.unminimize,
    setFocus: mocks.setFocus,
  }),
}));

import { sendAgentReadyNotification } from "./agentNotifications";

class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  static instances: FakeNotification[] = [];
  onclick: (() => void) | null = null;
  close = vi.fn();

  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    FakeNotification.instances.push(this);
  }
}

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  vi.clearAllMocks();
  FakeNotification.instances = [];
  FakeNotification.permission = "granted";
  mocks.notificationPermissionGranted.mockResolvedValue(true);
  mocks.emit.mockResolvedValue(undefined);
  mocks.show.mockResolvedValue(undefined);
  mocks.unminimize.mockResolvedValue(undefined);
  mocks.setFocus.mockResolvedValue(undefined);
});

describe("agent notifications", () => {
  it("uses the native clickable macOS transport when available", async () => {
    vi.stubGlobal("navigator", { userAgent: "Macintosh" });
    mocks.sendNativeAgentReadyNotification.mockResolvedValue(true);

    await sendAgentReadyNotification({
      tabId: "terminal-2",
      body: "Ready",
      notification: true,
      sound: true,
    });

    expect(mocks.sendNativeAgentReadyNotification).toHaveBeenCalledWith(
      "terminal-2",
      "Ready",
      true,
    );
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it("preserves the terminal id in the clickable development fallback", async () => {
    vi.stubGlobal("navigator", { userAgent: "Macintosh" });
    vi.stubGlobal("window", { Notification: FakeNotification });
    mocks.sendNativeAgentReadyNotification.mockResolvedValue(false);

    await sendAgentReadyNotification({
      tabId: "terminal-3",
      body: "Ready",
      notification: true,
      sound: false,
    });
    FakeNotification.instances[0]?.onclick?.();

    await vi.waitFor(() => expect(mocks.setFocus).toHaveBeenCalled());
    expect(mocks.emit).toHaveBeenCalledWith("agent-ready-notification-clicked", "terminal-3");
    expect(mocks.show).toHaveBeenCalled();
    expect(mocks.unminimize).toHaveBeenCalled();
  });

  it("plays sound without requesting notification access", async () => {
    await sendAgentReadyNotification({ body: "Ready", notification: false, sound: true });

    expect(mocks.playAgentReadySound).toHaveBeenCalledOnce();
    expect(mocks.notificationPermissionGranted).not.toHaveBeenCalled();
  });

  it("falls back to the desktop transport when the GNOME client is unavailable", async () => {
    vi.stubGlobal("navigator", { userAgent: "Linux" });
    mocks.sendNativeAgentReadyNotification.mockResolvedValue(false);
    mocks.playAgentReadySound.mockResolvedValue(true);

    await sendAgentReadyNotification({
      tabId: "terminal-1",
      body: "Ready",
      notification: true,
      sound: true,
    });

    expect(mocks.sendNativeAgentReadyNotification).toHaveBeenCalledWith(
      "terminal-1",
      "Ready",
      false,
    );
    expect(mocks.sendDesktopNotification).toHaveBeenCalledWith({
      title: "Pi is ready",
      body: "Ready",
      sound: undefined,
    });
    expect(mocks.playAgentReadySound).toHaveBeenCalledOnce();
  });
});
