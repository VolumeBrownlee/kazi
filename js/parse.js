/* Kazi — the parsing engine.
   Pure functions only: job messages in, structured fields out.
   No DOM, no network, no dependencies. */

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

const MONTH_RE = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const CITIES = [
  'Kampala', 'Entebbe', 'Jinja', 'Mbarara', 'Gulu', 'Lira', 'Mbale', 'Masaka',
  'Fort Portal', 'Arua', 'Soroti', 'Hoima', 'Mukono', 'Wakiso', 'Nairobi', 'Mombasa',
  'Kisumu', 'Kigali', 'Dar es Salaam', 'Dodoma', 'Arusha', 'Lagos', 'Abuja', 'Accra',
  'Kumasi', 'Addis Ababa', 'Juba', 'Mogadishu', 'Cairo', 'Johannesburg', 'Cape Town',
  'London', 'Manchester', 'Berlin', 'Amsterdam', 'Brussels', 'Toronto', 'New York',
  'Washington', 'Boston', 'San Francisco', 'Dubai', 'Doha', 'Riyadh'
];

const SOURCE_DOMAINS = [
  ['linkedin.com', 'LinkedIn'],
  ['indeed.com', 'Indeed'],
  ['brightermonday.co.ug', 'BrighterMonday'],
  ['brightermonday.com', 'BrighterMonday'],
  ['jobsuganda.com', 'Jobs Uganda'],
  ['myjobmag.com', 'MyJobMag'],
  ['reliefweb.int', 'ReliefWeb'],
  ['devex.com', 'Devex'],
  ['unjobs.org', 'UN Jobs'],
  ['glassdoor.com', 'Glassdoor'],
  ['greenhouse.io', 'Greenhouse'],
  ['lever.co', 'Lever'],
  ['workable.com', 'Workable'],
  ['ashbyhq.com', 'Ashby'],
  ['myworkdayjobs.com', 'Workday'],
  ['workday.com', 'Workday'],
  ['smartrecruiters.com', 'SmartRecruiters'],
  ['bamboohr.com', 'BambooHR'],
  ['recruitee.com', 'Recruitee'],
  ['teamtailor.com', 'Teamtailor'],
  ['jobvite.com', 'Jobvite'],
  ['icims.com', 'iCIMS'],
  ['taleo.net', 'Taleo'],
  ['wa.me', 'WhatsApp'],
  ['whatsapp.com', 'WhatsApp'],
  ['facebook.com', 'Facebook'],
  ['fb.com', 'Facebook'],
  ['t.me', 'Telegram'],
  ['twitter.com', 'X'],
  ['x.com', 'X'],
  ['mail.google.com', 'Email'],
  ['gmail.com', 'Email'],
  ['outlook.com', 'Email'],
  ['mailto', 'Email']
];

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com',
  'protonmail.com', 'proton.me', 'aol.com', 'mail.com', 'gmx.com', 'yandex.com'
]);

const COMPANY_WORDS = new Set([
  'we', 'our', 'the', 'this', 'that', 'you', 'your', 'they', 'their', 'it', 'its',
  'job', 'role', 'position', 'vacancy', 'opportunity', 'company', 'organisation',
  'organization', 'employer', 'team', 'office', 'location', 'deadline', 'salary',
  'application', 'candidate', 'applicant', 'successful', 'ideal', 'right', 'suitable'
]);

const ROLE_STOP_WORDS = [
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'in', 'at', 'on', 'with', 'who',
  'that', 'dynamic', 'motivated', 'experienced', 'qualified', 'suitable',
  'ideal', 'right', 'successful', 'committed', 'passionate', 'results-driven'
];

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'for', 'of', 'to', 'in',
  'on', 'at', 'by', 'with', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'this', 'that', 'these', 'those', 'it', 'its', 'we', 'our', 'you', 'your',
  'they', 'their', 'he', 'she', 'his', 'her', 'i', 'me', 'my', 'us', 'them', 'who',
  'whom', 'whose', 'which', 'what', 'when', 'where', 'why', 'how', 'all', 'any',
  'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should',
  'now', 'also', 'into', 'over', 'under', 'again', 'further', 'once', 'here', 'there',
  'about', 'against', 'between', 'during', 'before', 'after', 'above', 'below', 'up',
  'down', 'out', 'off', 'does', 'did', 'doing', 'have', 'has', 'had', 'having', 'may',
  'might', 'must', 'shall', 'would', 'could', 'etc', 'via', 'per', 'within', 'across',
  'through', 'including', 'include', 'includes', 'included', 'using', 'use', 'used',
  'able', 'ability', 'work', 'working', 'works', 'job', 'jobs', 'role', 'roles',
  'position', 'positions', 'vacancy', 'vacancies', 'opportunity', 'opportunities',
  'company', 'companies', 'organisation', 'organisation', 'organizations', 'employer',
  'team', 'teams', 'candidate', 'candidates', 'applicant', 'applicants', 'application',
  'applications', 'apply', 'applying', 'responsibility', 'responsibilities',
  'requirement', 'requirements', 'qualification', 'qualifications', 'skill', 'skills',
  'experience', 'experienced', 'year', 'years', 'strong', 'good', 'great', 'excellent',
  'proven', 'demonstrated', 'knowledge', 'understanding', 'familiarity', 'proficient',
  'proficiency', 'join', 'joining', 'looking', 'seeking', 'hiring', 'recruiting',
  'career', 'staff', 'member', 'members', 'new', 'full', 'part', 'time', 'full-time',
  'part-time', 'contract', 'permanent', 'temporary', 'based', 'location', 'deadline',
  'closing', 'date', 'submit', 'submission', 'send', 'sending', 'please', 'must',
  'should', 'will', 'would', 'like', 'want', 'need', 'needs', 'needed', 'relevant',
  'related', 'minimum', 'maximum', 'least', 'plus', 'advantage', 'added', 'desirable',
  'essential', 'preferred', 'required', 'require', 'requires', 'duties', 'duty',
  'tasks', 'task', 'support', 'supporting', 'ensure', 'ensuring', 'provide',
  'providing', 'manage', 'managing', 'management', 'develop', 'developing',
  'development', 'deliver', 'delivering', 'delivery', 'implementation', 'implement',
  'implementing', 'coordinate', 'coordinating', 'coordination', 'assist', 'assisting',
  'assistance', 'participate', 'participating', 'contribute', 'contributing',
  'maintain', 'maintaining', 'prepare', 'preparing', 'preparation', 'conduct',
  'conducting', 'monitor', 'monitoring', 'evaluate', 'evaluating', 'evaluation',
  'report', 'reporting', 'reports', 'written', 'verbal', 'communication',
  'interpersonal', 'organisational', 'organizational', 'attention', 'detail', 'details',
  'deadline', 'deadlines', 'pressure', 'independently', 'independence', 'initiative',
  'flexible', 'adapt', 'adaptable', 'environment', 'office', 'remote', 'hybrid',
  'onsite', 'site', 'field', 'travel', 'willing', 'willingness', 'salary',
  'compensation', 'benefit', 'benefits', 'package', 'negotiable', 'competitive',
  'application', 'applications', 'cv', 'resume', 'cover', 'letter', 'email', 'phone',
  'contact', 'address', 'website', 'link', 'click', 'here', 'more', 'information',
  'details', 'read', 'view', 'share', 'forwarded', 'many', 'times', 'whatsapp',
  'urgent', 'immediately', 'start', 'starting', 'asap', 'open', 'opening', 'openings',
  'qualified', 'suitable', 'ideal', 'right', 'successful', 'committed', 'passionate',
  'results-driven', 'dynamic', 'motivated', 'hardworking', 'proactive', 'reliable',
  'honest', 'integrity', 'professional', 'teamwork', 'team-player', 'fast', 'paced',
  'fast-paced', 'multitask', 'multi-task', 'prioritise', 'prioritize', 'prioritising',
  'prioritizing', 'solve', 'solving', 'problem', 'problems', 'solutions', 'solution',
  'improve', 'improving', 'improvement', 'growth', 'grow', 'growing', 'learn',
  'learning', 'learners', 'training', 'train', 'trained', 'trainer', 'mentor',
  'mentoring', 'coach', 'coaching', 'supervise', 'supervising', 'supervision',
  'lead', 'leading', 'leader', 'leadership', 'manager', 'managers', 'management'
]);

