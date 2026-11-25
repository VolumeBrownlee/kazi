/* Kazi — application shell, views and interactions.
   Static, local-first, no dependencies. */

import {
  STATUSES, STATUS_KEYS,
  loadState, saveState, defaultState, seedDemo, clearDemo, resetState,
  statusMeta, isClosed, getApplication, getCV, getCover,
  makeApplication, normaliseApplication, setApplicationStatus, logReply, addDocument, addEvent,
  deadlineInfo, applicationEvents, upcomingAgenda, needsAttention, computeStats,
  sourceStats, weeklyActivity, funnelStats, deadlinePerformance, profileCompleteness,
  tagCounts, storageSize, addFile, getFile, clearFiles, buildBackup, restoreBackup,
  applicationsCSV, importApplicationsCSV, calendarEventsForICS, exportFileName,
  readSharedPayload
} from './store.js';

import {
  normaliseProfile, normaliseCV, createCVFromProfile, cloneCV, renderCV, analyseCV,
  suggestSummary, tailorCV, ensureCover, generateCoverDraft, renderCover,
  cvPlainText, coverPlainText, cvFileName, coverFileName
} from './cv.js';

import { parseJobMessage, classifyReply } from './parse.js';
import { aiAvailable, aiParseJob, aiSummary, aiCover } from './ai.js';

import {
  esc, uid, todayISO, nowISO, formatDate, formatDateLong, formatDateTime, formatTime,
  relativeTime, addDaysISO, daysUntil, monthCells, monthLabel, initials, colorFor,
  truncate, titleCase, download, copyText, readFileAsText, formatBytes, buildICS
} from './utils.js';

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

const viewEl = document.getElementById('view');
const modalRoot = document.getElementById('modal-root');
const toastRoot = document.getElementById('toast-root');
const onboardingRoot = document.getElementById('onboarding-root');

let state = loadState();

const ui = {
  route: null,
  jobsStatus: 'all',
  jobsGroup: 'all',
  jobsSource: 'all',
  calendarAnchor: todayISO(),
  selectedDate: todayISO(),
  confirmResolve: null,
  lastFocused: null,
  summarySuggestion: null,
  sharedFiles: [],
  captureParse: null,
  replyAnalysis: null,
  pendingCapture: null,
  onboardStep: 1,
  onboardName: ''
};

const icon = (name, className = '') =>
  `<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

const escAttr = value => esc(value);

function pl(count, singular, plural) {
  return `${count} ${count === 1 ? singular : (plural || `${singular}s`)}`;
}

function splitList(value) {
  return String(value || '')
    .split(/[\n,;]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function splitLines(value) {
  return String(value || '')
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function setPath(object, path, value) {
  const keys = String(path || '').split('.').filter(Boolean);
  if (!keys.length) return;
  let target = object;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!target[key] || typeof target[key] !== 'object') target[key] = {};
    target = target[key];
  }
  target[keys[keys.length - 1]] = value;
}

function getPath(object, path) {
  return String(path || '').split('.').reduce((value, key) => (value == null ? value : value[key]), object);
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function avatar(name, className = '', color) {
  return `<span class="avatar ${className}" style="background:${color || colorFor(name)}" aria-hidden="true">${esc(initials(name))}</span>`;
}

function statusPill(status) {
  const meta = statusMeta(status);
  return `<span class="pill pill--${meta.tone}">${esc(meta.label)}</span>`;
}

function deadlineText(app) {
  const info = deadlineInfo(app);
  if (!info) return '<span class="job-cell-value is-muted">No deadline</span>';
  return `<span class="deadline-text tone-${info.tone}">${icon('clock')}${esc(info.label)}</span>`;
}

function demoBanner() {
  if (!state.meta.demo || state.settings.hideDemoBanner) return '';
  return `
    <div class="demo-banner">
      ${icon('folder')}
      <span><strong>Sample workspace.</strong> These eight applications are examples so you can try everything. Your own data stays separate.</span>
      <div class="demo-banner-actions">
        <a class="btn" href="#/settings">Manage</a>
        <button class="btn" type="button" data-action="dismiss-demo">Hide</button>
      </div>
    </div>`;
}

function pageHead({ eyebrow, title, lede, actions = '' }) {
  return `
    <header class="page-head">
      <div class="page-head-copy">
        <p class="eyebrow"><span class="dot"></span>${esc(eyebrow)}</p>
        <h1 class="page-title">${title}</h1>
        ${lede ? `<p class="page-lede">${lede}</p>` : ''}
      </div>
      ${actions ? `<div class="head-actions">${actions}</div>` : ''}
    </header>`;
}

function emptyState({ iconName = 'briefcase', title, text, action = '' }) {
  return `
    <div class="empty">
      <span class="empty-icon">${icon(iconName)}</span>
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      ${action}
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Toasts, modals and confirms                                        */
/* ------------------------------------------------------------------ */

function toast(message, tone = 'success') {
  const node = document.createElement('div');
  node.className = `toast${tone === 'error' ? ' toast--error' : ''}`;
  node.innerHTML = `${icon(tone === 'error' ? 'alert' : 'check')}<span>${esc(message)}</span>`;
  toastRoot.appendChild(node);
  window.setTimeout(() => {
    node.classList.add('is-leaving');
    window.setTimeout(() => node.remove(), 220);
  }, 3600);
}

function closeModal({ restoreFocus = true } = {}) {
  if (ui.confirmResolve) {
    const resolve = ui.confirmResolve;
    ui.confirmResolve = null;
    resolve(false);
  }
  modalRoot.innerHTML = '';
  document.body.classList.remove('modal-open');
  if (restoreFocus && ui.lastFocused && typeof ui.lastFocused.focus === 'function') {
    try { ui.lastFocused.focus({ preventScroll: true }); } catch { /* ignore */ }
  }
  ui.lastFocused = null;
}

function openModal({ eyebrow = '', title, sub = '', body = '', footer = '', wide = false, narrow = false, className = '' }) {
  closeModal({ restoreFocus: false });
  ui.lastFocused = document.activeElement;
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-modal-backdrop>
      <section class="modal${wide ? ' modal--wide' : ''}${narrow ? ' modal--narrow' : ''} ${className}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header class="modal-head">
          <div class="modal-head-copy">
            ${eyebrow ? `<p class="eyebrow"><span class="dot"></span>${esc(eyebrow)}</p>` : ''}
            <h2 class="modal-title" id="modal-title">${esc(title)}</h2>
            ${sub ? `<p class="modal-sub">${esc(sub)}</p>` : ''}
          </div>
          <button class="icon-btn modal-close" type="button" data-action="close-modal" aria-label="Close">${icon('x')}</button>
        </header>
        <div class="modal-body">${body}</div>
        ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
      </section>
    </div>`;
  document.body.classList.add('modal-open');
  window.requestAnimationFrame(() => {
    const target = modalRoot.querySelector('[autofocus], input:not([type="hidden"]), textarea, select, .modal-close');
    if (target) target.focus({ preventScroll: true });
  });
}

function askConfirm({ title, text, confirmLabel = 'Confirm', danger = false, eyebrow = 'Please confirm' }) {
  return new Promise(resolve => {
    openModal({
      eyebrow,
      title,
      sub: text,
      narrow: true,
      body: `<p class="small muted">${esc('This action is applied immediately. You can export a backup from Settings first if you want a safety copy.')}</p>`,
      footer: `
        <button class="btn btn-ghost" type="button" data-action="confirm-no">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-action="confirm-yes">${esc(confirmLabel)}</button>`
    });
    // openModal() closes any previous modal (resolving its confirm as false),
    // so register this resolver only after the modal is in place.
    ui.confirmResolve = resolve;
  });
}

/* ------------------------------------------------------------------ */
/* Chrome and routing                                                  */
/* ------------------------------------------------------------------ */

function activeSection(segments) {
  const root = segments[0] || 'today';
  if (root === 'jobs' || root === 'job') return 'jobs';
  if (root === 'studio') return 'studio';
  if (root === 'calendar') return 'calendar';
  if (root === 'people') return 'people';
  if (root === 'insights') return 'insights';
  if (root === 'settings') return 'settings';
  if (root === 'more') return 'more';
  return 'today';
}

function updateChrome(route) {
  const section = activeSection(route.segments);
  document.querySelectorAll('[data-nav]').forEach(link => {
    const active = link.dataset.nav === section;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const open = state.applications.filter(app => !app.archived && !isClosed(app.status)).length;
  for (const node of [document.getElementById('nav-pipeline-count'), document.getElementById('nav-pipeline-count-mobile')]) {
    if (!node) continue;
    node.hidden = open === 0;
    node.textContent = String(open);
  }
  const demoChip = document.getElementById('sidebar-demo');
  if (demoChip) demoChip.hidden = !state.meta.demo;
  const profileLink = document.getElementById('sidebar-profile');
  if (profileLink) {
    profileLink.innerHTML = `
      ${avatar(state.profile.name || '?', 'avatar--sm')}
      <span class="profile-mini-text">
        <strong>${esc(state.profile.name || 'Your profile')}</strong>
        <small>${esc(state.profile.headline || 'Set up your details')}</small>
      </span>`;
  }
}

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  return { segments, path: `/${segments.join('/')}`, query: new URLSearchParams(queryPart || '') };
}

function navigate(hash) {
  if (window.location.hash === hash) {
    renderRoute();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    window.location.hash = hash;
  }
}

function renderRoute({ scroll = true } = {}) {
  const route = parseHash();
  ui.route = route;
  const root = route.segments[0] || 'today';
  const id = route.segments[1];
  let markup = '';
  let title = 'Kazi';

  try {
    if (root === 'today') {
      markup = viewToday();
      title = 'Today';
    } else if (root === 'jobs' && id) {
      markup = viewJob(id);
      title = getApplication(state, id)?.role || 'Job';
    } else if (root === 'jobs') {
      markup = viewJobs();
      title = 'Pipeline';
    } else if (root === 'calendar') {
      markup = viewCalendar();
      title = 'Calendar';
    } else if (root === 'studio' && route.segments[1] === 'profile') {
      markup = viewProfile();
      title = 'Profile';
    } else if (root === 'studio' && route.segments[1] === 'cv' && route.segments[2]) {
      markup = viewCVEditor(route.segments[2]);
      title = getCV(state, route.segments[2])?.name || 'CV';
    } else if (root === 'studio' && route.segments[1] === 'cover' && route.segments[2]) {
      markup = viewCoverEditor(route.segments[2]);
      title = getCover(state, route.segments[2])?.name || 'Cover letter';
    } else if (root === 'studio') {
      markup = viewStudio();
      title = 'CV studio';
    } else if (root === 'insights') {
      markup = viewInsights();
      title = 'Insights';
    } else if (root === 'people') {
      markup = viewPeople();
      title = 'People';
    } else if (root === 'settings') {
      markup = viewSettings();
      title = 'Settings';
    } else if (root === 'more') {
      markup = viewMore();
      title = 'More';
    } else if (root === 'print' && route.segments[1] && route.segments[2]) {
      markup = viewPrint(route.segments[1], route.segments[2]);
      title = route.segments[1] === 'cv'
        ? getCV(state, route.segments[2])?.name || 'Print CV'
        : getCover(state, route.segments[2])?.name || 'Print cover letter';
    } else {
      markup = notFound();
      title = 'Not found';
    }
  } catch (error) {
    console.error('Kazi view error', error);
    markup = `<div class="page">${emptyState({
      iconName: 'alert',
      title: 'Something went wrong',
      text: 'This view could not be opened. Your saved data is still safe in this browser.',
      action: '<a class="btn btn-primary" href="#/today">Back to Today</a>'
    })}</div>`;
  }

  document.body.classList.toggle('print-mode', root === 'print');
  viewEl.innerHTML = markup;
  document.title = `${title} · Kazi`;
  updateChrome(route);
  if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
  const main = document.getElementById('view');
  main.setAttribute('aria-label', title);
  if (root === 'jobs' && !id) requestAnimationFrame(applyJobFilters);
}

function notFound() {
  return `<div class="page">${emptyState({
    iconName: 'search',
    title: 'Page not found',
    text: 'That link does not match a Kazi screen. Head back to Today to find your workspace.',
    action: '<a class="btn btn-primary" href="#/today">Back to Today</a>'
  })}</div>`;
}

/* ------------------------------------------------------------------ */
/* Today                                                               */
/* ------------------------------------------------------------------ */

function applicationCode(app) {
  const source = String(app.id || app.role || 'kazi');
  let hash = 7;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) % 9973;
  }
  return `KZ-${String((hash % 900) + 100)}`;
}

function weekdayShort(iso) {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date);
}

function weekdayLong(iso) {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(date);
}

function dayStamp(iso) {
  if (!iso) return '';
  const weekday = weekdayShort(iso);
  const date = formatDate(iso, { year: false });
  return weekday ? `${weekday} ${date}` : date;
}

function moveTimeLabel(iso) {
  if (!iso) return '';
  const days = daysUntil(iso);
  if (days == null) return '';
  if (days < 0) return `${Math.abs(days)}d over`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 6) return weekdayShort(iso);
  return `${days} days`;
}

function moveWhenLabel(item) {
  if (item.kind === 'offer') return 'offer';
  const days = item.sortDate ? daysUntil(item.sortDate) : null;
  if (days == null) return 'today';
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 6) return weekdayLong(item.sortDate).toLowerCase();
  return `in ${days} days`;
}

function noteContext(app) {
  const notes = String(app.notes || '').trim();
  if (!notes) return '';
  const sentences = (notes.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map(sentence => sentence.trim())
    .filter(Boolean);
  if (!sentences.length) return '';
  const name = firstName(app.contact?.name);
  const preferred = (name && sentences.find(sentence => sentence.includes(name)))
    || sentences.find(sentence => /interview|shortlist|reply|follow up|portfolio|accept|email|ask|call/i.test(sentence))
    || sentences[0];
  return truncate(preferred, 132);
}

function attentionMove(item) {
  const app = item.app;
  const company = app.company || 'the employer';
  const role = app.role || 'this role';
  const contact = app.contact?.name || '';
  const move = {
    title: item.label,
    detail: item.detail,
    meta: [company, role].filter(Boolean).join(' · '),
    estimate: 2,
    action: 'Open the job'
  };

  if (item.kind === 'deadline') {
    const days = item.sortDate ? daysUntil(item.sortDate) : null;
    const overdue = days != null && days < 0;
    move.title = overdue ? `Ask whether ${role} is still open` : `Apply for ${role}`;
    move.detail = overdue
      ? `The deadline was ${formatDate(item.sortDate)}. A short note can still keep the door open.`
      : `Applications close ${formatDate(app.deadline)}${app.deadlineTime ? ` at ${formatTime(app.deadlineTime)}` : ''}.`;
    move.estimate = 3;
  } else if (item.kind === 'interview') {
    const days = app.interviewDate ? daysUntil(app.interviewDate) : null;
    const weekday = weekdayLong(app.interviewDate);
    move.title = days != null && days <= 2
      ? `Confirm ${weekday ? `${weekday}'s` : 'the'} interview`
      : `Prepare for ${weekday ? `${weekday}'s` : 'the'} interview`;
    const when = `${dayStamp(app.interviewDate)}${app.interviewTime ? ` at ${formatTime(app.interviewTime)}` : ''}`;
    const context = noteContext(app);
    const contextIsContact = contact && context.includes(firstName(contact));
    move.detail = `${when}${contact ? ` with ${contact}` : ''}.${context && !contextIsContact ? ` ${context}` : ''}`;
    move.estimate = 5;
  } else if (item.kind === 'next') {
    move.title = app.nextAction || item.label;
    move.detail = [item.detail ? `${item.detail}.` : '', noteContext(app)].filter(Boolean).join(' ');
    move.action = 'Mark it done';
  } else if (item.kind === 'followup') {
    move.title = app.nextAction || `Follow up with ${contact || company}`;
    move.detail = `No reply yet from ${company}.${noteContext(app) ? ` ${noteContext(app)}` : ''}`;
    move.action = 'Mark it done';
  } else if (item.kind === 'review') {
    move.title = role === 'this role' ? 'Review this capture' : `Review the ${role} capture`;
    move.detail = `Captured ${relativeTime(app.capturedAt)} from ${app.source || 'a message'}. Check the role, company and deadline.`;
    move.action = 'Review the capture';
  } else if (item.kind === 'offer') {
    move.title = app.nextAction || `Answer the ${company} offer`;
    move.detail = `Offer received${app.offerAt ? ` ${elapsedLabel(app.offerAt)}` : ''}.${app.nextActionDate ? ` Reply by ${dayStamp(app.nextActionDate)}.` : ''}`;
    move.estimate = 10;
    move.action = 'Review the offer';
  }

  return move;
}

function moveActionMarkup(item) {
  const app = item.app;
  if (['next', 'followup'].includes(item.kind)) {
    return `<button class="action" type="button" data-action="complete-next" data-id="${app.id}">${icon('check')} Mark it done</button>`;
  }
  const label = item.kind === 'offer' ? 'Review the offer' : item.kind === 'review' ? 'Review the capture' : 'Open the job';
  return `<a class="action" href="#/jobs/${app.id}">${esc(label)} ${icon('arrow-right')}</a>`;
}

function quietMoveMarkup(item) {
  const move = attentionMove(item);
  const app = item.app;
  const context = item.kind === 'offer'
    ? (app.nextActionDate ? `reply by ${dayStamp(app.nextActionDate)}` : 'offer received')
    : item.kind === 'interview'
      ? `interview ${dayStamp(app.interviewDate)}`
      : item.kind === 'review'
        ? `captured ${relativeTime(app.capturedAt)}`
        : item.kind === 'deadline'
          ? (daysUntil(app.deadline) < 0 ? `closed ${elapsedLabel(app.deadline)}` : `closes ${dayStamp(app.deadline)}`)
          : item.kind === 'next'
            ? (daysUntil(item.sortDate) < 0 ? 'overdue' : 'due today')
            : 'no reply yet';
  const meta = [app.company || 'Company not set', context].filter(Boolean).join(' · ');
  return `
    <a class="move move--quiet" href="#/jobs/${app.id}">
      <span class="move-dot" aria-hidden="true"></span>
      <div class="move-content">
        <div class="move-line">
          <h3>${esc(move.title)}</h3>
          ${icon('chevron-right', 'move-go')}
        </div>
        <p class="move-meta">${esc(meta)} · ${move.estimate} min</p>
      </div>
    </a>`;
}

function watchingSummary(attentionIds) {
  const waiting = state.applications.filter(app => !app.archived && !isClosed(app.status) && !attentionIds.has(app.id));
  const noReply = waiting.filter(app => ['applied', 'reply'].includes(app.status) && !(app.replies || []).length);
  const nextInterview = waiting
    .filter(app => app.interviewDate && daysUntil(app.interviewDate) >= 0)
    .sort((a, b) => a.interviewDate.localeCompare(b.interviewDate))[0];
  const sentences = [];
  if (noReply.length) sentences.push(`${noReply[0].company || 'One employer'} has not replied.`);
  if (nextInterview) sentences.push(`${nextInterview.company || 'An employer'} interviews on ${dayStamp(nextInterview.interviewDate)}.`);
  if (!sentences.length && waiting.length) {
    sentences.push(`${pl(waiting.length, 'application')} ${waiting.length === 1 ? 'is' : 'are'} with an employer.`);
  }
  if (!sentences.length) sentences.push('Everything has an answer or a close.');
  return {
    count: noReply.length || waiting.length,
    label: noReply.length ? 'No reply yet' : 'Waiting',
    text: `${sentences.slice(0, 2).join(' ')} Nothing is needed from you yet.`
  };
}

function viewToday() {
  const attention = needsAttention(state);
  const attentionIds = new Set(attention.map(item => item.app.id));
  const offers = state.applications
    .filter(app => !app.archived && app.status === 'offer' && !attentionIds.has(app.id))
    .map(app => ({
      app,
      kind: 'offer',
      priority: 5,
      label: 'Offer received',
      detail: '',
      sortDate: app.nextActionDate || app.deadline || '',
      tone: 'green'
    }));
  const moves = [...attention, ...offers].slice(0, 5);
  const focus = moves[0] || null;
  const quiet = moves.slice(1, 5);
  const today = todayISO();
  const overdue = attention.filter(item => item.kind === 'deadline' && item.sortDate && daysUntil(item.sortDate) < 0).length;
  const dueToday = attention.filter(item => item.sortDate === today).length;
  const date = new Date();
  const dateLine = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  const watching = watchingSummary(attentionIds);
  const tallyNote = overdue
    ? `${overdue} overdue`
    : dueToday
      ? `${dueToday} due today`
      : moves.length
        ? `${moves.length} open`
        : 'Clear';

  let primary = '';
  if (focus) {
    const move = attentionMove(focus);
    primary = `
      <article class="move move--focus">
        <span class="move-dot move-dot--active" aria-hidden="true"></span>
        <div class="move-content">
          <div class="move-eyebrow mono">
            <span>Needs you · ${esc(moveWhenLabel(focus))}</span>
            <span>${move.estimate} min</span>
          </div>
          <h2>${esc(move.title)}</h2>
          <p class="move-detail">${esc(move.detail)}</p>
          <p class="move-source mono">${esc(move.meta)}</p>
          ${moveActionMarkup(focus)}
        </div>
      </article>`;
  }

  return `
    <div class="page page--today">
      ${demoBanner()}
      <header class="today-head">
        <div class="today-date mono">
          <span>${esc(dateLine)}</span>
          <span>${date.getFullYear()}</span>
        </div>
        <div class="today-tally">
          <span class="tally-number">${moves.length}</span>
          <span class="tally-word">${moves.length === 1 ? 'move' : 'moves'}</span>
          <span class="tally-note${overdue ? ' tally-note--alert' : ''}">${esc(tallyNote)}</span>
        </div>
      </header>

      ${focus ? `
        <section class="moves" aria-label="Today's moves">
          ${primary}
          ${quiet.map(quietMoveMarkup).join('')}
        </section>` : `
        <section class="today-empty" aria-labelledby="today-empty-title">
          <p class="mono">Nothing needs you</p>
          <h2 id="today-empty-title">No move is open today.</h2>
          <p>Deadlines, interviews and follow-ups will appear here when they need a decision. The rest can wait.</p>
          <button class="action" type="button" data-action="capture">${icon('plus')} Capture a job</button>
        </section>`}

      <section class="watching">
        <div class="watching-head mono">
          <span>${esc(watching.label)} · ${watching.count}</span>
          <span class="watching-line" aria-hidden="true"></span>
        </div>
        <p>${esc(watching.text)}</p>
        <a class="text-link" href="#/jobs">Open pipeline ${icon('arrow-right')}</a>
      </section>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

function pipelineApps() {
  return state.applications.filter(app => !app.archived);
}

function statusMatch(filter, status) {
  if (!filter || filter === 'all') return true;
  if (filter === 'active') return !isClosed(status);
  if (filter === 'applied') return ['applied', 'reply'].includes(status);
  if (filter === 'interview') return ['assessment', 'interview'].includes(status);
  if (filter === 'closed') return isClosed(status);
  return status === filter;
}

function jobSearchBlob(app) {
  return [
    app.role, app.company, app.location, app.workMode, app.source, app.tags.join(' '),
    app.notes, app.contact.name, app.contact.email, app.applicationEmail, app.nextAction
  ].join(' ').toLowerCase();
}

const PIPE_GROUPS = [
  { key: 'needs', label: 'Needs you', signal: 'cobalt' },
  { key: 'waiting', label: 'Waiting', signal: 'hollow' },
  { key: 'parked', label: 'Parked', signal: 'parked' }
];

const REPLY_FRAGMENTS = {
  offer: 'offer received',
  rejection: 'rejection received',
  interview: 'interview confirmed',
  assessment: 'assessment received',
  info_request: 'details requested'
};

function lowerFirst(value) {
  const text = String(value || '');
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : '';
}

function elapsedDays(iso) {
  const days = iso ? daysUntil(iso) : null;
  return days == null ? null : Math.max(0, -days);
}

function elapsedLabel(iso) {
  const days = elapsedDays(iso);
  if (days == null) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(iso, { year: false });
}

function lastReplyFor(app) {
  return [...(app.replies || [])]
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0] || null;
}

function pipelineReason(app, group, item) {
  if (group === 'needs' && item) {
    if (item.kind === 'deadline') {
      const days = app.deadline ? daysUntil(app.deadline) : null;
      return days != null && days < 0
        ? `closed ${elapsedLabel(app.deadline)}`
        : `closes ${dayStamp(app.deadline)}`;
    }
    if (item.kind === 'interview') {
      return `interview ${dayStamp(app.interviewDate)}${app.interviewTime ? ` · ${formatTime(app.interviewTime)}` : ''}`;
    }
    if (item.kind === 'next') {
      const action = lowerFirst(app.nextAction || item.label);
      if (action.length <= 42) return action;
      const contact = firstName(app.contact?.name);
      return contact ? `follow up with ${contact}` : truncate(action, 42);
    }
    if (item.kind === 'followup') return 'no reply yet';
    if (item.kind === 'review') return 'new · review the advert';
    if (item.kind === 'offer') return 'offer received';
  }

  if (group === 'parked') {
    return {
      rejected: 'rejection received',
      withdrawn: 'withdrawn by you',
      ghosted: 'no reply · closed'
    }[app.status] || statusMeta(app.status).label.toLowerCase();
  }

  if (group === 'waiting') {
    if (app.status === 'assessment') return 'assessment in progress';
    if (app.status === 'to_apply' || app.status === 'captured') return 'not submitted yet';
    if (app.interviewDate && daysUntil(app.interviewDate) >= 0) {
      return `interview ${dayStamp(app.interviewDate)}`;
    }
    const reply = lastReplyFor(app);
    if (reply) return REPLY_FRAGMENTS[reply.intent] || 'reply received';
    if (['applied', 'reply'].includes(app.status)) return 'no reply yet';
    return statusMeta(app.status).label.toLowerCase();
  }

  return '';
}

