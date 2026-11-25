/* Optional AI client. It is called only from an explicit AI action, and only
   when the person has switched AI assistance on in Settings. */

const ENDPOINT = new URL('api/ai', document.baseURI).href;

export class AIError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'AIError';
    this.status = status;
  }
}

function short(value, max = 300) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cvFacts(cvInput = {}) {
  const cv = cvInput || {};
  return {
    summary: short(cv.summary, 900),
    targetRole: short(cv.targetRole, 120),
    skills: (cv.skills || []).filter(skill => skill.selected && skill.name).slice(0, 20).map(skill => short(skill.name, 60)),
    experience: (cv.experience || []).filter(item => item.selected).slice(0, 4).map(item => ({
      role: short(item.role, 120),
      company: short(item.company, 120),
      start: short(item.start, 20),
      end: short(item.current ? 'Present' : item.end, 20),
      bullets: (item.bullets || []).filter(bullet => bullet.selected && bullet.text).slice(0, 5).map(bullet => short(bullet.text, 280))
    })),
    education: (cv.education || []).filter(item => item.selected).slice(0, 3).map(item => ({
      degree: short(item.degree, 120),
      school: short(item.school, 120)
    })),
    projects: (cv.projects || []).filter(item => item.selected).slice(0, 2).map(item => ({
      name: short(item.name, 120),
      detail: short(item.detail, 240)
    }))
  };
}

async function request(task, body) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 28_000);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, ...body }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new AIError(payload.error || 'AI could not finish that request.', response.status);
    }
    return payload;
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIError(error.name === 'AbortError' ? 'AI took too long to answer.' : 'AI is unavailable right now.');
  } finally {
    window.clearTimeout(timer);
  }
}

export async function aiAvailable() {
  try {
    const response = await fetch(ENDPOINT, { headers: { Accept: 'application/json' } });
    if (!response.ok) return false;
    const payload = await response.json();
    return Boolean(payload.configured);
  } catch {
    return false;
  }
}

export async function aiParseJob(text) {
  const payload = await request('parse', { text: String(text || '').slice(0, 9000) });
  return payload.data || {};
}

export async function aiSummary({ cv, role = '', company = '', jobDescription = '' }) {
  const payload = await request('summary', {
    cv: cvFacts(cv),
    role,
    company,
    jobDescription: short(jobDescription, 8000)
  });
  return short(payload.text, 1200);
}

export async function aiCover({ cv, role = '', company = '', recipient = '', jobDescription = '' }) {
  const payload = await request('cover', {
    cv: cvFacts(cv),
    role,
    company,
    recipient,
    jobDescription: short(jobDescription, 8000)
  });
  return String(payload.text || '').trim().slice(0, 4000);
}