const SKILL_TERMS = [
  // Data, research, M&E
  'monitoring and evaluation', 'monitoring & evaluation', 'm&e', 'mel', 'survey design',
  'data collection', 'data analysis', 'data analytics', 'data visualization', 'data visualisation',
  'data cleaning', 'data management', 'qualitative research', 'quantitative research',
  'research', 'statistics', 'stata', 'spss', 'python', 'r', 'excel', 'advanced excel',
  'power bi', 'tableau', 'looker', 'kobo toolbox', 'kobotoolbox', 'odk', 'surveycto',
  'commcare', 'sql', 'database management', 'report writing', 'impact evaluation',
  'baseline survey', 'endline survey', 'log frame', 'logframe', 'theory of change',
  'indicator tracking', 'dashboard', 'machine learning', 'artificial intelligence', 'gis',
  'arcgis', 'qgis', 'statistical analysis', 'sampling', 'questionnaire design',
  // Project, programme, operations
  'project management', 'programme management', 'program management', 'project coordination',
  'programme coordination', 'stakeholder management', 'stakeholder engagement',
  'budget management', 'budgeting', 'financial management', 'grants management',
  'proposal writing', 'concept notes', 'donor reporting', 'reporting', 'work planning',
  'risk management', 'procurement', 'logistics', 'supply chain', 'supply chain management',
  'operations management', 'event management', 'partnership management', 'partnerships',
  'capacity building', 'training', 'facilitation', 'community engagement', 'safeguarding',
  'gender mainstreaming', 'gender equality', 'social inclusion', 'child protection',
  'monitoring', 'evaluation', 'programme development', 'program development',
  'project planning', 'project delivery', 'contract management', 'tendering', 'bid writing',
  // Communications, marketing, design
  'communications', 'communication', 'content creation', 'copywriting', 'social media',
  'social media management', 'digital marketing', 'seo', 'email marketing', 'google analytics',
  'meta ads', 'facebook ads', 'campaign management', 'brand management', 'public relations',
  'media relations', 'storytelling', 'photography', 'videography', 'video editing',
  'graphic design', 'adobe photoshop', 'photoshop', 'illustrator', 'indesign', 'canva',
  'figma', 'ui/ux', 'ui design', 'ux design', 'user research', 'wireframing', 'prototyping',
  'design systems', 'product design', 'web design', 'wordpress', 'cms', 'content strategy',
  // Software and technology
  'javascript', 'typescript', 'react', 'react native', 'node.js', 'vue', 'angular', 'html',
  'css', 'tailwind', 'php', 'laravel', 'java', 'kotlin', 'swift', 'flutter', 'dart', 'c++',
  'c#', '.net', 'golang', 'rust', 'ruby', 'rails', 'django', 'flask', 'spring boot',
  'rest api', 'graphql', 'microservices', 'aws', 'azure', 'google cloud', 'docker',
  'kubernetes', 'terraform', 'ci/cd', 'devops', 'linux', 'git', 'github', 'agile', 'scrum',
  'kanban', 'jira', 'testing', 'qa', 'automation', 'cybersecurity', 'networking',
  'it support', 'system administration', 'cloud computing', 'api integration', 'database',
  'postgresql', 'mysql', 'mongodb', 'firebase', 'supabase', 'salesforce', 'hubspot',
  'crm', 'erp', 'sap', 'odoo', 'quickbooks', 'sage', 'xero', 'microsoft dynamics',
  // Finance, admin, compliance
  'accounting', 'bookkeeping', 'financial reporting', 'financial analysis', 'audit',
  'taxation', 'payroll', 'reconciliation', 'accounts payable', 'accounts receivable',
  'cash flow', 'forecasting', 'investment analysis', 'credit analysis', 'risk assessment',
  'compliance', 'corporate governance', 'company secretarial', 'administration',
  'office management', 'records management', 'data entry', 'customer service',
  'customer support', 'client relations', 'relationship management',
  // Sales and business
  'sales', 'business development', 'business strategy', 'market research', 'market analysis',
  'lead generation', 'negotiation', 'account management', 'key account management',
  'channel management', 'distribution', 'retail', 'e-commerce', 'customer acquisition',
  'pricing', 'business planning', 'commercial strategy',
  // People and HR
  'human resources', 'recruitment', 'talent acquisition', 'onboarding',
  'performance management', 'employee relations', 'learning and development', 'hris',
  'hr policies', 'compensation and benefits',
  // Health, education, agriculture, climate, humanitarian
  'public health', 'health systems', 'community health', 'nutrition', 'hiv', 'malaria',
  'maternal health', 'wash', 'water and sanitation', 'hygiene promotion', 'education',
  'curriculum development', 'teacher training', 'early childhood development',
  'agriculture', 'agronomy', 'livestock', 'value chain', 'food security', 'climate change',
  'climate adaptation', 'environment', 'conservation', 'renewable energy', 'solar energy',
  'energy access', 'resilience', 'disaster risk reduction', 'humanitarian response',
  'emergency response', 'refugee protection', 'human rights', 'advocacy', 'policy analysis',
  'legal research', 'governance', 'public policy',
  // Generic professional
  'leadership', 'team management', 'supervision', 'mentoring', 'coaching',
  'problem solving', 'analytical skills', 'critical thinking', 'communication skills',
  'interpersonal skills', 'time management', 'organizational skills', 'attention to detail',
  'adaptability', 'collaboration', 'teamwork', 'innovation', 'strategic planning',
  'change management', 'decision making', 'presentation skills', 'public speaking',
  'writing', 'editing', 'translation', 'english', 'luganda', 'swahili', 'french', 'arabic',
  // Tools
  'microsoft office', 'word', 'powerpoint', 'google workspace', 'google sheets',
  'google docs', 'notion', 'airtable', 'trello', 'asana', 'slack', 'zoom', 'teams',
  'mailchimp', 'hootsuite', 'buffer', 'zoho', 'oracle'
];

