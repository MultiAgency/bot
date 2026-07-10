import { isAdmin } from './isAdmin.js';
import { isRoomAdmin } from '../rooms.js';

export { isAdmin };

// Global admins (ADMIN_TELEGRAM_IDS) can manage any room; room admins are
// scoped to the room they were added to.
export async function canManageRoom(ctx, roomId) {
  if (isAdmin(ctx)) return true;
  return isRoomAdmin(roomId, ctx.from.id);
}

// A task with no roomId (created via DM) is only manageable by global
// admins, since there's no room roster to check it against.
export async function canManageTask(ctx, task) {
  if (isAdmin(ctx)) return true;
  if (!task.roomId) return false;
  return isRoomAdmin(task.roomId, ctx.from.id);
}
