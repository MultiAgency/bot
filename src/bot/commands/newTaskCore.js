import { Markup } from 'telegraf';
import { prisma } from '../../db.js';
import { TASK_STATUS } from '../../workflow.js';
import { isAdmin, canManageRoom } from '../roomAuth.js';
import { getOrCreateRoom } from '../../rooms.js';
import { updatePending, clearPending } from '../pendingActions.js';

// DM (private chat) tasks have no room and are global-admin-only; tasks
// created inside a group are scoped to that room and creatable by its
// room admins too.
export async function resolveCreationContext(ctx) {
  const isPrivate = ctx.chat.type === 'private';
  const room = isPrivate ? null : await getOrCreateRoom(ctx.chat.id, ctx.chat.title);
  const allowed = isPrivate ? isAdmin(ctx) : await canManageRoom(ctx, room.id);
  return { room, allowed, isPrivate };
}

export async function createDraftTask(
  ctx,
  roomId,
  { title, description, reward, requiredOutput, category, requiredSkills, maxAssignees }
) {
  return prisma.task.create({
    data: {
      title,
      description,
      reward: reward || null,
      requiredOutput: requiredOutput || null,
      category: category || null,
      requiredSkills: requiredSkills || [],
      maxAssignees: Number.isInteger(maxAssignees) && maxAssignees > 0 ? maxAssignees : 1,
      roomId: roomId ?? null,
      status: TASK_STATUS.DRAFT,
      createdByTelegramId: BigInt(ctx.from.id),
      history: { create: { toStatus: TASK_STATUS.DRAFT, actorTelegramId: BigInt(ctx.from.id) } },
    },
  });
}

// Group chats have Telegram Privacy Mode on by default, which silently
// drops plain-text messages that aren't commands, mentions, or replies to
// the bot. Forcing the client into "reply" mode against the specific user
// (selective) makes their next message a reply to us, which Privacy Mode
// always delivers - so free-text wizard steps stay reliable in groups too.
// Takes an explicit messageId (rather than ctx) so it also works right
// after a button step, where there's no fresh ctx.message from the user.
export function forceReplyExtraFor(messageId) {
  return {
    reply_to_message_id: messageId,
    reply_markup: { force_reply: true, selective: true },
  };
}

export function forceReplyExtra(ctx) {
  return forceReplyExtraFor(ctx.message.message_id);
}

export const CATEGORIES = [
  ['💻 Dev', 'dev'],
  ['🎨 Design', 'design'],
  ['✍️ Writing', 'writing'],
  ['📣 Marketing', 'marketing'],
  ['🌐 Community', 'community'],
  ['🔬 Research', 'research'],
  ['🎬 Video', 'video'],
  ['✨ Other', 'other'],
];

export function categoryKeyboard() {
  return Markup.inlineKeyboard(
    [
      ...CATEGORIES.map(([label, value]) => Markup.button.callback(label, `newtask_category:${value}`)),
      Markup.button.callback('⏭ Skip', 'newtask_category:skip'),
    ],
    { columns: 2 }
  );
}

export function taskCreatedReply(task) {
  return `📝 Created task #${task.id} (Draft, max ${task.maxAssignees} assignee${task.maxAssignees === 1 ? '' : 's'}): "${task.title}"\n✅ Use /approve ${task.id} to open it up.`;
}

const WIZARD_STEP_ORDER = ['title', 'description', 'reward', 'requiredOutput', 'category', 'skills', 'maxAssignees'];
const WIZARD_PROMPTS = {
  description: '📄 Description?',
  reward: '💰 Reward? (type "skip" to leave blank)',
  requiredOutput: '📦 Required output format? (type "skip" to leave blank)',
  skills: '🛠️ Skills, comma-separated? (type "skip" to leave blank)',
  maxAssignees: '👥 How many contributors can be assigned at once? (type "skip" for 1)',
};

function nextWizardStep(step) {
  return WIZARD_STEP_ORDER[WIZARD_STEP_ORDER.indexOf(step) + 1] ?? null;
}

async function finishWizard(ctx, roomId, fields) {
  clearPending(ctx.from.id);
  const requiredSkills = fields.skills
    ? fields.skills.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const maxAssignees = fields.maxAssignees ? parseInt(fields.maxAssignees, 10) : 1;
  const task = await createDraftTask(ctx, roomId, { ...fields, requiredSkills, maxAssignees });
  return ctx.reply(taskCreatedReply(task));
}

// One turn of the /newtask wizard (see pendingTextDispatcher.js), keyed off
// the pending entry set in newTask.js. Title/description are required and
// re-prompt on empty input; every later field accepts "skip". The category
// step is a button select (see newtask_category action in newTask.js), not
// part of this text-driven flow.
export async function handleNewTaskWizardStep(ctx, entry) {
  const text = ctx.message.text.trim();
  const { step, fields, roomId } = entry.data;
  const isRequiredField = step === 'title' || step === 'description';

  if (isRequiredField && !text) {
    return ctx.reply(`⚠️ ${step === 'title' ? 'Title' : 'Description'} can't be empty. Try again:`, forceReplyExtra(ctx));
  }

  const value = isRequiredField ? text : text.toLowerCase() === 'skip' ? null : text;
  const updatedFields = { ...fields, [step]: value };
  const following = nextWizardStep(step);
  const lastUserMessageId = ctx.message.message_id;

  if (!following) {
    return finishWizard(ctx, roomId, updatedFields);
  }

  if (following === 'category') {
    updatePending(ctx.from.id, { step: following, fields: updatedFields, lastUserMessageId });
    return ctx.reply('🏷️ Category?', categoryKeyboard());
  }

  updatePending(ctx.from.id, { step: following, fields: updatedFields, lastUserMessageId });
  return ctx.reply(WIZARD_PROMPTS[following], forceReplyExtraFor(lastUserMessageId));
}

// Handles the newtask_category:<value> button press (see newTask.js), then
// resumes the text-driven wizard at the next step (skills).
export async function handleNewTaskCategoryChoice(ctx, entry, value) {
  const { fields, roomId, lastUserMessageId } = entry.data;
  const category = value === 'skip' ? null : value;
  const updatedFields = { ...fields, category };
  const following = nextWizardStep('category');

  await ctx.answerCbQuery();
  await ctx.editMessageText(`🏷️ Category: ${category || '(none)'}`).catch(() => {});

  if (!following) {
    return finishWizard(ctx, roomId, updatedFields);
  }

  updatePending(ctx.from.id, { step: following, fields: updatedFields });
  return ctx.reply(WIZARD_PROMPTS[following], forceReplyExtraFor(lastUserMessageId));
}