const SKILL_SET = [...new Set(SKILL_TERMS)];

const REPLY_RULES = {
  offer: [
    [/we(?:'re| are)? (?:pleased|delighted|happy|excited|glad) to (?:offer|inform you)/i, 8],
    [/we would like to offer you/i, 8],
    [/offer of employment/i, 6],
    [/formal offer/i, 5],
    [/job offer/i, 5],
    [/offer letter/i, 5],
    [/congratulations[^.]{0,80}offer/i, 6]
  ],
  rejection: [
    [/regret to inform/i, 5],
    [/unfortunately/i, 2],
    [/not (?:been )?(?:successful|selected|shortlisted)/i, 5],
    [/unsuccessful/i, 5],
    [/not moving forward/i, 5],
    [/will not be (?:moving|progressing)/i, 5],
    [/won't be progressing/i, 5],
    [/other candidates/i, 4],
    [/decided to (?:proceed|move forward) with (?:another|other)/i, 5],
    [/position has been filled/i, 5],
    [/no longer considering/i, 4],
    [/cannot offer you/i, 5],
    [/unable to offer you/i, 5]
  ],
  interview: [
    [/interview/i, 5],
    [/shortlisted/i, 4],
    [/invite you (?:for|to) (?:an? )?/i, 3],
    [/schedule (?:a )?(?:call|chat|conversation|meeting)/i, 4],
    [/meet with/i, 2],
    [/speak with you/i, 2],
    [/next (?:stage|round)/i, 3],
    [/available for a (?:call|chat|conversation)/i, 3],
    [/book a (?:call|time)/i, 2]
  ],
  assessment: [
    [/assessment/i, 5],
    [/(?:online|aptitude|technical|coding) test/i, 5],
    [/coding challenge/i, 5],
    [/take[- ]home/i, 4],
    [/assignment/i, 4],
    [/case study/i, 3],
    [/exercise/i, 2]
  ],
  info_request: [
    [/additional (?:documents|information)/i, 5],
    [/request(?:ed)? (?:for )?(?:documents|references|information)/i, 4],
    [/please (?:send|provide|share|submit)/i, 2],
    [/references/i, 3],
    [/salary expectations/i, 4],
    [/notice period/i, 3],
    [/proof of/i, 3],
    [/academic (?:documents|transcripts)/i, 4],
    [/transcript/i, 3],
    [/certificate/i, 2],
    [/national id/i, 3],
    [/passport/i, 2]
  ],
  ack: [
    [/received your application/i, 5],
    [/application (?:has been |was )?received/i, 5],
    [/thank you for (?:your )?application/i, 4],
    [/successfully submitted/i, 4],
    [/application is being reviewed/i, 4],
    [/under review/i, 3],
    [/we have your application/i, 4]
  ],
  talent_pool: [
    [/talent pool/i, 5],
    [/keep your (?:cv|resume|details) on file/i, 4],
    [/future (?:opportunities|openings)/i, 3]
  ]
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export function norm(value) {
  return String(value == null ? '' : value)
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanLine(value) {
  return String(value || '')
    .replace(/^[\s\-•*–—>]+/, '')
    .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+\s*/u, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/, '')
    .trim();
}

function capitalise(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function words(value) {
  return norm(value).toLowerCase().match(/[a-z0-9][a-z0-9+#.'’-]*/g) || [];
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function validDate(y, m, d) {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

function addMonths(date, months) {
  const next = new Date(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, last));
  return startOfDay(next);
}

function timeFromMatch(match) {
  if (!match) return null;
  const raw = match[0].toLowerCase();
  if (raw.includes('noon')) return '12:00';
  if (raw.includes('midnight')) return '00:00';
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const ampm = (match[3] || '').toLowerCase();
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function findTimeNear(text, index, length) {
  const after = text.slice(index + length, index + length + 60);
  const before = text.slice(Math.max(0, index - 25), index);
  const patterns = [
    /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i,
    /\b([01]?\d|2[0-3]):([0-5]\d)\b/,
    /\b(noon|midnight)\b/i
  ];
  for (const source of [after, before]) {
    for (const pattern of patterns) {
      const match = source.match(pattern);
      const time = timeFromMatch(match);
      if (time) return time;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* URL, email, phone and source detection                              */
/* ------------------------------------------------------------------ */

export function extractUrls(text) {
  const found = [];
  const re = /https?:\/\/[^\s<>"')\]]+/gi;
  let match;
  while ((match = re.exec(String(text || '')))) {
    const raw = match[0].replace(/[.,;:!?]+$/, '');
    if (!found.includes(raw)) found.push(raw);
  }
  return found;
}

export function extractEmails(text) {
  const found = [];
  const re = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  let match;
  while ((match = re.exec(String(text || '')))) {
    const email = match[0].replace(/[.,;:]+$/, '');
    if (!found.some(item => item.toLowerCase() === email.toLowerCase())) found.push(email);
  }
  return found;
}

export function extractPhones(text) {
  const found = [];
  const re = /(?:\+?256|0)\s?7\d{2}[\s.-]?\d{3}[\s.-]?\d{3}|(?:\+?254|0)\s?7\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/g;
  let match;
  while ((match = re.exec(String(text || '')))) {
    const phone = match[0].replace(/[^\d+]/g, '');
    if (!found.includes(phone)) found.push(phone);
  }
  return found;
}

export function sourceFromUrl(url) {
  const raw = String(url || '').toLowerCase();
  if (!raw) return null;
  if (raw.startsWith('mailto:')) return 'Email';
  for (const [domain, label] of SOURCE_DOMAINS) {
    if (raw.includes(domain)) return label;
  }
  return 'Company site';
}

export function detectSource(url, text = '') {
  const fromUrl = sourceFromUrl(url);
  if (fromUrl) return fromUrl;
  const lower = String(text || '').toLowerCase();
  if (/\b(linkedin)\b/.test(lower)) return 'LinkedIn';
  if (/\b(brightermonday|brighter monday)\b/.test(lower)) return 'BrighterMonday';
  if (/\b(indeed)\b/.test(lower)) return 'Indeed';
  if (/\b(reliefweb)\b/.test(lower)) return 'ReliefWeb';
  if (/\b(devex)\b/.test(lower)) return 'Devex';
  if (/\b(whatsapp|forwarded)\b/.test(lower)) return 'WhatsApp';
  if (/\b(referral|referred|recommended by)\b/.test(lower)) return 'Referral';
  if (/\b(email|e-mail)\b/.test(lower)) return 'Email';
  return 'Direct';
}

function pickJobUrl(urls) {
  if (!urls.length) return null;
  const scored = urls.map((url, index) => {
    const lower = url.toLowerCase();
    let score = 0;
    if (/greenhouse\.io|lever\.co|workable\.com|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|bamboohr\.com/.test(lower)) score += 6;
    if (/linkedin\.com|indeed\.com|brightermonday|reliefweb|devex|unjobs/.test(lower)) score += 5;
    if (/wa\.me|whatsapp\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com/.test(lower)) score -= 5;
    if (/unsubscribe|privacy|terms|login|signin|sign-in/.test(lower)) score -= 6;
    return { url, score, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0].url;
}

function companyFromHost(host) {
  let value = String(host || '').toLowerCase().replace(/^www\./, '');
  value = value.replace(/^(careers?|jobs?|apply|hiring|recruit|talent)\./, '');
  const parts = value.split('.');
  if (parts.length < 2) return null;
  const root = parts[parts.length - 2];
  if (!root || root.length < 2) return null;
  if (['greenhouse', 'lever', 'workable', 'ashbyhq', 'myworkdayjobs', 'smartrecruiters', 'bamboohr', 'recruitee', 'teamtailor', 'jobvite', 'icims', 'taleo', 'linkedin', 'indeed', 'brightermonday', 'reliefweb', 'devex', 'unjobs', 'glassdoor', 'google', 'example'].includes(root)) return null;
  return capitalise(root.replace(/[-_]/g, ' '));
}

function titleFromSlug(slug) {
  const cleaned = decodeURIComponent(String(slug || ''))
    .replace(/\.(html?|php|aspx?)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned.length < 4) return null;
  if (!/[a-z]/i.test(cleaned)) return null;
  if (cleaned.split(' ').length > 10) return null;
  return capitalise(cleaned.toLowerCase());
}

export function parseLink(url) {
  const raw = String(url || '').trim();
  const result = {
    url: raw,
    role: null,
    company: null,
    source: sourceFromUrl(raw) || 'Direct',
    location: null,
    workMode: null
  };
  if (!raw) return result;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return result;
  }
  const host = parsed.hostname.replace(/^www\./, '');
  const segments = parsed.pathname.split('/').filter(Boolean);
  result.company = companyFromHost(host);

  const lowerHost = host.toLowerCase();
  if (lowerHost.includes('greenhouse.io')) {
    const idx = segments.indexOf('jobs');
    if (idx > 0) result.company = capitalise(segments[idx - 1].replace(/[-_]/g, ' '));
    const last = segments[segments.length - 1];
    if (last && !/^\d+$/.test(last)) result.role = titleFromSlug(last);
  } else if (lowerHost.includes('lever.co')) {
    if (segments[0]) result.company = capitalise(segments[0].replace(/[-_]/g, ' '));
    if (segments[1]) result.role = titleFromSlug(segments[1]);
  } else if (lowerHost.includes('workable.com')) {
    if (segments[0]) result.company = capitalise(segments[0].replace(/[-_]/g, ' '));
    if (segments[1]) result.role = titleFromSlug(segments[1]);
  } else if (lowerHost.includes('ashbyhq.com') || lowerHost.includes('smartrecruiters.com') || lowerHost.includes('bamboohr.com')) {
    if (segments[0]) result.company = capitalise(segments[0].replace(/[-_]/g, ' '));
    if (segments[1]) result.role = titleFromSlug(segments[1]);
  } else if (lowerHost.includes('myworkdayjobs.com')) {
    const company = host.split('.')[0];
    result.company = capitalise(company.replace(/[-_]/g, ' '));
  } else if (lowerHost.includes('linkedin.com') || lowerHost.includes('indeed.com')) {
    // No reliable company or title in the path.
  } else if (segments.length) {
    const last = segments[segments.length - 1];
    const guessed = titleFromSlug(last);
    if (guessed && /(job|career|vacanc|position|role|apply)/i.test(parsed.pathname)) result.role = guessed;
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Date parsing                                                        */
/* ------------------------------------------------------------------ */

function collectExplicitDates(text, refDate, used) {
  const results = [];
  const add = (date, raw, index, hasYear, kind) => {
    if (!date) return;
    const end = index + raw.length;
    for (const range of used) {
      if (index < range.end && end > range.start) return;
    }
    used.push({ start: index, end });
    results.push({
      iso: toISODate(date),
      index,
      raw,
      hasYear,
      kind,
      time: findTimeNear(text, index, raw.length)
    });
  };

  // ISO: 2026-11-15
  {
    const re = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
    let m;
    while ((m = re.exec(text))) {
      add(validDate(Number(m[1]), Number(m[2]), Number(m[3])), m[0], m.index, true, 'explicit');
    }
  }

  // 15 November 2026 / 15th Nov / 15th of November
  {
    const re = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\.?(?:\\s*,?\\s*(20\\d{2}))?\\b`, 'gi');
    let m;
    while ((m = re.exec(text))) {
      const day = Number(m[1]);
      const month = MONTHS[m[2].toLowerCase().replace(/\.$/, '')];
      const year = m[3] ? Number(m[3]) : refDate.getFullYear();
      add(validDate(year, month, day), m[0], m.index, Boolean(m[3]), 'explicit');
    }
  }

  // November 15, 2026 / Nov 15
  {
    const re = new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:\\s*,?\\s*(20\\d{2}))?\\b`, 'gi');
    let m;
    while ((m = re.exec(text))) {
      const day = Number(m[2]);
      const month = MONTHS[m[1].toLowerCase().replace(/\.$/, '')];
      const year = m[3] ? Number(m[3]) : refDate.getFullYear();
      add(validDate(year, month, day), m[0], m.index, Boolean(m[3]), 'explicit');
    }
  }

  // 15/11/2026, 15-11-2026, 11/15/2026
  {
    const re = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2}|\d{2})\b/g;
    let m;
    while ((m = re.exec(text))) {
      let a = Number(m[1]);
      let b = Number(m[2]);
      let year = Number(m[3]);
      if (year < 100) year += 2000;
      let day;
      let month;
      if (a > 12) {
        day = a;
        month = b;
      } else if (b > 12) {
        month = a;
        day = b;
      } else {
        day = a;
        month = b;
      }
      add(validDate(year, month, day), m[0], m.index, true, 'explicit');
    }
  }

  // 15/11 (current year)
  {
    const re = /\b(\d{1,2})[\/.-](\d{1,2})\b/g;
    let m;
    while ((m = re.exec(text))) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a > 31 || b > 31) continue;
      let day;
      let month;
      if (a > 12) {
        day = a;
        month = b;
      } else if (b > 12) {
        month = a;
        day = b;
      } else {
        day = a;
        month = b;
      }
      add(validDate(refDate.getFullYear(), month, day), m[0], m.index, false, 'explicit');
    }
  }

  return results;
}

function collectRelativeDates(text, refDate, used) {
  const results = [];
  const add = (date, raw, index, kind = 'relative') => {
    if (!date) return;
    const end = index + raw.length;
    for (const range of used) {
      if (index < range.end && end > range.start) return;
    }
    used.push({ start: index, end });
    results.push({
      iso: toISODate(date),
      index,
      raw,
      hasYear: true,
      kind,
      time: findTimeNear(text, index, raw.length)
    });
  };

  const patterns = [
    [/\bday after tomorrow\b/gi, () => addDays(refDate, 2)],
    [/\btomorrow|tmrw|tmr\b/gi, () => addDays(refDate, 1)],
    [/\btoday\b/gi, () => startOfDay(refDate)],
    [/\bnext week\b/gi, () => addDays(refDate, 7)],
    [/\bnext month\b/gi, () => addMonths(refDate, 1)],
    [/\bend of (?:the )?month\b/gi, () => new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0)],
    [/\bend of (?:the )?week\b/gi, () => {
      const day = refDate.getDay();
      return addDays(refDate, (7 - day) % 7);
    }],
    [/\b(?:in|within)\s+(\d{1,2})\s+(day|days|week|weeks)\b/gi, (m) => {
      const amount = Number(m[1]);
      return addDays(refDate, /week/i.test(m[2]) ? amount * 7 : amount);
    }]
  ];

  for (const [re, make] of patterns) {
    let m;
    while ((m = re.exec(text))) {
      add(make(m), m[0], m.index);
    }
  }

  // Weekday references: Monday, next Friday, this Sunday
  {
    const re = new RegExp(`\\b(?:(next|this)\\s+)?(${WEEKDAYS.join('|')})\\b`, 'gi');
    let m;
    while ((m = re.exec(text))) {
      const modifier = (m[1] || '').toLowerCase();
      const target = WEEKDAYS.indexOf(m[2].toLowerCase());
      if (target < 0) continue;
      const current = refDate.getDay();
      let ahead = (target - current + 7) % 7;
      if (modifier === 'next') {
        if (ahead === 0) ahead = 7;
      } else if (ahead === 0 && modifier !== 'this') {
        // A bare weekday that is today means today for a deadline.
        ahead = 0;
      }
      add(addDays(refDate, ahead), m[0], m.index, 'weekday');
    }
  }

  return results;
}

export function findDates(text, refDate = new Date()) {
  const value = norm(text);
  const ref = startOfDay(refDate);
  const used = [];
  const explicit = collectExplicitDates(value, ref, used);
  const relative = collectRelativeDates(value, ref, used);
  // "Monday, 15 November 2026" is one date, not two. Drop a weekday that
  // sits immediately before an explicit date.
  const cleanedRelative = relative.filter(item => {
    if (item.kind !== 'weekday') return true;
    return !explicit.some(date => date.index > item.index && date.index - item.index < 24);
  });
  return [...explicit, ...cleanedRelative].sort((a, b) => a.index - b.index);
}

function contextAround(text, index, rawLength, before = 100, after = 90) {
  return text.slice(Math.max(0, index - before), index + rawLength + after);
}

function pickContextDate(text, dates, keywordRe, { allowAny = false } = {}) {
  let best = null;
  for (const date of dates) {
    const context = contextAround(text, date.index, date.raw.length);
    const matches = context.match(keywordRe);
    const score = matches ? matches.length : 0;
    if (!score && !allowAny) continue;
    const candidate = { ...date, context, contextScore: score };
    if (!best || candidate.contextScore > best.contextScore) best = candidate;
  }
  return best;
}

export function findDeadline(text, refDate = new Date()) {
  const value = norm(text);
  const dates = findDates(value, refDate);
  const keywordRe = /\b(deadline|closing date|closes|close on|apply (?:before|by|on)|applications? (?:close|due)|submit (?:by|before|on)|not later than|due date|last date|before|by)\b/gi;
  const picked = pickContextDate(value, dates, keywordRe);
  if (!picked) {
    if (/\b(rolling|until filled|ongoing|open until|continuous)\b/i.test(value)) {
      return { iso: null, time: null, raw: null, confidence: 'rolling', note: 'Rolling deadline' };
    }
    return null;
  }
  const strong = /\b(deadline|closing date|not later than|last date|applications? close)\b/i.test(picked.context);
  return {
    iso: picked.iso,
    time: picked.time,
    raw: picked.raw,
    confidence: strong ? 'high' : 'medium',
    context: picked.context.trim()
  };
}

export function findReplyDates(text, refDate = new Date()) {
  const value = norm(text);
  const dates = findDates(value, refDate);
  const results = [];
  for (const date of dates) {
    const context = contextAround(value, date.index, date.raw.length, 80, 80);
    let label = 'Date mentioned';
    if (/\b(interview|meet|call|chat|conversation|schedule|speak with|speak to|next stage|next round)\b/i.test(context)) label = 'Interview';
    else if (/\b(assessment|test|assignment|challenge|case study|exercise|task)\b/i.test(context)) label = 'Assessment';
    else if (/\b(start|onboarding|resume|join us|begin)\b/i.test(context)) label = 'Start date';
    else if (/\b(respond|response|decision|reply|get back|confirm)\b/i.test(context)) label = 'Response due';
    else if (/\b(deadline|due|submit|before|by)\b/i.test(context)) label = 'Deadline';
    if (label !== 'Date mentioned') {
      results.push({ ...date, label, context: context.trim() });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ */
/* Field extraction                                                    */
/* ------------------------------------------------------------------ */

function labeledValue(text, labels) {
  for (const line of String(text || '').split(/\n+/)) {
    for (const label of labels) {
      const re = new RegExp(`^\\s*[^A-Za-z0-9]{0,4}${escapeRe(label)}\\s*[:\\-–]\\s*(.+)$`, 'i');
      const match = line.match(re);
      if (match) return cleanLine(match[1]);
    }
  }
  const inline = String(text || '').match(new RegExp(`\\b(?:${labels.map(escapeRe).join('|')})\\s*[:\\-–]\\s*([^\\n|;]{2,90})`, 'i'));
  return inline ? cleanLine(inline[1]) : null;
}

export function extractRole(text) {
  const labeled = labeledValue(text, ['job title', 'position', 'role', 'vacancy', 'title']);
  if (labeled) return cleanRole(labeled);

  const patterns = [
    /(?:we(?:'re| are)?\s+)?(?:hiring|recruiting|seeking|looking for|searching for)\s+(?:an\s+|a\s+|the\s+)?([A-Za-z][^\n,.;|]{2,80})/i,
    /(?:vacancy|opening|opportunity|position)\s+(?:for|of)\s+(?:an\s+|a\s+|the\s+)?([^\n,.;|]{2,80})/i,
    /(?:role|position)\s+(?:is|of)\s+(?:an\s+|a\s+|the\s+)?([^\n,.;|]{2,80})/i,
    /(?:join (?:us|our team) as|work with us as)\s+(?:an\s+|a\s+|the\s+)?([^\n,.;|]{2,80})/i
  ];
  for (const re of patterns) {
    const match = String(text || '').match(re);
    if (match) {
      const value = cleanRole(match[1]);
      if (value && !ROLE_STOP_WORDS.includes(value.toLowerCase())) return value;
    }
  }
  return null;
}

function cleanRole(value) {
  let role = cleanLine(value)
    .replace(/^(?:job title|position|role|vacancy|title)\s*[:\-–]\s*/i, '')
    .replace(/^(?:a|an|the)\s+/i, '')
    .replace(/\s+(?:at|with)\s+.+$/i, '')
    .replace(/\s+(?:to join|who will|to lead|responsible for|to support|to work)\b.*$/i, '')
    .replace(/\s*\((?:remote|hybrid|on[- ]?site|full[- ]?time|part[- ]?time)\)\s*/i, ' ')
    .replace(/\s*[–—|]\s*.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  role = role.replace(/[.,;:!?]+$/, '').trim();
  for (const city of CITIES) {
    role = role.replace(new RegExp(`\\s+(?:in|at|based in)\\s+${escapeRe(city)}\\b.*$`, 'i'), '');
  }
  // "We are hiring an experienced and motivated Sales Executive" should
  // become "Sales Executive", not the adjectives.
  let guard = 0;
  while (guard < 8) {
    const first = role.split(/\s+/)[0]?.toLowerCase();
    if (!ROLE_STOP_WORDS.includes(first)) break;
    role = role.split(/\s+/).slice(1).join(' ');
    guard += 1;
  }
  if (!role || role.length < 2 || role.length > 90) return null;
  if (COMPANY_WORDS.has(role.toLowerCase())) return null;
  if (!/[a-z]/i.test(role)) return null;
  return capitalise(role);
}

export function extractCompany(text, role = null) {
  const value = String(text || '');
  const labeled = labeledValue(value, ['company', 'organisation', 'organization', 'employer', 'firm', 'hiring company']);
  if (labeled) {
    const cleaned = cleanCompany(labeled);
    if (cleaned) return cleaned;
  }

  if (role) {
    const atMatch = value.match(new RegExp(`${escapeRe(role)}\\s+(?:at|with|for)\\s+([^\\n,.;|]{2,70})`, 'i'));
    if (atMatch) {
      const cleaned = cleanCompany(atMatch[1]);
      if (cleaned) return cleaned;
    }
  }

  const candidates = [];
  const atRe = /\b(?:at|with|join)[ \t]+([A-Z][^\n,.;|]{1,70})/g;
  let match;
  while ((match = atRe.exec(value))) {
    const cleaned = cleanCompany(match[1]);
    if (cleaned) candidates.push({ value: cleaned, index: match.index });
  }

  const hiringRe = /\b([A-Z][\w&'’.-]*(?:[ \t]+[A-Z][\w&'’.-]*){0,5})[ \t]+(?:is|are)[ \t]+(?:hiring|recruiting|seeking|looking for|inviting)/g;
  while ((match = hiringRe.exec(value))) {
    const cleaned = cleanCompany(match[1]);
    if (cleaned) candidates.push({ value: cleaned, index: match.index });
  }

  const suffixRe = /\b([A-Z][\w&'’.-]*(?:[ \t]+[A-Z][\w&'’.-]*){0,5}[ \t]+(?:Ltd|Limited|Inc|LLC|PLC|Bank|Foundation|Group|Company|Co\.|University|Hospital|School|NGO|Trust|Institute|Agency|Consulting|Solutions|Technologies|Systems|Services))\b/g;
  while ((match = suffixRe.exec(value))) {
    const cleaned = cleanCompany(match[1]);
    if (cleaned) candidates.push({ value: cleaned, index: match.index });
  }

  const emails = extractEmails(value);
  for (const email of emails) {
    const domain = email.split('@')[1]?.toLowerCase();
    if (domain && !FREE_EMAIL_DOMAINS.has(domain)) {
      const root = domain.split('.')[0];
      if (root && root.length > 2) {
        const cleaned = cleanCompany(root.replace(/[-_]/g, ' '));
        if (cleaned) candidates.push({ value: cleaned, index: value.indexOf(email) });
      }
    }
  }

  candidates.sort((a, b) => a.index - b.index);
  for (const candidate of candidates) {
    if (role && candidate.value.toLowerCase() === role.toLowerCase()) continue;
    return candidate.value;
  }
  return null;
}

function cleanCompany(value) {
  let company = cleanLine(value)
    .replace(/^(?:at|with|join|from)\s+/i, '')
    .replace(/\s+(?:is|are)\s+(?:hiring|recruiting|seeking|looking for|inviting)\b.*$/i, '')
    .replace(/\s+(?:seeks?|invites?|wishes?|requires?)\b.*$/i, '')
    .replace(/\s+(?:for|in|at)\s+(?:the\s+)?(?:position|role|job|deadline|location)\b.*$/i, '')
    .replace(/\s*[–—|]\s*.*$/, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const city of CITIES) {
    company = company.replace(new RegExp(`\\s+(?:in|at|based in)\\s+${escapeRe(city)}\\b.*$`, 'i'), '');
  }
  company = company.replace(/[.,;:!?]+$/, '').trim();
  if (!company || company.length < 2 || company.length > 70) return null;
  if (!/[A-Za-z]/.test(company)) return null;
  const lower = company.toLowerCase();
  const first = lower.split(' ')[0];
  if (COMPANY_WORDS.has(first) || COMPANY_WORDS.has(lower)) return null;
  if (/\b(position|role|job|vacancy|deadline|salary|application|candidate|location)\b/i.test(lower)) return null;
  return capitalise(company);
}

export function extractLocation(text) {
  const labeled = labeledValue(text, ['location', 'duty station', 'based in', 'office', 'workplace', 'place of work']);
  const lower = String(text || '').toLowerCase();
  let workMode = null;
  if (/\b(remote|work from home|wfh|telecommute|anywhere)\b/.test(lower)) workMode = 'Remote';
  else if (/\b(hybrid)\b/.test(lower)) workMode = 'Hybrid';
  else if (/\b(on[- ]?site|in[- ]?person|office[- ]?based)\b/.test(lower)) workMode = 'On-site';

  if (labeled) {
    return { location: cleanLine(labeled), workMode };
  }
  for (const city of CITIES) {
    if (new RegExp(`\\b${escapeRe(city)}\\b`, 'i').test(text)) {
      return { location: city, workMode };
    }
  }
  if (workMode === 'Remote') return { location: 'Remote', workMode };
  if (/\bUganda\b/i.test(text)) return { location: 'Uganda', workMode };
  if (/\bKenya\b/i.test(text)) return { location: 'Kenya', workMode };
  return { location: null, workMode };
}

export function extractSalary(text) {
  const labeled = labeledValue(text, ['salary', 'pay', 'compensation', 'remuneration', 'stipend', 'gross salary', 'net salary']);
  if (labeled && !/expectation/i.test(labeled)) return labeled;
  const re = /\b(?:UGX|KES|USD|EUR|GBP|TZS|RWF|\$|£|€)\s?\d[\d,.]*(?:\s*(?:-|–|to)\s*(?:UGX|KES|USD|EUR|GBP|TZS|RWF|\$|£|€)?\s?\d[\d,.]*)?(?:\s*(?:per|\/)\s*(?:month|monthly|year|annum|hour|day|week))?/i;
  const match = String(text || '').match(re);
  return match ? cleanLine(match[0]) : null;
}

function pickApplicationEmail(emails) {
  if (!emails.length) return null;
  const preferred = emails.find(email => /^(jobs?|careers?|hr|recruit|recruitment|apply|applications?|talent|people)[._-]?/i.test(email));
  return preferred || emails[0];
}

function roleFamily(role) {
  const lower = String(role || '').toLowerCase();
  if (!lower) return null;
  if (/\b(monitoring|evaluation|m&e|mel|research|data|statistic|analyst|insight)\b/.test(lower)) return 'Data & research';
  if (/\b(communication|marketing|content|social media|brand|public relations|media)\b/.test(lower)) return 'Communications';
  if (/\b(finance|financial|account|audit|tax|treasur|bookkeep)\b/.test(lower)) return 'Finance';
  if (/\b(software|developer|engineer|programmer|data scientist|product|designer|ux|ui|devops|it)\b/.test(lower)) return 'Tech & product';
  if (/\b(sales|business development|partnership|account manager|commercial)\b/.test(lower)) return 'Sales';
  if (/\b(operations|logistics|procurement|supply chain|administration|admin)\b/.test(lower)) return 'Operations';
  if (/\b(human resources|hr|people|talent|recruit)\b/.test(lower)) return 'People';
  if (/\b(program|project|coordinator|officer|manager|advisor|specialist)\b/.test(lower)) return 'Programmes';
  if (/\b(intern|graduate|trainee|attachment)\b/.test(lower)) return 'Early career';
  return null;
}

function seniorityTag(role) {
  const lower = String(role || '').toLowerCase();
  if (/\b(director|head of|chief|vp|vice president)\b/.test(lower)) return 'Senior';
  if (/\b(manager|lead|principal)\b/.test(lower)) return 'Manager';
  if (/\b(senior|snr)\b/.test(lower)) return 'Senior';
  if (/\b(junior|jr|assistant|associate)\b/.test(lower)) return 'Junior';
  if (/\b(intern|internship|graduate|trainee|attachment)\b/.test(lower)) return 'Early career';
  return null;
}

/* ------------------------------------------------------------------ */
/* Job message                                                         */
/* ------------------------------------------------------------------ */

export function parseJobMessage(rawText, { refDate = new Date() } = {}) {
  const text = norm(rawText);
  const urls = extractUrls(text);
  const url = pickJobUrl(urls);
  const emails = extractEmails(text);
  const applicationEmail = pickApplicationEmail(emails);
  const phones = extractPhones(text);
  const deadline = findDeadline(text, refDate);
  const role = extractRole(text);
  const company = extractCompany(text, role);
  const locationInfo = extractLocation(text);
  const salary = extractSalary(text);
  const source = detectSource(url, text);
  const tags = [];
  if (locationInfo.workMode) tags.push(locationInfo.workMode);
  const seniority = seniorityTag(role);
  if (seniority) tags.push(seniority);
  const family = roleFamily(role);
  if (family) tags.push(family);
  if (/\b(urgent|immediate|asap|closing soon)\b/i.test(text)) tags.push('Urgent');

  const warnings = [];
  if (!role) warnings.push('No job title found — add it before saving.');
  if (!company) warnings.push('No company found — add it before saving.');
  if (!deadline || !deadline.iso) warnings.push('No deadline found — add one so Kazi can chase it.');

  return {
    role,
    company,
    location: locationInfo.location,
    workMode: locationInfo.workMode,
    salary,
    url,
    applicationEmail,
    phone: phones[0] || null,
    source,
    deadline: deadline?.iso || null,
    deadlineTime: deadline?.time || null,
    deadlineConfidence: deadline?.confidence || null,
    description: text,
    tags: [...new Set(tags)],
    warnings,
    confidence: {
      role: Boolean(role),
      company: Boolean(company),
      deadline: Boolean(deadline?.iso),
      url: Boolean(url),
      email: Boolean(applicationEmail)
    }
  };
}

/* ------------------------------------------------------------------ */
/* Reply intent                                                        */
/* ------------------------------------------------------------------ */

function scoreRules(text, rules) {
  let score = 0;
  const hits = [];
  for (const [re, weight] of rules) {
    if (re.test(text)) {
      score += weight;
      hits.push(re.source);
    }
  }
  return { score, hits };
}

function extractContactName(text) {
  const patterns = [
    /(?:kind regards|best regards|warm regards|regards|sincerely|best wishes|thanks|thank you)[,\s]*\n+\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/,
    /(?:my name is|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/,
    /(?:from|signed)[,:]?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/
  ];
  for (const re of patterns) {
    const match = text.match(re);
    if (match) return match[1].trim();
  }
  return null;
}

export function classifyReply(rawText, { refDate = new Date() } = {}) {
  const text = norm(rawText);
  const lower = text.toLowerCase();
  const scored = {};
  for (const [intent, rules] of Object.entries(REPLY_RULES)) {
    scored[intent] = scoreRules(lower, rules);
  }

  let intent = 'unknown';
  let bestScore = 0;
  const priority = ['offer', 'rejection', 'interview', 'assessment', 'info_request', 'ack', 'talent_pool'];
  for (const key of priority) {
    if (scored[key].score > bestScore) {
      bestScore = scored[key].score;
      intent = key;
    }
  }
  if (bestScore < 2) intent = 'unknown';

  // A rejection can mention "interview"; a positive offer can mention "interview".
  if (scored.rejection.score >= 4 && scored.offer.score < 8) intent = 'rejection';
  if (scored.offer.score >= 8) intent = 'offer';

  const dates = findReplyDates(text, refDate);
  const contactEmail = extractEmails(text)[0] || null;
  const contactName = extractContactName(text);

  const statusMap = {
    offer: 'offer',
    rejection: 'rejected',
    interview: 'interview',
    assessment: 'assessment',
    info_request: 'reply',
    ack: 'applied',
    talent_pool: 'reply',
    unknown: 'reply'
  };

  const actions = {
    offer: 'Review the offer and respond',
    rejection: 'Close the application and note any feedback',
    interview: 'Reply to confirm the interview',
    assessment: 'Complete the assessment',
    info_request: 'Send the requested information',
    ack: 'Wait for a response, then follow up',
    talent_pool: 'Keep warm and check back in 30 days',
    unknown: 'Read the message and decide the next step'
  };

  const nextActionDate = (() => {
    const first = dates[0];
    if (intent === 'interview') return toISODate(refDate);
    if (intent === 'assessment' || intent === 'info_request') return first?.iso || null;
    return null;
  })();

  return {
    intent,
    confidence: bestScore >= 6 ? 'high' : bestScore >= 3 ? 'medium' : 'low',
    scores: Object.fromEntries(Object.entries(scored).map(([key, value]) => [key, value.score])),
    matched: scored[intent]?.hits || [],
    dates,
    contactName,
    contactEmail,
    suggestedStatus: statusMap[intent],
    suggestedNextAction: actions[intent],
    suggestedNextActionDate: nextActionDate,
    suggestedFollowUpDate: intent === 'ack' ? toISODate(addDays(refDate, 7)) : null,
    summary: text.split(/\n/)[0].slice(0, 180)
  };
}

/* ------------------------------------------------------------------ */
/* Keywords and CV matching                                            */
/* ------------------------------------------------------------------ */

function countTerm(text, term) {
  const needle = String(term || '').toLowerCase();
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(needle, index)) !== -1) {
    const before = text[index - 1];
    const after = text[index + needle.length];
    const leftOk = !before || !/[a-z0-9]/.test(before);
    const rightOk = !after || !/[a-z0-9]/.test(after);
    if (leftOk && rightOk) count += 1;
    index += needle.length;
  }
  return count;
}

export function extractKeywords(jobDescription, { limit = 24 } = {}) {
  const raw = norm(jobDescription);
  if (!raw) return [];
  const text = raw
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/g, ' ');

  const results = new Map();
  for (const term of SKILL_SET) {
    const count = countTerm(text, term);
    if (count > 0) {
      results.set(term, {
        term,
        count,
        weight: term.includes(' ') ? 4 : 3,
        source: 'skill'
      });
    }
  }

  const tokens = text.match(/[a-z0-9][a-z0-9+#.'-]*/g) || [];
  const freq = new Map();
  for (const token of tokens) {
    const value = token.replace(/^[.'-]+|[.'-]+$/g, '');
    if (!value || value.length < 3) continue;
    if (STOPWORDS.has(value)) continue;
    if (/^\d+$/.test(value)) continue;
    freq.set(value, (freq.get(value) || 0) + 1);
  }
  for (const [term, count] of freq.entries()) {
    if (count < 2) continue;
    if (results.has(term)) continue;
    results.set(term, { term, count, weight: 1, source: 'frequency' });
  }

  let list = [...results.values()].sort((a, b) =>
    b.weight - a.weight || b.count - a.count || a.term.localeCompare(b.term)
  );

  // If the advert is short, allow a few strong one-off terms.
  if (list.length < 8) {
    for (const [term, count] of freq.entries()) {
      if (results.has(term)) continue;
      if (term.length < 5) continue;
      results.set(term, { term, count, weight: 1, source: 'frequency' });
      list = [...results.values()].sort((a, b) =>
        b.weight - a.weight || b.count - a.count || a.term.localeCompare(b.term)
      );
      if (list.length >= 10) break;
    }
  }

  return list.slice(0, limit);
}

function stemWord(word) {
  let value = String(word || '').toLowerCase();
  if (value.length <= 4) return value;
  value = value
    .replace(/ies$/i, 'y')
    .replace(/(ing|ed|es|s)$/i, '')
    .replace(/e$/i, '');
  return value;
}

function wordPresent(haystack, haystackWords, word) {
  if (!word) return true;
  if (countTerm(haystack, word) > 0) return true;
  const stem = stemWord(word);
  if (stem.length < 4) return false;
  return haystackWords.some(candidate => {
    if (candidate === word) return true;
    const candidateStem = stemWord(candidate);
    if (candidateStem === stem) return true;
    // analyse / analysis, write / writing, manage / management
    return stem.length >= 5 && candidateStem.length >= 5 && stem.slice(0, 5) === candidateStem.slice(0, 5);
  });
}

export function termPresent(text, term) {
  const haystack = String(text || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const needle = String(term || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!needle) return false;
  if (countTerm(haystack, needle) > 0) return true;

  const haystackWords = haystack.match(/[a-z0-9][a-z0-9+#.]*/g) || [];
  const parts = needle.split(' ').filter(part => part && !STOPWORDS.has(part));
  if (parts.length > 1) {
    return parts.every(part => wordPresent(haystack, haystackWords, part));
  }
  return wordPresent(haystack, haystackWords, needle);
}

export function matchKeywords(cvText, keywords) {
  const list = (keywords || []).map(item => typeof item === 'string' ? { term: item, weight: 1, count: 1 } : item);
  if (!list.length) return { score: null, matched: [], missing: [], matchedWeight: 0, totalWeight: 0 };
  const matched = [];
  const missing = [];
  let matchedWeight = 0;
  let totalWeight = 0;
  for (const keyword of list) {
    const weight = keyword.weight || 1;
    totalWeight += weight;
    if (termPresent(cvText, keyword.term)) {
      matched.push(keyword);
      matchedWeight += weight;
    } else {
      missing.push(keyword);
    }
  }
  return {
    score: totalWeight ? Math.round((matchedWeight / totalWeight) * 100) : null,
    matched,
    missing,
    matchedWeight,
    totalWeight
  };
}

export function keywordHits(text, keywords) {
  const list = (keywords || []).map(item => typeof item === 'string' ? item : item.term);
  let hits = 0;
  for (const term of list) {
    if (termPresent(text, term)) hits += 1;
  }
  return hits;
}

export function replyIntentLabel(intent) {
  return {
    offer: 'Offer',
    rejection: 'Rejection',
    interview: 'Interview',
    assessment: 'Assessment',
    info_request: 'Information requested',
    ack: 'Application received',
    talent_pool: 'Talent pool',
    unknown: 'General reply'
  }[intent] || 'General reply';
}
