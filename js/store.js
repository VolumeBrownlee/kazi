/* Kazi — state, demo data, local persistence and derived views. */

import {
  createCVFromProfile,
  cloneCV,
  normaliseCV,
  normaliseProfile,
  ensureCover,
  generateCoverDraft,
  tailorCV
} from './cv.js';
import {
  uid, nowISO, todayISO, addDaysISO, daysUntil, formatDate, formatTime, toISODate,
  toCSV, rowsToObjects, blobToDataURL, dataURLToBlob, parseDateOnly
} from './utils.js';

export const STORAGE_KEY = 'kazi.state.v1';

export const STATUSES = {
  captured: { label: 'Captured', short: 'Captured', group: 'captured', tone: 'neutral', order: 0 },
  to_apply: { label: 'To apply', short: 'To apply', group: 'active', tone: 'amber', order: 1 },
  applied: { label: 'Applied', short: 'Applied', group: 'active', tone: 'blue', order: 2 },
  reply: { label: 'Reply received', short: 'Reply', group: 'active', tone: 'blue', order: 3 },
  assessment: { label: 'Assessment', short: 'Assessment', group: 'active', tone: 'amber', order: 4 },
  interview: { label: 'Interview', short: 'Interview', group: 'active', tone: 'green', order: 5 },
  offer: { label: 'Offer', short: 'Offer', group: 'active', tone: 'green', order: 6 },
  rejected: { label: 'Rejected', short: 'Rejected', group: 'closed', tone: 'red', order: 7 },
  withdrawn: { label: 'Withdrawn', short: 'Withdrawn', group: 'closed', tone: 'neutral', order: 8 },
  ghosted: { label: 'No response', short: 'No response', group: 'closed', tone: 'neutral', order: 9 }
};

export const STATUS_KEYS = Object.keys(STATUSES);
export const PIPELINE_STATUSES = ['captured', 'to_apply', 'applied', 'reply', 'assessment', 'interview', 'offer', 'rejected', 'withdrawn', 'ghosted'];

export const BOARD_COLUMNS = [
  { key: 'captured', label: 'Captured', statuses: ['captured'] },
  { key: 'to_apply', label: 'To apply', statuses: ['to_apply'] },
  { key: 'applied', label: 'Applied', statuses: ['applied', 'reply'] },
  { key: 'interview', label: 'Interviewing', statuses: ['assessment', 'interview'] },
  { key: 'offer', label: 'Offer', statuses: ['offer'] },
  { key: 'closed', label: 'Closed', statuses: ['rejected', 'withdrawn', 'ghosted'] }
];

export function statusMeta(status) {
  return STATUSES[status] || STATUSES.captured;
}

export function isClosed(status) {
  return statusMeta(status).group === 'closed';
}

export function defaultProfile() {
  return {
    name: '',
    headline: '',
    email: '',
    phone: '',
    location: '',
    links: { linkedin: '', portfolio: '', website: '' },
    summary: '',
    skills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    languages: []
  };
}

export function defaultState() {
  const at = nowISO();
  return {
    version: 1,
    meta: {
      createdAt: at,
      updatedAt: at,
      onboarded: false,
      demo: false,
      profileIsDemo: false,
      lastExportAt: null,
      lastNotified: null,
      demoSeededAt: null
    },
    profile: defaultProfile(),
    applications: [],
    cvs: [],
    covers: [],
    settings: {
      reminders: true,
      reminderDays: 1,
      defaultView: 'list',
      hideDemoBanner: false,
      ai: false
    }
  };
}

function deepMerge(base, incoming) {
  if (Array.isArray(base) || Array.isArray(incoming)) return incoming === undefined ? base : incoming;
  if (base && incoming && typeof base === 'object' && typeof incoming === 'object') {
    const out = { ...base };
    for (const key of Object.keys(incoming)) out[key] = deepMerge(base[key], incoming[key]);
    return out;
  }
  return incoming === undefined ? base : incoming;
}

function normaliseContact(contact = {}) {
  return {
    name: String(contact.name || '').trim(),
    role: String(contact.role || '').trim(),
    email: String(contact.email || '').trim(),
    phone: String(contact.phone || '').trim()
  };
}

function normaliseTimeline(timeline, app) {
  const events = Array.isArray(timeline) ? timeline.map(event => ({
    id: event.id || uid('event'),
    type: event.type || 'note',
    at: event.at || app.capturedAt || nowISO(),
    title: String(event.title || 'Activity'),
    note: String(event.note || ''),
    meta: event.meta && typeof event.meta === 'object' ? event.meta : {}
  })) : [];
  if (!events.length) {
    events.push({
      id: uid('event'),
      type: 'captured',
      at: app.capturedAt || nowISO(),
      title: 'Captured',
      note: app.source ? `Added from ${app.source}` : 'Added to Kazi',
      meta: {}
    });
  }
  return events.sort((a, b) => new Date(a.at) - new Date(b.at));
}

function normaliseReply(reply = {}) {
  return {
    id: reply.id || uid('reply'),
    at: reply.at || nowISO(),
    from: String(reply.from || '').trim(),
    subject: String(reply.subject || '').trim(),
    body: String(reply.body || ''),
    intent: reply.intent || 'unknown',
    dates: Array.isArray(reply.dates) ? reply.dates : [],
    contactName: String(reply.contactName || '').trim(),
    contactEmail: String(reply.contactEmail || '').trim()
  };
}

