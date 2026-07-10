export function isAdmin(ctx) {
  const admins = (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return admins.includes(String(ctx.from.id));
}
