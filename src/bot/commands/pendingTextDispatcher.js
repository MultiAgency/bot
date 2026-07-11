import { peekPending, clearPending } from '../pendingActions.js';
import { validateAssignmentForSubmission, submitTextOrLink, replyForTextSubmission } from './submitCore.js';
import { handleNewTaskWizardStep } from './newTaskCore.js';
import { handleTaskEditFieldAnswer } from './taskEdit.js';

// Dispatches a plain (non-command) text message to whichever pending
// conversational flow the sender is in: two-step submission or the
// /newtask wizard. Must run before registerSignalListener so a message
// that's actually fulfilling a pending flow doesn't get treated as a chat
// signal instead.
export function registerPendingTextDispatcher(bot) {
  bot.command('cancel', async (ctx) => {
    const had = peekPending(ctx.from.id);
    clearPending(ctx.from.id);
    await ctx.reply(had ? '✅ Cancelled.' : 'ℹ️ Nothing to cancel.');
  });

  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();

    const entry = peekPending(ctx.from.id);
    if (!entry) return next();

    if (entry.type === 'submission') {
      clearPending(ctx.from.id);
      const { application, error } = await validateAssignmentForSubmission(ctx, entry.data.taskId);
      if (error) return ctx.reply(error);

      const submissionFileMetadata = await submitTextOrLink(ctx, application, ctx.message.text.trim());
      return replyForTextSubmission(ctx, entry.data.taskId, submissionFileMetadata);
    }

    if (entry.type === 'newtask_wizard') {
      return handleNewTaskWizardStep(ctx, entry);
    }

    if (entry.type === 'newtask_edit') {
      return handleTaskEditFieldAnswer(ctx, entry);
    }

    // onboard_wizard is entirely button-driven (see onboard.js) - a stray
    // text message while it's pending isn't part of the flow, fall through.
    return next();
  });
}
