import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export type DesktopNotification = {
  title: string;
  body: string;
  sound?: string;
};

export function notificationPermissionGranted(): Promise<boolean> {
  return isPermissionGranted();
}

export function requestNotificationAccess(): Promise<NotificationPermission> {
  return requestPermission();
}

export function sendDesktopNotification(notification: DesktopNotification): void {
  sendNotification(notification);
}

/** Returns whether the backend could send a notification with a native click callback. */
export function sendMacAgentReadyNotification(
  tabId: string,
  body: string,
  sound: boolean,
): Promise<boolean> {
  return invoke<boolean>("notify_agent_ready", { tabId, body, sound });
}

export function playAgentReadySound(): Promise<boolean> {
  return invoke<boolean>("play_agent_ready_sound");
}
