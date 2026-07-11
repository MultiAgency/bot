// Shared skill vocabulary used by both /onboard (contributor profile) and
// /newtask (task requirements), so a task's requiredSkills and a
// contributor's skillTags can actually overlap for matching.js's skill-fit
// scoring instead of drifting into two different sets of strings.
export const SKILLS_BY_ROLE = {
  DEVELOPER: ['Solidity', 'Rust', 'JS/TS', 'Python', 'Smart Contracts', 'Backend', 'Frontend', 'Mobile'],
  DESIGNER: ['UI Design', 'UX Design', 'Graphic Design', 'Branding', 'Illustration', 'Motion Graphics'],
  WRITER: ['Copywriting', 'Technical Writing', 'Content Strategy', 'Translation', 'Editing'],
  MARKETING: ['Social Media', 'Growth', 'SEO', 'Paid Ads', 'Community Growth', 'Influencer Outreach'],
  COMMUNITY: ['Moderation', 'Discord Mgmt', 'Event Hosting', 'Community Building'],
  RESEARCH: ['Market Research', 'Data Analysis', 'Competitor Analysis', 'Tokenomics'],
  VIDEO: ['Video Editing', 'Animation', 'Videography', 'Streaming'],
  OTHER: ['General', 'Admin', 'Ops'],
};

// Task categories (src/bot/commands/newTaskCore.js) use lowercase slugs;
// JobRole (contributor profile) uses uppercase enum values. Map one to the
// other so both sides can share SKILLS_BY_ROLE above.
export const CATEGORY_TO_ROLE = {
  dev: 'DEVELOPER',
  design: 'DESIGNER',
  writing: 'WRITER',
  marketing: 'MARKETING',
  community: 'COMMUNITY',
  research: 'RESEARCH',
  video: 'VIDEO',
  other: 'OTHER',
};

export function skillsForCategory(category) {
  const role = CATEGORY_TO_ROLE[category] || 'OTHER';
  return SKILLS_BY_ROLE[role] || SKILLS_BY_ROLE.OTHER;
}
