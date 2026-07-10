import { prisma } from './db.js';

export async function getOrCreateRoom(chatId, chatTitle) {
  return prisma.room.upsert({
    where: { chatId: BigInt(chatId) },
    update: chatTitle ? { chatTitle } : {},
    create: { chatId: BigInt(chatId), chatTitle },
  });
}

export async function getRoomByChatId(chatId) {
  return prisma.room.findUnique({ where: { chatId: BigInt(chatId) } });
}

export async function setSignalsEnabled(chatId, enabled) {
  return prisma.room
    .update({ where: { chatId: BigInt(chatId) }, data: { signalsEnabled: enabled } })
    .catch(() => null); // no-op if the room row doesn't exist yet
}

export async function isSignalsEnabled(chatId) {
  const room = await prisma.room.findUnique({ where: { chatId: BigInt(chatId) } });
  return room?.signalsEnabled ?? false;
}

export async function isRoomAdmin(roomId, telegramUserId) {
  if (!roomId) return false;
  const entry = await prisma.roomAdmin.findUnique({
    where: { roomId_telegramUserId: { roomId, telegramUserId: BigInt(telegramUserId) } },
  });
  return entry != null;
}

export async function addRoomAdmin(roomId, telegramUserId) {
  return prisma.roomAdmin.upsert({
    where: { roomId_telegramUserId: { roomId, telegramUserId: BigInt(telegramUserId) } },
    update: {},
    create: { roomId, telegramUserId: BigInt(telegramUserId) },
  });
}

export async function removeRoomAdmin(roomId, telegramUserId) {
  return prisma.roomAdmin
    .delete({ where: { roomId_telegramUserId: { roomId, telegramUserId: BigInt(telegramUserId) } } })
    .catch(() => null);
}

export async function listRoomAdmins(roomId) {
  return prisma.roomAdmin.findMany({ where: { roomId } });
}
