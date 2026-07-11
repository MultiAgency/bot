import { Markup } from 'telegraf';
import { prisma } from '../db.js';
import { TASK_STATUS, APPLICATION_STATUS } from '../workflow.js';
import { resolveCreationContext, createDraftTask, taskCreatedMessage, taskSummaryText } from '../bot/commands/newTaskCore.js';
import { canManageTask } from '../bot/roomAuth.js';

// Tool definitions passed to Claude (Anthropic tool-use format). Every
// state-changing tool only ever *shows* the user a confirmation card with
// real buttons (task_approve, task_reject, task_apply, ...) - the actual
// mutation happens when the user taps one, going through the exact same
// permission checks and atomic guards as the classic commands. This keeps
// "AI mode" from ever silently applying/approving/rejecting anything.
export const AGENT_TOOLS = [
  {
    name: 'list_open_tasks',
    description: 'List currently open tasks that contributors can apply to.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_task_details',
    description: 'Get full details for one task by id, including its current status (Draft/Open/Closed).',
    input_schema: {
      type: 'object',
      properties: { taskId: { type: 'integer', description: 'Task id' } },
      required: ['taskId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_my_applications',
    description: "List the requesting user's own task applications and their status.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'create_task_draft',
    description:
      'Create a new task as a Draft. Only works for room/global admins. Shows the admin an Approve/Reject/Edit card in the chat - it does NOT open the task or notify anyone by itself.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        reward: { type: 'string' },
        requiredOutput: { type: 'string' },
        category: {
          type: 'string',
          enum: ['dev', 'design', 'writing', 'marketing', 'community', 'research', 'video', 'other'],
        },
        requiredSkills: { type: 'array', items: { type: 'string' } },
        maxAssignees: { type: 'integer', minimum: 1 },
      },
      required: ['title', 'description'],
      additionalProperties: false,
    },
  },
  {
    name: 'show_task_review_card',
    description:
      'Re-show the Approve/Reject/Edit card for an existing DRAFT task so an admin can decide on it. Only works for room/global admins, and only for tasks still in Draft status.',
    input_schema: {
      type: 'object',
      properties: { taskId: { type: 'integer' } },
      required: ['taskId'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_apply',
    description:
      'Show an Apply/Cancel card for an open task so the requesting user can confirm applying to it. Does NOT submit the application by itself - the user must tap Apply.',
    input_schema: {
      type: 'object',
      properties: { taskId: { type: 'integer' } },
      required: ['taskId'],
      additionalProperties: false,
    },
  },
];

function taskBrief(t) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    reward: t.reward,
    category: t.category,
    requiredSkills: t.requiredSkills,
    requiredOutput: t.requiredOutput,
    maxAssignees: t.maxAssignees,
  };
}

export async function executeAgentTool(ctx, name, input) {
  switch (name) {
    case 'list_open_tasks': {
      const tasks = await prisma.task.findMany({
        where: { status: TASK_STATUS.OPEN },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      return { tasks: tasks.map(taskBrief) };
    }

    case 'get_task_details': {
      const task = await prisma.task.findUnique({ where: { id: input.taskId } });
      if (!task) return { error: `Task #${input.taskId} not found.` };
      return { task: { ...taskBrief(task), description: task.description } };
    }

    case 'list_my_applications': {
      const contributor = await prisma.contributor.findUnique({
        where: { telegramUserId: BigInt(ctx.from.id) },
      });
      if (!contributor) return { applications: [] };

      const applications = await prisma.application.findMany({
        where: { contributorId: contributor.id },
        include: { task: true },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });
      return {
        applications: applications.map((a) => ({ taskId: a.taskId, title: a.task.title, status: a.status })),
      };
    }

    case 'create_task_draft': {
      const { room, allowed, isPrivate } = await resolveCreationContext(ctx);
      if (!allowed) {
        return {
          error: isPrivate
            ? 'Only global admins can create tasks via DM.'
            : 'Only admins of this room (or global admins) can create tasks here.',
        };
      }

      const task = await createDraftTask(ctx, room?.id ?? null, {
        title: input.title,
        description: input.description,
        reward: input.reward,
        requiredOutput: input.requiredOutput,
        category: input.category,
        requiredSkills: input.requiredSkills || [],
        maxAssignees: input.maxAssignees || 1,
      });

      const { text, keyboard } = taskCreatedMessage(task);
      await ctx.reply(text, keyboard);
      return { result: `Created task #${task.id} as a Draft and shown to the user with Approve/Reject/Edit buttons.` };
    }

    case 'show_task_review_card': {
      const task = await prisma.task.findUnique({ where: { id: input.taskId } });
      if (!task) return { error: `Task #${input.taskId} not found.` };
      if (!(await canManageTask(ctx, task))) {
        return { error: "Only admins of this task's room (or global admins) can review it." };
      }
      if (task.status !== TASK_STATUS.DRAFT) {
        return { error: `Task #${input.taskId} is not a draft (status: ${task.status}), nothing to review.` };
      }

      const { text, keyboard } = taskCreatedMessage(task);
      await ctx.reply(text, keyboard);
      return { result: `Shown the Approve/Reject/Edit card for task #${input.taskId}.` };
    }

    case 'propose_apply': {
      const task = await prisma.task.findUnique({
        where: { id: input.taskId },
        include: { applications: true },
      });
      if (!task) return { error: `Task #${input.taskId} not found.` };
      if (task.status !== TASK_STATUS.OPEN) {
        return { error: `Task #${input.taskId} is not open right now (status: ${task.status}).` };
      }

      const assignedCount = task.applications.filter((a) => a.status === APPLICATION_STATUS.ASSIGNED).length;
      const text = taskSummaryText(task, {
        heading: `📋 Task #${task.id} (👥 ${assignedCount}/${task.maxAssignees} assigned)`,
      });
      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('🙋 Apply', `task_apply:${task.id}`),
        Markup.button.callback('❌ Cancel', 'task_dismiss'),
      ]);
      await ctx.reply(text, keyboard);
      return { result: `Shown the Apply/Cancel card for task #${input.taskId}.` };
    }

    default:
      return { error: `Unknown tool "${name}".` };
  }
}