export function normaliseApplication(app = {}) {
  const status = STATUSES[app.status] ? app.status : 'captured';
  const at = app.capturedAt || app.createdAt || nowISO();
  const value = {
    id: app.id || uid('app'),
    role: String(app.role || '').trim(),
    company: String(app.company || '').trim(),
    location: String(app.location || '').trim(),
    workMode: String(app.workMode || '').trim(),
    salary: String(app.salary || '').trim(),
    source: String(app.source || 'Direct').trim(),
    url: String(app.url || '').trim(),
    applicationEmail: String(app.applicationEmail || '').trim(),
    status,
    priority: ['low', 'normal', 'high'].includes(app.priority) ? app.priority : 'normal',
    deadline: app.deadline || '',
    deadlineTime: app.deadlineTime || '',
    appliedAt: app.appliedAt || '',
    capturedAt: at,
    updatedAt: app.updatedAt || at,
    nextAction: String(app.nextAction || '').trim(),
    nextActionDate: app.nextActionDate || '',
    followUpDate: app.followUpDate || '',
    interviewDate: app.interviewDate || '',
    interviewTime: app.interviewTime || '',
    jobDescription: String(app.jobDescription || ''),
    notes: String(app.notes || ''),
    tags: Array.isArray(app.tags) ? [...new Set(app.tags.map(tag => String(tag).trim()).filter(Boolean))] : [],
    contact: normaliseContact(app.contact),
    timeline: [],
    replies: Array.isArray(app.replies) ? app.replies.map(normaliseReply) : [],
    documents: Array.isArray(app.documents) ? app.documents.map(document => ({
      id: document.id || uid('doc'),
      kind: document.kind || 'other',
      name: String(document.name || 'Document'),
      createdAt: document.createdAt || nowISO(),
      fileId: document.fileId || null,
      fileType: document.fileType || '',
      fileSize: Number(document.fileSize || 0),
      cv: document.cv || null,
      cover: document.cover || null
    })) : [],
    cvId: app.cvId || null,
    coverId: app.coverId || null,
    archived: Boolean(app.archived),
    needsReview: app.needsReview !== undefined ? Boolean(app.needsReview) : (!app.role || !app.company),
    isDemo: Boolean(app.isDemo)
  };
  value.timeline = normaliseTimeline(app.timeline, value);
  // Replies and interviews are part of the story even if they were imported or
  // logged before the event log existed.
  for (const reply of value.replies) {
    if (!value.timeline.some(event => event.type === 'reply' && event.at === reply.at)) {
      value.timeline.push({
        id: uid('event'),
        type: 'reply',
        at: reply.at,
        title: replyTitle(reply.intent),
        note: reply.body.slice(0, 240),
        meta: { intent: reply.intent, dates: reply.dates }
      });
    }
  }
  if (value.interviewDate && !value.timeline.some(event => event.type === 'interview' && event.meta?.date === value.interviewDate)) {
    value.timeline.push({
      id: uid('event'),
      type: 'interview',
      at: `${value.interviewDate}T${value.interviewTime || '09:00'}:00.000Z`,
      title: 'Interview scheduled',
      note: '',
      meta: { date: value.interviewDate, time: value.interviewTime }
    });
  }
  value.timeline.sort((a, b) => new Date(a.at) - new Date(b.at));
  if (!value.appliedAt && value.status === 'applied') value.appliedAt = value.capturedAt.slice(0, 10);
  return value;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    const merged = deepMerge(base, parsed);
    merged.version = 1;
    merged.profile = normaliseProfile({ ...defaultProfile(), ...(parsed.profile || {}) });
    merged.applications = Array.isArray(parsed.applications) ? parsed.applications.map(normaliseApplication) : [];
    merged.cvs = Array.isArray(parsed.cvs) ? parsed.cvs.map(normaliseCV) : [];
    merged.covers = Array.isArray(parsed.covers) ? parsed.covers.map(ensureCover) : [];
    merged.settings = { ...base.settings, ...(parsed.settings || {}) };
    merged.meta = { ...base.meta, ...(parsed.meta || {}) };
    return merged;
  } catch (error) {
    console.error('Kazi could not load your saved data.', error);
    const state = defaultState();
    state.meta.loadError = true;
    return state;
  }
}

export function saveState(state) {
  try {
    state.meta.updatedAt = nowISO();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error('Kazi could not save your data.', error);
    return false;
  }
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getApplication(state, id) {
  return state.applications.find(app => app.id === id) || null;
}

export function getCV(state, id) {
  return state.cvs.find(cv => cv.id === id) || null;
}

export function getCover(state, id) {
  return state.covers.find(cover => cover.id === id) || null;
}

export function addEvent(app, type, title, note = '', at = nowISO(), meta = {}) {
  app.timeline = app.timeline || [];
  app.timeline.push({ id: uid('event'), type, title, note, at, meta });
  app.timeline.sort((a, b) => new Date(a.at) - new Date(b.at));
  app.updatedAt = at;
}

export function makeApplication(fields = {}) {
  const at = fields.capturedAt || nowISO();
  const status = STATUSES[fields.status] ? fields.status : 'captured';
  const app = normaliseApplication({
    ...fields,
    id: fields.id || uid('app'),
    status,
    capturedAt: at,
    updatedAt: at,
    timeline: [],
    needsReview: fields.needsReview !== undefined ? fields.needsReview : status === 'captured'
  });
  if (status !== 'captured' && fields.needsReview === undefined) app.needsReview = false;
  if (status === 'applied' || app.appliedAt) {
    if (!app.appliedAt) app.appliedAt = at.slice(0, 10);
    addEvent(app, 'applied', 'Application sent', '', `${app.appliedAt}T09:00:00.000Z`);
  }
  return app;
}

export function setApplicationStatus(state, app, status, note = '') {
  if (!STATUSES[status] || app.status === status) return false;
  const previous = app.status;
  app.status = status;
  app.needsReview = false;
  if (status === 'applied' && !app.appliedAt) app.appliedAt = todayISO();
  if (status !== 'captured') app.needsReview = false;
  const labels = {
    to_apply: 'Marked as a role to apply for',
    applied: 'Application sent',
    reply: 'Reply received',
    assessment: 'Assessment stage',
    interview: 'Interview stage',
    offer: 'Offer received',
    rejected: 'Application closed — rejected',
    withdrawn: 'Application withdrawn',
    ghosted: 'Closed — no response',
    captured: 'Moved back to capture'
  };
  addEvent(app, 'status', labels[status] || `Status changed to ${statusMeta(status).label}`, note, nowISO(), { from: previous, to: status });
  return true;
}

export function logReply(state, app, reply) {
  const entry = normaliseReply(reply);
  app.replies = app.replies || [];
  app.replies.push(entry);
  addEvent(app, 'reply', replyTitle(entry.intent), entry.body.slice(0, 240), entry.at, {
    intent: entry.intent,
    dates: entry.dates
  });
  if (reply.intent === 'interview' && reply.interviewDate) {
    app.interviewDate = reply.interviewDate;
    app.interviewTime = reply.interviewTime || app.interviewTime || '';
    addEvent(app, 'interview', 'Interview scheduled', '', entry.at, {
      date: app.interviewDate, time: app.interviewTime
    });
  }
  if (reply.intent === 'offer') app.offerAt = entry.at.slice(0, 10);
  app.needsReview = false;
  app.updatedAt = entry.at;
  return entry;
}

function replyTitle(intent) {
  return {
    offer: 'Offer received',
    rejection: 'Rejection received',
    interview: 'Interview invitation',
    assessment: 'Assessment requested',
    info_request: 'More information requested',
    ack: 'Application acknowledged',
    talent_pool: 'Added to talent pool',
    unknown: 'Reply received'
  }[intent] || 'Reply received';
}

export function addDocument(app, document) {
  const entry = {
    id: uid('doc'),
    kind: document.kind || 'other',
    name: document.name || 'Document',
    createdAt: nowISO(),
    fileId: document.fileId || null,
    fileType: document.fileType || '',
    fileSize: document.fileSize || 0,
    cv: document.cv || null,
    cover: document.cover || null
  };
  app.documents = app.documents || [];
  app.documents.unshift(entry);
  app.updatedAt = nowISO();
  addEvent(app, 'document', `${entry.kind === 'cv' ? 'CV' : entry.kind === 'cover' ? 'Cover letter' : 'Document'} attached`, entry.name);
  return entry;
}

export function deadlineInfo(app, fromISO = todayISO()) {
  if (!app.deadline) return null;
  const days = daysUntil(app.deadline, fromISO);
  if (days == null) return null;
  let label;
  if (days < 0) label = `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  else if (days === 0) label = 'Due today';
  else if (days === 1) label = 'Due tomorrow';
  else if (days <= 7) label = `${days} days left`;
  else label = `Due ${formatDate(app.deadline)}`;
  const tone = days < 0 ? 'danger' : days <= 3 ? 'warn' : days <= 7 ? 'soon' : 'calm';
  return { days, label, tone, date: app.deadline, time: app.deadlineTime };
}

export function nextDeadline(state) {
  return state.applications
    .filter(app => !app.archived && !isClosed(app.status) && app.deadline && daysUntil(app.deadline) >= 0)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))[0] || null;
}

export function applicationEvents(state) {
  const events = [];
  for (const app of state.applications) {
    if (app.archived) continue;
    if (app.deadline && !isClosed(app.status)) {
      events.push({
        id: `${app.id}-deadline`,
        appId: app.id,
        type: 'deadline',
        date: app.deadline,
        time: app.deadlineTime || '',
        title: `${app.role || 'Role'} — application deadline`,
        shortTitle: 'Deadline',
        company: app.company,
        role: app.role,
        description: `Application deadline for ${app.role || 'the role'} at ${app.company || 'the company'}.`,
        tone: 'danger'
      });
    }
    if (app.nextActionDate && app.nextAction && !isClosed(app.status)) {
      events.push({
        id: `${app.id}-next`,
        appId: app.id,
        type: 'next',
        date: app.nextActionDate,
        time: '',
        title: app.nextAction,
        shortTitle: 'Next step',
        company: app.company,
        role: app.role,
        description: `Next step for ${app.role || 'the role'} at ${app.company || 'the company'}.`,
        tone: 'green'
      });
    }
    if (app.followUpDate && !isClosed(app.status)) {
      events.push({
        id: `${app.id}-followup`,
        appId: app.id,
        type: 'followup',
        date: app.followUpDate,
        time: '',
        title: `Follow up on ${app.role || 'application'}`,
        shortTitle: 'Follow up',
        company: app.company,
        role: app.role,
        description: `Follow up with ${app.company || 'the employer'} about ${app.role || 'your application'}.`,
        tone: 'amber'
      });
    }
    if (app.interviewDate && !isClosed(app.status)) {
      events.push({
        id: `${app.id}-interview`,
        appId: app.id,
        type: 'interview',
        date: app.interviewDate,
        time: app.interviewTime || '',
        title: `Interview — ${app.role || 'Role'}`,
        shortTitle: 'Interview',
        company: app.company,
        role: app.role,
        description: `Interview for ${app.role || 'the role'} at ${app.company || 'the company'}${app.contact?.name ? ` with ${app.contact.name}` : ''}.`,
        tone: 'blue'
      });
    }
  }
  return events.sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`));
}

