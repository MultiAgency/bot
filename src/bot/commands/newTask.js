import {
  resolveCreationContext,
  createDraftTask,
  taskCreatedMessage,
  forceReplyExtra,
  handleNewTaskCategoryChoice,
  handleNewTaskSkillToggle,
  handleNewTaskSkillsDone,
} from './newTaskCore.js';
import { setPending, peekPending } from '../pendingActions.js';

export function registerNewTask(bot) {
  bot.command('newtask', async (ctx) => {
    const { room, allowed, isPrivate } = await resolveCreationContext(ctx);
    if (!allowed) {
      return ctx.reply(
        isPrivate
          ? '🚫 Only global admins can create tasks via DM.'
          : '🚫 Only admins of this room (or global admins) can create tasks here.'
      );
    }

    const raw = ctx.message.text.split(' ').slice(1).join(' ').trim();

    if (!raw) {
      setPending(ctx.from.id, 'newtask_wizard', { step: 'title', roomId: room?.id ?? null, fields: {} });
      return ctx.reply("📝 Starting a new task draft. What's the title? (/cancel to stop)", forceReplyExtra(ctx));
    }

    const [title, description, reward, requiredOutput, category, skillsRaw, maxAssigneesRaw] = raw
      .split('|')
      .map((s) => s?.trim());

    if (!title || !description) {
      return ctx.reply(
        'ℹ️ Usage: /newtask <title> | <description> | <reward> | <required output> | [category] | [skill1,skill2] | [max_assignees]\n' +
          '💡 Or just "/newtask" with no arguments to start a step-by-step wizard.'
      );
    }

    const requiredSkills = skillsRaw ? skillsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const maxAssignees = maxAssigneesRaw ? parseInt(maxAssigneesRaw, 10) : 1;
    const task = await createDraftTask(ctx, room?.id ?? null, {
      title,
      description,
      reward,
      requiredOutput,
      category,
      requiredSkills,
      maxAssignees,
    });

    const { text, keyboard } = taskCreatedMessage(task);
    await ctx.reply(text, keyboard);
  });

  bot.action(/^newtask_category:(.+)$/, async (ctx) => {
    const entry = peekPending(ctx.from.id);
    if (!entry || entry.type !== 'newtask_wizard' || entry.data.step !== 'category') {
      return ctx.answerCbQuery('⚠️ This selection has expired - run /newtask again.');
    }

    return handleNewTaskCategoryChoice(ctx, entry, ctx.match[1]);
  });

  bot.action(/^newtask_skill:(\d+)$/, async (ctx) => {
    const entry = peekPending(ctx.from.id);
    if (!entry || entry.type !== 'newtask_wizard' || entry.data.step !== 'skills') {
      return ctx.answerCbQuery('⚠️ This selection has expired - run /newtask again.');
    }

    return handleNewTaskSkillToggle(ctx, entry, Number(ctx.match[1]));
  });

  bot.action('newtask_skills_done', async (ctx) => {
    const entry = peekPending(ctx.from.id);
    if (!entry || entry.type !== 'newtask_wizard' || entry.data.step !== 'skills') {
      return ctx.answerCbQuery('⚠️ This selection has expired - run /newtask again.');
    }

    return handleNewTaskSkillsDone(ctx, entry);
  });
}
