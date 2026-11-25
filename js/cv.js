/* Kazi — CV and cover letter engine.
   Everything is local and editable. Tailoring is transparent keyword
   matching, not a black box. */

import { extractKeywords, matchKeywords, keywordHits, termPresent, extractEmails } from './parse.js';
import { esc, uid, nowISO, formatDate, formatDateTime, formatRange, stripProtocol, titleCase } from './utils.js';

export const SECTION_ORDER = ['summary', 'experience', 'education', 'projects', 'skills', 'certifications', 'languages'];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value == null ? '' : value).trim();
}

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function list(values) {
  const items = values.filter(Boolean);
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function lowerFirst(value) {
  const textValue = text(value);
  if (!textValue) return '';
  return textValue.charAt(0).toLowerCase() + textValue.slice(1);
}

export function normaliseProfile(profile = {}) {
  return {
    name: text(profile.name),
    headline: text(profile.headline),
    email: text(profile.email),
    phone: text(profile.phone),
    location: text(profile.location),
    links: {
      linkedin: text(profile.links?.linkedin),
      portfolio: text(profile.links?.portfolio),
      website: text(profile.links?.website)
    },
    summary: text(profile.summary),
    skills: asArray(profile.skills).map(skill => text(skill)).filter(Boolean),
    experience: asArray(profile.experience).map(item => ({
      id: item.id || uid('exp'),
      role: text(item.role),
      company: text(item.company),
      location: text(item.location),
      start: text(item.start),
      end: text(item.end),
      current: Boolean(item.current),
      bullets: asArray(item.bullets).map(bullet => text(bullet)).filter(Boolean)
    })),
    education: asArray(profile.education).map(item => ({
      id: item.id || uid('edu'),
      degree: text(item.degree),
      school: text(item.school),
      location: text(item.location),
      start: text(item.start),
      end: text(item.end),
      detail: text(item.detail)
    })),
    projects: asArray(profile.projects).map(item => ({
      id: item.id || uid('project'),
      name: text(item.name),
      link: text(item.link),
      detail: text(item.detail)
    })),
    certifications: asArray(profile.certifications).map(item => ({
      id: item.id || uid('cert'),
      name: text(item.name),
      issuer: text(item.issuer),
      year: text(item.year)
    })),
    languages: asArray(profile.languages).map(item => ({
      id: item.id || uid('lang'),
      name: text(item.name),
      level: text(item.level)
    }))
  };
}

export function normaliseCV(cv = {}) {
  const value = clone(cv || {});
  const contact = value.contact || {};
  const normalized = {
    id: value.id || uid('cv'),
    name: text(value.name) || 'Untitled CV',
    kind: value.kind || 'tailored',
    isDemo: Boolean(value.isDemo),
    createdAt: value.createdAt || nowISO(),
    updatedAt: value.updatedAt || nowISO(),
    applicationId: value.applicationId || null,
    targetRole: text(value.targetRole),
    targetCompany: text(value.targetCompany),
    jobDescription: text(value.jobDescription),
    contact: {
      name: text(contact.name),
      headline: text(contact.headline),
      email: text(contact.email),
      phone: text(contact.phone),
      location: text(contact.location),
      linkedin: text(contact.linkedin),
      portfolio: text(contact.portfolio),
      website: text(contact.website)
    },
    summary: text(value.summary),
    experience: asArray(value.experience).map(item => ({
      id: item.id || uid('exp'),
      role: text(item.role),
      company: text(item.company),
      location: text(item.location),
      start: text(item.start),
      end: text(item.end),
      current: Boolean(item.current),
      selected: item.selected !== false,
      bullets: asArray(item.bullets).map(bullet => {
        if (typeof bullet === 'string') return { id: uid('bullet'), text: bullet, selected: true };
        return { id: bullet.id || uid('bullet'), text: text(bullet.text), selected: bullet.selected !== false };
      }).filter(bullet => bullet.text)
    })),
    education: asArray(value.education).map(item => ({
      id: item.id || uid('edu'),
      degree: text(item.degree),
      school: text(item.school),
      location: text(item.location),
      start: text(item.start),
      end: text(item.end),
      detail: text(item.detail),
      selected: item.selected !== false
    })),
    projects: asArray(value.projects).map(item => ({
      id: item.id || uid('project'),
      name: text(item.name),
      link: text(item.link),
      detail: text(item.detail),
      selected: item.selected !== false
    })),
    skills: asArray(value.skills).map(skill => {
      if (typeof skill === 'string') return { id: uid('skill'), name: skill, selected: true };
      return { id: skill.id || uid('skill'), name: text(skill.name), selected: skill.selected !== false };
    }).filter(skill => skill.name),
    certifications: asArray(value.certifications).map(item => ({
      id: item.id || uid('cert'),
      name: text(item.name),
      issuer: text(item.issuer),
      year: text(item.year),
      selected: item.selected !== false
    })).filter(item => item.name),
    languages: asArray(value.languages).map(item => {
      if (typeof item === 'string') return { id: uid('lang'), name: item, level: '', selected: true };
      return { id: item.id || uid('lang'), name: text(item.name), level: text(item.level), selected: item.selected !== false };
    }).filter(item => item.name),
    sectionOrder: Array.isArray(value.sectionOrder) && value.sectionOrder.length
      ? value.sectionOrder.filter(section => SECTION_ORDER.includes(section))
      : [...SECTION_ORDER],
    keywords: asArray(value.keywords)
  };
  for (const section of SECTION_ORDER) {
    if (!normalized.sectionOrder.includes(section)) normalized.sectionOrder.push(section);
  }
  return normalized;
}

export function createCVFromProfile(profile, { name, kind = 'master', isDemo = false } = {}) {
  const source = normaliseProfile(profile);
  const cv = normaliseCV({
    name: name || (source.name ? `${source.name} — CV` : 'My CV'),
    kind,
    isDemo,
    contact: {
      name: source.name,
      headline: source.headline,
      email: source.email,
      phone: source.phone,
      location: source.location,
      linkedin: source.links.linkedin,
      portfolio: source.links.portfolio,
      website: source.links.website
    },
    summary: source.summary,
    experience: source.experience.map(exp => ({
      ...exp,
      selected: true,
      bullets: exp.bullets.map(bullet => ({ text: bullet, selected: true }))
    })),
    education: source.education.map(item => ({ ...item, selected: true })),
    projects: source.projects.map(item => ({ ...item, selected: true })),
    skills: source.skills.map(nameValue => ({ name: nameValue, selected: true })),
    certifications: source.certifications.map(item => ({ ...item, selected: true })),
    languages: source.languages.map(item => ({ ...item, selected: true }))
  });
  return cv;
}

export function cloneCV(cv) {
  const copy = normaliseCV(cv);
  copy.id = uid('cv');
  copy.createdAt = nowISO();
  copy.updatedAt = nowISO();
  copy.isDemo = false;
  return copy;
}

export function cvPlainText(cv) {
  const value = normaliseCV(cv);
  const parts = [
    value.contact.name,
    value.contact.headline,
    value.contact.email,
    value.contact.phone,
    value.contact.location,
    value.summary
  ];
  for (const exp of value.experience) {
    if (!exp.selected) continue;
    parts.push(exp.role, exp.company, exp.location, formatRange(exp.start, exp.end, exp.current));
    for (const bullet of exp.bullets) {
      if (bullet.selected) parts.push(bullet.text);
    }
  }
  for (const edu of value.education) {
    if (edu.selected) parts.push(edu.degree, edu.school, edu.detail);
  }
  for (const project of value.projects) {
    if (project.selected) parts.push(project.name, project.detail);
  }
  for (const skill of value.skills) {
    if (skill.selected) parts.push(skill.name);
  }
  for (const cert of value.certifications) {
    if (cert.selected) parts.push(cert.name, cert.issuer, cert.year);
  }
  for (const lang of value.languages) {
    if (lang.selected) parts.push(lang.name, lang.level);
  }
  return parts.filter(Boolean).join('\n');
}

function contactLine(contact) {
  const parts = [contact.email, contact.phone, contact.location].filter(Boolean);
  return parts.map(part => esc(part)).join(' <span class="cv-sep">·</span> ');
}

function linksLine(contact) {
  const links = [
    contact.linkedin ? { url: contact.linkedin, label: 'LinkedIn' } : null,
    contact.portfolio ? { url: contact.portfolio, label: 'Portfolio' } : null,
    contact.website ? { url: contact.website, label: stripProtocol(contact.website) } : null
  ].filter(Boolean);
  if (!links.length) return '';
  return links.map(link => {
    const url = /^https?:\/\//i.test(link.url) ? link.url : `https://${link.url}`;
    return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(link.label)}</a>`;
  }).join(' <span class="cv-sep">·</span> ');
}

function sectionHeading(label) {
  return `<h2 class="cv-section-title">${esc(label)}</h2>`;
}

export function renderCV(input, { compact = false, forPrint = false } = {}) {
  const cv = normaliseCV(input);
  const contact = cv.contact;
  const selectedExperience = cv.experience.filter(exp => exp.selected && (exp.role || exp.company));
  const selectedEducation = cv.education.filter(item => item.selected && (item.degree || item.school));
  const selectedProjects = cv.projects.filter(item => item.selected && item.name);
  const selectedSkills = cv.skills.filter(skill => skill.selected && skill.name);
  const selectedCerts = cv.certifications.filter(item => item.selected && item.name);
  const selectedLanguages = cv.languages.filter(item => item.selected && item.name);
  const className = `cv-sheet${compact ? ' cv-sheet--compact' : ''}${forPrint ? ' cv-sheet--print' : ''}`;

  const sections = {
    summary: cv.summary ? `
      <section class="cv-section cv-section--summary">
        ${sectionHeading('Summary')}
        <p>${esc(cv.summary).replace(/\n/g, '<br>')}</p>
      </section>` : '',
    experience: selectedExperience.length ? `
      <section class="cv-section">
        ${sectionHeading('Experience')}
        ${selectedExperience.map(exp => {
          const bullets = exp.bullets.filter(bullet => bullet.selected && bullet.text);
          return `
          <div class="cv-role">
            <div class="cv-role-head">
              <div>
                <h3>${esc(exp.role || 'Role')}</h3>
                <p class="cv-role-company">${esc([exp.company, exp.location].filter(Boolean).join(' · '))}</p>
              </div>
              <p class="cv-role-dates">${esc(formatRange(exp.start, exp.end, exp.current))}</p>
            </div>
            ${bullets.length ? `<ul>${bullets.map(bullet => `<li>${esc(bullet.text)}</li>`).join('')}</ul>` : ''}
          </div>`;
        }).join('')}
      </section>` : '',
    education: selectedEducation.length ? `
      <section class="cv-section">
        ${sectionHeading('Education')}
        ${selectedEducation.map(item => `
          <div class="cv-role">
            <div class="cv-role-head">
              <div>
                <h3>${esc(item.degree || 'Qualification')}</h3>
                <p class="cv-role-company">${esc([item.school, item.location].filter(Boolean).join(' · '))}</p>
              </div>
              <p class="cv-role-dates">${esc(formatRange(item.start, item.end, false))}</p>
            </div>
            ${item.detail ? `<p class="cv-detail">${esc(item.detail)}</p>` : ''}
          </div>`).join('')}
      </section>` : '',
    projects: selectedProjects.length ? `
      <section class="cv-section">
        ${sectionHeading('Projects')}
        ${selectedProjects.map(item => `
          <div class="cv-role">
            <div class="cv-role-head">
              <div>
                <h3>${esc(item.name)}</h3>
                ${item.link ? `<p class="cv-role-company"><a href="${esc(item.link)}" target="_blank" rel="noopener">${esc(stripProtocol(item.link))}</a></p>` : ''}
              </div>
            </div>
            ${item.detail ? `<p class="cv-detail">${esc(item.detail)}</p>` : ''}
          </div>`).join('')}
      </section>` : '',
    skills: selectedSkills.length ? `
      <section class="cv-section">
        ${sectionHeading('Skills')}
        <p class="cv-skills">${selectedSkills.map(skill => esc(skill.name)).join(' · ')}</p>
      </section>` : '',
    certifications: selectedCerts.length ? `
      <section class="cv-section">
        ${sectionHeading('Certifications')}
        ${selectedCerts.map(item => `
          <p class="cv-line"><strong>${esc(item.name)}</strong>${item.issuer ? ` — ${esc(item.issuer)}` : ''}${item.year ? `, ${esc(item.year)}` : ''}</p>
        `).join('')}
      </section>` : '',
    languages: selectedLanguages.length ? `
      <section class="cv-section">
        ${sectionHeading('Languages')}
        <p class="cv-line">${selectedLanguages.map(item => `${esc(item.name)}${item.level ? ` (${esc(item.level)})` : ''}`).join(' · ')}</p>
      </section>` : ''
  };

  return `
    <article class="${className}" aria-label="CV preview">
      <header class="cv-head">
        <h1>${esc(contact.name || 'Your Name')}</h1>
        ${contact.headline ? `<p class="cv-headline">${esc(contact.headline)}</p>` : ''}
        ${contactLine(contact) ? `<p class="cv-contact">${contactLine(contact)}</p>` : ''}
        ${linksLine(contact) ? `<p class="cv-links">${linksLine(contact)}</p>` : ''}
      </header>
      ${cv.sectionOrder.map(section => sections[section] || '').join('')}
    </article>`;
}

export function analyseCV(input, jobDescription = '') {
  const cv = normaliseCV(input);
  const keywords = extractKeywords(jobDescription, { limit: 24 });
  const plain = cvPlainText(cv);
  const match = matchKeywords(plain, keywords);
  const selectedExperience = cv.experience.filter(exp => exp.selected && (exp.role || exp.company));
  const recent = selectedExperience[0];
  const recentBullets = recent ? recent.bullets.filter(bullet => bullet.selected && bullet.text) : [];
  const selectedSkills = cv.skills.filter(skill => skill.selected && skill.name);
  const ats = [];

  const check = (ok, pass, warn) => {
    ats.push({ status: ok ? 'pass' : 'warn', text: ok ? pass : warn });
  };

  check(Boolean(cv.contact.name), 'Name is present.', 'Add your full name.');
  check(Boolean(cv.contact.email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cv.contact.email), 'A valid email is present.', 'Add a valid email address.');
  check(Boolean(cv.contact.phone), 'Phone number is present.', 'Add a phone number.');
  check(cv.summary.length >= 120 && cv.summary.length <= 700, 'Summary length is in a readable range.', 'Write a short summary (2–4 lines).');
  check(selectedExperience.length > 0, 'At least one experience entry is selected.', 'Select or add an experience entry.');
  check(recentBullets.length >= 2, 'Your most recent role has at least two bullets.', 'Add at least two achievement bullets to your most recent role.');
  check(selectedExperience.every(exp => exp.start || exp.end), 'Experience entries have dates.', 'Add dates to every selected role.');
  check(selectedSkills.length >= 5, 'You have listed at least five skills.', 'List at least five relevant skills.');
  check(keywords.length > 0, 'The job advert has been analysed.', 'Paste the job description to get keyword insights.');
  if (match.missing.length) {
    ats.push({
      status: 'warn',
      text: `${match.missing.length} job keywords are missing from this CV: ${match.missing.slice(0, 4).map(item => item.term).join(', ')}.`
    });
  }
  if (match.score != null) {
    ats.push({
      status: match.score >= 65 ? 'pass' : 'warn',
      text: match.score >= 65
        ? `Keyword match is ${match.score}% — a solid fit for this advert.`
        : `Keyword match is ${match.score}% — add the most important missing terms where they are true.`
    });
  }
  ats.push({ status: 'info', text: 'Keep the layout single-column and the section headings standard. ATS software reads text, not design.' });

  return {
    keywords,
    match,
    score: match.score,
    matched: match.matched,
    missing: match.missing,
    ats,
    plain
  };
}

export function suggestSummary(input, jobDescription = '') {
  const cv = normaliseCV(input);
  const analysis = analyseCV(cv, jobDescription);
  const headline = cv.contact.headline || 'Professional';
  const matchedSkills = cv.skills
    .filter(skill => skill.selected && skill.name)
    .map(skill => skill.name)
    .filter(name => analysis.matched.some(keyword => termPresent(name, keyword.term)))
    .slice(0, 4);
  const topKeywords = analysis.matched.slice(0, 3).map(keyword => keyword.term);
  const focus = matchedSkills.length ? matchedSkills : topKeywords;
  const target = cv.targetRole || 'this role';
  const company = cv.targetCompany ? ` at ${cv.targetCompany}` : '';
  const experience = cv.experience.find(exp => exp.selected && exp.role);
  const years = experience?.start || '';
  const opening = years && /^\d{4}$/.test(years)
    ? `${headline} with experience since ${years}`
    : `${headline} with hands-on experience`;
  const skillsText = focus.length ? ` in ${list(focus)}` : '';
  return `${opening}${skillsText}. I am applying for the ${target} role${company}, and I focus on work that turns evidence into clear decisions.`;
}

export function tailorCV(input, jobDescription = '') {
  const cv = normaliseCV(input);
  const keywords = extractKeywords(jobDescription, { limit: 24 });
  cv.keywords = keywords;
  cv.jobDescription = text(jobDescription);
  let selectedBullets = 0;
  let selectedSkills = 0;

  for (const exp of cv.experience) {
    if (!exp.selected) continue;
    const scored = exp.bullets.map(bullet => ({
      ...bullet,
      hits: keywordHits(bullet.text, keywords)
    }));
    const matching = scored.filter(bullet => bullet.hits > 0);
    if (matching.length) {
      matching.sort((a, b) => b.hits - a.hits);
      const keepIds = new Set(matching.slice(0, 4).map(bullet => bullet.id));
      // Keep at least one existing bullet so a role never becomes empty.
      if (keepIds.size < 1 && scored[0]) keepIds.add(scored[0].id);
      exp.bullets = scored.map(bullet => ({ ...bullet, selected: keepIds.has(bullet.id) }));
      selectedBullets += [...keepIds].length;
    } else {
      selectedBullets += scored.filter(bullet => bullet.selected).length;
    }
  }

  const scoredSkills = cv.skills.map(skill => ({
    ...skill,
    hits: keywordHits(skill.name, keywords)
  }));
  const matchingSkills = scoredSkills.filter(skill => skill.hits > 0);
  if (matchingSkills.length) {
    const keep = new Set(matchingSkills.slice(0, 12).map(skill => skill.id));
    // If only a couple match, keep a few core skills so the section is not sparse.
    for (const skill of scoredSkills) {
      if (keep.size >= 6) break;
      if (skill.selected) keep.add(skill.id);
    }
    cv.skills = scoredSkills.map(skill => ({ ...skill, selected: keep.has(skill.id) }));
    selectedSkills = [...keep].length;
  } else {
    selectedSkills = scoredSkills.filter(skill => skill.selected).length;
  }

  cv.updatedAt = nowISO();
  const summarySuggestion = suggestSummary(cv, jobDescription);
  return {
    cv,
    analysis: analyseCV(cv, jobDescription),
    summarySuggestion,
    note: `Selected ${selectedBullets} experience bullet${selectedBullets === 1 ? '' : 's'} and ${selectedSkills} skill${selectedSkills === 1 ? '' : 's'} that match this advert. Review everything before sending.`
  };
}

export function ensureCover(input = {}) {
  const value = clone(input || {});
  return {
    id: value.id || uid('cover'),
    name: text(value.name) || 'Cover letter',
    isDemo: Boolean(value.isDemo),
    applicationId: value.applicationId || null,
    cvId: value.cvId || null,
    targetRole: text(value.targetRole),
    targetCompany: text(value.targetCompany),
    recipient: text(value.recipient),
    contact: {
      name: text(value.contact?.name),
      email: text(value.contact?.email),
      phone: text(value.contact?.phone),
      location: text(value.contact?.location)
    },
    body: text(value.body),
    createdAt: value.createdAt || nowISO(),
    updatedAt: value.updatedAt || nowISO()
  };
}

export function generateCoverDraft(cvInput, application = {}) {
  const cv = normaliseCV(cvInput);
  const role = text(application.role) || cv.targetRole || 'the role';
  const company = text(application.company) || cv.targetCompany || 'your team';
  const contactName = text(application.contact?.name);
  const source = text(application.source);
  const analysis = analyseCV(cv, application.jobDescription || cv.jobDescription || '');
  const skills = cv.skills
    .filter(skill => skill.selected && skill.name)
    .map(skill => skill.name)
    .filter(name => analysis.matched.some(keyword => termPresent(name, keyword.term)))
    .slice(0, 4);
  const recent = cv.experience.find(exp => exp.selected && (exp.role || exp.company));
  const recentBullet = recent?.bullets.find(bullet => bullet.selected && bullet.text)?.text || '';
  const keyword = analysis.matched[0]?.term || '';
  const sourceLine = source ? ` I came across the opportunity via ${source}.` : '';

  const paragraphs = [
    `Dear ${contactName || 'Hiring Manager'},`,
    `I am writing to apply for the ${role} position at ${company}.${sourceLine}`,
    `I bring hands-on experience${skills.length ? ` in ${list(skills)}` : ''}.${recent && recentBullet ? ` In my role as ${recent.role || 'a professional'} at ${recent.company || 'my current organisation'}, I ${lowerFirst(recentBullet).replace(/\.$/, '')}.` : ''}${keyword ? ` That work has given me a practical grounding in ${keyword}.` : ''}`,
    `I would welcome the chance to discuss how my experience can support ${company}. Thank you for considering my application.`,
    'Sincerely,'
  ];

  return {
    recipient: contactName || 'Hiring Manager',
    body: paragraphs.join('\n\n'),
    contact: {
      name: cv.contact.name,
      email: cv.contact.email,
      phone: cv.contact.phone,
      location: cv.contact.location
    }
  };
}

export function renderCover(input) {
  const cover = ensureCover(input);
  const paragraphs = cover.body.split(/\n{2,}/).map(paragraph => paragraph.trim()).filter(Boolean);
  const salutation = paragraphs.find(paragraph => /^Dear\b/i.test(paragraph));
  const rest = paragraphs.filter(paragraph => paragraph !== salutation);
  const signatureIndex = rest.findIndex(paragraph => /^(sincerely|kind regards|best regards|yours faithfully|yours sincerely)/i.test(paragraph));
  const body = signatureIndex >= 0 ? rest.slice(0, signatureIndex) : rest;
  const closing = signatureIndex >= 0 ? rest[signatureIndex] : 'Sincerely,';
  return `
    <article class="cover-sheet" aria-label="Cover letter preview">
      <header class="cover-head">
        <h1>${esc(cover.contact.name || 'Your Name')}</h1>
        <p>${[cover.contact.email, cover.contact.phone, cover.contact.location].filter(Boolean).map(esc).join(' · ')}</p>
      </header>
      <p class="cover-date">${esc(formatDate(new Date().toISOString().slice(0, 10)))}</p>
      ${cover.recipient ? `<p class="cover-recipient">${esc(cover.recipient)}<br>${esc(cover.targetCompany || '')}</p>` : ''}
      ${salutation ? `<p>${esc(salutation)}</p>` : ''}
      ${body.map(paragraph => `<p>${esc(paragraph).replace(/\n/g, '<br>')}</p>`).join('')}
      <p class="cover-closing">${esc(closing)}</p>
      ${cover.contact.name ? `<p class="cover-signature">${esc(cover.contact.name)}</p>` : ''}
    </article>`;
}

export function coverPlainText(cover) {
  return `${cover.recipient ? `Dear ${cover.recipient},` : ''}\n\n${cover.body}`;
}

export function cvFileName(cv) {
  const base = (cv.contact?.name || cv.name || 'CV').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
  return `${base || 'CV'}-CV`;
}

export function coverFileName(cover) {
  const base = (cover.contact?.name || cover.name || 'Cover-letter').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-');
  return `${base || 'Cover-letter'}-cover-letter`;
}