export function upcomingAgenda(state, days = 14) {
  const end = addDaysISO(todayISO(), days);
  return applicationEvents(state).filter(event => event.date >= todayISO() && event.date <= end);
}

export function needsAttention(state) {
  const items = [];
  const today = todayISO();
  for (const app of state.applications) {
    if (app.archived) continue;
    const candidates = [];
    const deadline = deadlineInfo(app, today);
    if (deadline && !isClosed(app.status) && ['captured', 'to_apply'].includes(app.status)) {
      if (deadline.days < 0) {
        candidates.push({
          kind: 'deadline',
          priority: 1,
          label: deadline.label,
          detail: app.deadline ? `Application deadline was ${formatDate(app.deadline)}` : '',
          sortDate: app.deadline,
          tone: 'danger'
        });
      } else if (deadline.days <= 3) {
        candidates.push({
          kind: 'deadline',
          priority: 1,
          label: deadline.label,
          detail: `Apply for ${app.role || 'this role'}`,
          sortDate: app.deadline,
          tone: 'warn'
        });
      }
    }
    if (app.interviewDate && !isClosed(app.status)) {
      const days = daysUntil(app.interviewDate, today);
      if (days != null && days >= 0 && days <= 7) {
        candidates.push({
          kind: 'interview',
          priority: days <= 2 ? 1 : 2,
          label: days === 0 ? 'Interview today' : days === 1 ? 'Interview tomorrow' : `Interview in ${days} days`,
          detail: `${formatTime(app.interviewTime) || 'Time to confirm'}${app.contact?.name ? ` with ${app.contact.name}` : ''}`,
          sortDate: app.interviewDate,
          tone: 'green'
        });
      }
    }
    if (app.nextActionDate && app.nextAction && app.nextActionDate <= today && !isClosed(app.status)) {
      const days = daysUntil(app.nextActionDate, today);
      candidates.push({
        kind: 'next',
        priority: days < 0 ? 2 : 2,
        label: app.nextAction,
        detail: days < 0 ? `Was due ${formatDate(app.nextActionDate)}` : 'Due today',
        sortDate: app.nextActionDate,
        tone: days < 0 ? 'danger' : 'amber'
      });
    }
    if (app.followUpDate && app.followUpDate <= today && !isClosed(app.status)) {
      candidates.push({
        kind: 'followup',
        priority: 3,
        label: 'Follow up',
        detail: app.followUpDate < today ? `Was due ${formatDate(app.followUpDate)}` : 'Due today',
        sortDate: app.followUpDate,
        tone: 'amber'
      });
    }
    if (app.needsReview) {
      candidates.push({
        kind: 'review',
        priority: 4,
        label: 'Review capture',
        detail: 'Check the role, company and deadline',
        sortDate: app.capturedAt?.slice(0, 10) || today,
        tone: 'neutral'
      });
    }
    if (!candidates.length) continue;
    candidates.sort((a, b) => a.priority - b.priority || String(a.sortDate).localeCompare(String(b.sortDate)));
    items.push({ app, ...candidates[0] });
  }
  return items.sort((a, b) => a.priority - b.priority || String(a.sortDate).localeCompare(String(b.sortDate)));
}

