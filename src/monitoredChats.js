import { prisma } from './db.js';

export async function isMonitored(chatId) {
  const chat = await prisma.monitoredChat.findUnique({ where: { chatId: BigInt(chatId) } });
  return chat?.enabled ?? false;
}

export async function enableChat({ chatId, chatTitle, actorTelegramId }) {
  return prisma.monitoredChat.upsert({
    where: { chatId: BigInt(chatId) },
    update: { enabled: true, chatTitle },
    create: {
      chatId: BigInt(chatId),
      chatTitle,
      enabled: true,
      addedByTelegramId: BigInt(actorTelegramId),
    },
  });
}

export async function disableChat(chatId) {
  return prisma.monitoredChat
    .update({ where: { chatId: BigInt(chatId) }, data: { enabled: false } })
    .catch(() => null); // no-op if the chat was never enabled
}