function pipelineTimeLabel(app, group, item) {
  if (group === 'parked') return 'Closed';

  if (group === 'needs') {
    if (item?.kind === 'offer') {
      return app.nextActionDate ? moveTimeLabel(app.nextActionDate) : 'Offer';
    }
    if (item?.kind === 'review') {
      const days = elapsedDays((app.capturedAt || '').slice(0, 10));
      return days == null ? 'New' : days === 0 ? 'Today' : `${days}d ago`;
    }
    return item?.sortDate ? moveTimeLabel(item.sortDate) : 'Today';
  }

  if (app.interviewDate && daysUntil(app.interviewDate) >= 0) return moveTimeLabel(app.interviewDate);
  if (['captured', 'to_apply'].includes(app.status) && app.deadline && daysUntil(app.deadline) >= 0) {
    return moveTimeLabel(app.deadline);
  }
  const reply = lastReplyFor(app);
  const start = (reply?.at || '').slice(0, 10) || app.appliedAt || (app.capturedAt || '').slice(0, 10);
  const days = elapsedDays(start);
  if (days == null) return '—';
  return days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`;
}

function pipelineGroups() {
  const attention = needsAttention(state);
  const seen = new Set(attention.map(item => item.app.id));
  const offers = pipelineApps()
    .filter(app => app.status === 'offer' && !seen.has(app.id))
    .map(app => ({
      app,
      kind: 'offer',
      label: 'Offer received',
      detail: '',
      sortDate: app.nextActionDate || app.deadline || '',
      priority: 5
    }))
    .sort((a, b) => String(a.sortDate).localeCompare(String(b.sortDate)));

  const needs = [...attention, ...offers].map(item => ({
    app: item.app,
    item,
    group: 'needs',
    overdue: item.kind === 'deadline' && item.sortDate && daysUntil(item.sortDate) < 0,
    reason: pipelineReason(item.app, 'needs', item),
    time: pipelineTimeLabel(item.app, 'needs', item)
  }));

  const waiting = pipelineApps()
    .filter(app => !isClosed(app.status) && app.status !== 'offer' && !seen.has(app.id))
    .map(app => ({
      app,
      item: null,
      group: 'waiting',
      overdue: false,
      reason: pipelineReason(app, 'waiting', null),
      time: pipelineTimeLabel(app, 'waiting', null)
    }))
    .sort((a, b) => {
      const dateOf = app => (app.deadline && daysUntil(app.deadline) >= 0)
        ? app.deadline
        : (app.interviewDate && daysUntil(app.interviewDate) >= 0)
          ? app.interviewDate
          : '';
      const dateA = dateOf(a.app);
      const dateB = dateOf(b.app);
      if (dateA && dateB) return dateA.localeCompare(dateB);
      if (dateA) return -1;
      if (dateB) return 1;
      return new Date(b.app.updatedAt || b.app.capturedAt || 0) - new Date(a.app.updatedAt || a.app.capturedAt || 0);
    });

  const parked = pipelineApps()
    .filter(app => isClosed(app.status))
    .map(app => ({
      app,
      item: null,
      group: 'parked',
      overdue: false,
      reason: pipelineReason(app, 'parked', null),
      time: 'Closed'
    }))
    .sort((a, b) => new Date(b.app.updatedAt || b.app.capturedAt || 0) - new Date(a.app.updatedAt || a.app.capturedAt || 0));

  return { needs, waiting, parked };
}

function pipeRow(entry) {
  const app = entry.app;
  return `
    <a class="pipe-row${entry.overdue ? ' is-overdue' : ''}" href="#/jobs/${app.id}" data-pipe-row
       data-group="${entry.group}" data-search="${escAttr(jobSearchBlob(app))}"
       data-status="${escAttr(app.status)}" data-source="${escAttr(app.source)}">
      <div class="pipe-main">
        <h2>${esc(app.role || 'Untitled role')}</h2>
        <p>${esc(app.company || 'Company not set')}${entry.reason ? ` · ${esc(entry.reason)}` : ''}</p>
      </div>
      <span class="pipe-time mono">${esc(entry.time)}</span>
    </a>`;
}

function pipeGroup(group, entries) {
  return `
    <section class="pipe-group" data-pipe-group="${group.key}">
      <div class="pipe-head">
        <span class="pipe-name mono">
          <span class="pipe-signal pipe-signal--${group.signal}" aria-hidden="true"></span>${esc(group.label)}
        </span>
        <span class="pipe-total mono" data-group-count="${group.key}">${entries.length}</span>
      </div>
      ${entries.map(pipeRow).join('')}
    </section>`;
}

function viewJobs() {
  const apps = pipelineApps()
    .sort((a, b) => (b.priority === 'high' ? 1 : 0) - (a.priority === 'high' ? 1 : 0) || new Date(b.updatedAt || b.capturedAt) - new Date(a.updatedAt || a.capturedAt));
  const archived = state.applications
    .filter(app => app.archived)
    .sort((a, b) => new Date(b.updatedAt || b.capturedAt) - new Date(a.updatedAt || a.capturedAt));
  const sources = [...new Set(apps.map(app => app.source).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (ui.jobsSource !== 'all' && !sources.includes(ui.jobsSource)) ui.jobsSource = 'all';
  if (ui.jobsStatus !== 'all' && !STATUS_KEYS.includes(ui.jobsStatus)) ui.jobsStatus = 'all';
  const groups = pipelineGroups();
  const counts = {
    needs: groups.needs.length,
    waiting: groups.waiting.length,
    parked: groups.parked.length
  };
  if (ui.jobsGroup !== 'all' && !counts[ui.jobsGroup]) ui.jobsGroup = 'all';
  const activeGroup = PIPE_GROUPS.find(group => group.key === ui.jobsGroup) || null;
  const populated = PIPE_GROUPS.filter(group => groups[group.key].length);

  return `
    <div class="page page--pipeline">
      <header class="page-head">
        <div class="page-head-copy">
          <h1 class="page-title">Pipeline</h1>
          <p class="page-lede">Grouped by who moves next.</p>
        </div>
        <span class="page-count">${pl(apps.length, 'application')}</span>
      </header>

      ${apps.length ? `
        <div class="pipe-rail" role="group" aria-label="Filter applications by who moves next">
          ${PIPE_GROUPS.map(group => `
            <button class="rail-stop${ui.jobsGroup === group.key ? ' is-active' : ''}" type="button"
                    data-action="jobs-group" data-group="${group.key}"
                    aria-pressed="${ui.jobsGroup === group.key}"${counts[group.key] || ui.jobsGroup === group.key ? '' : ' disabled'}>
              <span class="rail-dot" aria-hidden="true"></span>
              <span class="rail-count" data-rail-count="${group.key}">${counts[group.key]}</span>
              <span class="rail-label">${esc(group.label)}</span>
            </button>`).join('')}
        </div>

        <p class="pipe-scope mono" id="pipe-scope"${activeGroup ? '' : ' hidden'}>
          <span data-scope-label>${activeGroup ? `Showing ${esc(activeGroup.label.toLowerCase())}` : 'Showing all'}</span>
          <button class="pipe-scope-clear" type="button" data-action="jobs-group" data-group="all">Show all</button>
        </p>

        <div class="pipe-tools">
          <label class="pipe-search">
            ${icon('search')}
            <input id="jobs-search" type="search" placeholder="Search roles, companies, tags…" autocomplete="off" aria-label="Search applications">
          </label>
          <select class="pipe-select" id="jobs-source" aria-label="Filter by source">
            <option value="all" ${ui.jobsSource === 'all' ? 'selected' : ''}>All sources</option>
            ${sources.map(source => `<option value="${escAttr(source)}" ${ui.jobsSource === source ? 'selected' : ''}>${esc(source)}</option>`).join('')}
          </select>
          <select class="pipe-select" id="jobs-status" aria-label="Filter by stage">
            <option value="all" ${ui.jobsStatus === 'all' ? 'selected' : ''}>All stages</option>
            ${STATUS_KEYS.map(status => `<option value="${status}" ${ui.jobsStatus === status ? 'selected' : ''}>${esc(STATUSES[status].label)}</option>`).join('')}
          </select>
        </div>

        <div id="jobs-groups">
          ${populated.map(group => pipeGroup(group, groups[group.key])).join('')}
        </div>

        <div id="jobs-no-results" hidden>
          ${emptyState({
            iconName: 'search',
            title: 'No matching applications',
            text: 'Try a different search, source or stage.',
            action: '<button class="btn btn-outline btn-sm" type="button" data-action="reset-filters">Clear filters</button>'
          })}
        </div>
      ` : `
        <section class="pipe-empty">
          <p class="mono">${archived.length ? 'Pipeline clear' : 'Nothing captured yet'}</p>
          <h2>${archived.length ? 'No applications in play.' : 'Your pipeline starts here.'}</h2>
          <p>${archived.length
            ? 'Capture a new role when it arrives. Archived applications stay below.'
            : 'Paste a WhatsApp message, a link or a screenshot. Kazi pulls out the role, company and deadline.'}</p>
          <button class="action" type="button" data-action="capture">${icon('plus')} ${archived.length ? 'Capture a job' : 'Capture your first job'}</button>
        </section>`}

      ${archived.length ? `
        <details class="archive-drawer">
          <summary>
            <span>${icon('archive')} Archived applications <span class="count">${archived.length}</span></span>
            <span class="archive-hint">Kept on this device. Restore any time.</span>
          </summary>
          <div class="card archive-list">
            ${archived.map(app => `
              <div class="archive-row">
                <a href="#/jobs/${app.id}">
                  <span class="archive-role">${esc(app.role || 'Untitled role')}</span>
                  <span class="archive-company">${esc(app.company || 'Company not set')}${app.source ? ` · ${esc(app.source)}` : ''}</span>
                </a>
                <button class="btn btn-ghost btn-sm" type="button" data-action="unarchive-job" data-id="${app.id}">Restore</button>
              </div>`).join('')}
          </div>
        </details>` : ''}
    </div>`;
}

function applyJobFilters() {
  const search = document.getElementById('jobs-search');
  const sourceSelect = document.getElementById('jobs-source');
  const statusSelect = document.getElementById('jobs-status');
  const rows = [...document.querySelectorAll('[data-pipe-row]')];
  if (!rows.length) return;

  const query = (search?.value || '').trim().toLowerCase();
  const source = sourceSelect?.value || 'all';
  const status = statusSelect?.value || 'all';
  const counts = { needs: 0, waiting: 0, parked: 0 };
  let visible = 0;

  for (const row of rows) {
    const matches = (!query || row.dataset.search.includes(query))
      && (source === 'all' || row.dataset.source === source)
      && (status === 'all' || row.dataset.status === status);
    if (matches) counts[row.dataset.group] = (counts[row.dataset.group] || 0) + 1;
    const show = matches && (ui.jobsGroup === 'all' || ui.jobsGroup === row.dataset.group);
    row.hidden = !show;
    if (show) visible += 1;
  }

  PIPE_GROUPS.forEach(group => {
    const section = document.querySelector(`[data-pipe-group="${group.key}"]`);
    const count = counts[group.key] || 0;
    if (section) {
      section.hidden = count === 0 || (ui.jobsGroup !== 'all' && ui.jobsGroup !== group.key);
      const counter = section.querySelector('[data-group-count]');
      if (counter) counter.textContent = String(count);
    }
    const railCount = document.querySelector(`[data-rail-count="${group.key}"]`);
    if (railCount) railCount.textContent = String(count);
    const railStop = document.querySelector(`.rail-stop[data-group="${group.key}"]`);
    if (railStop) {
      const active = ui.jobsGroup === group.key;
      railStop.classList.toggle('is-active', active);
      railStop.setAttribute('aria-pressed', String(active));
      railStop.disabled = !active && count === 0;
    }
  });

  const noResults = document.getElementById('jobs-no-results');
  if (noResults) noResults.hidden = visible > 0;

  const scope = document.getElementById('pipe-scope');
  if (scope) {
    const activeGroup = PIPE_GROUPS.find(group => group.key === ui.jobsGroup);
    scope.hidden = !activeGroup;
    const label = scope.querySelector('[data-scope-label]');
    if (label && activeGroup) label.textContent = `Showing ${activeGroup.label.toLowerCase()}`;
  }
}

/* ------------------------------------------------------------------ */
/* Job detail                                                          */
/* ------------------------------------------------------------------ */

const INTENT_LABELS = {
  offer: 'Offer',
  rejection: 'Rejection',
  interview: 'Interview',
  assessment: 'Assessment',
  info_request: 'Information requested',
  ack: 'Acknowledged',
  talent_pool: 'Talent pool',
  unknown: 'Reply'
};

const INTENT_TONES = {
  offer: 'green',
  rejection: 'red',
  interview: 'blue',
  assessment: 'amber',
  info_request: 'amber',
  ack: 'neutral',
  talent_pool: 'neutral',
  unknown: 'neutral'
};

function intentPill(intent) {
  return `<span class="pill pill--${INTENT_TONES[intent] || 'neutral'}">${esc(INTENT_LABELS[intent] || 'Reply')}</span>`;
}

function docRow({ title, sub, href = '', action = '', id = '', iconName = 'file' }) {
  const inner = `
    <span class="doc-icon">${icon(iconName)}</span>
    <span class="doc-meta"><span class="doc-name">${esc(title)}</span><span class="doc-sub">${esc(sub)}</span></span>
    <span class="doc-go">${icon(href ? 'chevron-right' : 'download')}</span>`;
  return href
    ? `<a class="doc-row" href="${escAttr(href)}">${inner}</a>`
    : `<button class="doc-row" type="button" data-action="${escAttr(action)}" data-id="${escAttr(id)}" style="width:100%;text-align:left">${inner}</button>`;
}

function jobStateLabel(app) {
  const label = statusMeta(app.status).label;
  if (isClosed(app.status)) return `${label} · ${relativeTime(app.updatedAt || app.capturedAt)}`;
  if (app.status === 'offer') {
    return app.nextActionDate ? `Offer · reply by ${dayStamp(app.nextActionDate)}` : 'Offer received';
  }
  if (app.interviewDate) return `${label} · ${dayStamp(app.interviewDate)}`;
  if (['captured', 'to_apply'].includes(app.status) && app.deadline) {
    return `${label} · closes ${dayStamp(app.deadline)}`;
  }
  if (app.appliedAt) return `${label} · applied ${elapsedLabel(app.appliedAt)}`;
  return `${label} · ${relativeTime(app.updatedAt || app.capturedAt)}`;
}

function jobStateSignal(app) {
  if (isClosed(app.status)) return 'pipe-signal--parked';
  if (app.interviewDate || app.status === 'offer' || (['captured', 'to_apply'].includes(app.status) && app.deadline)) {
    return 'pipe-signal--marigold';
  }
  return '';
}

function jobNextMove(app) {
  const item = needsAttention(state).find(entry => entry.app.id === app.id);
  if (item) {
    const move = attentionMove(item);
    let action = `<button class="action" type="button" data-action="edit-job" data-id="${app.id}">${icon('edit')} Adjust the next step</button>`;
    if (['next', 'followup'].includes(item.kind)) {
      action = `<button class="action" type="button" data-action="complete-next" data-id="${app.id}">${icon('check')} Mark it done</button>`;
    } else if (item.kind === 'deadline' && ['captured', 'to_apply'].includes(app.status)) {
      action = `<button class="action" type="button" data-action="mark-applied" data-id="${app.id}">${icon('check')} Mark as applied</button>`;
    } else if (item.kind === 'review') {
      action = `<button class="action" type="button" data-action="edit-job" data-id="${app.id}">${icon('edit')} Review the capture</button>`;
    } else if (item.kind === 'interview') {
      action = `<button class="action" type="button" data-action="edit-job" data-id="${app.id}">${icon('calendar')} Edit the details</button>`;
    } else if (item.kind === 'offer') {
      action = `<button class="action" type="button" data-action="edit-job" data-id="${app.id}">${icon('edit')} Update the offer</button>`;
    }
    return {
      title: move.title,
      detail: move.detail,
      when: moveWhenLabel(item),
      estimate: move.estimate,
      action
    };
  }

  if (app.status === 'offer') {
    const context = noteContext(app);
    return {
      title: app.nextAction || `Answer the ${app.company || 'employer'} offer`,
      detail: `Offer received.${app.nextActionDate ? ` Reply by ${dayStamp(app.nextActionDate)}.` : ''}${context ? ` ${context}` : ''}`,
      when: app.nextActionDate ? moveTimeLabel(app.nextActionDate) : 'offer',
      estimate: 10,
      action: `<button class="action" type="button" data-action="edit-job" data-id="${app.id}">${icon('edit')} Update the offer</button>`
    };
  }

  if (app.nextAction) {
    return {
      title: app.nextAction,
      detail: app.nextActionDate
        ? `Due ${dayStamp(app.nextActionDate)}. Nothing is needed until then.`
        : 'No date is set, so this will not appear in Today. Add one to keep it moving.',
      when: app.nextActionDate ? moveTimeLabel(app.nextActionDate) : 'open',
      estimate: 2,
      action: `<button class="action" type="button" data-action="complete-next" data-id="${app.id}">${icon('check')} Mark it done</button>`
    };
  }

  if (app.interviewDate && !isClosed(app.status)) {
    return {
      title: `Prepare for the ${app.role || 'interview'}`,
      detail: `${dayStamp(app.interviewDate)}${app.interviewTime ? ` at ${formatTime(app.interviewTime)}` : ''}${app.contact?.name ? ` with ${app.contact.name}` : ''}.`,
      when: moveTimeLabel(app.interviewDate),
      estimate: 5,
      action: `<button class="action" type="button" data-action="edit-job" data-id="${app.id}">${icon('plus')} Add a next step</button>`
    };
  }

  if (app.deadline && ['captured', 'to_apply'].includes(app.status)) {
    const days = daysUntil(app.deadline);
    return {
      title: days < 0 ? `Ask whether ${app.role || 'the role'} is still open` : `Apply for ${app.role || 'this role'}`,
      detail: days < 0
        ? `The deadline was ${formatDate(app.deadline)}. A short note can still keep the door open.`
        : `Applications close ${formatDate(app.deadline)}${app.deadlineTime ? ` at ${formatTime(app.deadlineTime)}` : ''}.`,
      when: moveTimeLabel(app.deadline),
      estimate: 3,
      action: `<button class="action" type="button" data-action="mark-applied" data-id="${app.id}">${icon('check')} Mark as applied</button>`
    };
  }

  return {
    title: 'Set the next step',
    detail: 'A date keeps this role from going quiet. Add what happens next and Kazi will hold it.',
    when: 'open',
    estimate: 1,
    action: `<button class="action" type="button" data-action="edit-job" data-id="${app.id}">${icon('plus')} Add a next step</button>`
  };
}

function jobStory(app) {
  const now = nowISO();
  const events = app.timeline
    .filter(event => String(event.at || '') <= now)
    .map(event => ({
      at: event.at,
      type: event.type,
      title: event.title,
      note: event.note || ''
    }));
  if (app.appliedAt && !events.some(event => event.type === 'applied')) {
    events.push({
      at: `${app.appliedAt}T09:00:00.000Z`,
      type: 'applied',
      title: 'Application sent',
      note: 'Marked as applied in Kazi.'
    });
  }
  return events.sort((a, b) => new Date(a.at) - new Date(b.at));
}

function storyDate(iso) {
  if (!iso) return '';
  const date = String(iso).slice(0, 10);
  return date === todayISO() ? 'Today' : formatDate(date, { year: false });
}

function storyItemMarkup(event, isNow = false) {
  const timed = ['reply', 'interview', 'offer', 'deadline', 'assessment'].includes(event.type);
  return `
    <li class="story-item${isNow ? ' is-now' : ''}">
      <span class="story-date mono">${esc(isNow ? 'Now' : storyDate(event.at))}</span>
      <div class="story-body">
        <span class="story-dot${isNow ? ' story-dot--active' : timed ? ' story-dot--time' : ''}" aria-hidden="true"></span>
        <h3>${esc(event.title)}</h3>
        ${event.note ? `<p>${esc(truncate(event.note, 180))}</p>` : ''}
      </div>
    </li>`;
}

function viewJob(appId) {
  const app = getApplication(state, appId);
  if (!app) return notFound();
  const liveCV = app.cvId ? getCV(state, app.cvId) : null;
  const liveCover = app.coverId ? getCover(state, app.coverId) : null;
  const snapshots = app.documents.slice(0, 8);
  const nextMove = jobNextMove(app);
  const story = jobStory(app);
  const totalStory = story.length + 1;
  const earlier = Math.max(0, totalStory - 6);
  const visibleStory = story.slice(Math.max(0, story.length - (totalStory > 6 ? 5 : story.length)));
  const note = String(app.notes || '').trim();
  const contact = app.contact || {};
  const facts = [
    app.location,
    app.workMode,
    app.appliedAt ? `Applied ${elapsedLabel(app.appliedAt)}` : `Captured ${relativeTime(app.capturedAt)}`
  ].filter(Boolean).join(' · ');
  const docCount = (liveCV ? 1 : 0) + (liveCover ? 1 : 0) + snapshots.length;

  return `
    <div class="page page--job">
      <a class="job-back" href="#/jobs">${icon('arrow-left')} Back to pipeline</a>

      <header class="job-head">
        <div class="job-kicker">
          <span class="mono">${esc(applicationCode(app))}</span>
          <span class="job-state mono"><span class="pipe-signal ${jobStateSignal(app)}" aria-hidden="true"></span>${esc(jobStateLabel(app))}</span>
        </div>
        <h1>${esc(app.role || 'Untitled role')}</h1>
        <p class="job-company">${esc(app.company || 'Company not set')}</p>
        <p class="job-facts mono">${esc(facts)}</p>
      </header>

      <section class="job-next" aria-labelledby="job-next-title">
        <div class="next-top mono">
          <span>Next move · ${esc(nextMove.when)}</span>
          <span>${nextMove.estimate} min</span>
        </div>
        <h2 id="job-next-title">${esc(nextMove.title)}</h2>
        <p>${esc(nextMove.detail)}</p>
        ${nextMove.action}
      </section>

      <section class="story" aria-labelledby="job-story-title">
        <div class="story-head mono">
          <span id="job-story-title">The story</span>
          <span>${pl(totalStory, 'event')}</span>
        </div>
        ${earlier ? `<p class="story-earlier">${pl(earlier, 'earlier event')} in the full record below.</p>` : ''}
        <ol class="story-list">
          ${visibleStory.map(event => storyItemMarkup(event)).join('')}
          ${storyItemMarkup({ at: nowISO(), type: 'now', title: nextMove.title, note: nextMove.detail }, true)}
        </ol>
      </section>

      ${note ? `
        <section class="job-note">
          <span class="mono">${app.interviewDate ? 'For the interview' : 'Your note'}</span>
          <p>${esc(note)}</p>
        </section>` : ''}

      <div class="job-context">
        <div class="context-cell">
          <span class="mono">Contact</span>
          ${contact.name || contact.email || contact.phone ? `
            <p>${esc(contact.name || 'Contact')}${contact.role ? ` · ${esc(contact.role)}` : ''}</p>
            ${contact.email ? `<p><a href="mailto:${escAttr(contact.email)}">${esc(contact.email)}</a></p>` : ''}
            ${contact.phone ? `<p><a href="tel:${escAttr(contact.phone.replace(/[^\d+]/g, ''))}">${esc(contact.phone)}</a></p>` : ''}
          ` : '<p>No contact saved. Add a name in Edit.</p>'}
        </div>
        <div class="context-cell">
          <span class="mono">Documents</span>
          ${liveCV ? `<p><a href="#/studio/cv/${liveCV.id}">${esc(liveCV.name)}</a></p>` : ''}
          ${liveCover ? `<p><a href="#/studio/cover/${liveCover.id}">${esc(liveCover.name)}</a></p>` : ''}
          ${snapshots.length ? `<p>${pl(snapshots.length, 'attachment')} on file</p>` : ''}
          ${!docCount ? '<p>No documents yet.</p>' : ''}
        </div>
      </div>

      <div class="job-tools">
        <button class="job-tool" type="button" data-action="log-reply" data-id="${app.id}">Log a reply</button>
        <button class="job-tool" type="button" data-action="edit-job" data-id="${app.id}">Edit</button>
        <button class="job-tool" type="button" data-action="tailor-cv" data-id="${app.id}">Tailor CV</button>
        <details class="menu">
          <summary aria-label="More actions">${icon('more')}</summary>
          <div class="menu-panel">
            <button type="button" data-action="write-cover" data-id="${app.id}">${icon('cv')} Write a cover letter</button>
            ${app.url ? `<a class="menu-panel-link" href="${escAttr(app.url)}" target="_blank" rel="noopener">${icon('external')} Open job advert</a>` : ''}
            <hr>
            ${app.archived
              ? `<button type="button" data-action="unarchive-job" data-id="${app.id}">${icon('archive')} Restore to pipeline</button>`
              : `<button type="button" data-action="archive-job" data-id="${app.id}">${icon('archive')} Archive</button>`}
            <button class="danger" type="button" data-action="delete-job" data-id="${app.id}">${icon('trash')} Delete</button>
          </div>
        </details>
      </div>

      <details class="job-more">
        <summary>
          <span class="mono">Full record</span>
          <span class="mono job-more-count">${pl(story.length, 'event')} · ${pl(docCount, 'document')}<span class="summary-plus" aria-hidden="true"></span></span>
        </summary>
        <div class="job-more-body">
          <section class="record-section">
            <div class="record-head"><h2>Application</h2><span class="mono">${esc(applicationCode(app))}</span></div>
            <div class="record-facts">
              <div class="record-fact">
                <span class="mono">Stage</span>
                <select class="toolbar-select" data-change="app-status" data-id="${app.id}" aria-label="Change application stage">
                  ${STATUS_KEYS.map(key => `<option value="${key}" ${app.status === key ? 'selected' : ''}>${esc(STATUSES[key].label)}</option>`).join('')}
                </select>
              </div>
              <div class="record-fact"><span class="mono">Deadline</span><p>${app.deadline ? esc(formatDate(app.deadline)) : 'Not set'}</p></div>
              <div class="record-fact"><span class="mono">Applied</span><p>${app.appliedAt ? esc(formatDate(app.appliedAt)) : 'Not yet'}</p></div>
              <div class="record-fact"><span class="mono">Source</span><p>${esc(app.source || 'Not set')}</p></div>
              ${app.salary ? `<div class="record-fact"><span class="mono">Salary</span><p>${esc(app.salary)}</p></div>` : ''}
              ${app.priority === 'high' ? '<div class="record-fact"><span class="mono">Priority</span><p>High</p></div>' : ''}
              ${app.url ? `<div class="record-fact"><span class="mono">Job advert</span><p><a href="${escAttr(app.url)}" target="_blank" rel="noopener">${esc(truncate(app.url.replace(/^https?:\/\//, ''), 52))}</a></p></div>` : ''}
              ${app.applicationEmail ? `<div class="record-fact"><span class="mono">Application email</span><p><a href="mailto:${escAttr(app.applicationEmail)}">${esc(app.applicationEmail)}</a></p></div>` : ''}
            </div>
          </section>

          <section class="record-section">
            <div class="record-head">
              <h2>Replies</h2>
              <button class="btn btn-ghost btn-sm" type="button" data-action="log-reply" data-id="${app.id}">${icon('plus')} Log a reply</button>
            </div>
            ${app.replies.length ? app.replies.slice().sort((a, b) => new Date(b.at) - new Date(a.at)).map(reply => `
              <article class="record-reply">
                <div class="record-reply-head">
                  <strong>${esc(reply.from || 'Unknown sender')}</strong>
                  ${intentPill(reply.intent)}
                  <time>${esc(formatDateTime(reply.at))}</time>
                </div>
                ${reply.subject ? `<p class="record-reply-subject">${esc(reply.subject)}</p>` : ''}
                <p>${esc(reply.body)}</p>
              </article>`).join('') : '<p class="small muted">No replies logged yet.</p>'}
          </section>

          <section class="record-section">
            <div class="record-head"><h2>Activity</h2><span class="mono">${pl(app.timeline.length, 'event')}</span></div>
            <ul class="record-events">
              ${app.timeline.slice().reverse().map(event => `
                <li class="record-event">
                  <time>${esc(formatDateTime(event.at))}</time>
                  <div>
                    <strong>${esc(event.title)}</strong>
                    ${event.note ? `<p>${esc(truncate(event.note, 220))}</p>` : ''}
                  </div>
                </li>`).join('')}
            </ul>
          </section>

          <section class="record-section">
            <div class="record-head"><h2>Documents</h2><span class="mono">${pl(docCount, 'document')}</span></div>
            <div class="doc-list">
              ${liveCV ? docRow({ title: liveCV.name, sub: `Live CV · updated ${relativeTime(liveCV.updatedAt)}`, href: `#/studio/cv/${liveCV.id}`, iconName: 'cv' }) : ''}
              ${liveCover ? docRow({ title: liveCover.name, sub: `Cover letter · updated ${relativeTime(liveCover.updatedAt)}`, href: `#/studio/cover/${liveCover.id}`, iconName: 'mail' }) : ''}
              ${snapshots.map(doc => docRow({
                title: doc.name,
                sub: `${doc.kind === 'cv' ? 'CV' : doc.kind === 'cover' ? 'Cover letter' : 'Attachment'} · ${formatDateFrom(doc.createdAt)}`,
                action: 'view-doc',
                id: `${app.id}|${doc.id}`,
                iconName: doc.fileId ? 'paperclip' : doc.kind === 'cover' ? 'mail' : 'cv'
              })).join('')}
              ${!docCount ? '<p class="small muted">No documents yet. Tailor a CV or write a cover letter for this role.</p>' : ''}
            </div>
            <div class="record-actions">
              <button class="btn btn-outline btn-sm" type="button" data-action="tailor-cv" data-id="${app.id}">${icon('target')} ${liveCV ? 'Tailor another CV' : 'Tailor a CV'}</button>
              <button class="btn btn-outline btn-sm" type="button" data-action="write-cover" data-id="${app.id}">${icon('cv')} ${liveCover ? 'New cover letter' : 'Write cover letter'}</button>
            </div>
          </section>

          <section class="record-section">
            <div class="record-head"><h2>Job description</h2>${app.jobDescription ? `<button class="btn btn-ghost btn-sm" type="button" data-action="tailor-cv" data-id="${app.id}">${icon('file')} Use for CV</button>` : ''}</div>
            ${app.jobDescription ? `
              <details class="record-desc">
                <summary><span>Read the advert</span><span class="mono">Saved</span></summary>
                <div class="prose">${esc(app.jobDescription)}</div>
              </details>` : '<p class="small muted">No job description saved. Edit the application to add one.</p>'}
          </section>
        </div>
      </details>
    </div>`;
}

function formatDateFrom(value) {
  return value ? formatDateTime(value) : '';
}

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

function calendarEventClass(type) {
  return {
    deadline: 'cal-event--deadline',
    interview: 'cal-event--interview',
    followup: 'cal-event--followup',
    next: 'cal-event--next'
  }[type] || '';
}

function viewCalendar() {
  const anchor = new Date(`${ui.calendarAnchor}T12:00:00`);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const cells = monthCells(year, month);
  const allEvents = applicationEvents(state);
  const eventsByDate = new Map();
  for (const event of allEvents) {
    if (!eventsByDate.has(event.date)) eventsByDate.set(event.date, []);
    eventsByDate.get(event.date).push(event);
  }
  const selectedEvents = eventsByDate.get(ui.selectedDate) || [];
  const upcoming = allEvents.filter(event => event.date >= todayISO()).slice(0, 5);
  const selectedDateLabel = formatDateLong(ui.selectedDate);

  return `
    <div class="page">
      <header class="page-head">
        <div class="page-head-copy">
          <p class="eyebrow"><span class="dot"></span>Deadlines, interviews and follow-ups</p>
          <h1 class="page-title">Calendar</h1>
          <p class="page-lede">Everything with a date, in one quiet place. Export it to Google Calendar or your phone when you need it there too.</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-outline" type="button" data-action="export-ics">${icon('download')} Add to calendar</button>
          <button class="btn btn-primary" type="button" data-action="capture">${icon('plus')} Capture a job</button>
        </div>
      </header>

      <div class="calendar-layout">
        <section class="card calendar-card">
          <div class="cal-toolbar">
            <h2 class="cal-month">${esc(monthLabel(year, month))}</h2>
            <div class="cal-nav">
              <button class="icon-btn" type="button" data-action="cal-prev" aria-label="Previous month">${icon('chevron-left')}</button>
              <button class="btn btn-outline" type="button" data-action="cal-today">Today</button>
              <button class="icon-btn" type="button" data-action="cal-next" aria-label="Next month">${icon('chevron-right')}</button>
            </div>
          </div>
          <div class="cal-weekdays" aria-hidden="true">
            ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => `<span>${day}</span>`).join('')}
          </div>
          <div class="cal-grid" role="grid" aria-label="${esc(monthLabel(year, month))}">
            ${cells.map(cell => {
              const events = eventsByDate.get(cell.iso) || [];
              return `
                <button type="button" class="cal-cell ${cell.inMonth ? '' : 'cal-cell--out'} ${cell.weekday === 0 || cell.weekday === 6 ? 'cal-cell--weekend' : ''} ${cell.isToday ? 'cal-cell--today' : ''} ${cell.iso === ui.selectedDate ? 'cal-cell--selected' : ''}"
                  data-action="cal-day" data-date="${cell.iso}" aria-label="${esc(formatDateLong(cell.iso))}${events.length ? `, ${events.length} events` : ''}" aria-pressed="${cell.iso === ui.selectedDate}">
                  <span class="cal-day">${cell.day}</span>
                  <span class="cal-events">
                    ${events.slice(0, 2).map(event => `<span class="cal-event ${calendarEventClass(event.type)}">${esc(event.shortTitle)}</span>`).join('')}
                    ${events.length > 2 ? `<span class="cal-more">+${events.length - 2} more</span>` : ''}
                  </span>
                </button>`;
            }).join('')}
          </div>
        </section>

        <div class="detail-col">
          <section class="card day-panel">
            <div class="day-panel-head">
              <h2>${esc(selectedDateLabel)}</h2>
              <p>${selectedEvents.length ? pl(selectedEvents.length, 'event') : 'Nothing scheduled'}</p>
            </div>
            ${selectedEvents.length ? `<div class="day-events">${selectedEvents.map(event => `
              <a class="day-event day-event--${esc(event.type)}" href="#/jobs/${event.appId}">
                <span class="day-event-time">${event.time ? esc(formatTime(event.time)) : 'All day'}</span>
                <span class="day-event-body">
                  <span class="day-event-title">${esc(event.title)}</span>
                  <span class="day-event-meta">${esc(event.company || '')}${event.type === 'deadline' ? ' · deadline' : event.type === 'interview' ? ' · interview' : event.type === 'followup' ? ' · follow up' : ' · next step'}</span>
                </span>
              </a>`).join('')}</div>` : emptyState({
                iconName: 'calendar',
                title: 'A free day',
                text: 'Pick another day to see its deadlines and interviews, or capture a new opportunity.',
                action: '<button class="btn btn-outline btn-sm" type="button" data-action="capture">Capture a job</button>'
              })}
          </section>

          <section class="card agenda-card">
            <div class="panel-head"><h2>Coming up</h2><span class="count">${upcoming.length}</span></div>
            ${upcoming.length ? `<div class="agenda-list">${upcoming.map(event => `
              <a class="agenda-item" href="#/jobs/${event.appId}">
                <span class="agenda-date">
                  <span class="agenda-day">${Number(event.date.slice(8, 10))}</span>
                  <span class="agenda-month">${esc(new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(`${event.date}T12:00:00`)))}</span>
                </span>
                <span class="agenda-body">
                  <span class="agenda-title">${esc(event.title)}</span>
                  <span class="agenda-meta">${esc(event.company || '')}</span>
                  <span class="agenda-type"><span class="dot" style="background:${event.type === 'deadline' ? 'var(--red)' : event.type === 'interview' ? 'var(--blue)' : event.type === 'followup' ? 'var(--amber)' : 'var(--green)'}"></span>${esc(event.shortTitle)}</span>
                </span>
              </a>`).join('')}</div>` : '<div class="empty" style="padding:26px"><p>Nothing coming up yet.</p></div>'}
          </section>
        </div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Studio                                                              */
