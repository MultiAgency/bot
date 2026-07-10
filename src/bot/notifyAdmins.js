import { listRoomAdmins } from '../rooms.js';

export function notifyAdmins(ctx, text) {
  const admins = (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return Promise.allSettled(admins.map((adminId) => ctx.telegram.sendMessage(adminId, text)));
}

// Like notifyAdmins, but also includes that task's room admins - global
// admins alone would miss room admins who aren't in ADMIN_TELEGRAM_IDS.
export async function notifyTaskManagers(ctx, task, text) {
  const globalAdmins = (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const roomAdmins = task.roomId ? await listRoomAdmins(task.roomId) : [];
  const roomAdminIds = roomAdmins.map((a) => a.telegramUserId.toString());

  const recipients = new Set([...globalAdmins, ...roomAdminIds]);
  return Promise.allSettled([...recipients].map((id) => ctx.telegram.sendMessage(id, text)));
}
