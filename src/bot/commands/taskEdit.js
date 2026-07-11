import { Markup } from 'telegraf';
import { prisma } from '../../db.js';
import { TASK_STATUS } from '../../workflow.js';
import { canManageTask } from '../roomAuth.js';
import { setPending, peekPending, updatePending, clearPending } from '../pendingActions.js';
import { categoryKeyboard, skillsKeyboard, taskSummaryText, taskCreatedMessage, forceReplyExtraFor } from './newTaskCore.js';
import { skillsForCategory } from '../skillCatalog.js';

// Only DRAFT tasks are editable - once a task is Open, changing its
// requirements out from under applicants would be confusing (use /close +
// /newtask for that instead).
const EDIT_FIELDS = [
  ['📌 Title', 'title'],
  ['📄 Description', 'description'],
  ['💰 Reward', 'reward'],
  ['📦 Required output', 'requiredOutput'],
  ['🏷️ Category', 'category'],
  ['🛠️ Skills', 'skills'],
  ['👥 Max assignees', 'maxAssignees'],
];

// Category and skills are button-only sub-flows (see the dedicated actions
// below); the rest are free-text via force-reply.
const TEXT_FIELD_PROMPTS = {
  title: '📌 New title?',
  description: '📄 New description?',
  reward: '💰 New reward? (type "skip" to clear)',
  requiredOutput: '📦 New required output? (type "skip" to clear)',
  maxAssignees: '👥 New max assignees?',
};

function editMenuText(task) {
  return taskSummaryText(task, {
    heading: `✏️ Editing Task #${task.id}`,
    footer: '👇 Tap a field to change it, or Done when finished.',
  });
}

function editMenuKeyboard(id) {
  return Markup.inlineKeyboard(
    [
      ...EDIT_FIELDS.map(([label, field]) => Markup.button.callback(label, `task_edit_field:${id}:${field}`)),
      Markup.button.callback('✅ Done', `task_edit_done:${id}`),
    ],
    { columns: 2 }
  );
}

async function requireEditableTask(ctx, id) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return { error: `❌ Task #${id} not found.` };
  if (!(await canManageTask(ctx, task))) {
    return { error: "🚫 Only admins of this task's room (or global admins) can edit it." };
  }
  if (task.status !== TASK_STATUS.DRAFT) {
    return { error: `❌ Only draft tasks can be edited (this one is ${task.status}).` };
  }
  return { task };
}

function editSessionValid(entry, id, field) {
  return entry && entry.type === 'newtask_edit' && entry.data.taskId === id && (!field || entry.data.field === field);
}