export function computeStats(state) {
  const apps = state.applications.filter(app => !app.archived);
  const submitted = apps.filter(app => !['captured', 'to_apply'].includes(app.status));
  const active = apps.filter(app => !isClosed(app.status));
  const responded = submitted.filter(app => hasResponse(app));
  const interviews = submitted.filter(app => hasInterview(app));
  const offers = apps.filter(app => app.status === 'offer');
  const weekAgo = addDaysISO(todayISO(), -7);
  const applicationsThisWeek = apps.filter(app => (app.appliedAt || app.capturedAt?.slice(0, 10) || '') >= weekAgo).length;
  const repliesThisWeek = apps.reduce((count, app) => count + app.replies.filter(reply => reply.at.slice(0, 10) >= weekAgo).length, 0);
  const responseDays = apps
    .filter(app => app.replies.length)
    .map(app => {
      const sent = app.appliedAt || app.capturedAt?.slice(0, 10);
      const first = app.replies[0]?.at?.slice(0, 10);
      if (!sent || !first) return null;
      return Math.max(0, daysUntil(first, sent));
    })
    .filter(value => value != null);
  const avgResponseDays = responseDays.length ? Math.round(responseDays.reduce((a, b) => a + b, 0) / responseDays.length) : null;
  const missed = apps.filter(app => app.deadline && daysUntil(app.deadline) < 0 && ['captured', 'to_apply'].includes(app.status));

  return {
    total: apps.length,
    active: active.length,
    submitted: submitted.length,
    responded: responded.length,
    interviews: interviews.length,
    offers: offers.length,
    responseRate: submitted.length ? Math.round((responded.length / submitted.length) * 100) : null,
    interviewRate: submitted.length ? Math.round((interviews.length / submitted.length) * 100) : null,
    offerRate: submitted.length ? Math.round((offers.length / submitted.length) * 100) : null,
    applicationsThisWeek,
    repliesThisWeek,
    avgResponseDays,
    missed: missed.length,
    upcomingInterviews: apps.filter(app => app.interviewDate && daysUntil(app.interviewDate) >= 0 && daysUntil(app.interviewDate) <= 14).length
  };
}

function hasResponse(app) {
  return app.replies.length > 0 || ['reply', 'assessment', 'interview', 'offer', 'rejected'].includes(app.status);
}

function hasInterview(app) {
  return ['interview', 'offer'].includes(app.status) || app.replies.some(reply => reply.intent === 'interview');
}

export function sourceStats(state) {
  const submitted = state.applications.filter(app => !app.archived && !['captured', 'to_apply'].includes(app.status));
  const groups = new Map();
  for (const app of submitted) {
    const key = app.source || 'Unknown';
    if (!groups.has(key)) groups.set(key, { source: key, applications: 0, responses: 0, interviews: 0, offers: 0 });
    const group = groups.get(key);
    group.applications += 1;
    if (hasResponse(app)) group.responses += 1;
    if (hasInterview(app)) group.interviews += 1;
    if (app.status === 'offer') group.offers += 1;
  }
  return [...groups.values()]
    .map(group => ({
      ...group,
      responseRate: group.applications ? Math.round((group.responses / group.applications) * 100) : 0,
      interviewRate: group.applications ? Math.round((group.interviews / group.applications) * 100) : 0
    }))
    .sort((a, b) => b.applications - a.applications || b.responseRate - a.responseRate);
}

export function weeklyActivity(state, weeks = 8) {
  const today = parseDateOnly(todayISO());
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const starts = [];
  for (let index = weeks - 1; index >= 0; index -= 1) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - index * 7);
    starts.push(start);
  }
  return starts.map(start => {
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const startISO = toISODate(start);
    const endISO = toISODate(end);
    const count = state.applications.filter(app => {
      if (app.archived) return false;
      const date = app.appliedAt || app.capturedAt?.slice(0, 10) || '';
      return date >= startISO && date <= endISO;
    }).length;
    return {
      start: startISO,
      end: endISO,
      label: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(start),
      count
    };
  });
}

export function funnelStats(state) {
  const stats = computeStats(state);
  return [
    { key: 'submitted', label: 'Submitted', count: stats.submitted, percent: 100 },
    { key: 'responded', label: 'Replies', count: stats.responded, percent: stats.submitted ? Math.round((stats.responded / stats.submitted) * 100) : 0 },
    { key: 'interviews', label: 'Interviews', count: stats.interviews, percent: stats.submitted ? Math.round((stats.interviews / stats.submitted) * 100) : 0 },
    { key: 'offers', label: 'Offers', count: stats.offers, percent: stats.submitted ? Math.round((stats.offers / stats.submitted) * 100) : 0 }
  ];
}

export function deadlinePerformance(state) {
  const applied = state.applications.filter(app => !app.archived && app.appliedAt && !['captured', 'to_apply'].includes(app.status));
  const withDeadline = applied.filter(app => app.deadline);
  const onTime = withDeadline.filter(app => app.appliedAt <= app.deadline);
  const missed = state.applications.filter(app => !app.archived && app.deadline && daysUntil(app.deadline) < 0 && ['captured', 'to_apply'].includes(app.status));
  return {
    onTime: onTime.length,
    withDeadline: withDeadline.length,
    percent: withDeadline.length ? Math.round((onTime.length / withDeadline.length) * 100) : null,
    missed: missed.length
  };
}

export function profileCompleteness(profileInput) {
  const profile = normaliseProfile(profileInput);
  const checks = [
    { key: 'name', label: 'Full name', ok: Boolean(profile.name) },
    { key: 'headline', label: 'Professional headline', ok: Boolean(profile.headline) },
    { key: 'email', label: 'Email', ok: Boolean(profile.email) },
    { key: 'phone', label: 'Phone', ok: Boolean(profile.phone) },
    { key: 'location', label: 'Location', ok: Boolean(profile.location) },
    { key: 'summary', label: 'Short summary', ok: profile.summary.length >= 80 },
    { key: 'experience', label: 'Work experience', ok: profile.experience.some(exp => exp.role && exp.bullets.length) },
    { key: 'education', label: 'Education', ok: profile.education.some(item => item.degree || item.school) },
    { key: 'skills', label: 'Five skills', ok: profile.skills.length >= 5 },
    { key: 'links', label: 'A link (LinkedIn or portfolio)', ok: Boolean(profile.links.linkedin || profile.links.portfolio || profile.links.website) }
  ];
  const done = checks.filter(check => check.ok).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    done,
    total: checks.length,
    checks,
    missing: checks.filter(check => !check.ok).map(check => check.label)
  };
}

export function allTags(state) {
  return [...new Set(state.applications.flatMap(app => app.tags))].sort((a, b) => a.localeCompare(b));
}

