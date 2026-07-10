import { listRoomAdmins } from '../rooms.js';

export function notifyAdmins(ctx, text) {
  const admins = (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return Promise.allSettled(admins.map((adminId) => ctx.telegram.sendMessage(adminId, text)));
}

// Global admins + that task's room admins, deduped - the set of people who
// are allowed to act on this task and so should hear about things happening
// to it.
export async function getTaskManagerIds(task) {
  const globalAdmins = (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const roomAdmins = task.roomId ? await listRoomAdmins(task.roomId) : [];
  const roomAdminIds = roomAdmins.map((a) => a.telegramUserId.toString());

  return [...new Set([...globalAdmins, ...roomAdminIds])];
}

// Like notifyAdmins, but also includes that task's room admins - global
// admins alone would miss room admins who aren't in ADMIN_TELEGRAM_IDS.
export async function notifyTaskManagers(ctx, task, text) {
  const recipients = await getTaskManagerIds(task);
  return Promise.allSettled(recipients.map((id) => ctx.telegram.sendMessage(id, text)));
}
