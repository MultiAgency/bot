import { Markup } from 'telegraf';
import { prisma } from '../../db.js';
import { setPending, peekPending, updatePending, clearPending } from '../pendingActions.js';
import { evaluateCandidate } from '../../candidateEvaluation.js';
import { TIER_EMOJI } from '../emoji.js';
import { SKILLS_BY_ROLE } from '../skillCatalog.js';

// Entirely button-driven (no free-text steps): in a group, a plain text
// reply from the user only reaches the bot if Privacy Mode is disabled AND
// the bot was removed/re-added after that (see README "Signal detection").
// Callback queries (button presses), on the other hand, always reach the
// bot regardless of Privacy Mode - so keeping onboarding 100% button-based
// makes it work reliably in groups without depending on that setup step.
//
// The whole wizard also stays inside a single message, edited in place at
// each step (role -> income -> skills -> done), instead of replying with a
// new bubble per step - keeps the chat from filling up with one-line
// "✅ Role: ..." / "✅ Income: ..." messages.

const JOB_ROLES = [
  ['👨‍💻 Developer', 'DEVELOPER'],
  ['🎨 Designer', 'DESIGNER'],
  ['✍️ Writer', 'WRITER'],
  ['📣 Marketing', 'MARKETING'],
  ['🌐 Community', 'COMMUNITY'],
  ['🔬 Research', 'RESEARCH'],
  ['🎬 Video', 'VIDEO'],
  ['✨ Other', 'OTHER'],
];

const INCOME_OPTIONS = [
  ['💵 < $100/mo', 'UNDER_100'],
  ['💵 $100-500/mo', '100_500'],
  ['💰 $500-1000/mo', '500_1000'],
  ['💰 $1000-3000/mo', '1000_3000'],
  ['💎 $3000+/mo', 'OVER_3000'],
  ['🤝 Per-task / negotiable', 'NEGOTIABLE'],
];

const INCOME_LABELS = Object.fromEntries(INCOME_OPTIONS.map(([label, value]) => [value, label]));

function skillsKeyboard(role, selected) {
  const skills = SKILLS_BY_ROLE[role] || SKILLS_BY_ROLE.OTHER;
  const buttons = skills.map((skill, i) => {
    const checked = selected.includes(skill);
    return Markup.button.callback(`${checked ? '✅ ' : ''}${skill}`, `onboard_skill:${i}`);
  });
  return Markup.inlineKeyboard(
    [...buttons, Markup.button.callback('✅ Done', 'onboard_skills_done')],
    { columns: 2 }
  );
}

// Builds the running summary shown in the single onboarding message -
// each answered step becomes a line, followed by the current question.
function summaryLines(fields) {
  const lines = ['🚀 Onboarding', ''];
  if (fields.jobRole) lines.push(`✅ Role: ${fields.jobRole}`);
  if (fields.desiredIncomeLabel) lines.push(`✅ Income: ${fields.desiredIncomeLabel}`);
  return lines;
}

async function finalizeOnboarding(ctx, fields) {
  const contributor = await prisma.contributor.upsert({
    where: { telegramUserId: BigInt(ctx.from.id) },
    update: {
      telegramUsername: ctx.from.username ?? null,
      displayName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
      jobRole: fields.jobRole,
      desiredIncome: fields.desiredIncomeLabel || null,
      skillTags: fields.selectedSkills || [],
    },
    create: {
      telegramUserId: BigInt(ctx.from.id),
      telegramUsername: ctx.from.username ?? null,
      displayName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
      jobRole: fields.jobRole,
      desiredIncome: fields.desiredIncomeLabel || null,
      skillTags: fields.selectedSkills || [],
    },
  });

  const { telegramScore, socialTrustScore, eligibilityTier } = await evaluateCandidate(contributor);

  await prisma.contributor.update({
    where: { id: contributor.id },
    data: { isRegistered: true, telegramScore, socialTrustScore, eligibilityTier, lastEvaluatedAt: new Date() },
  });

  const tierEmoji = TIER_EMOJI[eligibilityTier] || '🏷';

  return [
    `🎉 You're onboarded as ${fields.jobRole}!`,
    `${tierEmoji} Trust tier: ${eligibilityTier}`,
    fields.desiredIncomeLabel ? `💰 Desired income: ${fields.desiredIncomeLabel}` : null,
    `⭐ Skills: ${fields.selectedSkills?.length ? fields.selectedSkills.join(', ') : '(none selected)'}`,
    `📊 Telegram score: ${telegramScore.toFixed(2)}`,
    '',
    "✅ You're all set — use /tasks to see what's open.",
  ]
    .filter(Boolean)
    .join('\n');
}