export function tagCounts(state) {
  const counts = new Map();
  for (const app of state.applications) {
    if (app.archived) continue;
    for (const tag of app.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/* ------------------------------------------------------------------ */
/* Demo workspace                                                      */
/* ------------------------------------------------------------------ */

const MONITORING_JD = `Monitoring and Evaluation Officer — Savanna Health Initiative

We are looking for an M&E Officer to lead measurement, evaluation and learning across our maternal health programme in central Uganda.

Responsibilities
- Design and manage surveys, including baseline and endline data collection
- Analyse quantitative and qualitative data using Excel, Stata or Power BI
- Maintain the programme logframe and track indicators against targets
- Write quarterly donor reports and learning briefs
- Train programme staff on KoboToolbox and data quality
- Engage district health officials and community stakeholders

Requirements
- Degree in social sciences, statistics, public health or a related field
- At least 3 years of experience in monitoring and evaluation
- Strong skills in survey design, data analysis and report writing
- Experience with donor reporting and stakeholder engagement
- Proficiency in Excel, Power BI and KoboToolbox
- Excellent written and verbal communication skills

Deadline: applications close soon.`;

function demoProfile() {
  return normaliseProfile({
    name: 'Amina Nakato',
    headline: 'Monitoring & Evaluation Officer',
    email: 'amina.nakato@example.com',
    phone: '+256 700 000 000',
    location: 'Kampala, Uganda',
    links: {
      linkedin: 'https://linkedin.com/in/amina-nakato-example',
      portfolio: 'https://amina.example.com',
      website: ''
    },
    summary: 'Monitoring and evaluation professional with four years of experience turning field data into decisions. I design surveys, build dashboards and write reports that programme teams actually use.',
    skills: [
      'Monitoring and evaluation', 'Survey design', 'Data analysis', 'Report writing',
      'Power BI', 'Excel', 'Stata', 'KoboToolbox', 'Stakeholder engagement',
      'Donor reporting', 'Qualitative research', 'Project management'
    ],
    experience: [
      {
        role: 'Monitoring & Evaluation Officer',
        company: 'Savanna Impact Foundation',
        location: 'Kampala',
        start: 'Feb 2023',
        end: '',
        current: true,
        bullets: [
          'Built a monthly results dashboard in Power BI used by five programme teams to track 18 indicators.',
          'Designed and ran a 1,200-respondent baseline survey across three districts, cutting data cleaning time by 40% with KoboToolbox.',
          'Wrote quarterly donor reports for a €750k portfolio with zero late submissions.',
          'Trained 24 programme staff on data quality, mobile data collection and indicator tracking.'
        ]
      },
      {
        role: 'Research Associate',
        company: 'Kampala Policy Lab',
        location: 'Kampala',
        start: 'Jan 2021',
        end: 'Jan 2023',
        current: false,
        bullets: [
          'Analysed survey data in Stata and Excel and co-authored two policy briefs on youth employment.',
          'Coordinated 12 key-informant interviews and a 300-household survey across two districts.',
          'Presented findings to local government and civil society partners.'
        ]
      },
      {
        role: 'Programmes Intern',
        company: 'Nile Community Trust',
        location: 'Kampala',
        start: 'Jun 2020',
        end: 'Dec 2020',
        current: false,
        bullets: [
          'Supported community outreach and maintained attendance records for eight training sessions.',
          'Compiled weekly activity reports for the programme team.'
        ]
      }
    ],
    education: [
      { degree: 'BA Social Sciences', school: 'Makerere University', location: 'Kampala', start: '2016', end: '2020', detail: 'Upper second class honours.' }
    ],
    projects: [
      { name: 'Youth Employment Tracker', link: 'https://example.com/youth-tracker', detail: 'A district-level dashboard tracking youth employment programme outcomes.' }
    ],
    certifications: [
      { name: 'Certificate in Monitoring and Evaluation', issuer: 'Uganda Management Institute', year: '2022' },
      { name: 'Power BI for Data Analysts', issuer: 'Coursera', year: '2023' }
    ],
    languages: [
      { name: 'English', level: 'Fluent' },
      { name: 'Luganda', level: 'Native' }
    ]
  });
}

function isoAtDaysAgo(days, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function demoApplications(state) {
  const today = todayISO();
  const apps = [
    {
      role: 'Monitoring & Evaluation Officer',
      company: 'Savanna Health Initiative',
      location: 'Kampala, Uganda',
      workMode: 'Hybrid',
      salary: 'UGX 3.5M – 4.5M monthly',
      source: 'ReliefWeb',
      url: 'https://reliefweb.int/job/example-mne-officer',
      applicationEmail: 'jobs@savannahealth.example',
      status: 'applied',
      priority: 'high',
      deadline: addDaysISO(today, 2),
      appliedAt: addDaysISO(today, -4),
      capturedAt: isoAtDaysAgo(6),
      nextAction: 'Follow up with Grace about the interview timeline',
      nextActionDate: today,
      followUpDate: today,
      contact: { name: 'Grace Namusoke', role: 'HR Manager', email: 'grace@savannahealth.example', phone: '+256 700 000 111' },
      tags: ['Data & research', 'Hybrid'],
      jobDescription: MONITORING_JD,
      notes: 'The role reports to the Programme Director. Grace said they are shortlisting this week.',
      replies: [
        {
          at: isoAtDaysAgo(3, 11),
          from: 'Grace Namusoke',
          subject: 'Application received — M&E Officer',
          body: 'Dear Amina, thank you for applying. We have received your application and it is under review. We will contact shortlisted candidates by Friday.',
          intent: 'ack'
        }
      ]
    },
    {
      role: 'Programme Associate',
      company: 'Nile Fintech',
      location: 'Kampala, Uganda',
      workMode: 'On-site',
      salary: '',
      source: 'LinkedIn',
      url: 'https://www.linkedin.com/jobs/view/example-programme-associate',
      applicationEmail: 'careers@nilefintech.example',
      status: 'captured',
      priority: 'normal',
      deadline: addDaysISO(today, 5),
      capturedAt: isoAtDaysAgo(1),
      nextAction: 'Review the advert and tailor your CV',
      nextActionDate: addDaysISO(today, 1),
      contact: { name: '', role: '', email: '', phone: '' },
      tags: ['Programmes', 'On-site'],
      jobDescription: `Programme Associate — Nile Fintech

Nile Fintech is hiring a Programme Associate to support the design and delivery of financial inclusion programmes in Kampala.

What you will do
- Coordinate programme activities, partners and field visits
- Maintain work plans, budgets and activity reports
- Support monitoring, evaluation and learning
- Prepare partner updates and donor reports
- Engage community stakeholders and local partners

What we are looking for
- Degree in social sciences, business or a related field
- 2+ years of experience in programme coordination or project management
- Strong organisational and communication skills
- Experience with budgeting, reporting and stakeholder engagement
- Proficiency in Excel and Google Workspace

Deadline: applications close on the date shown in the original post.`,
      notes: '',
      replies: []
    },
    {
      role: 'Data Analyst',
      company: 'Kampala Coffee Co.',
      location: 'Kampala, Uganda',
      workMode: 'Hybrid',
      salary: 'Negotiable',
      source: 'WhatsApp',
      url: 'https://example.com/jobs/data-analyst',
      applicationEmail: 'people@kampalacoffee.example',
      status: 'interview',
      priority: 'high',
      deadline: addDaysISO(today, 9),
      appliedAt: addDaysISO(today, -8),
      capturedAt: isoAtDaysAgo(10),
      interviewDate: addDaysISO(today, 3),
      interviewTime: '10:30',
      nextAction: 'Prepare for the interview',
      nextActionDate: addDaysISO(today, 2),
      contact: { name: 'Daniel Okello', role: 'People Lead', email: 'daniel@kampalacoffee.example', phone: '+256 700 000 222' },
      tags: ['Data & research', 'Hybrid'],
      jobDescription: `Data Analyst — Kampala Coffee Co.

We are looking for a Data Analyst to turn sales, operations and farmer data into clear decisions.

Responsibilities
- Build dashboards in Power BI and maintain Excel reports
- Analyse sales, supply chain and farmer records
- Clean and validate data from multiple sources
- Present insights to commercial and operations teams
- Support field data collection with KoboToolbox

Requirements
- 2+ years of experience in data analysis
- Advanced Excel and Power BI skills
- Experience with SQL and Stata is an advantage
- Strong attention to detail and communication skills
- Interest in agriculture and rural livelihoods`,
      notes: 'Interview with Daniel and the operations lead. Prepare two examples of dashboards and one data cleaning story.',
      replies: [
        {
          at: isoAtDaysAgo(1, 15),
          from: 'Daniel Okello',
          subject: 'Interview — Data Analyst',
          body: 'Hi Amina, thank you for your application. We would like to invite you for an interview on the date below at 10:30am. Please confirm your availability and bring two examples of dashboards you have built.',
          intent: 'interview',
          dates: [{ iso: addDaysISO(today, 3), time: '10:30', label: 'Interview' }]
        }
      ]
    },
    {
      role: 'Research Assistant',
      company: 'East Africa Policy Institute',
      location: 'Kampala, Uganda',
      workMode: 'On-site',
      salary: '',
      source: 'Email',
      url: '',
      applicationEmail: 'research@eapi.example',
      status: 'captured',
      priority: 'high',
      deadline: addDaysISO(today, -1),
      capturedAt: isoAtDaysAgo(3),
      nextAction: 'Check whether late applications are accepted',
      nextActionDate: today,
      contact: { name: '', role: '', email: '', phone: '' },
      tags: ['Data & research', 'Urgent'],
      jobDescription: `Research Assistant — East Africa Policy Institute

The Institute is looking for a Research Assistant to support a study on urban labour markets.

- Conduct literature reviews and key-informant interviews
- Support survey design and data cleaning
- Analyse data in Stata or R
- Draft research summaries and presentations

Requirements: degree in economics, social sciences or related field; strong writing; experience with Stata or R.

Deadline: 7 November 2026.`,
      notes: 'The deadline has passed. Worth a short email to ask if they are still accepting applications.',
      replies: []
    },
    {
      role: 'Communications Officer',
      company: 'Mango Tree Foundation',
      location: 'Kampala, Uganda',
      workMode: 'Hybrid',
      salary: '',
      source: 'BrighterMonday',
      url: 'https://www.brightermonday.co.ug/jobs/example-communications',
      applicationEmail: 'hr@mangotree.example',
      status: 'applied',
      priority: 'normal',
      deadline: addDaysISO(today, 6),
      appliedAt: addDaysISO(today, -12),
      capturedAt: isoAtDaysAgo(14),
      nextAction: 'Send a short follow-up note',
      nextActionDate: addDaysISO(today, 5),
      followUpDate: addDaysISO(today, 5),
      contact: { name: 'Sarah Kintu', role: 'Communications Manager', email: 'sarah@mangotree.example', phone: '' },
      tags: ['Communications', 'Hybrid'],
      jobDescription: `Communications Officer — Mango Tree Foundation

We are looking for a Communications Officer to tell the stories of our community programmes.

- Write stories, press releases and social media content
- Manage the organisation's website and social channels
- Work with programme teams to collect photos and case studies
- Support donor reporting and campaign launches

Requirements: 3 years of communications experience, excellent writing, experience with social media and content management systems.`,
      notes: 'No reply yet. Follow up with Sarah and attach the communications portfolio.',
      replies: []
    },
    {
      role: 'Operations Coordinator',
      company: 'Lakeview Logistics',
      location: 'Kampala, Uganda',
      workMode: 'On-site',
      salary: 'UGX 2.8M monthly',
      source: 'Referral',
      url: '',
      applicationEmail: 'jobs@lakeviewlogistics.example',
      status: 'interview',
      priority: 'high',
      deadline: addDaysISO(today, 12),
      appliedAt: addDaysISO(today, -15),
      capturedAt: isoAtDaysAgo(17),
      interviewDate: addDaysISO(today, 8),
      interviewTime: '14:00',
      nextAction: 'Confirm the interview and prepare examples',
      nextActionDate: addDaysISO(today, 7),
      contact: { name: 'Peter Mwesigwa', role: 'Operations Director', email: 'peter@lakeviewlogistics.example', phone: '+256 700 000 333' },
      tags: ['Operations', 'On-site'],
      jobDescription: `Operations Coordinator — Lakeview Logistics

Coordinate fleet scheduling, warehouse operations and customer deliveries.

- Plan daily routes and monitor delivery performance
- Manage supplier and customer relationships
- Track inventory and prepare operations reports
- Support procurement and cost control

Requirements: 3 years of operations or logistics experience, advanced Excel, strong organisational skills.`,
      notes: 'Referral from Peter. Interview is a panel with operations and finance.',
      replies: [
        {
          at: isoAtDaysAgo(2, 10),
          from: 'Peter Mwesigwa',
          subject: 'Interview invitation',
          body: 'Dear Amina, thank you for your interest. We would like to meet you on the date below at 2:00pm at our office. Please confirm.',
          intent: 'interview',
          dates: [{ iso: addDaysISO(today, 8), time: '14:00', label: 'Interview' }]
        }
      ]
    },
    {
      role: 'Graduate Trainee',
      company: 'Lakeview Bank',
      location: 'Kampala, Uganda',
      workMode: 'On-site',
      salary: '',
      source: 'LinkedIn',
      url: 'https://www.linkedin.com/jobs/view/example-graduate-trainee',
      applicationEmail: 'graduate@lakeviewbank.example',
      status: 'rejected',
      priority: 'low',
      deadline: addDaysISO(today, -5),
      appliedAt: addDaysISO(today, -20),
      capturedAt: isoAtDaysAgo(22),
      contact: { name: 'Recruitment Team', role: '', email: 'graduate@lakeviewbank.example', phone: '' },
      tags: ['Early career', 'On-site'],
      jobDescription: 'Graduate trainee programme for recent graduates in finance, operations and customer service.',
      notes: 'Rejected after the online assessment. Keep the feedback for next time.',
      replies: [
        {
          at: isoAtDaysAgo(4, 12),
          from: 'Lakeview Bank Recruitment',
          subject: 'Your application',
          body: 'Thank you for your interest. Unfortunately, we will not be moving forward with your application at this time. We received many strong applications and have decided to proceed with other candidates.',
          intent: 'rejection'
        }
      ]
    },
    {
      role: 'Product Designer',
      company: 'Savanna Labs',
      location: 'Remote',
      workMode: 'Remote',
      salary: 'USD 1,500 – 2,000 monthly',
      source: 'WhatsApp',
      url: 'https://example.com/jobs/product-designer',
      applicationEmail: 'talent@savannalabs.example',
      status: 'offer',
      priority: 'high',
      deadline: addDaysISO(today, 4),
      appliedAt: addDaysISO(today, -25),
      capturedAt: isoAtDaysAgo(27),
      nextAction: 'Review the offer and respond',
      nextActionDate: addDaysISO(today, 4),
      contact: { name: 'Lena Achieng', role: 'Founder', email: 'lena@savannalabs.example', phone: '' },
      tags: ['Tech & product', 'Remote'],
      jobDescription: `Product Designer — Savanna Labs

Design simple, useful tools for small businesses.

- Lead user research and turn findings into product decisions
- Design flows, wireframes and high-fidelity prototypes in Figma
- Maintain the design system and work closely with engineers
- Test designs with users and iterate

Requirements: 3 years of product design experience, strong Figma skills, a portfolio of shipped work.`,
      notes: 'Offer received. Review the salary, start date and equity terms before responding.',
      replies: [
        {
          at: isoAtDaysAgo(1, 17),
          from: 'Lena Achieng',
          subject: 'Offer — Product Designer',
          body: 'Hi Amina, we are pleased to offer you the Product Designer position. Your offer letter is attached. Please respond by Friday.',
          intent: 'offer'
        }
      ]
    }
  ];

  return apps.map(app => makeApplication({ ...app, isDemo: true }));
}

export function seedDemo(state) {
  // Remove any previous demo records first, keeping the user's own work.
  state.applications = state.applications.filter(app => !app.isDemo);
  state.cvs = state.cvs.filter(cv => !cv.isDemo);
  state.covers = state.covers.filter(cover => !cover.isDemo);
  if (state.meta.profileIsDemo || !state.profile.name) {
    state.profile = demoProfile();
    state.meta.profileIsDemo = true;
  }
  const profile = state.profile;
  const master = createCVFromProfile(profile, { name: 'Amina Nakato — Master CV', kind: 'master', isDemo: true });
  master.isDemo = true;
  state.cvs.push(master);

  const apps = demoApplications(state);
  state.applications.push(...apps);

  const app1 = apps[0];
  const tailored = cloneCV(master);
  tailored.isDemo = true;
  tailored.name = 'M&E Officer — Savanna Health';
  tailored.kind = 'tailored';
  tailored.applicationId = app1.id;
  tailored.targetRole = app1.role;
  tailored.targetCompany = app1.company;
  tailored.jobDescription = app1.jobDescription;
  const result = tailorCV(tailored, app1.jobDescription);
  const demoCV = normaliseCV({
    ...result.cv,
    summary: 'Monitoring and evaluation professional with four years of experience in survey design, data analysis, report writing and donor reporting. I build practical dashboards and turn field evidence into decisions programme teams can use.'
  });
  state.cvs.push(demoCV);
  app1.cvId = demoCV.id;

  const coverDraft = generateCoverDraft(demoCV, app1);
  const cover = ensureCover({
    name: 'Cover letter — Savanna Health Initiative',
    isDemo: true,
    applicationId: app1.id,
    cvId: demoCV.id,
    targetRole: app1.role,
    targetCompany: app1.company,
    recipient: coverDraft.recipient,
    contact: coverDraft.contact,
    body: coverDraft.body
  });
  state.covers.push(cover);
  app1.coverId = cover.id;

  // Attach the versions that were "sent" so the demo shows document history.
  addDocument(app1, {
    kind: 'cv',
    name: 'CV — Savanna Health Initiative',
    cv: JSON.parse(JSON.stringify(demoCV))
  });
  addDocument(app1, {
    kind: 'cover',
    name: 'Cover letter — Savanna Health Initiative',
    cover: JSON.parse(JSON.stringify(cover))
  });

  state.meta.demo = true;
  state.meta.onboarded = true;
  state.meta.demoSeededAt = nowISO();
  return state;
}

export function clearDemo(state) {
  state.applications = state.applications.filter(app => !app.isDemo);
  state.cvs = state.cvs.filter(cv => !cv.isDemo);
  state.covers = state.covers.filter(cover => !cover.isDemo);
  if (state.meta.profileIsDemo) {
    state.profile = defaultProfile();
    state.meta.profileIsDemo = false;
  }
  state.meta.demo = false;
  state.meta.demoSeededAt = null;
  return state;
}

/* ------------------------------------------------------------------ */
/* File storage (IndexedDB)                                            */
/* ------------------------------------------------------------------ */

const FILE_DB = 'kazi-files';
const FILE_STORE = 'files';
const SHARED_DB = 'kazi-shared';
const SHARED_STORE = 'payload';

function openDatabase(name, store, keyPath = 'id') {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local storage.'));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Local storage request failed.'));
  });
}

