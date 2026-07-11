import { isAiEnabled } from '../../rooms.js';
import { runAgentTurn } from '../../ai/agent.js';

// Must be registered before every other text/command handler (see
// bot/index.js). When a group has AI mode on, this swallows the update
// (doesn't call next()) so no classic command handler or signal listener
// ever sees it - the AI agent is the only thing that responds. /ai itself
// is exempted so a room can always be switched back off. Callback queries
// (button taps) are a different update type and never pass through here,
// so existing confirm buttons (task_approve, task_apply, ...) keep working
// exactly as before regardless of AI mode.
export function registerAiRouter(bot) {
  bot.on('text', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();

    const text = ctx.message.text.trim();
    if (/^\/ai(\s|@|$)/.test(text)) return next();

    const enabled = await isAiEnabled(ctx.chat.id);
    if (!enabled) return next();

    await runAgentTurn(ctx, text).catch((err) => {
      console.error('AI agent turn failed:', err);
      return ctx.reply('⚠️ Something went wrong talking to the AI - try again in a moment.');
    });
  });
}