export function registerOnboard(bot) {
  bot.command('onboard', async (ctx) => {
    setPending(ctx.from.id, 'onboard_wizard', { step: 'jobRole', fields: {} });
    await ctx.reply(
      [...summaryLines({}), 'Role?'].join('\n'),
      Markup.inlineKeyboard(
        JOB_ROLES.map(([label, value]) => Markup.button.callback(label, `onboard_role:${value}`)),
        { columns: 2 }
      )
    );
  });

  bot.action(/^onboard_role:(.+)$/, async (ctx) => {
    const entry = peekPending(ctx.from.id);
    if (!entry || entry.type !== 'onboard_wizard' || entry.data.step !== 'jobRole') {
      return ctx.answerCbQuery('⚠️ This selection has expired - run /onboard again.');
    }

    const role = ctx.match[1];
    const fields = { ...entry.data.fields, jobRole: role };
    updatePending(ctx.from.id, { step: 'income', fields });

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      [...summaryLines(fields), '', '💰 Income/rate?'].join('\n'),
      Markup.inlineKeyboard(
        INCOME_OPTIONS.map(([label, value]) => Markup.button.callback(label, `onboard_income:${value}`)),
        { columns: 2 }
      )
    ).catch(() => {});
  });

  bot.action(/^onboard_income:(.+)$/, async (ctx) => {
    const entry = peekPending(ctx.from.id);
    if (!entry || entry.type !== 'onboard_wizard' || entry.data.step !== 'income') {
      return ctx.answerCbQuery('⚠️ This selection has expired - run /onboard again.');
    }

    const value = ctx.match[1];
    const desiredIncomeLabel = INCOME_LABELS[value] || value;
    const fields = { ...entry.data.fields, desiredIncomeLabel, selectedSkills: [] };
    updatePending(ctx.from.id, { step: 'skills', fields });

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      [...summaryLines(fields), '', `⭐ Skills (${fields.jobRole}) — tap, then Done`].join('\n'),
      skillsKeyboard(fields.jobRole, [])
    ).catch(() => {});
  });

  bot.action(/^onboard_skill:(\d+)$/, async (ctx) => {
    const entry = peekPending(ctx.from.id);
    if (!entry || entry.type !== 'onboard_wizard' || entry.data.step !== 'skills') {
      return ctx.answerCbQuery('⚠️ This selection has expired - run /onboard again.');
    }

    const { jobRole, selectedSkills = [] } = entry.data.fields;
    const skills = SKILLS_BY_ROLE[jobRole] || SKILLS_BY_ROLE.OTHER;
    const skill = skills[Number(ctx.match[1])];
    if (!skill) return ctx.answerCbQuery();

    const nextSelected = selectedSkills.includes(skill)
      ? selectedSkills.filter((s) => s !== skill)
      : [...selectedSkills, skill];
    updatePending(ctx.from.id, { fields: { ...entry.data.fields, selectedSkills: nextSelected } });

    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(skillsKeyboard(jobRole, nextSelected).reply_markup).catch(() => {});
  });

  bot.action('onboard_skills_done', async (ctx) => {
    const entry = peekPending(ctx.from.id);
    if (!entry || entry.type !== 'onboard_wizard' || entry.data.step !== 'skills') {
      return ctx.answerCbQuery('⚠️ This selection has expired - run /onboard again.');
    }

    clearPending(ctx.from.id);
    await ctx.answerCbQuery();

    const finalText = await finalizeOnboarding(ctx, entry.data.fields);
    await ctx.editMessageText(finalText, Markup.inlineKeyboard([])).catch(() => ctx.reply(finalText));
  });
}