export async function putFileRecord(record) {
  const db = await openDatabase(FILE_DB, FILE_STORE);
  const value = {
    id: record.id || uid('file'),
    name: record.name || 'Attachment',
    type: record.type || 'application/octet-stream',
    size: record.size || record.blob?.size || 0,
    blob: record.blob,
    createdAt: record.createdAt || nowISO()
  };
  const tx = db.transaction(FILE_STORE, 'readwrite');
  await requestToPromise(tx.objectStore(FILE_STORE).put(value));
  db.close();
  return value;
}

export async function addFile(blob, name, type = '') {
  return putFileRecord({ blob, name, type: type || blob.type, size: blob.size });
}

export async function getFile(id) {
  if (!id) return null;
  const db = await openDatabase(FILE_DB, FILE_STORE);
  const value = await requestToPromise(db.transaction(FILE_STORE, 'readonly').objectStore(FILE_STORE).get(id));
  db.close();
  return value || null;
}

export async function deleteFile(id) {
  if (!id) return;
  const db = await openDatabase(FILE_DB, FILE_STORE);
  const tx = db.transaction(FILE_STORE, 'readwrite');
  await requestToPromise(tx.objectStore(FILE_STORE).delete(id));
  db.close();
}

export async function listFiles() {
  const db = await openDatabase(FILE_DB, FILE_STORE);
  const values = await requestToPromise(db.transaction(FILE_STORE, 'readonly').objectStore(FILE_STORE).getAll());
  db.close();
  return values || [];
}

