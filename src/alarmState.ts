import type { GatewaySnapshot } from "./types";

export const PASSWORD_REMINDER_MASK = 0x80000;
export function isPasswordReminderAlarm(value: string): boolean {
  return /password|парол|парол/i.test(value);
}

export function unknownAlarmMask(snapshot: GatewaySnapshot | null): number {
  if (!snapshot) return 0;
  if (typeof snapshot.unknownAlarmMask === "number") return snapshot.unknownAlarmMask;
  // Compatibility with gateways released before unknownAlarmMask was added.
  return (snapshot.alarms?.length ?? 0) === 0 ? (snapshot.alarmMask ?? 0) & ~PASSWORD_REMINDER_MASK : 0;
}

export function passwordReminder(snapshot: GatewaySnapshot | null): boolean {
  return !!snapshot && (((snapshot.alarmMask ?? 0) & PASSWORD_REMINDER_MASK) !== 0);
}

export function alarmCount(snapshot: GatewaySnapshot | null): number {
  return (snapshot?.alarms ?? []).filter((alarm) => !isPasswordReminderAlarm(alarm)).length + (unknownAlarmMask(snapshot) !== 0 ? 1 : 0);
}
