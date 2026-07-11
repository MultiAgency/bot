import { Markup } from 'telegraf';
import { prisma } from '../../db.js';
import { setPending, peekPending, updatePending, clearPending } from '../pendingActions.js';
import { evaluateCandidate } from '../../candidateEvaluation.js';

const JOB_ROLES = [
  ['Developer', 'DEVELOPER'],
  ['Designer', 'DESIGNER'],
  ['Writer', 'WRITER'],
  ['Marketing', 'MARKETING'],
  ['Community', 'COMMUNITY'],
  ['Research', 'RESEARCH'],
  ['Video', 'VIDEO'],
  ['Other', 'OTHER'],
];

async function finalizeOnboarding(ctx, fields) {
  const contributor = await prisma.contributor.upsert({
    where: { telegramUserId: BigInt(ctx.from.id) },
    update: {
      telegramUsername: ctx.from.username ?? null,
      displayName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
      jobRole: fields.jobRole,
      desiredIncome: fields.desiredIncome || null,
      skillTags: fields.skillTags || [],
    },
    create: {
      telegramUserId: BigInt(ctx.from.id),
      telegramUsername: ctx.from.username ?? null,
      displayName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
      jobRole: fields.jobRole,
      desiredIncome: fields.desiredIncome || null,
      skillTags: fields.skillTags || [],
    },
  });

  const { telegramScore, socialTrustScore, eligibilityTier } = await evaluateCandidate(contributor);

  await prisma.contributor.update({
    where: { id: contributor.id },
    data: { isRegistered: true, telegramScore, socialTrustScore, eligibilityTier, lastEvaluatedAt: new Date() },
  });

  await ctx.reply(
    [
      `Onboarded as ${fields.jobRole}. Initial trust tier: ${eligibilityTier}.`,
      fields.desiredIncome ? `Desired income: ${fields.desiredIncome}` : null,
      fields.skillTags?.length ? `Skills: ${fields.skillTags.join(', ')}` : null,
      `Telegram score: ${telegramScore.toFixed(2)}`,
      '',
      "You're all set. Use /tasks to see what's open.",
    ]
      .filter(Boolean)
      .join('\n')
  );
}

// Text steps of the wizard (the first step, job role, is button-based - see
// the bot.action handler below). Called from pendingTextDispatcher.js.
export async function handleOnboardWizardStep(ctx, entry) {
  const text = ctx.message.text.trim();
  const { step, fields } = entry.data;

  if (step === 'desiredIncome') {
    const desiredIncome = text.toLowerCase() === 'skip' ? null : text;
    updatePending(ctx.from.id, { step: 'skills', fields: { ...fields, desiredIncome } });
    return ctx.reply('What skills do you have? Comma-separated (e.g. "solidity, ui design, copywriting"), or type "skip".');
  }

  if (step === 'skills') {
    const skillTags = text.toLowerCase() === 'skip' ? [] : text.split(',').map((s) => s.trim()).filter(Boolean);
    clearPending(ctx.from.id);
    return finalizeOnboarding(ctx, { ...fields, skillTags });
  }
}

export function registerOnboard(bot) {
  bot.command('onboard', async (ctx) => {
    setPending(ctx.from.id, 'onboard_wizard', { step: 'jobRole', fields: {} });
    await ctx.reply(
      "Let's get you onboarded. What's your primary role?",
      Markup.inlineKeyboard(
        JOB_ROLES.map(([label, value]) => Markup.button.callback(label, `onboard_role:${value}`)),
        { columns: 2 }
      )
    );
  });

  bot.action(/^onboard_role:(.+)$/, async (ctx) => {
    const entry = peekPending(ctx.from.id);
    if (!entry || entry.type !== 'onboard_wizard' || entry.data.step !== 'jobRole') {
      return ctx.answerCbQuery('This selection has expired - run /onboard again.');
    }

    const role = ctx.match[1];
    updatePending(ctx.from.id, { step: 'desiredIncome', fields: { ...entry.data.fields, jobRole: role } });

    await ctx.answerCbQuery();
    await ctx.editMessageText(`Role: ${role}`).catch(() => {});
    await ctx.reply('What income/rate are you looking for? (e.g. "$500-1000/month", "20 USDT/task"), or type "skip".');
  });
}