export async function clearFiles() {
  const db = await openDatabase(FILE_DB, FILE_STORE);
  const tx = db.transaction(FILE_STORE, 'readwrite');
  await requestToPromise(tx.objectStore(FILE_STORE).clear());
  db.close();
}

export async function readSharedPayload() {
  try {
    const db = await openDatabase(SHARED_DB, SHARED_STORE);
    const store = db.transaction(SHARED_STORE, 'readwrite').objectStore(SHARED_STORE);
    const value = await requestToPromise(store.get('latest'));
    if (value) await requestToPromise(store.delete('latest'));
    db.close();
    return value || null;
  } catch (error) {
    console.warn('No shared payload available.', error);
    return null;
  }
}

export async function writeSharedPayload(payload) {
  const db = await openDatabase(SHARED_DB, SHARED_STORE);
  const tx = db.transaction(SHARED_STORE, 'readwrite');
  await requestToPromise(tx.objectStore(SHARED_STORE).put({ id: 'latest', ...payload, at: nowISO() }));
  db.close();
}

/* ------------------------------------------------------------------ */
/* Backup and export                                                   */
/* ------------------------------------------------------------------ */

export async function buildBackup(state) {
  const files = await listFiles();
  return {
    app: 'kazi',
    version: 1,
    exportedAt: nowISO(),
    state,
    files: await Promise.all(files.map(async file => ({
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size,
      createdAt: file.createdAt,
      data: await blobToDataURL(file.blob)
    })))
  };
}

