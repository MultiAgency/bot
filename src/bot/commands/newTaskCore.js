import { Markup } from 'telegraf';
import { prisma } from '../../db.js';
import { TASK_STATUS } from '../../workflow.js';
import { isAdmin, canManageRoom } from '../roomAuth.js';
import { getOrCreateRoom } from '../../rooms.js';
import { updatePending, clearPending } from '../pendingActions.js';
import { skillsForCategory } from '../skillCatalog.js';

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

export function skillsKeyboard(category, selected) {
  const skills = skillsForCategory(category);
  const buttons = skills.map((skill, i) => {
    const checked = selected.includes(skill);
    return Markup.button.callback(`${checked ? '✅ ' : ''}${skill}`, `newtask_skill:${i}`);
  });
  return Markup.inlineKeyboard(
    [...buttons, Markup.button.callback('✅ Done', 'newtask_skills_done')],
    { columns: 2 }
  );
}

// Full task summary + an Approve button, shown right after creation so an
// admin doesn't need to look up the id and type /approve <id> separately.
export function taskCreatedMessage(task) {
  const text = [
    `📝 Task #${task.id} created (Draft)`,
    '',
    `📌 Title: ${task.title}`,
    `📄 Description: ${task.description}`,
    `💰 Reward: ${task.reward || '(not specified)'}`,
    `📦 Required output: ${task.requiredOutput || '(not specified)'}`,
    `🏷️ Category: ${task.category || '(none)'}`,
    `🛠️ Skills: ${task.requiredSkills?.length ? task.requiredSkills.join(', ') : '(none)'}`,
    `👥 Max assignees: ${task.maxAssignees}`,
    '',
    '👇 Tap Approve to open it up for applicants.',
  ].join('\n');

  const keyboard = Markup.inlineKeyboard([Markup.button.callback('✅ Approve', `task_approve:${task.id}`)]);
  return { text, keyboard };
}

const WIZARD_STEP_ORDER = ['title', 'description', 'reward', 'requiredOutput', 'category', 'skills', 'maxAssignees'];
const WIZARD_PROMPTS = {
  description: '📄 Description?',
  reward: '💰 Reward? (type "skip" to leave blank)',
  requiredOutput: '📦 Required output format? (type "skip" to leave blank)',
  maxAssignees: '👥 How many contributors can be assigned at once? (type "skip" for 1)',
};

// Steps answered via inline keyboard, not free text - a stray text message
// while one of these is pending gets redirected back to the buttons instead
// of being consumed as if it were the answer.
const BUTTON_ONLY_STEPS = ['category', 'skills'];

function nextWizardStep(step) {
  return WIZARD_STEP_ORDER[WIZARD_STEP_ORDER.indexOf(step) + 1] ?? null;
}

async function finishWizard(ctx, roomId, fields) {
  clearPending(ctx.from.id);
  const requiredSkills = Array.isArray(fields.requiredSkills) ? fields.requiredSkills : [];
  const maxAssignees = fields.maxAssignees ? parseInt(fields.maxAssignees, 10) : 1;
  const task = await createDraftTask(ctx, roomId, { ...fields, requiredSkills, maxAssignees });
  const { text, keyboard } = taskCreatedMessage(task);
  return ctx.reply(text, keyboard);
}

// One turn of the /newtask wizard (see pendingTextDispatcher.js), keyed off
// the pending entry set in newTask.js. Title/description are required and
// re-prompt on empty input; every later field accepts "skip". Category and
// skills are button selects (see newtask_category / newtask_skill actions
// in newTask.js), not part of this text-driven flow.
export async function handleNewTaskWizardStep(ctx, entry) {
  const { step, fields, roomId } = entry.data;

  if (BUTTON_ONLY_STEPS.includes(step)) {
    return ctx.reply('👆 Please use the buttons above to answer this step.');
  }

  const text = ctx.message.text.trim();
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
// moves into the skills multi-select - edits the same message rather than
// sending a new one, so category+skills stay in one bubble.
export async function handleNewTaskCategoryChoice(ctx, entry, value) {
  const { fields, lastUserMessageId } = entry.data;
  const category = value === 'skip' ? null : value;
  const updatedFields = { ...fields, category };

  await ctx.answerCbQuery();
  updatePending(ctx.from.id, {
    step: 'skills',
    fields: { ...updatedFields, selectedSkills: [] },
    lastUserMessageId,
  });
  await ctx.editMessageText(
    [`🏷️ Category: ${category || '(none)'}`, '', `🛠️ Pick skills for this task${category ? ` (${category})` : ''}, then Done:`].join('\n'),
    skillsKeyboard(category, [])
  ).catch(() => {});
}

// Toggles one skill in the newtask_skill:<index> multi-select (see
// newTask.js) and re-renders the same keyboard with the updated checkmarks.
export async function handleNewTaskSkillToggle(ctx, entry, index) {
  const { fields } = entry.data;
  const skills = skillsForCategory(fields.category);
  const skill = skills[index];
  if (!skill) return ctx.answerCbQuery();

  const selected = fields.selectedSkills || [];
  const nextSelected = selected.includes(skill) ? selected.filter((s) => s !== skill) : [...selected, skill];
  updatePending(ctx.from.id, { fields: { ...fields, selectedSkills: nextSelected } });

  await ctx.answerCbQuery();
  await ctx.editMessageReplyMarkup(skillsKeyboard(fields.category, nextSelected).reply_markup).catch(() => {});
}

// Finalizes the skills multi-select (newtask_skills_done) and resumes the
// text-driven wizard at maxAssignees, the final step.
export async function handleNewTaskSkillsDone(ctx, entry) {
  const { fields, roomId, lastUserMessageId } = entry.data;
  const requiredSkills = fields.selectedSkills || [];
  const { selectedSkills, ...rest } = fields;
  const updatedFields = { ...rest, requiredSkills };

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    [
      `🏷️ Category: ${updatedFields.category || '(none)'}`,
      `🛠️ Skills: ${requiredSkills.length ? requiredSkills.join(', ') : '(none selected)'}`,
    ].join('\n')
  ).catch(() => {});

  const following = nextWizardStep('skills');
  if (!following) {
    return finishWizard(ctx, roomId, updatedFields);
  }

  updatePending(ctx.from.id, { step: following, fields: updatedFields });
  return ctx.reply(WIZARD_PROMPTS[following], forceReplyExtraFor(lastUserMessageId));
}
