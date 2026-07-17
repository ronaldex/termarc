import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  notificationPermissionGranted,
  playAgentReadySound,
  requestNotificationAccess,
  sendDesktopNotification,
  sendMacAgentReadyNotification,
} from "../api/notifications";

const NOTIFICATION_CLICKED_EVENT = "agent-ready-notification-clicked";

type AgentReadyNotification = {
  tabId?: string;
  body: string;
  notification: boolean;
  sound: boolean;
};

export async function sendAgentReadyNotification({
  tabId,
  body,
  notification,
  sound,
}: AgentReadyNotification): Promise<void> {
  try {
    if (!notification) {
      if (sound) await playAgentReadySound();
      return;
    }

    let permissionGranted = await notificationPermissionGranted();
    if (!permissionGranted) permissionGranted = (await requestNotificationAccess()) === "granted";
    if (!permissionGranted) return;

    if (navigator.userAgent.includes("Mac")) {
      const clickable = await sendMacAgentReadyNotification(tabId ?? "", body, sound);
      if (!clickable) await sendClickableWebNotification(tabId, body, sound);
      return;
    }

    sendDesktopNotification({
      title: "Pi is ready",
      body,
      sound: sound ? "default" : undefined,
    });
  } catch (error) {
    console.error("Could not send agent ready notification", error);
  }
}

export function listenForAgentNotificationClicks(
  onClick: (tabId: string) => void,
): Promise<UnlistenFn> {
  return listen<string>(NOTIFICATION_CLICKED_EVENT, ({ payload }) => onClick(payload));
}

async function sendClickableWebNotification(
  tabId: string | undefined,
  body: string,
  sound: boolean,
): Promise<void> {
  if (!("Notification" in window)) {
    sendDesktopNotification({ title: "Pi is ready", body, sound: sound ? "Ping" : undefined });
    return;
  }

  let permission = window.Notification.permission;
  if (permission === "default") permission = await window.Notification.requestPermission();
  if (permission !== "granted") return;

  const notification = new window.Notification("Pi is ready", {
    body,
    tag: tabId,
    silent: !sound,
  });
  notification.onclick = () => {
    notification.close();
    void openNotificationTerminal(tabId).catch((error) =>
      console.error("Could not open notification terminal", error),
    );
  };
}

async function openNotificationTerminal(tabId: string | undefined): Promise<void> {
  if (tabId) await emit(NOTIFICATION_CLICKED_EVENT, tabId);
  const appWindow = getCurrentWindow();
  await appWindow.show();
  await appWindow.unminimize();
  await appWindow.setFocus();
}
