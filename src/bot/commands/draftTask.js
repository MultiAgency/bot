import { draftTask } from '../../ai/claude.js';
import { resolveCreationContext, createDraftTask, taskCreatedMessage } from './newTaskCore.js';

export function registerDraftTask(bot) {
  bot.command('drafttask', async (ctx) => {
    const { room, allowed, isPrivate } = await resolveCreationContext(ctx);
    if (!allowed) {
      return ctx.reply(
        isPrivate
          ? '🚫 Only global admins can create tasks via DM.'
          : '🚫 Only admins of this room (or global admins) can create tasks here.'
      );
    }

    const shortPrompt = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!shortPrompt) {
      return ctx.reply('ℹ️ Usage: /drafttask <short description of what you need>\n🤖 Claude will expand it into a full task draft for you to review.');
    }

    const drafted = await draftTask(shortPrompt).catch((err) => {
      console.error('draftTask failed:', err);
      return null;
    });

    if (!drafted) {
      return ctx.reply("❌ Couldn't draft a task from that - try /newtask for the manual flow instead.");
    }

    const task = await createDraftTask(ctx, room?.id ?? null, {
      title: drafted.title,
      description: drafted.description,
      requiredOutput: drafted.requiredOutput,
      category: drafted.category,
      requiredSkills: drafted.skillTags || [],
    });

    const { text, keyboard } = taskCreatedMessage(task);
    await ctx.reply(`🤖 AI-drafted:\n\n${text}\n\n👀 Edit with /newtask if it needs changes.`, keyboard);
  });
}
