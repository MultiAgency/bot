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

export async function createDraftTask(ctx, roomId, { title, description, reward, requiredOutput, category, requiredSkills }) {
  return prisma.task.create({
    data: {
      title,
      description,
      reward: reward || null,
      requiredOutput: requiredOutput || null,
      category: category || null,
      requiredSkills: requiredSkills || [],
      roomId: roomId ?? null,
      status: TASK_STATUS.DRAFT,
      createdByTelegramId: BigInt(ctx.from.id),
      history: { create: { toStatus: TASK_STATUS.DRAFT, actorTelegramId: BigInt(ctx.from.id) } },
    },
  });
}

export function taskCreatedReply(task) {
  return `Created task #${task.id} (Draft): "${task.title}"\nUse /approve ${task.id}, then /route ${task.id} to match candidates and open it up.`;
}

const WIZARD_STEP_ORDER = ['title', 'description', 'reward', 'requiredOutput', 'category', 'skills'];
const WIZARD_PROMPTS = {
  description: 'Description?',
  reward: 'Reward? (type "skip" to leave blank)',
  requiredOutput: 'Required output format? (type "skip" to leave blank)',
  category: 'Category? (type "skip" to leave blank)',
  skills: 'Skills, comma-separated? (type "skip" to leave blank)',
};

function nextWizardStep(step) {
  return WIZARD_STEP_ORDER[WIZARD_STEP_ORDER.indexOf(step) + 1] ?? null;
}

// One turn of the /newtask wizard (see pendingTextDispatcher.js), keyed off
// the pending entry set in newTask.js. Title/description are required and
// re-prompt on empty input; every later field accepts "skip".
export async function handleNewTaskWizardStep(ctx, entry) {
  const text = ctx.message.text.trim();
  const { step, fields, roomId } = entry.data;
  const isRequiredField = step === 'title' || step === 'description';

  if (isRequiredField && !text) {
    return ctx.reply(`${step === 'title' ? 'Title' : 'Description'} can't be empty. Try again:`);
  }

  const value = isRequiredField ? text : text.toLowerCase() === 'skip' ? null : text;
  const updatedFields = { ...fields, [step]: value };
  const following = nextWizardStep(step);

  if (!following) {
    clearPending(ctx.from.id);
    const requiredSkills = updatedFields.skills
      ? updatedFields.skills.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const task = await createDraftTask(ctx, roomId, { ...updatedFields, requiredSkills });
    return ctx.reply(taskCreatedReply(task));
  }

  updatePending(ctx.from.id, { step: following, fields: updatedFields });
  return ctx.reply(WIZARD_PROMPTS[following]);
}