export function registerTaskEdit(bot) {
  bot.action(/^task_edit:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const { task, error } = await requireEditableTask(ctx, id);
    if (error) {
      await ctx.answerCbQuery('❌');
      return ctx.reply(error);
    }

    setPending(ctx.from.id, 'newtask_edit', { taskId: id, field: null });
    await ctx.answerCbQuery();
    await ctx.editMessageText(editMenuText(task), editMenuKeyboard(id)).catch(() => {});
  });

  bot.action(/^task_edit_field:(\d+):(\w+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const field = ctx.match[2];
    const entry = peekPending(ctx.from.id);
    if (!editSessionValid(entry, id)) {
      return ctx.answerCbQuery('⚠️ This edit session has expired - tap Edit again.');
    }

    const { task, error } = await requireEditableTask(ctx, id);
    if (error) {
      await ctx.answerCbQuery('❌');
      return ctx.reply(error);
    }

    if (field === 'category') {
      updatePending(ctx.from.id, { field: 'category' });
      await ctx.answerCbQuery();
      return ctx.editMessageText(
        `✏️ Editing Task #${id}\n\n🏷️ Choose a new category:`,
        categoryKeyboard(`task_edit_category:${id}`)
      ).catch(() => {});
    }

    if (field === 'skills') {
      updatePending(ctx.from.id, { field: 'skills', stagingSkills: task.requiredSkills || [] });
      await ctx.answerCbQuery();
      return ctx.editMessageText(
        `✏️ Editing Task #${id}\n\n🛠️ Pick skills${task.category ? ` (${task.category})` : ''}, then Done:`,
        skillsKeyboard(task.category, task.requiredSkills || [], {
          togglePrefix: `task_edit_skill:${id}`,
          doneAction: `task_edit_skills_done:${id}`,
        })
      ).catch(() => {});
    }

    // Free-text field: force-reply, remembering which message to restore
    // the menu into once the answer comes back as a plain text message.
    updatePending(ctx.from.id, {
      field,
      menuChatId: ctx.chat.id,
      menuMessageId: ctx.callbackQuery.message.message_id,
    });
    await ctx.answerCbQuery();
    await ctx.reply(TEXT_FIELD_PROMPTS[field], forceReplyExtraFor(ctx.callbackQuery.message.message_id));
  });

  bot.action(/^task_edit_category:(\d+):(.+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const value = ctx.match[2];
    const entry = peekPending(ctx.from.id);
    if (!editSessionValid(entry, id, 'category')) {
      return ctx.answerCbQuery('⚠️ This edit session has expired - tap Edit again.');
    }

    const category = value === 'skip' ? null : value;
    const task = await prisma.task.update({ where: { id }, data: { category } });

    updatePending(ctx.from.id, { field: null });
    await ctx.answerCbQuery('✅');
    await ctx.editMessageText(editMenuText(task), editMenuKeyboard(id)).catch(() => {});
  });

  bot.action(/^task_edit_skill:(\d+):(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const index = Number(ctx.match[2]);
    const entry = peekPending(ctx.from.id);
    if (!editSessionValid(entry, id, 'skills')) {
      return ctx.answerCbQuery('⚠️ This edit session has expired - tap Edit again.');
    }

    const task = await prisma.task.findUnique({ where: { id } });
    const skills = skillsForCategory(task?.category);
    const skill = skills[index];
    if (!skill) return ctx.answerCbQuery();

    const selected = entry.data.stagingSkills || [];
    const nextSelected = selected.includes(skill) ? selected.filter((s) => s !== skill) : [...selected, skill];
    updatePending(ctx.from.id, { stagingSkills: nextSelected });

    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(
      skillsKeyboard(task?.category, nextSelected, {
        togglePrefix: `task_edit_skill:${id}`,
        doneAction: `task_edit_skills_done:${id}`,
      }).reply_markup
    ).catch(() => {});
  });

  bot.action(/^task_edit_skills_done:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const entry = peekPending(ctx.from.id);
    if (!editSessionValid(entry, id, 'skills')) {
      return ctx.answerCbQuery('⚠️ This edit session has expired - tap Edit again.');
    }

    const requiredSkills = entry.data.stagingSkills || [];
    const task = await prisma.task.update({ where: { id }, data: { requiredSkills } });

    updatePending(ctx.from.id, { field: null, stagingSkills: undefined });
    await ctx.answerCbQuery('✅');
    await ctx.editMessageText(editMenuText(task), editMenuKeyboard(id)).catch(() => {});
  });

  bot.action(/^task_edit_done:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const entry = peekPending(ctx.from.id);
    if (editSessionValid(entry, id)) clearPending(ctx.from.id);

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      await ctx.answerCbQuery('❌');
      return ctx.reply(`❌ Task #${id} not found.`);
    }

    await ctx.answerCbQuery('✅ Done');
    const { text, keyboard } = taskCreatedMessage(task);
    await ctx.editMessageText(text, keyboard).catch(() => {});
  });
}

// Handles the free-text answer to a task_edit_field prompt (see
// pendingTextDispatcher.js) for title/description/reward/requiredOutput/
// maxAssignees. category/skills are button-only, handled by the actions
// above - a stray text message while one of those is pending gets
// redirected back to the buttons instead of being consumed.
export async function handleTaskEditFieldAnswer(ctx, entry) {
  const { taskId, field, menuChatId, menuMessageId } = entry.data;

  if (!field || field === 'category' || field === 'skills') {
    return ctx.reply('👆 Please use the buttons above to continue editing.');
  }

  const text = ctx.message.text.trim();
  const isRequiredField = field === 'title' || field === 'description';

  if (isRequiredField && !text) {
    return ctx.reply(
      `⚠️ ${field === 'title' ? 'Title' : 'Description'} can't be empty. Try again:`,
      forceReplyExtraFor(ctx.message.message_id)
    );
  }

  let value = isRequiredField ? text : text.toLowerCase() === 'skip' ? null : text;
  if (field === 'maxAssignees') {
    const n = parseInt(text, 10);
    value = Number.isInteger(n) && n > 0 ? n : 1;
  }

  const task = await prisma.task.update({ where: { id: taskId }, data: { [field]: value } });

  updatePending(ctx.from.id, { field: null });
  await ctx.reply('✅ Updated.');

  await ctx.telegram
    .editMessageText(menuChatId, menuMessageId, undefined, editMenuText(task), editMenuKeyboard(taskId))
    .catch(() => {});
}