/* ------------------------------------------------------------------ */

function docLineMarkup(kind = 'cv') {
  return `
    <div class="doc-paper${kind === 'cover' ? ' doc-paper--cover' : ''}">
      <div class="doc-line doc-line--title"></div>
      <div class="doc-line" style="width:74%"></div>
      <div class="doc-line doc-line--short"></div>
      <div class="doc-line doc-line--text" style="margin-top:12px"></div>
      <div class="doc-line doc-line--text"></div>
      <div class="doc-line" style="width:84%"></div>
      <div class="doc-line" style="width:58%;margin-top:9px"></div>
      <div class="doc-line doc-line--text"></div>
      <div class="doc-line" style="width:72%"></div>
    </div>`;
}

function cvCard(cv) {
  const isMaster = cv.kind === 'master';
  const subtitle = cv.targetCompany
    ? `${isMaster ? 'Master CV' : 'Tailored for'} ${cv.targetCompany}`
    : isMaster ? 'Master CV' : cv.targetRole || 'Tailored CV';
  return `
    <article class="doc-card">
      <div class="doc-preview">${docLineMarkup('cv')}</div>
      <div class="doc-body">
        <p class="doc-title">${esc(cv.name)}</p>
        <p class="doc-sub">${esc(subtitle)} · updated ${esc(relativeTime(cv.updatedAt))}</p>
        <div class="doc-actions">
          <a class="btn btn-outline btn-sm" href="#/studio/cv/${cv.id}">${icon('edit')} <span>Open</span></a>
          <a class="btn btn-ghost btn-sm" href="#/print/cv/${cv.id}" aria-label="Print ${escAttr(cv.name)}">${icon('printer')}</a>
          <button class="btn btn-ghost btn-sm" type="button" data-action="duplicate-cv" data-id="${cv.id}" aria-label="Duplicate ${escAttr(cv.name)}">${icon('copy')}</button>
          <details class="menu" style="margin-left:auto">
            <summary aria-label="More CV actions" style="width:30px;height:30px">${icon('more')}</summary>
            <div class="menu-panel">
              <button class="danger" type="button" data-action="delete-cv" data-id="${cv.id}">${icon('trash')} Delete</button>
            </div>
          </details>
        </div>
      </div>
    </article>`;
}

function coverCard(cover) {
  const app = cover.applicationId ? getApplication(state, cover.applicationId) : null;
  const subtitle = app ? `${app.role} · ${app.company}` : cover.targetCompany || 'Cover letter';
  return `
    <article class="doc-card">
      <div class="doc-preview">${docLineMarkup('cover')}</div>
      <div class="doc-body">
        <p class="doc-title">${esc(cover.name)}</p>
        <p class="doc-sub">${esc(subtitle)} · updated ${esc(relativeTime(cover.updatedAt))}</p>
        <div class="doc-actions">
          <a class="btn btn-outline btn-sm" href="#/studio/cover/${cover.id}">${icon('edit')} <span>Open</span></a>
          <a class="btn btn-ghost btn-sm" href="#/print/cover/${cover.id}" aria-label="Print ${escAttr(cover.name)}">${icon('printer')}</a>
          <details class="menu" style="margin-left:auto">
            <summary aria-label="More cover letter actions" style="width:30px;height:30px">${icon('more')}</summary>
            <div class="menu-panel">
              <button class="danger" type="button" data-action="delete-cover" data-id="${cover.id}">${icon('trash')} Delete</button>
            </div>
          </details>
        </div>
      </div>
    </article>`;
}

