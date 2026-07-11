import { Markup } from 'telegraf';
import { prisma } from '../../db.js';
import { setPending, peekPending, updatePending, clearPending } from '../pendingActions.js';
import { evaluateCandidate } from '../../candidateEvaluation.js';
import { TIER_EMOJI } from '../emoji.js';

// Entirely button-driven (no free-text steps): in a group, a plain text
// reply from the user only reaches the bot if Privacy Mode is disabled AND
// the bot was removed/re-added after that (see README "Signal detection").
// Callback queries (button presses), on the other hand, always reach the
// bot regardless of Privacy Mode - so keeping onboarding 100% button-based
// makes it work reliably in groups without depending on that setup step.

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

const SKILLS_BY_ROLE = {
  DEVELOPER: ['Solidity', 'Rust', 'JS/TS', 'Python', 'Smart Contracts', 'Backend', 'Frontend', 'Mobile'],
  DESIGNER: ['UI Design', 'UX Design', 'Graphic Design', 'Branding', 'Illustration', 'Motion Graphics'],
  WRITER: ['Copywriting', 'Technical Writing', 'Content Strategy', 'Translation', 'Editing'],
  MARKETING: ['Social Media', 'Growth', 'SEO', 'Paid Ads', 'Community Growth', 'Influencer Outreach'],
  COMMUNITY: ['Moderation', 'Discord Mgmt', 'Event Hosting', 'Community Building'],
  RESEARCH: ['Market Research', 'Data Analysis', 'Competitor Analysis', 'Tokenomics'],
  VIDEO: ['Video Editing', 'Animation', 'Videography', 'Streaming'],
  OTHER: ['General', 'Admin', 'Ops'],
};

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

  await ctx.reply(
    [
      `🎉 You're onboarded as ${fields.jobRole}!`,
      `${tierEmoji} Trust tier: ${eligibilityTier}`,
      fields.desiredIncomeLabel ? `💰 Desired income: ${fields.desiredIncomeLabel}` : null,
      `⭐ Skills: ${fields.selectedSkills?.length ? fields.selectedSkills.join(', ') : '(none selected)'}`,
      `📊 Telegram score: ${telegramScore.toFixed(2)}`,
      '',
      "✅ You're all set — use /tasks to see what's open.",
    ]
      .filter(Boolean)
      .join('\n')
  );
}

export function registerOnboard(bot) {
  bot.command('onboard', async (ctx) => {
    setPending(ctx.from.id, 'onboard_wizard', { step: 'jobRole', fields: {} });
    await ctx.reply(
      "🚀 Let's get you onboarded! What's your primary role?",
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
    updatePending(ctx.from.id, { step: 'income', fields: { ...entry.data.fields, jobRole: role } });

    await ctx.answerCbQuery();
    await ctx.editMessageText(`✅ Role: ${role}`).catch(() => {});
    await ctx.reply(
      '💰 What income/rate are you looking for?',
      Markup.inlineKeyboard(
        INCOME_OPTIONS.map(([label, value]) => Markup.button.callback(label, `onboard_income:${value}`)),
        { columns: 2 }
      )
    );
  });

  bot.action(/^onboard_income:(.+)$/, async (ctx) => {
    const entry = peekPending(ctx.from.id);
    if (!entry || entry.type !== 'onboard_wizard' || entry.data.step !== 'income') {
      return ctx.answerCbQuery('⚠️ This selection has expired - run /onboard again.');
    }

    const value = ctx.match[1];
    const desiredIncomeLabel = INCOME_LABELS[value] || value;
    const fields = { ...entry.data.fields, desiredIncomeLabel };
    updatePending(ctx.from.id, { step: 'skills', fields: { ...fields, selectedSkills: [] } });

    await ctx.answerCbQuery();
    await ctx.editMessageText(`✅ Income: ${desiredIncomeLabel}`).catch(() => {});
    await ctx.reply(
      `⭐ Pick your skills (${fields.jobRole}) — tap each one, then Done:`,
      skillsKeyboard(fields.jobRole, [])
    );
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
    await ctx.editMessageText(
      `⭐ Skills: ${entry.data.fields.selectedSkills?.length ? entry.data.fields.selectedSkills.join(', ') : '(none selected)'}`
    ).catch(() => {});

    await finalizeOnboarding(ctx, entry.data.fields);
  });
}
