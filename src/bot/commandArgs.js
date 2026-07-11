// Telegram clients (especially mobile) can leave a double space after a
// command, attach @botname to it, or otherwise vary whitespace - a plain
// `text.split(' ')` then produces an empty string or wrong index instead of
// the intended argument, making the command silently fall through to its
// "Usage: ..." message even though the user typed it correctly.

// Whitespace-separated argument tokens after the command (id, status,
// decision words, ...).
export function commandArgs(ctx) {
  return ctx.message.text.trim().split(/\s+/).slice(1);
}

// Everything after the command as one string, with internal spacing
// preserved - for free-text arguments (a task description, a drafttask
// prompt) where collapsing whitespace via join(' ') would be wrong.
export function commandRest(ctx) {
  const match = ctx.message.text.match(/^\S+\s*(.*)$/s);
  return (match?.[1] || '').trim();
}