function viewStudio() {
  const master = state.cvs.find(cv => cv.kind === 'master') || state.cvs[0] || null;
  const tailored = state.cvs.filter(cv => cv !== master);
  const completeness = profileCompleteness(state.profile);

  return `
    <div class="page">
      <header class="page-head">
        <div class="page-head-copy">
          <p class="eyebrow"><span class="dot"></span>One profile, many applications</p>
          <h1 class="page-title">CV studio</h1>
          <p class="page-lede">Build a strong master CV, then tailor a version for each job. Kazi shows the keyword match instead of guessing.</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-outline" type="button" data-action="new-cover">${icon('mail')} New cover letter</button>
          <button class="btn btn-primary" type="button" data-action="new-cv">${icon('plus')} New CV</button>
        </div>
      </header>

      <div class="studio-top">
        <section class="master-card">
          <div class="master-doc" aria-hidden="true">
            <div class="doc-line doc-line--title"></div>
            <div class="doc-line"></div>
            <div class="doc-line doc-line--short"></div>
            <div class="doc-line" style="margin-top:8px"></div>
            <div class="doc-line doc-line--short"></div>
          </div>
          <div class="master-copy">
            <p class="eyebrow"><span class="dot"></span>${master ? 'Your base document' : 'Start here'}</p>
            <h2>${master ? esc(master.name) : 'Create your master CV'}</h2>
            <p>${master ? `Updated ${esc(relativeTime(master.updatedAt))}. Tailor a copy for every serious application.` : 'Pull your profile into a clean, single-column CV that is easy to tailor.'}</p>
            ${master
              ? `<div class="data-actions" style="margin-top:11px;padding:0"><a class="btn btn-primary btn-sm" href="#/studio/cv/${master.id}">${icon('edit')} Open master CV</a><a class="btn btn-outline btn-sm" href="#/print/cv/${master.id}">${icon('printer')} Print</a></div>`
              : `<button class="btn btn-primary btn-sm" type="button" data-action="create-master">${icon('plus')} Create from profile</button>`}
          </div>
        </section>

        <section class="card profile-card">
          <div class="profile-card-head">
            <div class="progress-ring" style="--value:${completeness.percent}"><strong>${completeness.percent}%</strong></div>
            <div>
              <h2>${esc(state.profile.name || 'Your profile')}</h2>
              <p>${esc(state.profile.headline || 'Add a headline so every CV starts strong')}</p>
            </div>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${completeness.percent}%"></div></div>
          ${completeness.missing.length ? `<div class="missing-chips">${completeness.missing.slice(0, 6).map(item => `<span>${esc(item)}</span>`).join('')}</div>` : '<p class="tiny" style="margin-top:9px;color:var(--green)">Profile complete — nice.</p>'}
          <div class="data-actions" style="padding-bottom:0"><a class="btn btn-outline btn-sm" href="#/studio/profile">${icon('user')} Edit profile</a></div>
        </section>
      </div>

      <section class="section studio-section">
        <div class="section-head">
          <h2 class="section-title">Tailored CVs</h2>
          <span class="small muted">${tailored.length} saved</span>
        </div>
        <div class="doc-grid">
          ${tailored.map(cvCard).join('')}
          <button class="doc-add" type="button" data-action="new-cv">${icon('plus')} New CV from profile</button>
        </div>
      </section>

      <section class="section studio-section">
        <div class="section-head">
          <h2 class="section-title">Cover letters</h2>
          <span class="small muted">${state.covers.length} saved</span>
        </div>
        <div class="doc-grid">
          ${state.covers.map(coverCard).join('')}
          <button class="doc-add" type="button" data-action="new-cover">${icon('plus')} Write a cover letter</button>
        </div>
      </section>

      <div class="insight-note studio-privacy">
        ${icon('shield')}
        <span><strong>Private by default.</strong> Your CVs and job notes live in this browser, not on a server. Export a backup from Settings whenever you switch phones.</span>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* CV editor                                                           */
/* ------------------------------------------------------------------ */

function summarySuggestionMarkup(cv) {
  const suggestion = ui.summarySuggestion?.cvId === cv.id ? ui.summarySuggestion.text : '';
  if (!suggestion) return '<div id="summary-suggestion"></div>';
  return `
    <div id="summary-suggestion">
      <div class="summary-suggestion">
        ${esc(suggestion)}
        ${ui.summarySuggestion?.source === 'ai' ? '<p class="tiny muted" style="margin-top:7px">AI draft from your CV. Check every claim before using it.</p>' : ''}
        <div><button class="btn btn-outline btn-sm" type="button" data-action="apply-summary" data-id="${cv.id}">Use this summary</button></div>
      </div>
    </div>`;
}

function analysisMarkup(cv) {
  const analysis = analyseCV(cv, cv.jobDescription);
  const score = analysis.score;
  return `
    <div class="cv-analysis">
      <div class="analysis-top">
        <div class="analysis-score" style="--score:${score ?? 0}"><strong>${score == null ? '—' : `${score}%`}</strong></div>
        <div>
          <h3>${score == null ? 'Add the job advert' : score >= 70 ? 'Strong keyword match' : score >= 45 ? 'Room to tailor' : 'Needs attention'}</h3>
          <p>${score == null ? 'Paste the advert above to see matched and missing terms.' : `${analysis.matched.length} matched · ${analysis.missing.length} missing`}</p>
        </div>
      </div>
      ${analysis.matched.length || analysis.missing.length ? `
        <div class="keyword-chips">
          ${analysis.matched.slice(0, 9).map(item => `<span class="keyword-chip keyword-chip--hit">${esc(item.term)}</span>`).join('')}
          ${analysis.missing.slice(0, 9).map(item => `<span class="keyword-chip keyword-chip--miss">${esc(item.term)}</span>`).join('')}
        </div>` : ''}
      ${analysis.ats.length ? `<div class="ats-list">${analysis.ats.slice(0, 6).map(check => `
        <div class="ats-item ats-item--${check.status}"><span class="dot"></span><span>${esc(check.text)}</span></div>`).join('')}</div>` : ''}
      ${analysis.missing.length ? `<p class="tiny muted">Only add missing terms where they are genuinely true of your experience.</p>` : ''}
    </div>`;
}

function cvEditorSection({ iconName, title, count = '', body, toggle = '' }) {
  return `
    <section class="card editor-section">
      <div class="editor-section-head">
        <h2>${icon(iconName)} ${esc(title)}</h2>
        ${count ? `<span class="count">${count}</span>` : ''}
        ${toggle}
      </div>
      <div class="editor-section-body">${body}</div>
    </section>`;
}

function viewCVEditor(id) {
  const cv = getCV(state, id);
  if (!cv) return notFound();
  const isMaster = cv.kind === 'master';
  const selectedExperience = cv.experience.filter(exp => exp.selected).length;

  return `
    <div class="page">
      <a class="back-link" href="#/studio">${icon('arrow-left')} Back to CV studio</a>
      <header class="page-head">
        <div class="page-head-copy">
          <p class="eyebrow"><span class="dot"></span>${isMaster ? 'Master CV' : 'Tailored CV'}${cv.targetCompany ? ` · ${esc(cv.targetCompany)}` : ''}</p>
          <h1 class="page-title">${esc(cv.name)}</h1>
          <p class="page-lede">Edit on the left, watch the document change on the right. Everything saves locally as you type.</p>
        </div>
        <div class="head-actions editor-actions">
          <button class="btn btn-primary" type="button" data-action="save-cv" data-id="${cv.id}">${icon('check')} Save</button>
          <a class="btn btn-outline" href="#/print/cv/${cv.id}">${icon('printer')} <span class="btn-label-long">Print / PDF</span></a>
          <button class="btn btn-outline" type="button" data-action="download-cv" data-id="${cv.id}">${icon('download')} <span class="btn-label-long">Word</span></button>
          <details class="menu">
            <summary aria-label="More CV actions">${icon('more')}</summary>
            <div class="menu-panel">
              <button type="button" data-action="duplicate-cv" data-id="${cv.id}">${icon('copy')} Duplicate</button>
              <button class="danger" type="button" data-action="delete-cv" data-id="${cv.id}">${icon('trash')} Delete</button>
            </div>
          </details>
        </div>
      </header>

      <div class="editor-layout">
        <div class="editor-panel" id="cv-editor" data-cv-id="${cv.id}">
          ${cvEditorSection({
            iconName: 'target',
            title: 'Target and advert',
            body: `
              <div class="field">
                <label class="field-label" for="cv-name">CV name</label>
                <input class="input" id="cv-name" data-cv-field="name" value="${escAttr(cv.name)}" placeholder="e.g. M&E Officer — Savanna Health">
              </div>
              <div class="field-row">
                <div class="field">
                  <label class="field-label">Target role</label>
                  <input class="input" data-cv-field="targetRole" value="${escAttr(cv.targetRole)}" placeholder="Monitoring & Evaluation Officer">
                </div>
                <div class="field">
                  <label class="field-label">Target company</label>
                  <input class="input" data-cv-field="targetCompany" value="${escAttr(cv.targetCompany)}" placeholder="Savanna Health Initiative">
                </div>
              </div>
              <div class="field">
                <label class="field-label">Job advert</label>
                <textarea class="textarea" data-cv-field="jobDescription" placeholder="Paste the full job description here to score the match and tailor bullet points.">${esc(cv.jobDescription)}</textarea>
                <span class="field-hint">Kazi compares the advert with your selected experience, skills and summary.</span>
              </div>
              <div class="data-actions" style="padding:0">
                <button class="btn btn-primary btn-sm" type="button" data-action="tailor-editor" data-id="${cv.id}">${icon('target')} Tailor to this advert</button>
                <button class="btn btn-outline btn-sm" type="button" data-action="suggest-summary" data-id="${cv.id}">${icon('file')} ${state.settings.ai ? 'Suggest with AI' : 'Suggest a summary'}</button>
              </div>`
          })}

          ${cvEditorSection({
            iconName: 'file',
            title: 'Summary',
            body: `
              <div class="field">
                <label class="field-label" for="cv-summary">Professional summary</label>
                <textarea class="textarea" id="cv-summary" data-cv-field="summary" style="min-height:110px" placeholder="Two to four lines on what you do, your strengths and the value you bring.">${esc(cv.summary)}</textarea>
                <span class="field-hint">Aim for 2–4 lines. Keep it specific to the kind of role you want.</span>
              </div>
              ${summarySuggestionMarkup(cv)}`
          })}

          ${cvEditorSection({
            iconName: 'user',
            title: 'Contact details',
            body: `
              <div class="field-row">
                <div class="field"><label class="field-label">Full name</label><input class="input" data-cv-field="contact.name" value="${escAttr(cv.contact.name)}"></div>
                <div class="field"><label class="field-label">Headline</label><input class="input" data-cv-field="contact.headline" value="${escAttr(cv.contact.headline)}"></div>
              </div>
              <div class="field-row">
                <div class="field"><label class="field-label">Email</label><input class="input" type="email" data-cv-field="contact.email" value="${escAttr(cv.contact.email)}"></div>
                <div class="field"><label class="field-label">Phone</label><input class="input" data-cv-field="contact.phone" value="${escAttr(cv.contact.phone)}"></div>
              </div>
              <div class="field"><label class="field-label">Location</label><input class="input" data-cv-field="contact.location" value="${escAttr(cv.contact.location)}" placeholder="Kampala, Uganda"></div>
              <div class="field-row field-row--three">
                <div class="field"><label class="field-label">LinkedIn</label><input class="input" data-cv-field="contact.linkedin" value="${escAttr(cv.contact.linkedin)}"></div>
                <div class="field"><label class="field-label">Portfolio</label><input class="input" data-cv-field="contact.portfolio" value="${escAttr(cv.contact.portfolio)}"></div>
                <div class="field"><label class="field-label">Website</label><input class="input" data-cv-field="contact.website" value="${escAttr(cv.contact.website)}"></div>
              </div>`
          })}

          ${cvEditorSection({
            iconName: 'briefcase',
            title: 'Experience',
            count: `${selectedExperience}/${cv.experience.length}`,
            body: `
              ${cv.experience.length ? cv.experience.map(exp => `
                <div class="repeat-item" data-exp="${exp.id}">
                  <div class="repeat-head">
                    <label class="check-line" style="font-size:11px"><input type="checkbox" data-exp-field="selected" ${exp.selected ? 'checked' : ''}> Include this role</label>
                    <button class="icon-btn" type="button" data-action="remove-cv-item" data-kind="experience" data-id="${exp.id}" aria-label="Remove experience">${icon('trash')}</button>
                  </div>
                  <div class="field-row">
                    <div class="field"><label class="field-label">Role</label><input class="input" data-exp-field="role" value="${escAttr(exp.role)}"></div>
                    <div class="field"><label class="field-label">Company</label><input class="input" data-exp-field="company" value="${escAttr(exp.company)}"></div>
                  </div>
                  <div class="field-row field-row--three" style="margin-top:7px">
                    <div class="field"><label class="field-label">Location</label><input class="input" data-exp-field="location" value="${escAttr(exp.location)}"></div>
                    <div class="field"><label class="field-label">Start</label><input class="input" data-exp-field="start" value="${escAttr(exp.start)}" placeholder="Feb 2023"></div>
                    <div class="field"><label class="field-label">End</label><input class="input" data-exp-field="end" value="${escAttr(exp.end)}" placeholder="Present"></div>
                  </div>
                  <label class="check-line" style="margin-top:7px"><input type="checkbox" data-exp-field="current" ${exp.current ? 'checked' : ''}> I currently work here</label>
                  <div style="margin-top:9px">
                    <div class="field-label" style="margin-bottom:4px">Achievement bullets</div>
                    ${exp.bullets.map(bullet => `
                      <div class="bullet-row" data-bullet="${bullet.id}">
                        <input type="checkbox" data-bullet-selected ${bullet.selected ? 'checked' : ''} aria-label="Include bullet">
                        <input class="input" data-bullet-text value="${escAttr(bullet.text)}">
                        <button class="icon-btn" type="button" data-action="remove-bullet" data-id="${bullet.id}" aria-label="Remove bullet">${icon('x')}</button>
                      </div>`).join('')}
                    <button class="btn btn-ghost btn-sm" type="button" data-action="add-bullet" data-id="${exp.id}" style="margin-top:5px">${icon('plus')} Add bullet</button>
                  </div>
                </div>`).join('') : '<p class="small muted">No experience entries yet. Add one below or build them in your profile.</p>'}
              <button class="btn btn-outline btn-sm" type="button" data-action="add-cv-experience">${icon('plus')} Add a role</button>`
          })}

          ${cvEditorSection({
            iconName: 'cv',
            title: 'Education',
            count: cv.education.filter(item => item.selected).length,
            body: cv.education.length ? cv.education.map(item => `
              <div class="repeat-item" data-edu="${item.id}">
                <div class="repeat-head">
                  <label class="check-line" style="font-size:11px"><input type="checkbox" data-edu-field="selected" ${item.selected ? 'checked' : ''}> Include</label>
                  <button class="icon-btn" type="button" data-action="remove-cv-item" data-kind="education" data-id="${item.id}" aria-label="Remove education">${icon('trash')}</button>
                </div>
                <div class="field-row">
                  <div class="field"><label class="field-label">Qualification</label><input class="input" data-edu-field="degree" value="${escAttr(item.degree)}"></div>
                  <div class="field"><label class="field-label">School</label><input class="input" data-edu-field="school" value="${escAttr(item.school)}"></div>
                </div>
                <div class="field-row field-row--three" style="margin-top:7px">
                  <div class="field"><label class="field-label">Location</label><input class="input" data-edu-field="location" value="${escAttr(item.location)}"></div>
                  <div class="field"><label class="field-label">Start</label><input class="input" data-edu-field="start" value="${escAttr(item.start)}"></div>
                  <div class="field"><label class="field-label">End</label><input class="input" data-edu-field="end" value="${escAttr(item.end)}"></div>
                </div>
                <div class="field" style="margin-top:7px"><label class="field-label">Detail</label><input class="input" data-edu-field="detail" value="${escAttr(item.detail)}"></div>
              </div>`).join('') : '<p class="small muted">No education entries. You can add them from your profile.</p>'
          })}

          ${cvEditorSection({
            iconName: 'star',
            title: 'Skills',
            count: cv.skills.filter(skill => skill.selected).length,
            body: `
              <div class="form-grid">
                ${cv.skills.map(skill => `
                  <label class="check-line"><input type="checkbox" data-skill="${skill.id}" ${skill.selected ? 'checked' : ''}> <span>${esc(skill.name)}</span></label>`).join('')}
              </div>
              <div class="field-row" style="align-items:end">
                <div class="field"><label class="field-label" for="new-skill">Add a skill</label><input class="input" id="new-skill" placeholder="e.g. Power BI"></div>
                <button class="btn btn-outline" type="button" data-action="add-skill" data-id="${cv.id}">Add</button>
              </div>`
          })}

          ${cvEditorSection({
            iconName: 'folder',
            title: 'Projects',
            count: cv.projects.filter(item => item.selected).length,
            body: cv.projects.length ? cv.projects.map(item => `
              <div class="repeat-item" data-project-item="${item.id}">
                <div class="repeat-head">
                  <label class="check-line" style="font-size:11px"><input type="checkbox" data-project-field="selected" ${item.selected ? 'checked' : ''}> Include</label>
                  <button class="icon-btn" type="button" data-action="remove-cv-item" data-kind="projects" data-id="${item.id}" aria-label="Remove project">${icon('trash')}</button>
                </div>
                <div class="field-row">
                  <div class="field"><label class="field-label">Project name</label><input class="input" data-project-field="name" value="${escAttr(item.name)}"></div>
                  <div class="field"><label class="field-label">Link</label><input class="input" data-project-field="link" value="${escAttr(item.link)}"></div>
                </div>
                <div class="field" style="margin-top:7px"><label class="field-label">Detail</label><textarea class="textarea" data-project-field="detail" style="min-height:60px">${esc(item.detail)}</textarea></div>
              </div>`).join('') : '<p class="small muted">No projects yet. Add them from your profile.</p>'
          })}

          ${cvEditorSection({
            iconName: 'shield',
            title: 'Certifications',
            count: cv.certifications.filter(item => item.selected).length,
            body: cv.certifications.length ? cv.certifications.map(item => `
              <div class="repeat-item" data-cert="${item.id}">
                <div class="repeat-head">
                  <label class="check-line" style="font-size:11px"><input type="checkbox" data-cert-field="selected" ${item.selected ? 'checked' : ''}> Include</label>
                  <button class="icon-btn" type="button" data-action="remove-cv-item" data-kind="certifications" data-id="${item.id}" aria-label="Remove certification">${icon('trash')}</button>
                </div>
                <div class="field-row field-row--three">
                  <div class="field"><label class="field-label">Name</label><input class="input" data-cert-field="name" value="${escAttr(item.name)}"></div>
                  <div class="field"><label class="field-label">Issuer</label><input class="input" data-cert-field="issuer" value="${escAttr(item.issuer)}"></div>
                  <div class="field"><label class="field-label">Year</label><input class="input" data-cert-field="year" value="${escAttr(item.year)}"></div>
                </div>
              </div>`).join('') : '<p class="small muted">No certifications yet. Add them from your profile.</p>'
          })}

          ${cvEditorSection({
            iconName: 'message',
            title: 'Languages',
            count: cv.languages.filter(item => item.selected).length,
            body: cv.languages.length ? cv.languages.map(item => `
              <div class="repeat-item" data-lang="${item.id}">
                <div class="repeat-head">
                  <label class="check-line" style="font-size:11px"><input type="checkbox" data-lang-field="selected" ${item.selected ? 'checked' : ''}> Include</label>
                  <button class="icon-btn" type="button" data-action="remove-cv-item" data-kind="languages" data-id="${item.id}" aria-label="Remove language">${icon('trash')}</button>
                </div>
                <div class="field-row">
                  <div class="field"><label class="field-label">Language</label><input class="input" data-lang-field="name" value="${escAttr(item.name)}"></div>
                  <div class="field"><label class="field-label">Level</label><input class="input" data-lang-field="level" value="${escAttr(item.level)}"></div>
                </div>
              </div>`).join('') : '<p class="small muted">No languages yet. Add them from your profile.</p>'
          })}
        </div>

        <aside class="preview-pane">
          <div class="preview-toolbar">
            <span>Live preview</span>
            <button class="btn btn-ghost btn-sm" type="button" data-action="copy-cv" data-id="${cv.id}">${icon('copy')} Copy text</button>
          </div>
          <div class="preview-stage" id="cv-preview">${renderCV(cv)}</div>
          <div class="card" id="cv-analysis">${analysisMarkup(cv)}</div>
        </aside>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Cover letter editor                                                 */
/* ------------------------------------------------------------------ */

function viewCoverEditor(id) {
  const cover = getCover(state, id);
  if (!cover) return notFound();
  const application = cover.applicationId ? getApplication(state, cover.applicationId) : null;
  const linkedCV = cover.cvId ? getCV(state, cover.cvId) : null;

  return `
    <div class="page">
      <a class="back-link" href="#/studio">${icon('arrow-left')} Back to CV studio</a>
      <header class="page-head">
        <div class="page-head-copy">
          <p class="eyebrow"><span class="dot"></span>Cover letter${application ? ` · ${esc(application.company)}` : ''}</p>
          <h1 class="page-title">${esc(cover.name)}</h1>
          <p class="page-lede">Write like yourself. Kazi can draft the first version from your CV, then you make it sound human.</p>
        </div>
        <div class="head-actions editor-actions">
          <button class="btn btn-primary" type="button" data-action="save-cover" data-id="${cover.id}">${icon('check')} Save</button>
          <a class="btn btn-outline" href="#/print/cover/${cover.id}">${icon('printer')} <span class="btn-label-long">Print / PDF</span></a>
          <button class="btn btn-outline" type="button" data-action="download-cover" data-id="${cover.id}">${icon('download')} <span class="btn-label-long">Word</span></button>
          <details class="menu">
            <summary aria-label="More cover letter actions">${icon('more')}</summary>
            <div class="menu-panel">
              <button class="danger" type="button" data-action="delete-cover" data-id="${cover.id}">${icon('trash')} Delete</button>
            </div>
          </details>
        </div>
      </header>

      <div class="editor-layout">
        <div class="editor-panel" id="cover-editor" data-cover-id="${cover.id}">
          ${cvEditorSection({
            iconName: 'target',
            title: 'Who it is for',
            body: `
              <div class="field">
                <label class="field-label">Cover letter name</label>
                <input class="input" data-cover-field="name" value="${escAttr(cover.name)}">
              </div>
              <div class="field-row">
                <div class="field">
                  <label class="field-label">Linked application</label>
                  <select class="select" data-cover-select="applicationId">
                    <option value="">No linked application</option>
                    ${state.applications.filter(app => !app.archived).map(app => `<option value="${app.id}" ${cover.applicationId === app.id ? 'selected' : ''}>${esc(app.role || 'Untitled')} — ${esc(app.company || '')}</option>`).join('')}
                  </select>
                </div>
                <div class="field">
                  <label class="field-label">Base CV</label>
                  <select class="select" data-cover-select="cvId">
                    <option value="">No linked CV</option>
                    ${state.cvs.map(cv => `<option value="${cv.id}" ${cover.cvId === cv.id ? 'selected' : ''}>${esc(cv.name)}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="field-row">
                <div class="field"><label class="field-label">Recipient</label><input class="input" data-cover-field="recipient" value="${escAttr(cover.recipient)}" placeholder="Hiring Manager"></div>
                <div class="field"><label class="field-label">Target role</label><input class="input" data-cover-field="targetRole" value="${escAttr(cover.targetRole)}" placeholder="Monitoring & Evaluation Officer"></div>
              </div>
              <div class="field"><label class="field-label">Company</label><input class="input" data-cover-field="targetCompany" value="${escAttr(cover.targetCompany)}" placeholder="Savanna Health Initiative"></div>
              <div class="data-actions" style="padding:0">
                <button class="btn btn-primary btn-sm" type="button" data-action="generate-cover" data-id="${cover.id}">${icon('mail')} ${state.settings.ai ? 'Generate an AI draft' : 'Generate a draft from my CV'}</button>
                ${application ? `<a class="btn btn-ghost btn-sm" href="#/jobs/${application.id}">${icon('briefcase')} Open application</a>` : ''}
              </div>
              <div class="form-note">${icon(state.settings.ai ? 'target' : 'shield')}<span>${state.settings.ai ? 'AI generation sends only the CV facts and advert for this draft to the AI endpoint. Check every claim before sending.' : 'Generation uses your saved CV and the linked job advert. It never sends anything anywhere.'}</span></div>`
          })}

          ${cvEditorSection({
            iconName: 'user',
            title: 'Your contact details',
            body: `
              <div class="field-row">
                <div class="field"><label class="field-label">Name</label><input class="input" data-cover-field="contact.name" value="${escAttr(cover.contact.name)}"></div>
                <div class="field"><label class="field-label">Email</label><input class="input" type="email" data-cover-field="contact.email" value="${escAttr(cover.contact.email)}"></div>
              </div>
              <div class="field-row">
                <div class="field"><label class="field-label">Phone</label><input class="input" data-cover-field="contact.phone" value="${escAttr(cover.contact.phone)}"></div>
                <div class="field"><label class="field-label">Location</label><input class="input" data-cover-field="contact.location" value="${escAttr(cover.contact.location)}"></div>
              </div>`
          })}

          ${cvEditorSection({
            iconName: 'mail',
            title: 'Letter',
            body: `
              <div class="field">
                <label class="field-label">Body</label>
                <textarea class="textarea" data-cover-field="body" style="min-height:360px">${esc(cover.body)}</textarea>
                <span class="field-hint">${linkedCV ? `Using details from ${esc(linkedCV.name)}.` : 'Link a CV above to generate a draft with matching skills.'}</span>
              </div>`
          })}
        </div>

        <aside class="preview-pane">
          <div class="preview-toolbar">
            <span>Live preview</span>
            <button class="btn btn-ghost btn-sm" type="button" data-action="copy-cover" data-id="${cover.id}">${icon('copy')} Copy text</button>
          </div>
          <div class="preview-stage" id="cover-preview">${renderCover(cover)}</div>
        </aside>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Profile editor                                                      */
/* ------------------------------------------------------------------ */

function profileInput(item, field, label, placeholder = '', type = 'text') {
  return `
    <div class="field">
      <label class="field-label">${esc(label)}</label>
      <input class="input" type="${type}" data-p-field="${field}" value="${escAttr(item[field] || '')}" placeholder="${escAttr(placeholder)}">
    </div>`;
}

function experienceProfileItem(exp) {
  return `
    <div class="repeat-item" data-profile-exp data-id="${exp.id}">
      <div class="repeat-head">
        <span class="repeat-title">${esc(exp.role || 'New role')}</span>
        <button class="icon-btn" type="button" data-action="remove-profile-item" data-kind="experience" data-id="${exp.id}" aria-label="Remove experience">${icon('trash')}</button>
      </div>
      <div class="field-row">
        ${profileInput(exp, 'role', 'Role', 'Monitoring & Evaluation Officer')}
        ${profileInput(exp, 'company', 'Company', 'Savanna Impact Foundation')}
      </div>
      <div class="field-row field-row--three" style="margin-top:7px">
        ${profileInput(exp, 'location', 'Location', 'Kampala')}
        ${profileInput(exp, 'start', 'Start', 'Feb 2023')}
        ${profileInput(exp, 'end', 'End', 'Present')}
      </div>
      <label class="check-line" style="margin-top:7px"><input type="checkbox" data-p-field="current" ${exp.current ? 'checked' : ''}> I currently work here</label>
      <div class="field" style="margin-top:7px">
        <label class="field-label">Achievement bullets — one per line</label>
        <textarea class="textarea" data-p-field="bullets" style="min-height:90px" placeholder="Built a monthly dashboard used by five programme teams…">${esc(exp.bullets.join('\n'))}</textarea>
      </div>
    </div>`;
}

function educationProfileItem(item) {
  return `
    <div class="repeat-item" data-profile-edu data-id="${item.id}">
      <div class="repeat-head">
        <span class="repeat-title">${esc(item.degree || 'New qualification')}</span>
        <button class="icon-btn" type="button" data-action="remove-profile-item" data-kind="education" data-id="${item.id}" aria-label="Remove education">${icon('trash')}</button>
      </div>
      <div class="field-row">
        ${profileInput(item, 'degree', 'Qualification', 'BA Social Sciences')}
        ${profileInput(item, 'school', 'School', 'Makerere University')}
      </div>
      <div class="field-row field-row--three" style="margin-top:7px">
        ${profileInput(item, 'location', 'Location', 'Kampala')}
        ${profileInput(item, 'start', 'Start', '2016')}
        ${profileInput(item, 'end', 'End', '2020')}
      </div>
      <div class="field" style="margin-top:7px">${profileInput(item, 'detail', 'Detail', 'Upper second class honours')}</div>
    </div>`;
}

function projectProfileItem(item) {
  return `
    <div class="repeat-item" data-profile-project data-id="${item.id}">
      <div class="repeat-head">
        <span class="repeat-title">${esc(item.name || 'New project')}</span>
        <button class="icon-btn" type="button" data-action="remove-profile-item" data-kind="projects" data-id="${item.id}" aria-label="Remove project">${icon('trash')}</button>
      </div>
      <div class="field-row">
        ${profileInput(item, 'name', 'Project name', 'Youth Employment Tracker')}
        ${profileInput(item, 'link', 'Link', 'https://…')}
      </div>
      <div class="field" style="margin-top:7px">
        <label class="field-label">Detail</label>
        <textarea class="textarea" data-p-field="detail" style="min-height:65px">${esc(item.detail || '')}</textarea>
      </div>
    </div>`;
}

function certificationProfileItem(item) {
  return `
    <div class="repeat-item" data-profile-cert data-id="${item.id}">
      <div class="repeat-head">
        <span class="repeat-title">${esc(item.name || 'New certification')}</span>
        <button class="icon-btn" type="button" data-action="remove-profile-item" data-kind="certifications" data-id="${item.id}" aria-label="Remove certification">${icon('trash')}</button>
      </div>
      <div class="field-row field-row--three">
        ${profileInput(item, 'name', 'Name', 'Power BI for Data Analysts')}
        ${profileInput(item, 'issuer', 'Issuer', 'Coursera')}
        ${profileInput(item, 'year', 'Year', '2023')}
      </div>
    </div>`;
}

function languageProfileItem(item) {
  return `
    <div class="repeat-item" data-profile-lang data-id="${item.id}">
      <div class="repeat-head">
        <span class="repeat-title">${esc(item.name || 'New language')}</span>
        <button class="icon-btn" type="button" data-action="remove-profile-item" data-kind="languages" data-id="${item.id}" aria-label="Remove language">${icon('trash')}</button>
      </div>
      <div class="field-row">
        ${profileInput(item, 'name', 'Language', 'Luganda')}
        ${profileInput(item, 'level', 'Level', 'Native')}
      </div>
    </div>`;
}

function viewProfile() {
  const p = state.profile;
  const completeness = profileCompleteness(p);
  return `
    <div class="page">
      <a class="back-link" href="#/studio">${icon('arrow-left')} Back to CV studio</a>
      <header class="page-head">
        <div class="page-head-copy">
          <p class="eyebrow"><span class="dot"></span>Your source of truth</p>
          <h1 class="page-title">Your profile</h1>
          <p class="page-lede">Fill this once. Kazi uses it to build your master CV, tailored versions and cover letters. You can still edit every document separately.</p>
        </div>
        <div class="head-actions">
          <a class="btn btn-outline" href="#/studio">Cancel</a>
          <button class="btn btn-primary" type="submit" form="profile-form">${icon('check')} Save profile</button>
        </div>
      </header>

      <form id="profile-form" class="settings-layout" data-form="profile" novalidate>
        <div class="settings-col">
          ${cvEditorSection({
            iconName: 'user',
            title: 'The basics',
            body: `
              <div class="field-row">
                ${profileInput(p, 'name', 'Full name', 'Amina Nakato')}
                ${profileInput(p, 'headline', 'Professional headline', 'Monitoring & Evaluation Officer')}
              </div>
              <div class="field-row">
                ${profileInput(p, 'email', 'Email', 'you@example.com', 'email')}
                ${profileInput(p, 'phone', 'Phone', '+256 700 000 000', 'tel')}
              </div>
              <div class="field">${profileInput(p, 'location', 'Location', 'Kampala, Uganda')}</div>`
          })}

          ${cvEditorSection({
            iconName: 'link',
            title: 'Links',
            body: `
              <div class="field-row field-row--three">
                ${profileInput(p.links, 'linkedin', 'LinkedIn', 'https://linkedin.com/in/…')}
                ${profileInput(p.links, 'portfolio', 'Portfolio', 'https://…')}
                ${profileInput(p.links, 'website', 'Website', 'https://…')}
              </div>`
          })}

          ${cvEditorSection({
            iconName: 'file',
            title: 'Summary',
            body: `
              <div class="field">
                <label class="field-label">Short professional summary</label>
                <textarea class="textarea" data-p-field="summary" style="min-height:110px" placeholder="What you do, the strengths you bring and the kind of role you want.">${esc(p.summary)}</textarea>
                <span class="field-hint">Aim for 2–4 lines. The CV studio can suggest a version tailored to a specific advert.</span>
              </div>`
          })}

          ${cvEditorSection({
            iconName: 'star',
            title: 'Skills',
            body: `
              <div class="field">
                <label class="field-label">Skills — comma or line separated</label>
                <textarea class="textarea" data-p-field="skills" style="min-height:90px" placeholder="Monitoring and evaluation, Survey design, Power BI, Excel, KoboToolbox">${esc(p.skills.join(', '))}</textarea>
              </div>`
          })}

          ${cvEditorSection({
            iconName: 'briefcase',
            title: 'Experience',
            count: p.experience.length,
            body: `
              ${p.experience.map(experienceProfileItem).join('')}
              <button class="btn btn-outline btn-sm" type="button" data-action="add-profile-item" data-kind="experience">${icon('plus')} Add experience</button>`
          })}

          ${cvEditorSection({
            iconName: 'cv',
            title: 'Education',
            count: p.education.length,
            body: `
              ${p.education.map(educationProfileItem).join('')}
              <button class="btn btn-outline btn-sm" type="button" data-action="add-profile-item" data-kind="education">${icon('plus')} Add education</button>`
          })}

          ${cvEditorSection({
            iconName: 'folder',
            title: 'Projects',
            count: p.projects.length,
            body: `
              ${p.projects.map(projectProfileItem).join('')}
              <button class="btn btn-outline btn-sm" type="button" data-action="add-profile-item" data-kind="projects">${icon('plus')} Add project</button>`
          })}

          ${cvEditorSection({
            iconName: 'shield',
            title: 'Certifications',
            count: p.certifications.length,
            body: `
              ${p.certifications.map(certificationProfileItem).join('')}
              <button class="btn btn-outline btn-sm" type="button" data-action="add-profile-item" data-kind="certifications">${icon('plus')} Add certification</button>`
          })}

          ${cvEditorSection({
            iconName: 'message',
            title: 'Languages',
            count: p.languages.length,
            body: `
              ${p.languages.map(languageProfileItem).join('')}
              <button class="btn btn-outline btn-sm" type="button" data-action="add-profile-item" data-kind="languages">${icon('plus')} Add language</button>`
          })}
        </div>

        <div class="settings-col">
          <section class="card profile-card">
            <div class="profile-card-head">
              <div class="progress-ring" style="--value:${completeness.percent}"><strong>${completeness.percent}%</strong></div>
              <div><h2>Profile strength</h2><p>${completeness.done} of ${completeness.total} checks complete</p></div>
            </div>
            <div class="progress-track"><div class="progress-fill" style="width:${completeness.percent}%"></div></div>
            <div class="ats-list" style="margin-top:12px">
              ${completeness.checks.map(check => `<div class="ats-item ats-item--${check.ok ? 'pass' : 'warn'}"><span class="dot"></span><span>${esc(check.label)}</span></div>`).join('')}
            </div>
          </section>

          <section class="card card--tint card--pad">
            <label class="check-line"><input type="checkbox" id="sync-master" checked> <span><strong>Update my master CV</strong><br>Refresh the master CV with these details. Tailored versions are kept as they are.</span></label>
            <button class="btn btn-primary btn-block" type="submit" form="profile-form" style="margin-top:14px">${icon('check')} Save profile</button>
            <p class="tiny muted" style="margin-top:9px">Saved only in this browser. Export a backup from Settings before switching devices.</p>
          </section>

          <section class="profile-tip">
            <p class="eyebrow" style="margin-bottom:5px"><span class="dot"></span>Writing tip</p>
            <p class="small" style="color:var(--ink-soft);line-height:1.6">Use numbers and outcomes in your bullets: “trained 24 staff” beats “responsible for training”. One achievement per line is easiest for a busy recruiter to scan.</p>
          </section>
        </div>
      </form>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Insights                                                            */
/* ------------------------------------------------------------------ */

function barChart(weeks) {
  const max = Math.max(1, ...weeks.map(week => week.count));
  return `
    <div class="bar-chart" role="img" aria-label="Applications captured or sent per week">
      ${weeks.map((week, index) => `
        <div class="bar-col">
          <span class="bar-value">${week.count}</span>
          <span class="bar-fill" style="height:${Math.max(4, Math.round((week.count / max) * 100))}%"></span>
          <span class="bar-label">${index === weeks.length - 1 ? 'Now' : esc(week.label)}</span>
        </div>`).join('')}
    </div>`;
}

function viewInsights() {
  const stats = computeStats(state);
  const funnel = funnelStats(state);
  const sources = sourceStats(state);
  const performance = deadlinePerformance(state);
  const weeks = weeklyActivity(state, 8);
  const tags = tagCounts(state).slice(0, 10);
  const bestSource = sources.filter(item => item.applications >= 1).sort((a, b) => b.responseRate - a.responseRate || b.applications - a.applications)[0];
  const notes = [];

  if (stats.submitted === 0) {
    notes.push('Mark a role as applied to start measuring response and interview rates.');
  } else if (bestSource && bestSource.responses) {
    notes.push(`${bestSource.source} is your strongest source so far: ${bestSource.responseRate}% response across ${pl(bestSource.applications, 'application')}. Spend more attention there.`);
  } else {
    notes.push('Response rates need a few replies before they mean much. Keep logging every email so the picture gets clearer.');
  }
  if (stats.avgResponseDays != null) {
    notes.push(`Employers reply in about ${pl(stats.avgResponseDays, 'day')} on average. Plan a follow-up after a week of silence.`);
  }
  if (performance.withDeadline) {
    notes.push(`${performance.percent}% of applications with a deadline were sent on time. ${performance.missed ? `${pl(performance.missed, 'deadline')} currently missed.` : 'Nothing missed right now.'}`);
  } else if (stats.missed) {
    notes.push(`${pl(stats.missed, 'deadline')} slipped past while still in capture. A weekly pass through the pipeline keeps that number at zero.`);
  }

  return `
    <div class="page">
      <header class="page-head">
        <div class="page-head-copy">
          <p class="eyebrow"><span class="dot"></span>The honest picture</p>
          <h1 class="page-title">Insights</h1>
          <p class="page-lede">No vanity metrics. Just the numbers that tell you where to spend your effort next.</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-outline" type="button" data-action="export-csv">${icon('download')} Export CSV</button>
          <button class="btn btn-outline" type="button" data-action="export-ics">${icon('calendar')} Calendar</button>
        </div>
      </header>

      <div class="stat-band">
        <div class="stat">
          <p class="stat-label">Response rate</p>
          <p class="stat-value tone-green">${stats.responseRate == null ? '—' : `${stats.responseRate}<span>%</span>`}</p>
          <p class="stat-foot">${stats.responded} of ${stats.submitted} submitted</p>
        </div>
        <div class="stat">
          <p class="stat-label">Interview rate</p>
          <p class="stat-value">${stats.interviewRate == null ? '—' : `${stats.interviewRate}<span>%</span>`}</p>
          <p class="stat-foot">${pl(stats.interviews, 'interview')} so far</p>
        </div>
        <div class="stat">
          <p class="stat-label">Offers</p>
          <p class="stat-value">${stats.offers}</p>
          <p class="stat-foot">${stats.offerRate == null ? 'No submitted applications yet' : `${stats.offerRate}% offer rate`}</p>
        </div>
        <div class="stat">
          <p class="stat-label">Applied on time</p>
          <p class="stat-value">${performance.percent == null ? '—' : `${performance.percent}<span>%</span>`}</p>
          <p class="stat-foot">${performance.missed ? `${pl(performance.missed, 'live deadline')} missed` : 'No live deadlines missed'}</p>
        </div>
      </div>

      <div class="insight-grid">
        <section class="card chart-card">
          <div class="chart-head">
            <div><h2>Weekly activity</h2><p>Applications captured or sent, last eight weeks</p></div>
            <span class="pill pill--green pill--plain">${stats.applicationsThisWeek} this week</span>
          </div>
          ${barChart(weeks)}
        </section>

        <section class="card chart-card">
          <div class="chart-head">
            <div><h2>From sent to offer</h2><p>Where the pipeline narrows</p></div>
            <span class="pill pill--neutral pill--plain">${stats.submitted} submitted</span>
          </div>
          <div class="funnel">
            ${funnel.map(item => `
              <div class="funnel-row">
                <span class="funnel-label">${esc(item.label)}</span>
                <span class="funnel-track"><span class="funnel-fill" style="width:${Math.max(item.count ? 4 : 0, item.percent)}%">${item.count && item.percent >= 18 ? item.count : ''}</span></span>
                <span class="funnel-value">${item.count} · ${item.percent}%</span>
              </div>`).join('')}
          </div>
          <p class="tiny muted" style="margin-top:14px">Percentages are relative to submitted applications.</p>
        </section>

        <section class="card chart-card">
          <div class="chart-head">
            <div><h2>Where jobs come from</h2><p>Response and interview rate by source</p></div>
          </div>
          ${sources.length ? `
            <div style="overflow-x:auto">
              <table class="source-table">
                <thead><tr><th>Source</th><th>Sent</th><th>Replies</th><th>Rate</th></tr></thead>
                <tbody>${sources.map(source => `
                  <tr>
                    <td>${esc(source.source)}</td>
                    <td>${source.applications}</td>
                    <td>${source.responses}</td>
                    <td>${source.responseRate}% <span class="rate-bar"><i style="width:${source.responseRate}%"></i></span></td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>` : '<p class="small muted">No submitted applications yet. Add applications and log replies to see source performance.</p>'}
        </section>

        <section class="card chart-card">
          <div class="chart-head"><div><h2>What this is telling you</h2><p>Small signals you can act on</p></div></div>
          <div class="insight-notes">
            ${notes.map((note, index) => `<div class="insight-note"><span class="insight-index">${String(index + 1).padStart(2, '0')}</span><span>${esc(note)}</span></div>`).join('')}
          </div>
          ${tags.length ? `<div class="tag-row" style="margin-top:15px">${tags.map(([tag, count]) => `<span class="tag">${esc(tag)} · ${count}</span>`).join('')}</div>` : ''}
        </section>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

function viewPeople() {
  const people = new Map();
  for (const app of state.applications.filter(item => !item.archived)) {
    const contact = app.contact || {};
    if (!contact.name && !contact.email && !contact.phone) continue;
    const key = (contact.email || contact.name || contact.phone).toLowerCase();
    if (!people.has(key)) {
      people.set(key, {
        name: contact.name || contact.email || 'Contact',
        role: contact.role || '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: app.company || '',
        apps: []
      });
    }
    const person = people.get(key);
    if (!person.role && contact.role) person.role = contact.role;
    if (!person.company && app.company) person.company = app.company;
    person.apps.push(app);
  }
  const list = [...people.values()].sort((a, b) => a.name.localeCompare(b.name));

  return `
    <div class="page">
      <header class="page-head">
        <div class="page-head-copy">
          <p class="eyebrow"><span class="dot"></span>${pl(list.length, 'contact')}</p>
          <h1 class="page-title">People</h1>
          <p class="page-lede">The human side of the pipeline. Keep recruiters and hiring managers close, with every application they are connected to.</p>
        </div>
        <div class="head-actions">
          <button class="btn btn-primary" type="button" data-action="capture">${icon('plus')} Capture a job</button>
        </div>
      </header>

      ${list.length ? `
        <div class="people-grid">
          ${list.map(person => `
            <article class="card person-card">
              <div class="person-card-head">
                ${avatar(person.name, 'avatar--square', colorFor(person.name))}
                <div>
                  <p class="person-name">${esc(person.name)}</p>
                  <p class="person-role">${esc([person.role, person.company].filter(Boolean).join(' · ') || 'Contact')}</p>
                </div>
              </div>
              <div class="person-links">
                ${person.email ? `<a href="mailto:${escAttr(person.email)}">${icon('mail')}${esc(person.email)}</a>` : ''}
                ${person.phone ? `<a href="tel:${escAttr(person.phone.replace(/[^\d+]/g, ''))}">${icon('message')}${esc(person.phone)}</a>` : ''}
              </div>
              <div class="person-apps">
                ${person.apps.slice(0, 4).map(app => `
                  <a class="person-app" href="#/jobs/${app.id}">
                    <span>${esc(app.role || 'Untitled role')}</span>
                    ${statusPill(app.status)}
                  </a>`).join('')}
              </div>
            </article>`).join('')}
        </div>` : emptyState({
          iconName: 'users',
          title: 'No contacts saved yet',
          text: 'Add a recruiter or hiring manager when you capture a job. Their details will collect here automatically.',
          action: '<button class="btn btn-primary" type="button" data-action="capture">Capture a job</button>'
        })}
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function notificationState() {
  if (!('Notification' in window)) return { label: 'Not supported', enabled: false };
  if (Notification.permission === 'granted') return { label: 'Enabled', enabled: true };
  if (Notification.permission === 'denied') return { label: 'Blocked in browser', enabled: false };
  return { label: 'Not enabled', enabled: false };
}

function viewSettings() {
  const completeness = profileCompleteness(state.profile);
  const bytes = storageSize();
  const notifications = notificationState();
  const demoCount = state.applications.filter(app => app.isDemo).length;

  return `
    <div class="page">
      <header class="page-head">
        <div class="page-head-copy">
          <p class="eyebrow"><span class="dot"></span>Make it yours</p>
          <h1 class="page-title">Settings</h1>
          <p class="page-lede">Your workspace, your data, your rules. No account, no tracking. Records stay in this browser; AI is off until you choose it.</p>
        </div>
        <div class="head-actions">
          <a class="btn btn-outline" href="#/studio/profile">${icon('user')} Edit profile</a>
          <button class="btn btn-primary" type="button" data-action="export-backup">${icon('download')} Back up</button>
        </div>
      </header>

      ${demoBanner()}

      <div class="settings-layout">
        <div class="settings-col">
          <section class="card settings-section">
            <div class="settings-section-head"><h2>Workspace</h2><p>Defaults for your day-to-day pipeline.</p></div>
            <div class="settings-body">
              <div class="setting-row">
                <div class="setting-copy"><strong>Deadline and interview reminders</strong><span>Show a daily notification when something needs attention. Requires browser permission.</span></div>
                <label class="switch"><input type="checkbox" id="pref-reminders" ${state.settings.reminders ? 'checked' : ''} aria-label="Enable reminders"><span></span></label>
              </div>
              <div class="setting-row">
                <div class="setting-copy"><strong>Remind me before</strong><span>Used when exporting to a calendar as well.</span></div>
                <select class="toolbar-select" id="pref-reminder-days" aria-label="Reminder lead time">
                  ${[1, 2, 3, 7].map(days => `<option value="${days}" ${Number(state.settings.reminderDays) === days ? 'selected' : ''}>${days} day${days === 1 ? '' : 's'}</option>`).join('')}
                </select>
              </div>
              <div class="setting-row">
                <div class="setting-copy"><strong>Hide the sample-data banner</strong><span>You can still manage demo data below.</span></div>
                <label class="switch"><input type="checkbox" id="pref-hide-demo" ${state.settings.hideDemoBanner ? 'checked' : ''} aria-label="Hide demo banner"><span></span></label>
              </div>
              <div class="setting-row">
                <div class="setting-copy"><strong>AI assistance</strong><span>Optional. When you choose an AI action, only the text involved is sent to this deployment's AI endpoint. Nothing is sent in the background.</span></div>
                <label class="switch"><input type="checkbox" id="pref-ai" ${state.settings.ai ? 'checked' : ''} aria-label="Enable AI assistance"><span></span></label>
              </div>
              <p class="tiny muted" style="padding-top:10px">AI needs a key configured on the hosted app. Every other feature keeps working without it.</p>
            </div>
          </section>

          <section class="card settings-section">
            <div class="settings-section-head"><h2>Your data</h2><p>Local-first. Back up before changing phones or clearing your browser.</p></div>
            <div class="settings-body">
              <div class="setting-row">
                <div class="setting-copy"><strong>Local storage used</strong><span>Applications, CVs and notes in this browser. Attachments are stored separately.</span>
                  <div class="storage-meter"><span class="progress-track"><span class="progress-fill" style="width:${Math.min(100, Math.round((bytes / (5 * 1024 * 1024)) * 100))}%"></span></span><span>${esc(formatBytes(bytes))}</span></div>
                </div>
              </div>
              <div class="data-actions">
                <button class="btn btn-outline btn-sm" type="button" data-action="export-backup">${icon('download')} Full backup</button>
                <button class="btn btn-outline btn-sm" type="button" data-action="export-csv">${icon('file')} CSV</button>
                <button class="btn btn-outline btn-sm" type="button" data-action="export-ics">${icon('calendar')} Calendar</button>
                <label class="btn btn-outline btn-sm" style="margin:0">${icon('upload')} Restore backup<input class="sr-only" type="file" id="import-backup" accept="application/json,.json"></label>
                <label class="btn btn-outline btn-sm" style="margin:0">${icon('upload')} Import CSV<input class="sr-only" type="file" id="import-csv" accept=".csv,text/csv"></label>
              </div>
              <p class="tiny muted" style="padding-top:9px">Last backup: ${state.meta.lastExportAt ? esc(formatDateTime(state.meta.lastExportAt)) : 'never'}. A full backup includes attachments.</p>
            </div>
          </section>

          <section class="card settings-section">
            <div class="settings-section-head"><h2>Sample workspace</h2><p>Try Kazi with realistic examples before adding your own.</p></div>
            <div class="settings-body">
              <div class="setting-row">
                <div class="setting-copy"><strong>${state.meta.demo ? 'Sample data is loaded' : 'No sample data loaded'}</strong><span>${state.meta.demo ? `${demoCount} sample applications and a demo profile. Your own records stay untouched.` : 'Load eight applications, two CVs and a cover letter to explore.'}</span></div>
                <div class="data-actions" style="padding:0">
                  <button class="btn btn-outline btn-sm" type="button" data-action="load-demo">${state.meta.demo ? 'Reload sample' : 'Load sample'}</button>
                  ${state.meta.demo ? '<button class="btn btn-ghost btn-sm" type="button" data-action="clear-demo">Remove sample</button>' : ''}
                </div>
              </div>
            </div>
          </section>

          <section class="card settings-section danger-zone">
            <div class="settings-section-head"><h2>Danger zone</h2><p>Start over completely. This cannot be undone.</p></div>
            <div class="settings-body">
              <div class="setting-row">
                <div class="setting-copy"><strong>Erase this workspace</strong><span>Deletes every application, CV, cover letter and attachment from this browser.</span></div>
                <button class="btn btn-danger btn-sm" type="button" data-action="reset-workspace">${icon('trash')} Erase all data</button>
              </div>
            </div>
          </section>
        </div>

        <div class="settings-col">
          <section class="card profile-card">
            <div class="profile-card-head">
              ${avatar(state.profile.name || '?', 'avatar--square')}
              <div><h2>${esc(state.profile.name || 'Your profile')}</h2><p>${esc(state.profile.headline || 'No headline yet')}</p></div>
            </div>
            <div class="progress-track" style="margin-top:13px"><div class="progress-fill" style="width:${completeness.percent}%"></div></div>
            <p class="tiny muted" style="margin-top:7px">${completeness.percent}% complete · ${esc(state.profile.email || 'No email added')}</p>
            <div class="data-actions" style="padding-bottom:0"><a class="btn btn-outline btn-sm" href="#/studio/profile">${icon('edit')} Edit profile</a></div>
          </section>

          <section class="card settings-section">
            <div class="settings-section-head"><h2>Reminders</h2><p>${esc(notifications.label)}</p></div>
            <div class="settings-body">
              <p class="small muted" style="padding:10px 0">${notifications.enabled ? 'Kazi can show one quiet reminder per day when a deadline or interview needs you. No emails, no account.' : 'Allow browser notifications to get a single daily nudge when a deadline or interview is close.'}</p>
              ${!notifications.enabled ? `<button class="btn btn-outline btn-sm" type="button" data-action="enable-notifications">${icon('bell')} Enable notifications</button>` : ''}
            </div>
          </section>

          <section class="card about-card">
            <span class="brand-mark" aria-hidden="true"></span>
            <h2>Kazi</h2>
            <p>Job search, under control. A private, phone-first command centre for the opportunities that arrive in WhatsApp, email and the spaces in between.</p>
            <div class="about-links">
              <a class="text-link" href="#/insights">Insights</a>
              <a class="text-link" href="#/calendar">Calendar</a>
              <a class="text-link" href="#/studio">CV studio</a>
            </div>
            <p class="tiny muted" style="margin-top:12px">Version 1.0 · Local-first</p>
          </section>
        </div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* More (mobile)                                                       */
/* ------------------------------------------------------------------ */

function viewMore() {
  const links = [
    { href: '#/calendar', iconName: 'calendar', title: 'Calendar', copy: 'Deadlines and interviews' },
    { href: '#/people', iconName: 'users', title: 'People', copy: 'Recruiters and contacts' },
    { href: '#/insights', iconName: 'chart', title: 'Insights', copy: 'Rates, sources and progress' },
    { href: '#/studio/profile', iconName: 'user', title: 'Profile', copy: 'Your CV source of truth' },
    { href: '#/settings', iconName: 'settings', title: 'Settings', copy: 'Data, reminders and backup' }
  ];
  const completeness = profileCompleteness(state.profile);
  return `
    <div class="page more-page">
      <header class="page-head">
        <div class="page-head-copy">
          <p class="eyebrow"><span class="dot"></span>Everything else</p>
          <h1 class="page-title">More</h1>
          <p class="page-lede">The rest of your workspace, one tap away.</p>
        </div>
      </header>

      <div class="more-grid">
        ${links.map(link => `
          <a class="more-link" href="${link.href}">
            <span class="more-icon">${icon(link.iconName)}</span>
            <span class="more-copy"><strong>${esc(link.title)}</strong><span>${esc(link.copy)}</span></span>
            ${icon('chevron-right')}
          </a>`).join('')}
      </div>

      <section class="card profile-card">
        <div class="profile-card-head">
          ${avatar(state.profile.name || '?', 'avatar--square')}
          <div><h2>${esc(state.profile.name || 'Your profile')}</h2><p>${esc(state.profile.headline || 'Add your details to strengthen every CV')}</p></div>
        </div>
        <div class="progress-track" style="margin-top:13px"><div class="progress-fill" style="width:${completeness.percent}%"></div></div>
        <p class="tiny muted" style="margin-top:7px">${completeness.percent}% complete</p>
      </section>

      <div class="data-actions more-actions">
        <button class="btn btn-primary" type="button" data-action="capture">${icon('plus')} Capture a job</button>
        <button class="btn btn-outline" type="button" data-action="log-reply">${icon('mail')} Log a reply</button>
        <button class="btn btn-outline" type="button" data-action="export-backup">${icon('download')} Back up data</button>
      </div>

      <p class="more-footnote">Kazi keeps your job search in this browser. No account, no tracking.</p>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Print routes                                                        */
/* ------------------------------------------------------------------ */

function viewPrint(kind, id) {
  const document = kind === 'cv' ? getCV(state, id) : getCover(state, id);
  if (!document) return notFound();
  const isCV = kind === 'cv';
  return `
    <div class="print-view">
      <div class="print-toolbar">
        <a class="back-link" href="${isCV ? `#/studio/cv/${id}` : `#/studio/cover/${id}`}">${icon('arrow-left')} Back to editor</a>
        <button class="btn btn-outline btn-sm" type="button" data-action="download-${isCV ? 'cv' : 'cover'}" data-id="${id}">${icon('download')} Word file</button>
        <button class="btn btn-primary btn-sm" type="button" data-action="do-print">${icon('printer')} Print / save PDF</button>
      </div>
      <div class="print-stage">
        <div class="print-sheet">
          ${isCV ? renderCV(document, { forPrint: true }) : renderCover(document)}
        </div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Modal forms                                                         */
/* ------------------------------------------------------------------ */

function selectOptions(values, selected) {
  return values.map(value => `<option value="${escAttr(value)}" ${selected === value ? 'selected' : ''}>${esc(value)}</option>`).join('');
}

function captureFieldsHTML() {
  return `
    <div class="form-grid">
      <div class="field"><label class="field-label">Role <span class="req">*</span></label><input class="input" id="capture-role" name="role" placeholder="Monitoring & Evaluation Officer"></div>
      <div class="field"><label class="field-label">Company <span class="req">*</span></label><input class="input" id="capture-company" name="company" placeholder="Savanna Health Initiative"></div>
      <div class="field"><label class="field-label">Deadline</label><input class="input" id="capture-deadline" name="deadline" type="date"></div>
      <div class="field"><label class="field-label">Stage</label><select class="select" name="status"><option value="captured">Captured — needs review</option><option value="to_apply">To apply</option><option value="applied">Applied</option></select></div>
      <div class="field"><label class="field-label">Next step date</label><input class="input" name="nextActionDate" type="date"></div>
      <div class="field span-2"><label class="field-label">Next step</label><input class="input" name="nextAction" placeholder="Review the advert and tailor your CV"></div>
    </div>

    <details class="capture-more">
      <summary>
        <span>More detail</span>
        <span class="mono capture-more-hint">Optional<span class="summary-plus" aria-hidden="true"></span></span>
      </summary>
      <div class="form-grid">
        <div class="field"><label class="field-label">Deadline time</label><input class="input" id="capture-deadline-time" name="deadlineTime" type="time"></div>
        <div class="field"><label class="field-label">Source</label><input class="input" id="capture-source" name="source" list="source-list" placeholder="WhatsApp"><datalist id="source-list"><option value="WhatsApp"><option value="LinkedIn"><option value="Email"><option value="Referral"><option value="ReliefWeb"><option value="BrighterMonday"><option value="Direct"></datalist></div>
        <div class="field span-2"><label class="field-label">Link</label><input class="input" id="capture-url" name="url" type="url" placeholder="https://…"></div>
        <div class="field"><label class="field-label">Application email</label><input class="input" id="capture-email" name="applicationEmail" type="email" placeholder="jobs@company.com"></div>
        <div class="field"><label class="field-label">Priority</label><select class="select" name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></div>
        <div class="field"><label class="field-label">Location</label><input class="input" id="capture-location" name="location" placeholder="Kampala, Uganda"></div>
        <div class="field"><label class="field-label">Work mode</label><select class="select" name="workMode"><option value="">Not set</option><option value="On-site">On-site</option><option value="Hybrid">Hybrid</option><option value="Remote">Remote</option></select></div>
        <div class="field"><label class="field-label">Salary</label><input class="input" id="capture-salary" name="salary" placeholder="UGX 3.5M monthly"></div>
        <div class="field"><label class="field-label">Tags</label><input class="input" id="capture-tags" name="tags" placeholder="Data & research, Urgent"></div>
        <div class="field"><label class="field-label">Contact name</label><input class="input" name="contactName" placeholder="Grace Namusoke"></div>
        <div class="field"><label class="field-label">Contact email</label><input class="input" name="contactEmail" type="email" placeholder="grace@company.com"></div>
        <div class="field"><label class="field-label">Contact phone</label><input class="input" name="contactPhone" type="tel" placeholder="+256 …"></div>
        <div class="field span-2"><label class="field-label">Notes</label><input class="input" name="notes" placeholder="Anything worth remembering"></div>
        <div class="field span-2"><label class="field-label">Original message / job description</label><textarea class="textarea" id="capture-description" name="jobDescription" style="min-height:120px" placeholder="Paste the full advert or keep the original message here."></textarea></div>
      </div>
    </details>`;
}

function openCaptureModal({ tab = 'paste', text = '', files = [] } = {}) {
  ui.sharedFiles = files;
  const sharedNames = files.map(file => file.name).join(', ');
  openModal({
    eyebrow: 'Capture',
    title: 'Add a job',
    sub: 'Paste the WhatsApp message, a link or a screenshot. You can check every field before saving.',
    wide: true,
    body: `
      <form id="capture-form" data-form="capture" novalidate>
        <div class="capture-tabs" role="tablist" aria-label="Capture method">
          <button type="button" class="${tab === 'paste' ? 'is-active' : ''}" data-action="capture-tab" data-tab="paste" role="tab" aria-selected="${tab === 'paste'}">${icon('message')} Paste</button>
          <button type="button" class="${tab === 'screenshot' ? 'is-active' : ''}" data-action="capture-tab" data-tab="screenshot" role="tab" aria-selected="${tab === 'screenshot'}">${icon('camera')} Screenshot</button>
          <button type="button" class="${tab === 'manual' ? 'is-active' : ''}" data-action="capture-tab" data-tab="manual" role="tab" aria-selected="${tab === 'manual'}">${icon('edit')} Manual</button>
        </div>

        <div data-capture-panel="paste" ${tab === 'paste' ? '' : 'hidden'}>
          <div class="field">
            <label class="field-label" for="capture-text">WhatsApp message, email or job link</label>
            <textarea class="textarea" id="capture-text" style="min-height:120px" placeholder="Paste the forwarded message here…">${esc(text)}</textarea>
            <span class="field-hint">Kazi looks for a role, company, deadline, pay, location and application email.</span>
          </div>
          <div class="data-actions" style="padding-top:0">
            <button class="btn btn-primary btn-sm" type="button" data-action="parse-capture">${icon('message')} Read this message</button>
            ${state.settings.ai ? `<button class="btn btn-outline btn-sm" type="button" data-action="parse-capture-ai">${icon('target')} Read with AI</button>` : ''}
            <span class="tiny muted">${state.settings.ai ? 'The local read stays here. AI sends only this message.' : 'Nothing leaves your browser.'}</span>
          </div>
        </div>

        <div data-capture-panel="screenshot" ${tab === 'screenshot' ? '' : 'hidden'}>
          <label class="file-drop">
            <input type="file" id="capture-file" accept="image/*,.pdf" multiple>
            ${icon('upload')}
            <strong>Add a screenshot or PDF</strong>
            <span>It is saved as evidence with the application. Fill in the role and company below — screenshots are not read automatically.</span>
          </label>
          <div id="capture-file-status" style="margin-top:9px">
            ${sharedNames ? `<div class="attached-file">${icon('paperclip')}<span>${esc(sharedNames)}</span></div>` : ''}
          </div>
        </div>

        <div data-capture-panel="manual" ${tab === 'manual' ? '' : 'hidden'}>
          <p class="capture-hint">${icon('edit')}<span>Only the role and company are essential. Everything else can wait.</span></p>
        </div>

        <div id="capture-preview"></div>

        <div>
          <div class="capture-step">Check the details</div>
          ${captureFieldsHTML()}
        </div>
      </form>`,
    footer: `
      <span class="modal-foot-note">Private to this browser · you can edit everything later</span>
      <button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button>
      <button class="btn btn-primary" type="submit" form="capture-form">${icon('check')} Save to pipeline</button>`
  });

  if (text.trim()) {
    window.requestAnimationFrame(() => {
      const textarea = document.getElementById('capture-text');
      if (textarea && textarea.value.trim().length > 10) runCaptureParse();
    });
  }
}

function parsePreviewHTML(result, usedAI = false) {
  const detected = [];
  if (result.role) detected.push(['Role', result.role]);
  if (result.company) detected.push(['Company', result.company]);
  if (result.deadline) detected.push(['Deadline', formatDate(result.deadline)]);
  if (result.location) detected.push(['Location', result.location]);
  if (result.salary) detected.push(['Salary', result.salary]);
  if (result.source) detected.push(['Source', result.source]);
  if (result.applicationEmail) detected.push(['Email', result.applicationEmail]);
  return `
    <div class="parse-preview">
      <h3>${icon('check')} ${usedAI ? 'Message read with AI' : 'Message read'}</h3>
      <p>${detected.length} detail${detected.length === 1 ? '' : 's'} found. Edit anything that looks wrong below.</p>
      ${detected.length ? `<dl class="detected-grid">${detected.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : ''}
      ${result.warnings.length ? `<div class="form-note form-note--warn" style="margin-top:9px">${icon('alert')}<span>${result.warnings.map(esc).join(' ')}</span></div>` : '<div class="form-note form-note--green" style="margin-top:9px">' + icon('check') + '<span>Role, company and deadline all found.</span></div>'}
    </div>`;
}

function mergeAIParse(local, ai) {
  const merged = { ...local };
  for (const key of ['role', 'company', 'deadline', 'deadlineTime', 'location', 'salary', 'applicationEmail', 'url', 'source', 'workMode']) {
    if (ai[key]) merged[key] = ai[key];
  }
  if (ai.tags?.length) merged.tags = [...new Set([...ai.tags, ...(local.tags || [])])].slice(0, 5);
  merged.warnings = [];
  if (!merged.role) merged.warnings.push('No job title found — add it before saving.');
  if (!merged.company) merged.warnings.push('No company found — add it before saving.');
  if (!merged.deadline) merged.warnings.push('No deadline found — add one so Kazi can chase it.');
  return merged;
}

async function runCaptureParse({ useAI = false } = {}) {
  const textarea = document.getElementById('capture-text');
  if (!textarea) return;
  const text = textarea.value.trim();
  if (!text) {
    toast('Paste a message or link first.', 'error');
    textarea.focus();
    return;
  }
  let result = parseJobMessage(text);
  let usedAI = false;
  if (useAI) {
    try {
      const ai = await aiParseJob(text);
      result = mergeAIParse(result, ai);
      usedAI = true;
    } catch (error) {
      toast(`${error.message} Showing the local read instead.`, 'error');
    }
  }
  ui.captureParse = result;
  const set = (id, value) => {
    const input = document.getElementById(id);
    if (input && value) input.value = value;
  };
  set('capture-role', result.role);
  set('capture-company', result.company);
  set('capture-deadline', result.deadline);
  set('capture-deadline-time', result.deadlineTime);
  set('capture-location', result.location);
  set('capture-salary', result.salary);
  set('capture-url', result.url);
  set('capture-email', result.applicationEmail);
  set('capture-source', result.source);
  set('capture-description', result.description);
  if (result.workMode) {
    const select = document.querySelector('#capture-form select[name="workMode"]');
    if (select) select.value = result.workMode;
  }
  if (result.tags?.length) set('capture-tags', result.tags.join(', '));
  const preview = document.getElementById('capture-preview');
  if (preview) {
    preview.innerHTML = parsePreviewHTML(result, usedAI);
    window.requestAnimationFrame(() => preview.scrollIntoView({ block: 'nearest' }));
  }
  const tabs = document.querySelectorAll('.capture-tabs button');
  tabs.forEach(button => {
    button.classList.toggle('is-active', button.dataset.tab === 'paste');
    button.setAttribute('aria-selected', String(button.dataset.tab === 'paste'));
  });
  document.querySelectorAll('[data-capture-panel]').forEach(panel => {
    panel.hidden = panel.dataset.capturePanel !== 'paste';
  });
}

function editFieldsHTML(app) {
  const workModes = ['', 'On-site', 'Hybrid', 'Remote'];
  return `
    <div class="form-grid">
      <div class="field"><label class="field-label">Role <span class="req">*</span></label><input class="input" name="role" value="${escAttr(app.role)}"></div>
      <div class="field"><label class="field-label">Company <span class="req">*</span></label><input class="input" name="company" value="${escAttr(app.company)}"></div>
      <div class="field"><label class="field-label">Stage</label><select class="select" name="status">${STATUS_KEYS.map(key => `<option value="${key}" ${app.status === key ? 'selected' : ''}>${esc(STATUSES[key].label)}</option>`).join('')}</select></div>
      <div class="field"><label class="field-label">Priority</label><select class="select" name="priority"><option value="normal" ${app.priority === 'normal' ? 'selected' : ''}>Normal</option><option value="high" ${app.priority === 'high' ? 'selected' : ''}>High</option><option value="low" ${app.priority === 'low' ? 'selected' : ''}>Low</option></select></div>
      <div class="field"><label class="field-label">Deadline</label><input class="input" name="deadline" type="date" value="${escAttr(app.deadline)}"></div>
      <div class="field"><label class="field-label">Deadline time</label><input class="input" name="deadlineTime" type="time" value="${escAttr(app.deadlineTime)}"></div>
      <div class="field"><label class="field-label">Applied on</label><input class="input" name="appliedAt" type="date" value="${escAttr(app.appliedAt)}"></div>
      <div class="field"><label class="field-label">Source</label><input class="input" name="source" list="edit-source-list" value="${escAttr(app.source)}"><datalist id="edit-source-list"><option value="WhatsApp"><option value="LinkedIn"><option value="Email"><option value="Referral"><option value="ReliefWeb"><option value="BrighterMonday"><option value="Direct"></datalist></div>
      <div class="field span-2"><label class="field-label">Job advert link</label><input class="input" name="url" type="url" value="${escAttr(app.url)}"></div>
      <div class="field span-2"><label class="field-label">Application email</label><input class="input" name="applicationEmail" type="email" value="${escAttr(app.applicationEmail)}"></div>
      <div class="field"><label class="field-label">Location</label><input class="input" name="location" value="${escAttr(app.location)}"></div>
      <div class="field"><label class="field-label">Work mode</label><select class="select" name="workMode">${workModes.map(mode => `<option value="${mode}" ${app.workMode === mode ? 'selected' : ''}>${mode || 'Not set'}</option>`).join('')}</select></div>
      <div class="field"><label class="field-label">Salary</label><input class="input" name="salary" value="${escAttr(app.salary)}"></div>
      <div class="field"><label class="field-label">Tags</label><input class="input" name="tags" value="${escAttr(app.tags.join(', '))}" placeholder="Data & research, Urgent"></div>
      <div class="field"><label class="field-label">Contact name</label><input class="input" name="contactName" value="${escAttr(app.contact.name)}"></div>
      <div class="field"><label class="field-label">Contact role</label><input class="input" name="contactRole" value="${escAttr(app.contact.role)}"></div>
      <div class="field"><label class="field-label">Contact email</label><input class="input" name="contactEmail" type="email" value="${escAttr(app.contact.email)}"></div>
      <div class="field"><label class="field-label">Contact phone</label><input class="input" name="contactPhone" type="tel" value="${escAttr(app.contact.phone)}"></div>
      <div class="field span-2"><label class="field-label">Next step</label><input class="input" name="nextAction" value="${escAttr(app.nextAction)}" placeholder="Follow up about the interview timeline"></div>
      <div class="field"><label class="field-label">Next step date</label><input class="input" name="nextActionDate" type="date" value="${escAttr(app.nextActionDate)}"></div>
      <div class="field"><label class="field-label">Follow-up date</label><input class="input" name="followUpDate" type="date" value="${escAttr(app.followUpDate)}"></div>
      <div class="field"><label class="field-label">Interview date</label><input class="input" name="interviewDate" type="date" value="${escAttr(app.interviewDate)}"></div>
      <div class="field"><label class="field-label">Interview time</label><input class="input" name="interviewTime" type="time" value="${escAttr(app.interviewTime)}"></div>
      <div class="field span-2"><label class="field-label">Notes</label><textarea class="textarea" name="notes" style="min-height:80px">${esc(app.notes)}</textarea></div>
      <div class="field span-2"><label class="field-label">Job description</label><textarea class="textarea" name="jobDescription" style="min-height:140px">${esc(app.jobDescription)}</textarea></div>
    </div>`;
}

function openEditModal(appId) {
  const app = getApplication(state, appId);
  if (!app) return;
  openModal({
    eyebrow: 'Edit application',
    title: app.role || 'Untitled role',
    sub: 'Keep the facts current. This is also where you can change the stage or move a deadline.',
    wide: true,
    body: `<form id="edit-job-form" data-form="edit-job"><input type="hidden" name="id" value="${app.id}">${editFieldsHTML(app)}</form>`,
    footer: `
      <button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button>
      <button class="btn btn-primary" type="submit" form="edit-job-form">${icon('check')} Save changes</button>`
  });
}

function localDateTimeValue(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function openReplyModal(appId = '') {
  const apps = state.applications.filter(app => !app.archived).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  if (!apps.length) {
    toast('Capture a job first, then log the reply against it.', 'error');
    return;
  }
  const selected = getApplication(state, appId) || apps[0];
  ui.replyAnalysis = null;
  openModal({
    eyebrow: 'Email reply',
    title: 'Log a reply',
    sub: 'Paste the email. Kazi labels the intent, spots dates and suggests the next move.',
    wide: true,
    body: `
      <form id="reply-form" data-form="reply" novalidate>
        <div class="field">
          <label class="field-label">Application</label>
          <select class="select" name="applicationId">
            ${apps.map(app => `<option value="${app.id}" ${app.id === selected.id ? 'selected' : ''}>${esc(app.role || 'Untitled')} — ${esc(app.company || 'No company')}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="reply-body">Email text</label>
          <textarea class="textarea reply-body-input" id="reply-body" name="body" placeholder="Dear Amina, thank you for your application. We would like to invite you for an interview on 14 November at 10:30am…"></textarea>
        </div>
        <div class="data-actions" style="padding:0">
          <button class="btn btn-outline btn-sm" type="button" data-action="reply-analyse">${icon('mail')} Read this reply</button>
          <span class="tiny muted">Detects offers, rejections, interviews and assessments.</span>
        </div>
        <div id="reply-analysis"></div>
        <div class="field-row">
          <div class="field"><label class="field-label">From</label><input class="input" name="from" value="${escAttr(selected.contact.name)}" placeholder="Recruiter or hiring manager"></div>
          <div class="field"><label class="field-label">Received</label><input class="input" name="at" type="datetime-local" value="${localDateTimeValue()}"></div>
        </div>
        <div class="field"><label class="field-label">Subject</label><input class="input" name="subject" placeholder="Interview invitation"></div>
      </form>`,
    footer: `
      <button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button>
      <button class="btn btn-primary" type="submit" form="reply-form">${icon('check')} Log reply</button>`
  });
  window.requestAnimationFrame(() => {
    const body = document.getElementById('reply-body');
    if (body) body.focus();
  });
}

function renderReplyAnalysis(analysis, app) {
  const target = analysis.suggestedStatus;
  const nextDate = analysis.suggestedNextActionDate || todayISO();
  return `
    <div class="intent-banner">
      <span class="intent-icon">${icon(analysis.intent === 'offer' ? 'star' : analysis.intent === 'rejection' ? 'x' : analysis.intent === 'interview' ? 'calendar' : 'mail')}</span>
      <div>
        <h3>${esc(INTENT_LABELS[analysis.intent] || 'Reply')} detected</h3>
        <p>${esc(analysis.confidence)} confidence${analysis.dates.length ? ` · ${analysis.dates.length} date${analysis.dates.length === 1 ? '' : 's'} found` : ''}</p>
      </div>
    </div>
    ${target && target !== app.status ? `<label class="check-line"><input type="checkbox" id="reply-update-status" name="updateStatus" checked> Move application from <strong>${esc(statusMeta(app.status).label)}</strong> to <strong>${esc(statusMeta(target).label)}</strong></label>` : ''}
    <label class="check-line"><input type="checkbox" name="setNext" checked> <span><strong>Next step:</strong> ${esc(analysis.suggestedNextAction)}</span></label>
    <div class="field-row">
      <div class="field"><label class="field-label">Next action</label><input class="input" name="nextAction" value="${escAttr(analysis.suggestedNextAction)}"></div>
      <div class="field"><label class="field-label">Date</label><input class="input" name="nextActionDate" type="date" value="${escAttr(nextDate)}"></div>
    </div>
    ${analysis.dates.length ? `<div class="form-note">${icon('calendar')}<span>Dates found: ${analysis.dates.map(date => esc(`${formatDate(date.iso)}${date.time ? ` at ${formatTime(date.time)}` : ''}`)).join(', ')}</span></div>` : ''}`;
}

function runReplyAnalysis() {
  const form = document.getElementById('reply-form');
  if (!form) return;
  const bodyEl = document.getElementById('reply-body');
  const text = bodyEl.value.trim();
  if (!text) {
    toast('Paste the email text first.', 'error');
    bodyEl.focus();
    return;
  }
  const app = getApplication(state, form.querySelector('[name="applicationId"]').value);
  const analysis = classifyReply(text);
  ui.replyAnalysis = { ...analysis, appId: app?.id || null };
  const from = form.querySelector('[name="from"]');
  if (from && !from.value.trim() && analysis.contactName) from.value = analysis.contactName;
  const subject = form.querySelector('[name="subject"]');
  if (subject && !subject.value.trim()) subject.value = INTENT_LABELS[analysis.intent] || 'Reply';
  document.getElementById('reply-analysis').innerHTML = renderReplyAnalysis(analysis, app || makeApplication({ role: '', company: '' }));
}

function openTailorModal(appId) {
  const app = getApplication(state, appId);
  if (!app) return;
  const defaultName = `${app.role || 'Role'} — ${app.company || 'Company'}`;
  openModal({
    eyebrow: 'Tailor a CV',
    title: 'Make a version for this job',
    sub: 'Kazi keeps your master CV intact and creates a copy with the strongest matching bullets and skills selected.',
    wide: true,
    body: `
      <form id="tailor-form" data-form="tailor" novalidate>
        <input type="hidden" name="applicationId" value="${app.id}">
        <div class="field-row">
          <div class="field">
            <label class="field-label">Start from</label>
            <select class="select" name="baseCV">
              ${state.cvs.length ? state.cvs.map(cv => `<option value="${cv.id}" ${(app.cvId === cv.id ? 'selected' : '') || (cv.kind === 'master' && app.cvId !== cv.id ? 'selected' : '')}>${esc(cv.name)}</option>`).join('') : '<option value="new">Create from my profile</option>'}
            </select>
          </div>
          <div class="field"><label class="field-label">CV name</label><input class="input" name="name" value="${escAttr(defaultName)}"></div>
        </div>
        <label class="check-line"><input type="checkbox" name="attach" checked> <span>Set this as the CV for this application</span></label>
        <div class="field"><label class="field-label">Job advert being matched</label><textarea class="textarea" readonly style="min-height:150px;background:var(--paper-soft)">${esc(app.jobDescription || 'No job description saved. Add one on the job page for a useful keyword match.')}</textarea></div>
        <div class="form-note">${icon('shield')}<span>Tailoring only changes which bullets and skills are selected. Nothing is invented and no text is sent anywhere.</span></div>
      </form>`,
    footer: `
      <button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button>
      <button class="btn btn-primary" type="submit" form="tailor-form">${icon('target')} Create tailored CV</button>`
  });
}

function openNewCoverModal(appId = '') {
  const app = getApplication(state, appId);
  const defaultName = app ? `Cover letter — ${app.company || 'Application'}` : `${state.profile.name ? `${state.profile.name} — ` : ''}Cover letter`;
  openModal({
    eyebrow: 'Cover letter',
    title: 'Write a cover letter',
    sub: 'Start from a real application and your CV, or begin with a blank letter.',
    wide: true,
    body: `
      <form id="new-cover-form" data-form="new-cover" novalidate>
        <div class="field">
          <label class="field-label">Link to an application</label>
          <select class="select" name="applicationId">
            <option value="">No linked application</option>
            ${state.applications.filter(item => !item.archived).map(item => `<option value="${item.id}" ${app?.id === item.id ? 'selected' : ''}>${esc(item.role || 'Untitled')} — ${esc(item.company || '')}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="field-label">Base CV</label>
            <select class="select" name="cvId">
              <option value="">No CV / use profile only</option>
              ${state.cvs.map(cv => `<option value="${cv.id}" ${app?.cvId === cv.id ? 'selected' : ''}>${esc(cv.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label class="field-label">Letter name</label><input class="input" name="name" value="${escAttr(defaultName)}"></div>
        </div>
        <div class="form-note">${icon('file')}<span>If you link a job with a description, Kazi drafts a first version from your CV and the advert. You can edit every word afterwards.</span></div>
      </form>`,
    footer: `
      <button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button>
      <button class="btn btn-primary" type="submit" form="new-cover-form">${icon('plus')} Create cover letter</button>`
  });
}

/* ------------------------------------------------------------------ */
/* Editor synchronisation                                             */
/* ------------------------------------------------------------------ */

let cvSyncTimer = null;
let coverSyncTimer = null;

function scheduleCVSync() {
  window.clearTimeout(cvSyncTimer);
  cvSyncTimer = window.setTimeout(() => syncCVEditor(), 450);
}

function scheduleCoverSync() {
  window.clearTimeout(coverSyncTimer);
  coverSyncTimer = window.setTimeout(() => syncCoverEditor(), 450);
}

function syncCVEditor({ refresh = true } = {}) {
  const root = document.getElementById('cv-editor');
  if (!root || !root.isConnected) return null;
  const cv = getCV(state, root.dataset.cvId);
  if (!cv) return null;
  root.querySelectorAll('[data-cv-field]').forEach(input => {
    setPath(cv, input.dataset.cvField, input.type === 'checkbox' ? input.checked : input.value);
  });
  root.querySelectorAll('[data-exp]').forEach(node => {
    const exp = cv.experience.find(item => item.id === node.dataset.exp);
    if (!exp) return;
    node.querySelectorAll('[data-exp-field]').forEach(input => {
      exp[input.dataset.expField] = input.type === 'checkbox' ? input.checked : input.value;
    });
    node.querySelectorAll('[data-bullet]').forEach(row => {
      const bullet = exp.bullets.find(item => item.id === row.dataset.bullet);
      if (!bullet) return;
      const check = row.querySelector('[data-bullet-selected]');
      const text = row.querySelector('[data-bullet-text]');
      bullet.selected = check ? check.checked : bullet.selected;
      if (text) bullet.text = text.value;
    });
  });
  root.querySelectorAll('[data-edu]').forEach(node => {
    const item = cv.education.find(entry => entry.id === node.dataset.edu);
    if (!item) return;
    node.querySelectorAll('[data-edu-field]').forEach(input => {
      item[input.dataset.eduField] = input.type === 'checkbox' ? input.checked : input.value;
    });
  });
  root.querySelectorAll('[data-project-item]').forEach(node => {
    const item = cv.projects.find(entry => entry.id === node.dataset.projectItem);
    if (!item) return;
    node.querySelectorAll('[data-project-field]').forEach(input => {
      item[input.dataset.projectField] = input.type === 'checkbox' ? input.checked : input.value;
    });
  });
  root.querySelectorAll('[data-cert]').forEach(node => {
    const item = cv.certifications.find(entry => entry.id === node.dataset.cert);
    if (!item) return;
    node.querySelectorAll('[data-cert-field]').forEach(input => {
      item[input.dataset.certField] = input.type === 'checkbox' ? input.checked : input.value;
    });
  });
  root.querySelectorAll('[data-lang]').forEach(node => {
    const item = cv.languages.find(entry => entry.id === node.dataset.lang);
    if (!item) return;
    node.querySelectorAll('[data-lang-field]').forEach(input => {
      item[input.dataset.langField] = input.type === 'checkbox' ? input.checked : input.value;
    });
  });
  root.querySelectorAll('[data-skill]').forEach(input => {
    const skill = cv.skills.find(entry => entry.id === input.dataset.skill);
    if (skill) skill.selected = input.checked;
  });
  cv.updatedAt = nowISO();
  saveState(state);
  if (refresh) refreshCVPanels(cv);
  return cv;
}

function refreshCVPanels(cv) {
  const preview = document.getElementById('cv-preview');
  if (preview) preview.innerHTML = renderCV(cv);
  const analysis = document.getElementById('cv-analysis');
  if (analysis) analysis.innerHTML = analysisMarkup(cv);
}

function syncCoverEditor({ refresh = true } = {}) {
  const root = document.getElementById('cover-editor');
  if (!root || !root.isConnected) return null;
  const cover = getCover(state, root.dataset.coverId);
  if (!cover) return null;
  root.querySelectorAll('[data-cover-field]').forEach(input => {
    setPath(cover, input.dataset.coverField, input.type === 'checkbox' ? input.checked : input.value);
  });
  const applicationSelect = root.querySelector('[data-cover-select="applicationId"]');
  if (applicationSelect) cover.applicationId = applicationSelect.value || null;
  const cvSelect = root.querySelector('[data-cover-select="cvId"]');
  if (cvSelect) cover.cvId = cvSelect.value || null;
  cover.updatedAt = nowISO();
  saveState(state);
  if (refresh) {
    const preview = document.getElementById('cover-preview');
    if (preview) preview.innerHTML = renderCover(cover);
  }
  return cover;
}

function flushEditors() {
  window.clearTimeout(cvSyncTimer);
  window.clearTimeout(coverSyncTimer);
  syncCVEditor({ refresh: false });
  syncCoverEditor({ refresh: false });
}

/* ------------------------------------------------------------------ */
/* Profile synchronisation                                             */
/* ------------------------------------------------------------------ */

function collectProfileForm() {
  const form = document.getElementById('profile-form');
  if (!form) return null;
  const value = selector => form.querySelector(selector)?.value || '';
  const top = field => value(`[data-p-field="${field}"]`);
  const checked = selector => Boolean(form.querySelector(selector)?.checked);
  const experience = [...form.querySelectorAll('[data-profile-exp]')].map(node => ({
    id: node.dataset.id,
    role: node.querySelector('[data-p-field="role"]')?.value || '',
    company: node.querySelector('[data-p-field="company"]')?.value || '',
    location: node.querySelector('[data-p-field="location"]')?.value || '',
    start: node.querySelector('[data-p-field="start"]')?.value || '',
    end: node.querySelector('[data-p-field="end"]')?.value || '',
    current: Boolean(node.querySelector('[data-p-field="current"]')?.checked),
    bullets: splitLines(node.querySelector('[data-p-field="bullets"]')?.value || '')
  }));
  const education = [...form.querySelectorAll('[data-profile-edu]')].map(node => ({
    id: node.dataset.id,
    degree: node.querySelector('[data-p-field="degree"]')?.value || '',
    school: node.querySelector('[data-p-field="school"]')?.value || '',
    location: node.querySelector('[data-p-field="location"]')?.value || '',
    start: node.querySelector('[data-p-field="start"]')?.value || '',
    end: node.querySelector('[data-p-field="end"]')?.value || '',
    detail: node.querySelector('[data-p-field="detail"]')?.value || ''
  }));
  const projects = [...form.querySelectorAll('[data-profile-project]')].map(node => ({
    id: node.dataset.id,
    name: node.querySelector('[data-p-field="name"]')?.value || '',
    link: node.querySelector('[data-p-field="link"]')?.value || '',
    detail: node.querySelector('[data-p-field="detail"]')?.value || ''
  }));
  const certifications = [...form.querySelectorAll('[data-profile-cert]')].map(node => ({
    id: node.dataset.id,
    name: node.querySelector('[data-p-field="name"]')?.value || '',
    issuer: node.querySelector('[data-p-field="issuer"]')?.value || '',
    year: node.querySelector('[data-p-field="year"]')?.value || ''
  }));
  const languages = [...form.querySelectorAll('[data-profile-lang]')].map(node => ({
    id: node.dataset.id,
    name: node.querySelector('[data-p-field="name"]')?.value || '',
    level: node.querySelector('[data-p-field="level"]')?.value || ''
  }));

  return normaliseProfile({
    name: top('name'),
    headline: top('headline'),
    email: top('email'),
    phone: top('phone'),
    location: top('location'),
    links: {
      linkedin: top('linkedin'),
      portfolio: top('portfolio'),
      website: top('website')
    },
    summary: top('summary'),
    skills: splitList(top('skills')),
    experience,
    education,
    projects,
    certifications,
    languages
  });
}

function syncMasterCV() {
  const existing = state.cvs.find(cv => cv.kind === 'master');
  const fresh = createCVFromProfile(state.profile, {
    name: existing?.name || `${state.profile.name || 'My'} — Master CV`,
    kind: 'master'
  });
  if (existing) {
    fresh.id = existing.id;
    fresh.createdAt = existing.createdAt;
    fresh.isDemo = existing.isDemo;
    Object.assign(existing, fresh);
    return existing;
  }
  state.cvs.unshift(fresh);
  return fresh;
}

function saveProfileFromForm() {
  const profile = collectProfileForm();
  if (!profile) return false;
  state.profile = profile;
  state.meta.profileIsDemo = false;
  const syncMaster = document.getElementById('sync-master');
  if (syncMaster?.checked) syncMasterCV();
  saveState(state);
  return true;
}

function persistProfileDraft() {
  const profile = collectProfileForm();
  if (profile) {
    state.profile = profile;
    saveState(state);
  }
}

/* ------------------------------------------------------------------ */
/* Export documents                                                    */
/* ------------------------------------------------------------------ */

const DOWNLOAD_STYLES = `
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Calibri, Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #25241f; }
  .cv-sheet, .cover-sheet { width: 100%; max-width: 100%; padding: 0; margin: 0; border: 0; box-shadow: none; }
  .cv-head, .cover-head { padding-bottom: 10pt; border-bottom: 1.5pt solid #263f33; }
  .cv-head h1, .cover-head h1 { margin: 0; font-family: Georgia, 'Times New Roman', serif; font-size: 24pt; font-weight: normal; letter-spacing: -0.5pt; }
  .cv-headline { margin: 2pt 0 0; font-size: 11pt; font-weight: bold; color: #1f5a43; }
  .cv-contact, .cv-links, .cover-head p { margin: 3pt 0 0; font-size: 9pt; color: #6b675b; }
  .cv-section { margin-top: 13pt; }
  .cv-section-title { margin: 0 0 5pt; padding-bottom: 2pt; border-bottom: 0.75pt solid #ddd5c4; font-family: Arial, sans-serif; font-size: 8pt; letter-spacing: 1.5pt; text-transform: uppercase; color: #1f5a43; }
  .cv-role { margin-bottom: 9pt; }
  .cv-role-head { width: 100%; }
  .cv-role-head h3 { margin: 0; font-size: 11pt; }
  .cv-role-company { margin: 0; font-size: 9.5pt; color: #746f61; }
  .cv-role-dates { margin: 0; font-size: 8.5pt; color: #8d8778; }
  ul { margin: 3pt 0 0 14pt; padding: 0; }
  li { margin-bottom: 2pt; font-size: 9.5pt; }
  .cv-detail, .cv-skills, .cv-line { font-size: 9.5pt; margin: 2pt 0; }
  .cv-skills { line-height: 1.6; }
  .cv-role-head > div { display: inline-block; width: 74%; vertical-align: top; }
  .cv-role-dates { display: inline-block; width: 24%; text-align: right; vertical-align: top; }
  .cover-sheet { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.65; }
  .cover-sheet p { margin: 9pt 0 0; }
  .cover-date { font-family: Calibri, Arial, sans-serif; font-size: 9pt; color: #6b675b; }
  .cover-recipient { margin-top: 14pt !important; }
  .cover-closing { margin-top: 16pt !important; }
  .cover-signature { margin-top: 14pt !important; font-style: italic; font-size: 12pt; }
  a { color: #1f5a43; text-decoration: none; }
`;

function standaloneHTML(title, bodyHTML) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOWNLOAD_STYLES}</style></head><body>${bodyHTML}</body></html>`;
}

function downloadCVFile(cv) {
  download(`${cvFileName(cv)}.doc`, standaloneHTML(cvFileName(cv), renderCV(cv, { forPrint: true })), 'application/msword');
}

function downloadCoverFile(cover) {
  download(`${coverFileName(cover)}.doc`, standaloneHTML(coverFileName(cover), renderCover(cover)), 'application/msword');
}

async function openDocumentModal(appId, docId) {
  const app = getApplication(state, appId);
  const doc = app?.documents.find(item => item.id === docId);
  if (!app || !doc) return;
  if (doc.fileId) {
    try {
      const file = await getFile(doc.fileId);
      if (!file) {
        toast('That attachment could not be found in this browser.', 'error');
        return;
      }
      const url = URL.createObjectURL(file.blob);
      const isImage = String(file.type || '').startsWith('image/');
      openModal({
        eyebrow: 'Attachment',
        title: doc.name,
        sub: `${file.type || 'File'} · ${formatBytes(file.size)} · ${formatDateFrom(doc.createdAt)}`,
        wide: true,
        body: isImage
          ? `<img src="${url}" alt="${escAttr(doc.name)}" style="width:100%;border-radius:10px;border:1px solid var(--line)">`
          : `<div class="attached-file">${icon('paperclip')}<span>${esc(file.name)}</span></div>`,
        footer: `<a class="btn btn-outline" href="${url}" download="${escAttr(file.name)}">${icon('download')} Download</a><button class="btn btn-primary" type="button" data-action="close-modal">Done</button>`
      });
    } catch (error) {
      console.error(error);
      toast('Could not open that attachment.', 'error');
    }
    return;
  }
  const snapshot = doc.cv || doc.cover;
  if (!snapshot) return;
  openModal({
    eyebrow: doc.kind === 'cover' ? 'Saved cover letter' : 'Saved CV',
    title: doc.name,
    sub: `Saved ${formatDateFrom(doc.createdAt)}. This is the version attached to the application.`,
    wide: true,
    body: `<div class="preview-stage" style="max-height:60vh">${doc.cv ? renderCV(doc.cv, { compact: true }) : renderCover(doc.cover)}</div>`,
    footer: `
      <button class="btn btn-outline" type="button" data-action="download-snapshot" data-app="${app.id}" data-doc="${doc.id}">${icon('download')} Download</button>
      <button class="btn btn-primary" type="button" data-action="close-modal">Done</button>`
  });
}

function downloadSnapshot(appId, docId) {
  const app = getApplication(state, appId);
  const doc = app?.documents.find(item => item.id === docId);
  if (!doc) return;
  if (doc.cv) downloadCVFile(doc.cv);
  else if (doc.cover) downloadCoverFile(doc.cover);
}

/* ------------------------------------------------------------------ */
/* Onboarding                                                          */
/* ------------------------------------------------------------------ */

function onboardingVisual() {
  return `
    <div class="visual-stack">
      <div class="visual-meta"><span>Sample workspace</span><span>This week</span></div>
      <div class="visual-card visual-card--back" aria-hidden="true"></div>
      <div class="visual-card visual-card--main">
        <div class="visual-top">
          ${avatar('Savanna Health', '', '#1f5a43')}
          <div><p class="visual-title">M&E Officer</p><p class="visual-sub">Savanna Health · WhatsApp</p></div>
        </div>
        <div class="visual-chips"><span class="visual-chip visual-chip--warn">Due in 2 days</span><span class="visual-chip visual-chip--green">Priority</span></div>
        <div class="visual-lines"><span class="visual-line visual-line--accent"></span><span class="visual-line"></span><span class="visual-line visual-line--short"></span></div>
        <div class="visual-caption"><span class="dot"></span>Follow up with Grace today</div>
      </div>
      <div class="visual-card visual-card--float">
        <div class="visual-top">
          ${avatar('Amina', '', '#b85032')}
          <div><p class="visual-title">Interview · Data Analyst</p><p class="visual-sub">Kampala Coffee Co.</p></div>
        </div>
        <div class="visual-lines"><span class="visual-line visual-line--short"></span><span class="visual-line"></span></div>
        <div class="visual-chips"><span class="visual-chip visual-chip--green">CV tailored 87%</span></div>
      </div>
      <div class="visual-note">${icon('check')} Deadline saved</div>
    </div>`;
}

function onboardingMarkup() {
  const step = ui.onboardStep;
  return `
    <div class="onboarding" role="dialog" aria-modal="true" aria-label="Welcome to Kazi">
      <div class="onboard-card">
        <div class="onboard-copy">
          <a class="brand onboard-brand" href="#/today" aria-label="Kazi">
            <span class="brand-mark" aria-hidden="true"></span>
            <span class="brand-word">kazi</span>
          </a>
          <div class="onboard-content">
            ${step === 1 ? `
              <p class="onboard-kicker">${icon('target')} Job search, under control</p>
              <h1>The job hunt is messy.<br><em>Your workspace shouldn't be.</em></h1>
              <p class="onboard-lede">Kazi turns WhatsApp forwards, screenshots and email replies into a calm, deadline-first pipeline — with a CV tailored for every serious application.</p>
              <div class="onboard-points">
                <div class="onboard-point">${icon('whatsapp')}<span><strong>Capture from anywhere.</strong> Paste a message or link; Kazi finds the role, company and deadline.</span></div>
                <div class="onboard-point">${icon('clock')}<span><strong>Never miss the moment.</strong> Today, calendar and email replies stay in one place.</span></div>
                <div class="onboard-point">${icon('cv')}<span><strong>One CV per job.</strong> Transparent keyword matching, no black box.</span></div>
                <div class="onboard-point">${icon('shield')}<span><strong>Private by default.</strong> No account, no tracking. AI is off until you choose it.</span></div>
              </div>
              <div class="onboard-form">
                <button class="btn btn-primary" type="button" data-action="onboard-next">Get started ${icon('arrow-right')}</button>
              </div>
              <div class="step-dots"><span class="is-active"></span><span></span></div>
            ` : `
              <p class="onboard-kicker">${icon('user')} Make it yours</p>
              <h1>How would you like to start?</h1>
              <p class="onboard-lede">Explore a realistic sample workspace, or begin with a clean slate. You can switch between the two at any time.</p>
              <div class="onboard-form">
                <div class="field">
                  <label class="field-label" for="onboard-name">What should we call you? <span class="muted">(optional)</span></label>
                  <input class="input" id="onboard-name" value="${escAttr(ui.onboardName)}" placeholder="Your first name">
                </div>
                <button class="btn btn-primary" type="button" data-action="onboard-demo">${icon('folder')} Explore with sample data</button>
                <span class="field-hint">Eight applications, two CVs and a cover letter. Clearly marked, easy to remove.</span>
                <button class="btn btn-outline" type="button" data-action="onboard-fresh">${icon('plus')} Start with a blank workspace</button>
                <span class="field-hint">Capture your first real job in under a minute.</span>
                <button class="btn btn-ghost btn-sm" type="button" data-action="onboard-back" style="justify-content:flex-start;margin-top:2px">${icon('arrow-left')} Back</button>
              </div>
              <div class="step-dots"><span></span><span class="is-active"></span></div>
            `}
          </div>
          <p class="onboard-skip">Your data stays in this browser. <button type="button" data-action="onboard-skip">Skip for now</button></p>
        </div>
        <div class="onboard-visual">${onboardingVisual()}</div>
      </div>
    </div>`;
}

function showOnboarding(step = 1) {
  if (step === 2) {
    const current = document.getElementById('onboard-name');
    if (current) ui.onboardName = current.value.trim();
  }
  ui.onboardStep = step;
  onboardingRoot.innerHTML = onboardingMarkup();
  document.body.classList.add('onboarding-open');
}

function maybeOnboard() {
  if (state.meta.onboarded) return false;
  showOnboarding(1);
  return true;
}

function closeOnboarding() {
  onboardingRoot.innerHTML = '';
  document.body.classList.remove('onboarding-open');
}

function finishOnboarding(mode) {
  const nameInput = document.getElementById('onboard-name');
  const enteredName = nameInput?.value.trim() || '';
  if (mode === 'demo') {
    // The sample workspace is Amina's story; keep it coherent rather than
    // overlaying a new name on top of demo CVs.
    seedDemo(state);
  } else {
    if (enteredName) {
      state.profile.name = enteredName;
      state.meta.profileIsDemo = false;
    }
    state.meta.onboarded = true;
  }
  saveState(state);
  closeOnboarding();
  navigate('#/today');
  renderRoute();
  toast(mode === 'demo' ? 'Sample workspace ready. Look around and make it yours.' : 'Your workspace is ready. Capture your first job when you are.');
  if (ui.pendingCapture) {
    const pending = ui.pendingCapture;
    ui.pendingCapture = null;
    openCaptureModal(pending);
  }
}

function skipOnboarding() {
  state.meta.onboarded = true;
  saveState(state);
  closeOnboarding();
  renderRoute();
  if (ui.pendingCapture) {
    const pending = ui.pendingCapture;
    ui.pendingCapture = null;
    openCaptureModal(pending);
  }
  toast('You can load the sample workspace any time in Settings.');
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

async function withBusy(element, label, task) {
  if (!element) return task();
  const markup = element.innerHTML;
  element.disabled = true;
  element.textContent = label;
  try {
    return await task();
  } finally {
    element.disabled = false;
    element.innerHTML = markup;
  }
}

async function handleAction(action, element) {
  const id = element.dataset.id;
  switch (action) {
    case 'close-modal':
      closeModal();
      return;
    case 'confirm-no': {
      const resolve = ui.confirmResolve;
      ui.confirmResolve = null;
      closeModal();
      if (resolve) resolve(false);
      return;
    }
    case 'confirm-yes': {
      const resolve = ui.confirmResolve;
      ui.confirmResolve = null;
      closeModal();
      if (resolve) resolve(true);
      return;
    }
    case 'capture':
      openCaptureModal({ tab: element.dataset.tab || 'paste' });
      return;
    case 'search-jump':
      navigate('#/jobs');
      window.setTimeout(() => document.getElementById('jobs-search')?.focus(), 180);
      return;
    case 'dismiss-demo':
      state.settings.hideDemoBanner = true;
      saveState(state);
      renderRoute({ scroll: false });
      return;
    case 'parse-capture':
      runCaptureParse();
      return;
    case 'parse-capture-ai':
      await withBusy(element, 'Reading…', () => runCaptureParse({ useAI: true }));
      return;
    case 'capture-tab': {
      const tab = element.dataset.tab;
      document.querySelectorAll('.capture-tabs button').forEach(button => {
        button.classList.toggle('is-active', button.dataset.tab === tab);
        button.setAttribute('aria-selected', String(button.dataset.tab === tab));
      });
      document.querySelectorAll('[data-capture-panel]').forEach(panel => {
        panel.hidden = panel.dataset.capturePanel !== tab;
      });
      return;
    }
    case 'log-reply':
      openReplyModal(id || '');
      return;
    case 'reply-analyse':
      runReplyAnalysis();
      return;
    case 'tailor-cv':
      openTailorModal(id);
      return;
    case 'write-cover':
      openNewCoverModal(id);
      return;
    case 'edit-job':
      openEditModal(id);
      return;
    case 'mark-applied': {
      const app = getApplication(state, id);
      if (!app) return;
      setApplicationStatus(state, app, 'applied');
      saveState(state);
      renderRoute({ scroll: false });
      toast('Marked as applied. The clock on replies starts now.');
      return;
    }
    case 'complete-next': {
      const app = getApplication(state, id);
      if (!app) return;
      const done = app.nextAction || 'Next step';
      app.nextAction = '';
      app.nextActionDate = '';
      if (app.followUpDate && app.followUpDate <= todayISO()) app.followUpDate = '';
      addEvent(app, 'next', 'Next step completed', done);
      saveState(state);
      renderRoute({ scroll: false });
      toast('Next step cleared. It stays in the story.');
      return;
    }
    case 'archive-job': {
      const app = getApplication(state, id);
      if (!app) return;
      app.archived = true;
      app.updatedAt = nowISO();
      saveState(state);
      navigate('#/jobs');
      toast('Application archived. Find it at the bottom of your pipeline.');
      return;
    }
    case 'unarchive-job': {
      const app = getApplication(state, id);
      if (!app) return;
      app.archived = false;
      app.updatedAt = nowISO();
      saveState(state);
      renderRoute({ scroll: false });
      toast('Application restored to your pipeline.');
      return;
    }
    case 'delete-job': {
      const app = getApplication(state, id);
      if (!app) return;
      const ok = await askConfirm({
        title: 'Delete this application?',
        text: `${app.role || 'This role'}${app.company ? ` at ${app.company}` : ''} and its timeline will be removed from this browser.`,
        confirmLabel: 'Delete application',
        danger: true
      });
      if (!ok) return;
      state.applications = state.applications.filter(item => item.id !== id);
      saveState(state);
      navigate('#/jobs');
      toast('Application deleted.');
      return;
    }
    case 'jobs-group': {
      const next = element.dataset.group || 'all';
      ui.jobsGroup = next === 'all' || next === ui.jobsGroup ? 'all' : next;
      applyJobFilters();
      return;
    }
    case 'reset-filters': {
      ui.jobsGroup = 'all';
      ui.jobsStatus = 'all';
      ui.jobsSource = 'all';
      const search = document.getElementById('jobs-search');
      const source = document.getElementById('jobs-source');
      const status = document.getElementById('jobs-status');
      if (search) search.value = '';
      if (source) source.value = 'all';
      if (status) status.value = 'all';
      applyJobFilters();
      return;
    }
    case 'cal-prev':
    case 'cal-next': {
      const anchor = new Date(`${ui.calendarAnchor}T12:00:00`);
      anchor.setMonth(anchor.getMonth() + (action === 'cal-next' ? 1 : -1), 1);
      ui.calendarAnchor = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-01`;
      renderRoute({ scroll: false });
      return;
    }
    case 'cal-today':
      ui.calendarAnchor = todayISO();
      ui.selectedDate = todayISO();
      renderRoute({ scroll: false });
      return;
    case 'cal-day':
      ui.selectedDate = element.dataset.date || todayISO();
      renderRoute({ scroll: false });
      return;
    case 'view-doc': {
      const [appId, docId] = String(id || '').split('|');
      await openDocumentModal(appId, docId);
      return;
    }
    case 'download-snapshot':
      downloadSnapshot(element.dataset.app, element.dataset.doc);
      return;
    case 'new-cv': {
      const cv = createCVFromProfile(state.profile, {
        name: state.profile.name ? `${state.profile.name} — Tailored CV` : 'My CV',
        kind: 'tailored'
      });
      state.cvs.push(cv);
      saveState(state);
      navigate(`#/studio/cv/${cv.id}`);
      toast(state.profile.name ? 'New CV created from your profile.' : 'Blank CV created. Add your details and save.');
      return;
    }
    case 'create-master': {
      const existing = state.cvs.find(cv => cv.kind === 'master');
      if (existing) {
        navigate(`#/studio/cv/${existing.id}`);
        return;
      }
      const cv = createCVFromProfile(state.profile, {
        name: state.profile.name ? `${state.profile.name} — Master CV` : 'My Master CV',
        kind: 'master'
      });
      state.cvs.unshift(cv);
      saveState(state);
      navigate(`#/studio/cv/${cv.id}`);
      toast('Master CV created from your profile. Edit it until it feels like you.');
      return;
    }
    case 'duplicate-cv': {
      const cv = getCV(state, id);
      if (!cv) return;
      const copy = cloneCV(cv);
      copy.name = `${cv.name} — copy`;
      copy.kind = 'tailored';
      copy.applicationId = null;
      state.cvs.push(copy);
      saveState(state);
      navigate(`#/studio/cv/${copy.id}`);
      toast('CV duplicated. You can tailor the copy without touching the original.');
      return;
    }
    case 'delete-cv': {
      const cv = getCV(state, id);
      if (!cv) return;
      const ok = await askConfirm({
        title: 'Delete this CV?',
        text: `${cv.name} will be removed. Applications keep their saved document snapshots, but lose the live link.`,
        confirmLabel: 'Delete CV',
        danger: true
      });
      if (!ok) return;
      state.cvs = state.cvs.filter(item => item.id !== id);
      state.applications.forEach(app => { if (app.cvId === id) app.cvId = null; });
      state.covers.forEach(cover => { if (cover.cvId === id) cover.cvId = null; });
      saveState(state);
      navigate('#/studio');
      toast('CV deleted.');
      return;
    }
    case 'save-cv': {
      const cv = syncCVEditor();
      if (cv) toast('CV saved in this browser.');
      return;
    }
    case 'download-cv': {
      const cv = syncCVEditor() || getCV(state, id);
      if (!cv) return;
      downloadCVFile(cv);
      toast('Word document downloaded. Open it in Word or Google Docs.');
      return;
    }
    case 'copy-cv': {
      const cv = syncCVEditor() || getCV(state, id);
      if (!cv) return;
      await copyText(cvPlainText(cv));
      toast('CV text copied to the clipboard.');
      return;
    }
    case 'tailor-editor': {
      const cv = syncCVEditor();
      if (!cv) return;
      if (!cv.jobDescription.trim()) {
        toast('Paste the job advert first so Kazi has something to match.', 'error');
        return;
      }
      const result = tailorCV(cv, cv.jobDescription);
      Object.assign(cv, result.cv);
      cv.updatedAt = nowISO();
      ui.summarySuggestion = { cvId: cv.id, text: result.summarySuggestion };
      saveState(state);
      renderRoute({ scroll: false });
      toast(result.note);
      return;
    }
    case 'suggest-summary': {
      const cv = syncCVEditor();
      if (!cv) return;
      let suggestion = '';
      let source = 'local';
      if (state.settings.ai) {
        try {
          suggestion = await withBusy(element, 'Writing…', () => aiSummary({
            cv,
            role: cv.targetRole,
            company: cv.targetCompany,
            jobDescription: cv.jobDescription
          }));
          source = 'ai';
        } catch (error) {
          toast(`${error.message} Using the local suggestion instead.`, 'error');
        }
      }
      if (!suggestion) suggestion = suggestSummary(cv, cv.jobDescription);
      ui.summarySuggestion = { cvId: cv.id, text: suggestion, source };
      renderRoute({ scroll: false });
      toast(source === 'ai' ? 'AI summary ready. Check it before using it.' : 'A summary suggestion is ready below the summary field.');
      return;
    }
    case 'apply-summary': {
      const cv = syncCVEditor() || getCV(state, id);
      if (!cv || !ui.summarySuggestion) return;
      cv.summary = ui.summarySuggestion.text;
      cv.updatedAt = nowISO();
      ui.summarySuggestion = null;
      saveState(state);
      renderRoute({ scroll: false });
      toast('Suggested summary applied. Edit it until it sounds like you.');
      return;
    }
    case 'add-bullet': {
      const cv = syncCVEditor();
      if (!cv) return;
      const exp = cv.experience.find(item => item.id === id);
      if (!exp) return;
      exp.bullets.push({ id: uid('bullet'), text: '', selected: true });
      saveState(state);
      renderRoute({ scroll: false });
      return;
    }
    case 'remove-bullet': {
      const cv = syncCVEditor();
      if (!cv) return;
      for (const exp of cv.experience) exp.bullets = exp.bullets.filter(bullet => bullet.id !== id);
      saveState(state);
      renderRoute({ scroll: false });
      return;
    }
    case 'add-cv-experience': {
      const cv = syncCVEditor();
      if (!cv) return;
      cv.experience.push({ id: uid('exp'), role: '', company: '', location: '', start: '', end: '', current: false, selected: true, bullets: [] });
      saveState(state);
      renderRoute({ scroll: false });
      return;
    }
    case 'remove-cv-item': {
      const cv = syncCVEditor();
      if (!cv) return;
      const kind = element.dataset.kind;
      if (Array.isArray(cv[kind])) cv[kind] = cv[kind].filter(item => item.id !== id);
      saveState(state);
      renderRoute({ scroll: false });
      return;
    }
    case 'add-skill': {
      const cv = syncCVEditor();
      if (!cv) return;
      const input = document.getElementById('new-skill');
      const name = input?.value.trim() || '';
      if (!name) {
        toast('Type a skill first.', 'error');
        input?.focus();
        return;
      }
      if (cv.skills.some(skill => skill.name.toLowerCase() === name.toLowerCase())) {
        toast('That skill is already on this CV.', 'error');
        return;
      }
      cv.skills.push({ id: uid('skill'), name, selected: true });
      saveState(state);
      renderRoute({ scroll: false });
      toast(`Added ${name}.`);
      return;
    }
    case 'save-cover': {
      const cover = syncCoverEditor();
      if (cover) toast('Cover letter saved in this browser.');
      return;
    }
    case 'download-cover': {
      const cover = syncCoverEditor() || getCover(state, id);
      if (!cover) return;
      downloadCoverFile(cover);
      toast('Word document downloaded. Open it in Word or Google Docs.');
      return;
    }
    case 'copy-cover': {
      const cover = syncCoverEditor() || getCover(state, id);
      if (!cover) return;
      await copyText(coverPlainText(cover));
      toast('Cover letter text copied to the clipboard.');
      return;
    }
    case 'generate-cover': {
      const cover = syncCoverEditor();
      if (!cover) return;
      const application = cover.applicationId ? getApplication(state, cover.applicationId) : null;
      let base = cover.cvId ? getCV(state, cover.cvId) : null;
      if (!base && application?.cvId) base = getCV(state, application.cvId);
      if (!base) base = state.cvs[0] || null;
      if (!base) {
        toast('Create a CV first so Kazi can draft from your experience.', 'error');
        return;
      }
      const context = application || {
        role: cover.targetRole,
        company: cover.targetCompany,
        jobDescription: ''
      };
      const draft = generateCoverDraft(base, context);
      let body = draft.body;
      let usedAI = false;
      if (state.settings.ai) {
        try {
          body = await withBusy(element, 'Writing…', () => aiCover({
            cv: base,
            role: cover.targetRole || context.role || base.targetRole,
            company: cover.targetCompany || context.company || base.targetCompany,
            recipient: cover.recipient || context.contact?.name || '',
            jobDescription: context.jobDescription || base.jobDescription || ''
          })) || body;
          usedAI = true;
        } catch (error) {
          toast(`${error.message} Using the local draft instead.`, 'error');
        }
      }
      cover.body = body;
      cover.cvId = base.id;
      if (!cover.recipient) cover.recipient = draft.recipient;
      if (!cover.contact.name) cover.contact = { ...draft.contact };
      saveState(state);
      renderRoute({ scroll: false });
      toast(usedAI ? 'AI draft ready. Check every claim before sending.' : 'Draft generated. Rewrite it in your own voice before sending.');
      return;
    }
    case 'delete-cover': {
      const cover = getCover(state, id);
      if (!cover) return;
      const ok = await askConfirm({
        title: 'Delete this cover letter?',
        text: `${cover.name} will be removed from this browser.`,
        confirmLabel: 'Delete cover letter',
        danger: true
      });
      if (!ok) return;
      state.covers = state.covers.filter(item => item.id !== id);
      state.applications.forEach(app => { if (app.coverId === id) app.coverId = null; });
      saveState(state);
      navigate('#/studio');
      toast('Cover letter deleted.');
      return;
    }
    case 'new-cover':
      openNewCoverModal('');
      return;
    case 'add-profile-item': {
      persistProfileDraft();
      const kind = element.dataset.kind;
      const blank = {
        experience: { id: uid('exp'), role: '', company: '', location: '', start: '', end: '', current: false, bullets: [] },
        education: { id: uid('edu'), degree: '', school: '', location: '', start: '', end: '', detail: '' },
        projects: { id: uid('project'), name: '', link: '', detail: '' },
        certifications: { id: uid('cert'), name: '', issuer: '', year: '' },
        languages: { id: uid('lang'), name: '', level: '' }
      }[kind];
      if (!blank || !Array.isArray(state.profile[kind])) return;
      state.profile[kind].push(blank);
      saveState(state);
      renderRoute({ scroll: false });
      return;
    }
    case 'remove-profile-item': {
      persistProfileDraft();
      const kind = element.dataset.kind;
      if (!Array.isArray(state.profile[kind])) return;
      state.profile[kind] = state.profile[kind].filter(item => item.id !== id);
      saveState(state);
      renderRoute({ scroll: false });
      toast('Section removed. Save the profile to keep the change.');
      return;
    }
    case 'export-csv': {
      download(`kazi-applications-${todayISO()}.csv`, applicationsCSV(state), 'text/csv');
      toast('Applications exported as CSV.');
      return;
    }
    case 'export-ics': {
      const events = calendarEventsForICS(state);
      if (!events.length) {
        toast('No deadlines or events to add yet.', 'error');
        return;
      }
      download(`kazi-calendar-${todayISO()}.ics`, buildICS(events), 'text/calendar');
      toast('Calendar file downloaded. Import it into Google Calendar or your phone.');
      return;
    }
    case 'export-backup': {
      try {
        toast('Preparing your backup…');
        const backup = await buildBackup(state);
        state.meta.lastExportAt = nowISO();
        saveState(state);
        download(exportFileName(), JSON.stringify(backup, null, 2), 'application/json');
        toast('Backup downloaded. Keep it somewhere safe.');
      } catch (error) {
        console.error(error);
        toast('Backup failed. Try again or use CSV export.', 'error');
      }
      return;
    }
    case 'load-demo': {
      seedDemo(state);
      saveState(state);
      renderRoute({ scroll: false });
      toast('Sample workspace loaded. Your own records were left in place.');
      return;
    }
    case 'clear-demo': {
      clearDemo(state);
      saveState(state);
      renderRoute({ scroll: false });
      toast('Sample data removed.');
      return;
    }
    case 'enable-notifications':
      await enableNotifications();
      return;
    case 'reset-workspace': {
      const ok = await askConfirm({
        title: 'Erase this workspace?',
        text: 'Every application, CV, cover letter and attachment in this browser will be deleted. This cannot be undone.',
        confirmLabel: 'Erase everything',
        danger: true
      });
      if (!ok) return;
      try { await clearFiles(); } catch (error) { console.warn(error); }
      resetState();
      state = defaultState();
      navigate('#/today');
      renderRoute();
      showOnboarding(1);
      toast('Workspace erased. You can start fresh.');
      return;
    }
    case 'do-print':
      window.print();
      return;
    case 'onboard-next':
      showOnboarding(2);
      return;
    case 'onboard-back':
      showOnboarding(1);
      return;
    case 'onboard-demo':
      finishOnboarding('demo');
      return;
    case 'onboard-fresh':
      finishOnboarding('fresh');
      return;
    case 'onboard-skip':
      skipOnboarding();
      return;
    default:
      return;
  }
}

/* ------------------------------------------------------------------ */
/* Event wiring                                                        */
/* ------------------------------------------------------------------ */

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function captureFileList() {
  const input = document.getElementById('capture-file');
  const picked = input?.files ? [...input.files] : [];
  return [...ui.sharedFiles, ...picked];
}

function renderCaptureAttachments() {
  const status = document.getElementById('capture-file-status');
  if (!status) return;
  const files = captureFileList();
  status.innerHTML = files.length
    ? files.map(file => `<div class="attached-file">${icon('paperclip')}<span>${esc(file.name)} · ${esc(formatBytes(file.size))}</span></div>`).join('')
    : '<p class="tiny muted">No files attached yet.</p>';
}

async function submitCapture(form) {
  const data = formValues(form);
  const role = String(data.role || '').trim();
  const company = String(data.company || '').trim();
  if (!role) {
    toast('Add the role before saving.', 'error');
    document.getElementById('capture-role')?.focus();
    return;
  }
  if (!company) {
    toast('Add the company before saving.', 'error');
    document.getElementById('capture-company')?.focus();
    return;
  }

  const rawText = document.getElementById('capture-text')?.value.trim() || '';
  const status = STATUSES[data.status] ? data.status : 'captured';
  const app = makeApplication({
    role,
    company,
    status,
    priority: data.priority || 'normal',
    source: String(data.source || '').trim() || 'Direct',
    url: data.url || '',
    applicationEmail: data.applicationEmail || '',
    location: data.location || '',
    workMode: data.workMode || '',
    salary: data.salary || '',
    deadline: data.deadline || '',
    deadlineTime: data.deadlineTime || '',
    nextAction: data.nextAction || '',
    nextActionDate: data.nextActionDate || '',
    tags: splitList(data.tags),
    notes: data.notes || '',
    jobDescription: data.jobDescription || rawText,
    contact: {
      name: data.contactName || '',
      email: data.contactEmail || '',
      phone: data.contactPhone || ''
    }
  });

  const files = captureFileList();
  let attached = 0;
  for (const file of files) {
    try {
      const record = await addFile(file, file.name, file.type);
      addDocument(app, {
        kind: file.type.startsWith('image/') ? 'screenshot' : file.type === 'application/pdf' ? 'pdf' : 'attachment',
        name: file.name,
        fileId: record.id,
        fileType: record.type,
        fileSize: record.size
      });
      attached += 1;
    } catch (error) {
      console.warn('Could not save attachment', error);
    }
  }

  state.applications.unshift(app);
  ui.sharedFiles = [];
  ui.captureParse = null;
  saveState(state);
  closeModal({ restoreFocus: false });
  navigate(`#/jobs/${app.id}`);
  toast(status === 'applied' ? 'Application captured and marked as sent.' : 'Application captured. Check the details when you are ready.');
  if (files.length && attached < files.length) {
    toast('Some attachments could not be saved. The application itself is safe.', 'error');
  }
}

function submitEdit(form) {
  const data = formValues(form);
  const app = getApplication(state, data.id);
  if (!app) {
    toast('That application no longer exists.', 'error');
    closeModal();
    return;
  }
  const previousInterview = `${app.interviewDate}|${app.interviewTime}`;
  app.role = String(data.role || '').trim();
  app.company = String(data.company || '').trim();
  app.priority = data.priority || 'normal';
  app.deadline = data.deadline || '';
  app.deadlineTime = data.deadlineTime || '';
  app.source = String(data.source || '').trim() || 'Direct';
  app.url = data.url || '';
  app.applicationEmail = data.applicationEmail || '';
  app.location = data.location || '';
  app.workMode = data.workMode || '';
  app.salary = data.salary || '';
  app.tags = splitList(data.tags);
  app.contact = {
    name: data.contactName || '',
    role: data.contactRole || '',
    email: data.contactEmail || '',
    phone: data.contactPhone || ''
  };
  app.nextAction = data.nextAction || '';
  app.nextActionDate = data.nextActionDate || '';
  app.followUpDate = data.followUpDate || '';
  app.interviewDate = data.interviewDate || '';
  app.interviewTime = data.interviewTime || '';
  app.notes = data.notes || '';
  app.jobDescription = data.jobDescription || '';
  if (data.appliedAt) app.appliedAt = data.appliedAt;
  if (String(app.status) !== String(data.status || '')) {
    setApplicationStatus(state, app, data.status || 'captured', 'Updated from the application form');
  }
  if (app.status === 'applied' && !app.appliedAt) app.appliedAt = todayISO();
  if (app.interviewDate && `${app.interviewDate}|${app.interviewTime}` !== previousInterview) {
    addEvent(app, 'interview', 'Interview details updated', '', `${app.interviewDate}T${app.interviewTime || '09:00'}:00.000Z`, {
      date: app.interviewDate,
      time: app.interviewTime
    });
  }
  app.needsReview = app.status === 'captured' && (!app.role || !app.company);
  app.updatedAt = nowISO();
  saveState(state);
  closeModal({ restoreFocus: false });
  renderRoute({ scroll: false });
  toast('Application updated.');
}

function submitReply(form) {
  const data = formValues(form);
  const app = getApplication(state, data.applicationId);
  if (!app) {
    toast('Choose an application first.', 'error');
    return;
  }
  const body = String(data.body || '').trim();
  if (!body) {
    toast('Paste the email text first.', 'error');
    document.getElementById('reply-body')?.focus();
    return;
  }
  const analysis = classifyReply(body);
  const primaryDate = analysis.dates[0] || null;
  const at = data.at ? new Date(data.at).toISOString() : nowISO();
  logReply(state, app, {
    at,
    from: data.from || analysis.contactName || '',
    subject: data.subject || analysis.summary.slice(0, 120),
    body,
    intent: analysis.intent,
    dates: analysis.dates,
    contactName: analysis.contactName,
    contactEmail: analysis.contactEmail,
    interviewDate: analysis.intent === 'interview' ? primaryDate?.iso || '' : '',
    interviewTime: analysis.intent === 'interview' ? primaryDate?.time || '' : ''
  });
  if (!app.contact.name && (data.from || analysis.contactName)) {
    app.contact.name = String(data.from || analysis.contactName).trim();
  }
  if (!app.contact.email && analysis.contactEmail) app.contact.email = analysis.contactEmail;
  if (data.updateStatus && analysis.suggestedStatus) {
    setApplicationStatus(state, app, analysis.suggestedStatus, 'Suggested from a logged email reply');
  }
  if (data.setNext) {
    app.nextAction = data.nextAction || analysis.suggestedNextAction || app.nextAction;
    app.nextActionDate = data.nextActionDate || analysis.suggestedNextActionDate || app.nextActionDate;
  }
  if (!app.followUpDate && analysis.suggestedFollowUpDate) app.followUpDate = analysis.suggestedFollowUpDate;
  app.needsReview = false;
  app.updatedAt = nowISO();
  ui.replyAnalysis = null;
  saveState(state);
  closeModal({ restoreFocus: false });
  renderRoute({ scroll: false });
  toast(`Reply logged as ${INTENT_LABELS[analysis.intent] || 'a reply'}.`);
}

function submitTailor(form) {
  const data = formValues(form);
  const app = getApplication(state, data.applicationId);
  if (!app) {
    toast('That application no longer exists.', 'error');
    closeModal();
    return;
  }
  const base = data.baseCV && data.baseCV !== 'new' ? getCV(state, data.baseCV) : null;
  const cv = base
    ? cloneCV(base)
    : createCVFromProfile(state.profile, {
      name: data.name || `${app.role || 'Role'} — ${app.company || 'Company'}`,
      kind: 'tailored'
    });
  const description = app.jobDescription || base?.jobDescription || '';
  cv.name = String(data.name || '').trim() || `${app.role || 'Role'} — ${app.company || 'Company'}`;
  cv.kind = 'tailored';
  cv.applicationId = app.id;
  cv.targetRole = app.role || cv.targetRole;
  cv.targetCompany = app.company || cv.targetCompany;
  cv.jobDescription = description;
  const result = tailorCV(cv, description);
  Object.assign(cv, result.cv);
  cv.name = String(data.name || '').trim() || cv.name;
  cv.applicationId = app.id;
  cv.targetRole = app.role || cv.targetRole;
  cv.targetCompany = app.company || cv.targetCompany;
  cv.updatedAt = nowISO();
  state.cvs.push(cv);
  if (data.attach) app.cvId = cv.id;
  if (result.summarySuggestion) ui.summarySuggestion = { cvId: cv.id, text: result.summarySuggestion };
  saveState(state);
  closeModal({ restoreFocus: false });
  navigate(`#/studio/cv/${cv.id}`);
  toast(description.trim()
    ? result.note
    : 'Tailored CV created. Add the job advert on this page to score the match and select stronger bullets.');
}

function submitNewCover(form) {
  const data = formValues(form);
  const app = data.applicationId ? getApplication(state, data.applicationId) : null;
  let base = data.cvId ? getCV(state, data.cvId) : null;
  if (!base && app?.cvId) base = getCV(state, app.cvId);
  if (!base) base = state.cvs.find(cv => cv.kind === 'master') || state.cvs[0] || null;
  const cover = ensureCover({
    name: String(data.name || '').trim() || 'Cover letter',
    applicationId: app?.id || null,
    cvId: base?.id || null,
    targetRole: app?.role || '',
    targetCompany: app?.company || '',
    recipient: app?.contact.name || 'Hiring Manager',
    contact: {
      name: state.profile.name,
      email: state.profile.email,
      phone: state.profile.phone,
      location: state.profile.location
    }
  });
  if (base) {
    const draft = generateCoverDraft(base, app || {
      role: cover.targetRole,
      company: cover.targetCompany,
      jobDescription: base.jobDescription || ''
    });
    cover.body = draft.body;
    if (!cover.recipient) cover.recipient = draft.recipient;
    if (!cover.contact.name) cover.contact = { ...draft.contact };
  }
  state.covers.unshift(cover);
  if (app) app.coverId = cover.id;
  saveState(state);
  closeModal({ restoreFocus: false });
  navigate(`#/studio/cover/${cover.id}`);
  toast(base ? 'Cover letter drafted from your CV. Edit it until it sounds like you.' : 'Cover letter created. Add your details and write the first draft.');
}

function submitProfile(form) {
  if (!saveProfileFromForm()) {
    toast('The profile form could not be read. Reload and try again.', 'error');
    return;
  }
  renderRoute({ scroll: false });
  toast('Profile saved. New CVs will start from these details.');
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch (error) {
    console.warn('Notification permission could not be requested.', error);
    return false;
  }
}

async function enableNotifications() {
  if (!('Notification' in window)) {
    toast('This browser does not support notifications.', 'error');
    return;
  }
  const granted = await requestNotificationPermission();
  if (!granted) {
    state.settings.reminders = false;
    saveState(state);
    toast('Notifications are blocked. Allow them in your browser settings, then try again.', 'error');
    renderRoute({ scroll: false });
    return;
  }
  state.settings.reminders = true;
  saveState(state);
  renderRoute({ scroll: false });
  toast('Daily reminders enabled. Kazi will send one quiet nudge when something needs you.');
  sendDailyReminder({ force: true });
}

async function sendDailyReminder({ force = false } = {}) {
  if (!state.settings.reminders) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const stampKey = 'kazi.reminder.sent';
  if (!force) {
    try {
      if (localStorage.getItem(stampKey) === todayISO()) return;
    } catch { /* storage can be unavailable */ }
  }
  const items = needsAttention(state)
    .filter(item => item.kind === 'deadline' || item.kind === 'interview')
    .slice(0, 3);
  if (!items.length) return;
  const title = items.length === 1
    ? 'Kazi — one thing needs you today'
    : `Kazi — ${items.length} things need you today`;
  const body = items.map(item => {
    const role = item.app.role || 'Application';
    const company = item.app.company ? ` · ${item.app.company}` : '';
    return `${role}${company} — ${item.label}`;
  }).join('\n');
  const options = {
    body,
    icon: 'icons/icon-192.png',
    badge: 'icons/favicon-64.png',
    tag: 'kazi-daily',
    data: { url: './#/today' }
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration?.showNotification) await registration.showNotification(title, options);
    else new Notification(title, options);
    try { localStorage.setItem(stampKey, todayISO()); } catch { /* ignore */ }
  } catch (error) {
    console.warn('Daily reminder could not be shown.', error);
  }
}

async function importBackupFile(file) {
  if (!file) return;
  try {
    const text = await readFileAsText(file);
    const payload = JSON.parse(text);
    const restored = await restoreBackup(payload);
    state = restored;
    saveState(state);
    ui.jobsGroup = 'all';
    ui.jobsStatus = 'all';
    ui.jobsSource = 'all';
    navigate('#/today');
    toast(`Backup restored: ${pl(state.applications.length, 'application')} and ${pl(state.cvs.length, 'CV')}.`);
  } catch (error) {
    console.error('Backup restore failed', error);
    toast(error.message || 'That backup could not be restored.', 'error');
  }
}

async function importCSVFile(file) {
  if (!file) return;
  try {
    const text = await readFileAsText(file);
    const added = importApplicationsCSV(state, text);
    if (!added) {
      toast('No applications found. Check the CSV has role or company columns.', 'error');
      return;
    }
    saveState(state);
    renderRoute({ scroll: false });
    toast(`${pl(added, 'application')} imported. Review the stages and dates.`);
  } catch (error) {
    console.error('CSV import failed', error);
    toast('That CSV could not be imported.', 'error');
  }
}

function handleDocumentClick(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const actionElement = event.target.closest('[data-action]');
  if (!actionElement) {
    if (event.target.matches('[data-modal-backdrop]')) closeModal();
    return;
  }
  if (actionElement.disabled) return;
  event.preventDefault();
  Promise.resolve(handleAction(actionElement.dataset.action, actionElement)).catch(error => {
    console.error('Kazi action failed', error);
    toast('That action did not finish. Your saved data is still safe.', 'error');
  });
}

function handleSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const kind = form.dataset.form;
  const run = async () => {
    if (kind === 'capture') return submitCapture(form);
    if (kind === 'edit-job') return submitEdit(form);
    if (kind === 'reply') return submitReply(form);
    if (kind === 'tailor') return submitTailor(form);
    if (kind === 'new-cover') return submitNewCover(form);
    if (kind === 'profile') return submitProfile(form);
    return null;
  };
  run().catch(error => {
    console.error('Kazi form failed', error);
    toast('That form could not be saved. Nothing was lost — try again.', 'error');
  });
}

async function handleChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.matches('[data-change="app-status"]')) {
    const app = getApplication(state, target.dataset.id);
    if (!app) return;
    if (setApplicationStatus(state, app, target.value)) {
      saveState(state);
      renderRoute({ scroll: false });
      toast(app.status === 'applied' ? 'Marked as applied. The reply clock starts now.' : `Moved to ${statusMeta(app.status).label.toLowerCase()}.`);
    }
    return;
  }

  if (target.id === 'pref-reminder-days') {
    state.settings.reminderDays = Number(target.value) || 2;
    saveState(state);
    return;
  }

  if (target.id === 'pref-hide-demo') {
    state.settings.hideDemoBanner = target.checked;
    saveState(state);
    renderRoute({ scroll: false });
    return;
  }

  if (target.id === 'pref-ai') {
    if (!target.checked) {
      state.settings.ai = false;
      saveState(state);
      toast('AI assistance off. Your records stay on this device.');
      return;
    }
    target.disabled = true;
    const ready = await aiAvailable();
    target.disabled = false;
    if (!ready) {
      target.checked = false;
      state.settings.ai = false;
      saveState(state);
      toast('AI is not configured on this deployment yet. Local features still work.', 'error');
      return;
    }
    state.settings.ai = true;
    saveState(state);
    toast('AI assistance on. Only text you choose will be sent.');
    return;
  }

  if (target.id === 'pref-reminders') {
    if (target.checked) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        target.checked = false;
        state.settings.reminders = false;
        saveState(state);
        toast('Notifications are blocked. Allow them in your browser settings first.', 'error');
        return;
      }
      state.settings.reminders = true;
      saveState(state);
      toast('Daily reminders enabled.');
      sendDailyReminder();
    } else {
      state.settings.reminders = false;
      saveState(state);
      toast('Daily reminders turned off.');
    }
    return;
  }

  if (target.id === 'import-backup') {
    const file = target.files?.[0];
    target.value = '';
    await importBackupFile(file);
    return;
  }

  if (target.id === 'import-csv') {
    const file = target.files?.[0];
    target.value = '';
    await importCSVFile(file);
    return;
  }

  if (target.id === 'jobs-source') {
    ui.jobsSource = target.value || 'all';
    applyJobFilters();
    return;
  }

  if (target.id === 'jobs-status') {
    ui.jobsStatus = target.value || 'all';
    applyJobFilters();
    return;
  }

  if (target.id === 'capture-file') {
    renderCaptureAttachments();
    return;
  }

  if (target.closest('#cv-editor')) {
    scheduleCVSync();
    return;
  }

  if (target.closest('#cover-editor')) {
    scheduleCoverSync();
  }
}

function handleInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.id === 'jobs-search') {
    applyJobFilters();
    return;
  }
  if (target.closest('#cv-editor')) scheduleCVSync();
  else if (target.closest('#cover-editor')) scheduleCoverSync();
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    if (modalRoot.firstElementChild) {
      closeModal();
      return;
    }
    return;
  }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    const form = event.target.closest('form');
    if (form && form.dataset.form) {
      event.preventDefault();
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
  }
}

function handleRouteChange() {
  flushEditors();
  if (modalRoot.firstElementChild) closeModal({ restoreFocus: false });
  renderRoute();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') return;
  const register = () => {
    navigator.serviceWorker.register('./sw.js').catch(error => {
      console.warn('Kazi could not register its offline worker.', error);
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

async function handleSharedPayload() {
  const params = new URLSearchParams(window.location.search);
  const isShared = params.get('shared') === '1';
  const wantsCapture = params.get('capture') === '1';
  if (!isShared && !wantsCapture) return;
  if (isShared) {
    try {
      history.replaceState(null, '', `${window.location.pathname}${window.location.hash || '#/today'}`);
    } catch { /* ignore */ }
  }
  const payload = isShared ? await readSharedPayload() : null;
  const textParts = [payload?.title, payload?.text, payload?.url]
    .map(value => String(value || '').trim())
    .filter((value, index, values) => value && values.indexOf(value) === index);
  const files = (Array.isArray(payload?.files) ? payload.files : [])
    .map((entry, index) => {
      if (!entry?.blob) return null;
      const name = entry.name || `shared-file-${index + 1}`;
      const type = entry.type || entry.blob.type || '';
      try {
        return typeof File === 'function' ? new File([entry.blob], name, { type }) : entry.blob;
      } catch {
        return entry.blob;
      }
    })
    .filter(Boolean);
  const request = {
    tab: textParts.length ? 'paste' : files.length ? 'screenshot' : 'manual',
    text: textParts.join('\n\n'),
    files
  };
  if (state.meta.onboarded) openCaptureModal(request);
  else ui.pendingCapture = request;
}

function scheduleDailyReminderCheck() {
  window.setTimeout(() => sendDailyReminder(), 1600);
  window.setInterval(() => sendDailyReminder(), 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sendDailyReminder();
  });
}

function bindEvents() {
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('change', event => {
    handleChange(event).catch(error => {
      console.error('Kazi change handler failed', error);
      toast('That change could not be saved.', 'error');
    });
  });
  document.addEventListener('input', handleInput);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('hashchange', handleRouteChange);
  window.addEventListener('beforeunload', flushEditors);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushEditors();
  });
}

function init() {
  bindEvents();
  if (!window.location.hash) {
    try {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/today`);
    } catch { /* ignore */ }
  }
  renderRoute();
  maybeOnboard();
  handleSharedPayload().catch(error => console.warn('Shared content could not be opened.', error));
  registerServiceWorker();
  scheduleDailyReminderCheck();
  if (state.meta.loadError) {
    toast('Kazi could not read saved data. A fresh workspace is open; restore a backup if you have one.', 'error');
  }
}

init();