export async function restoreBackup(payload) {
  if (!payload || payload.app !== 'kazi' || !payload.state) {
    throw new Error('This does not look like a Kazi backup file.');
  }
  const state = loadStateFromObject(payload.state);
  const records = [];
  for (const file of payload.files || []) {
    if (!file.data) continue;
    const blob = await dataURLToBlob(file.data);
    records.push({ ...file, blob });
  }
  await clearFiles();
  for (const record of records) {
    await putFileRecord(record);
  }
  return state;
}

function loadStateFromObject(parsed) {
  const base = defaultState();
  const merged = deepMerge(base, parsed);
  merged.version = 1;
  merged.profile = normaliseProfile({ ...defaultProfile(), ...(parsed.profile || {}) });
  merged.applications = Array.isArray(parsed.applications) ? parsed.applications.map(normaliseApplication) : [];
  merged.cvs = Array.isArray(parsed.cvs) ? parsed.cvs.map(normaliseCV) : [];
  merged.covers = Array.isArray(parsed.covers) ? parsed.covers.map(ensureCover) : [];
  merged.settings = { ...base.settings, ...(parsed.settings || {}) };
  merged.meta = { ...base.meta, ...(parsed.meta || {}) };
  return merged;
}

export function applicationsCSV(state) {
  const header = [
    'company', 'role', 'status', 'source', 'deadline', 'applied_at', 'next_action',
    'next_action_date', 'follow_up_date', 'location', 'work_mode', 'salary', 'url',
    'application_email', 'contact_name', 'contact_email', 'contact_phone', 'tags', 'notes'
  ];
  const rows = state.applications.map(app => [
    app.company, app.role, statusMeta(app.status).label, app.source, app.deadline,
    app.appliedAt, app.nextAction, app.nextActionDate, app.followUpDate, app.location,
    app.workMode, app.salary, app.url, app.applicationEmail, app.contact.name,
    app.contact.email, app.contact.phone, app.tags.join('; '), app.notes
  ]);
  return toCSV([header, ...rows]);
}

function normaliseDateValue(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const dmy = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    return `${year}-${String(Number(dmy[2])).padStart(2, '0')}-${String(Number(dmy[1])).padStart(2, '0')}`;
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

function statusFromText(value) {
  const text = String(value || '').toLowerCase().replace(/[_-]+/g, ' ');
  if (!text) return 'captured';
  if (/offer/.test(text)) return 'offer';
  if (/interview/.test(text)) return 'interview';
  if (/assessment|test/.test(text)) return 'assessment';
  if (/reject|unsuccess/.test(text)) return 'rejected';
  if (/withdraw/.test(text)) return 'withdrawn';
  if (/ghost|no response/.test(text)) return 'ghosted';
  if (/reply|response/.test(text)) return 'reply';
  if (/applied|sent|submitted/.test(text)) return 'applied';
  if (/to apply|saved|wishlist|shortlist/.test(text)) return 'to_apply';
  return 'captured';
}

export function importApplicationsCSV(state, csvText) {
  const rows = rowsToObjects(parseCSVCompat(csvText));
  let added = 0;
  for (const row of rows) {
    const lower = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), value]));
    const pick = (...keys) => {
      for (const key of keys) {
        if (lower[key] != null && String(lower[key]).trim()) return String(lower[key]).trim();
      }
      return '';
    };
    const role = pick('role', 'job title', 'title', 'position');
    const company = pick('company', 'employer', 'organisation', 'organization');
    if (!role && !company) continue;
    const status = statusFromText(pick('status', 'stage'));
    const app = makeApplication({
      role,
      company,
      status,
      source: pick('source', 'where'),
      deadline: normaliseDateValue(pick('deadline', 'closing date', 'close date')),
      appliedAt: normaliseDateValue(pick('applied_at', 'applied', 'date applied', 'application date')),
      nextAction: pick('next_action', 'next action', 'next step'),
      nextActionDate: normaliseDateValue(pick('next_action_date', 'next action date')),
      followUpDate: normaliseDateValue(pick('follow_up_date', 'follow up date', 'follow-up date')),
      location: pick('location'),
      workMode: pick('work_mode', 'work mode'),
      salary: pick('salary', 'pay'),
      url: pick('url', 'link', 'job link'),
      applicationEmail: pick('application_email', 'application email', 'email'),
      contact: {
        name: pick('contact_name', 'contact', 'contact person'),
        email: pick('contact_email', 'contact email'),
        phone: pick('contact_phone', 'contact phone', 'phone')
      },
      tags: pick('tags').split(/[;,]/).map(tag => tag.trim()).filter(Boolean),
      notes: pick('notes', 'note'),
      jobDescription: pick('job_description', 'job description', 'description')
    });
    if (status === 'applied' && !app.appliedAt) app.appliedAt = todayISO();
    state.applications.push(app);
    added += 1;
  }
  return added;
}

function parseCSVCompat(text) {
  // Kept local so the store has one less dependency cycle.
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') field += char;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(item => item.some(cell => String(cell).trim() !== ''));
}

export function calendarEventsForICS(state) {
  return applicationEvents(state).map(event => ({
    uid: `${event.appId}-${event.type}-${event.date}`,
    title: event.title,
    description: event.description,
    date: event.date,
    time: event.time,
    durationMinutes: event.type === 'interview' ? 60 : 0,
    alarmMinutes: event.type === 'interview' ? 60 : 1440
  }));
}

export function exportFileName(prefix = 'kazi-backup') {
  return `${prefix}-${todayISO()}.json`;
}

export function storageSize() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || '';
    return new Blob([raw]).size;
  } catch {
    return 0;
  }
}


