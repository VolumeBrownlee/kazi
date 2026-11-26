import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findDates,
  findDeadline,
  parseJobMessage,
  classifyReply,
  extractKeywords,
  matchKeywords,
  parseLink,
  extractRole,
  extractCompany,
  extractLocation,
  detectSource
} from '../js/parse.js';

const REF = new Date(2026, 10, 8); // Sunday, 8 November 2026

const whatsappJob = `Forwarded many times
URGENT: Programme Associate
Nile Fintech is hiring a Programme Associate in Kampala.
Deadline: 14 November 2026
Send your CV to careers@nilefintech.example
Details: https://jobs.example.com/nile-fintech/programme-associate`;

test('parses a forwarded WhatsApp job message', () => {
  const parsed = parseJobMessage(whatsappJob, { refDate: REF });
  assert.equal(parsed.role, 'Programme Associate');
  assert.equal(parsed.company, 'Nile Fintech');
  assert.equal(parsed.location, 'Kampala');
  assert.equal(parsed.deadline, '2026-11-14');
  assert.equal(parsed.applicationEmail, 'careers@nilefintech.example');
  assert.equal(parsed.url, 'https://jobs.example.com/nile-fintech/programme-associate');
  assert.equal(parsed.deadlineConfidence, 'high');
  assert.equal(parsed.confidence.company, true);
});

test('strips adjectives from a role', () => {
  const role = extractRole('We are hiring an experienced and motivated Sales Executive to join our team.');
  assert.equal(role, 'Sales Executive');
});

test('extracts company without swallowing the city', () => {
  const text = 'We are hiring a Sales Executive at XYZ Ltd in Kampala. Apply by Friday 13 Nov.';
  assert.equal(extractCompany(text, 'Sales Executive'), 'XYZ Ltd');
  const parsed = parseJobMessage(text, { refDate: REF });
  assert.equal(parsed.role, 'Sales Executive');
  assert.equal(parsed.company, 'XYZ Ltd');
  assert.equal(parsed.deadline, '2026-11-13');
  assert.equal(parsed.location, 'Kampala');
});

test('parses month-first dates and does not turn May 2026 into May 20', () => {
  const dates = findDates('Applications close November 15, 2026. The programme starts May 2026.', REF);
  const iso = dates.map(date => date.iso);
  assert.ok(iso.includes('2026-11-15'));
  assert.ok(!iso.includes('2026-05-20'));
});

test('parses numeric dates day-first', () => {
  const deadline = findDeadline('Deadline: 15/11/2026. Send your CV to jobs@example.com.', REF);
  assert.equal(deadline.iso, '2026-11-15');
});

test('understands a weekday next to an explicit date as one date', () => {
  const dates = findDates('The interview is on Monday, 16 November 2026 at 10:30am.', REF);
  assert.equal(dates.length, 1);
  assert.equal(dates[0].iso, '2026-11-16');
  assert.equal(dates[0].time, '10:30');
});

test('detects a rolling deadline', () => {
  const deadline = findDeadline('Applications are reviewed on a rolling basis until filled.', REF);
  assert.equal(deadline.confidence, 'rolling');
  assert.equal(deadline.iso, null);
});

test('classifies an interview invitation and extracts the date, time and contact', () => {
  const reply = `Dear Amina,

Thank you for your application for the Programme Associate role. We would like to invite you for an interview on Tuesday, 17 November 2026 at 10:30am at our office in Kampala.

Please confirm your availability.

Kind regards,
Grace Namusoke`;

  const result = classifyReply(reply, { refDate: REF });
  assert.equal(result.intent, 'interview');
  assert.equal(result.suggestedStatus, 'interview');
  assert.equal(result.dates[0].iso, '2026-11-17');
  assert.equal(result.dates[0].time, '10:30');
  assert.equal(result.contactName, 'Grace Namusoke');
});

test('classifies a rejection', () => {
  const result = classifyReply(
    'Thank you for your interest. Unfortunately, we will not be moving forward with your application. We received many strong applications and have decided to proceed with other candidates.',
    { refDate: REF }
  );
  assert.equal(result.intent, 'rejection');
  assert.equal(result.suggestedStatus, 'rejected');
});

test('classifies an offer', () => {
  const result = classifyReply(
    'We are pleased to offer you the Programme Associate position. Your offer letter is attached. Please respond by 20 November 2026.',
    { refDate: REF }
  );
  assert.equal(result.intent, 'offer');
  assert.equal(result.suggestedStatus, 'offer');
});

test('classifies an application acknowledgement', () => {
  const result = classifyReply(
    'Thank you for applying. We have received your application and it is under review.',
    { refDate: REF }
  );
  assert.equal(result.intent, 'ack');
  assert.equal(result.suggestedStatus, 'applied');
});

test('extracts keywords from a job description and scores a CV', () => {
  const jd = `We are looking for a Monitoring and Evaluation Officer with strong experience in
    monitoring and evaluation, survey design, data analysis, report writing and stakeholder engagement.
    Proficiency in Excel, Power BI and KoboToolbox is required. Experience with donor reporting is an advantage.`;
  const keywords = extractKeywords(jd);
  const terms = keywords.map(keyword => keyword.term);
  assert.ok(terms.includes('monitoring and evaluation'));
  assert.ok(terms.includes('data analysis'));
  assert.ok(terms.includes('report writing'));

  const result = matchKeywords(
    'Monitoring and evaluation specialist. I design surveys, analyse data in Excel and Power BI, write reports and engage stakeholders.',
    keywords
  );
  assert.ok(result.score > 40);
  assert.ok(result.matched.some(keyword => keyword.term === 'data analysis'));
});

test('parses an ATS link', () => {
  const link = parseLink('https://boards.greenhouse.io/acme/jobs/123456');
  assert.equal(link.source, 'Greenhouse');
  assert.equal(link.company, 'Acme');
});

test('detects sources', () => {
  assert.equal(detectSource('https://www.linkedin.com/jobs/view/123'), 'LinkedIn');
  assert.equal(detectSource('https://wa.me/256700000000'), 'WhatsApp');
  assert.equal(detectSource('', 'A friend sent this on WhatsApp'), 'WhatsApp');
});

test('parses a link-only LinkedIn job into role and company', () => {
  const url = 'https://www.linkedin.com/jobs/view/programme-associate-at-nile-fintech-4123456789';
  const parsed = parseJobMessage(url, { refDate: REF });
  assert.equal(parsed.role, 'Programme Associate');
  assert.equal(parsed.company, 'Nile Fintech');
  assert.equal(parsed.source, 'LinkedIn');
  assert.equal(parsed.url, url);
});

test('parses Lever, Workable and BrighterMonday links without inventing fields', () => {
  const lever = parseLink('https://jobs.lever.co/nile-fintech/123e4567-e89b-12d3-a456-426614174000');
  assert.equal(lever.company, 'Nile Fintech');
  assert.equal(lever.role, null);

  const workable = parseLink('https://apply.workable.com/nile-fintech/j/ABC123');
  assert.equal(workable.company, 'Nile Fintech');
  assert.equal(workable.role, null);

  const brighter = parseLink('https://www.brightermonday.co.ug/jobs/programme-associate-at-nile-fintech-123456');
  assert.equal(brighter.company, 'Nile Fintech');
  assert.equal(brighter.role, 'Programme Associate');
  assert.notEqual(brighter.company, 'Co');
});

test('reads a heading-style job message with a slash-separated company', () => {
  const parsed = parseJobMessage(
    'Job Opportunity: Monitoring and Evaluation Officer / Savanna Health Initiative — Kampala, Uganda\nDeadline: Friday, 28 November 2026',
    { refDate: REF }
  );
  assert.equal(parsed.role, 'Monitoring and Evaluation Officer');
  assert.equal(parsed.company, 'Savanna Health Initiative');
  assert.equal(parsed.location, 'Kampala');
  assert.equal(parsed.deadline, '2026-11-28');
});

test('extracts roles written after need or at', () => {
  const need = parseJobMessage('We need a Sales Executive at XYZ Ltd in Kampala.', { refDate: REF });
  assert.equal(need.role, 'Sales Executive');
  assert.equal(need.company, 'XYZ Ltd');

  const at = parseJobMessage('Programme Officer at Relief International. Apply by 30 November 2026.', { refDate: REF });
  assert.equal(at.role, 'Programme Officer');
  assert.equal(at.company, 'Relief International');
  assert.equal(at.deadline, '2026-11-30');
});

test('does not infer a company from an example email domain', () => {
  const parsed = parseJobMessage('Send your CV to jobs@example.com by 30 November 2026.', { refDate: REF });
  assert.equal(parsed.company, null);
  assert.equal(parsed.deadline, '2026-11-30');
});

test('does not warn about a missing deadline when the advert is rolling', () => {
  const parsed = parseJobMessage(
    'Programme Officer at Relief International. Applications are reviewed on a rolling basis until filled.',
    { refDate: REF }
  );
  assert.equal(parsed.deadline, null);
  assert.equal(parsed.deadlineConfidence, 'rolling');
  assert.ok(!parsed.warnings.some(warning => /No deadline found/.test(warning)));
});

test('labels an offer acceptance date separately from the start date', () => {
  const result = classifyReply(
    'We are pleased to offer you the Programme Associate position. Please confirm your acceptance by 20 November 2026. Your start date will be 5 January 2027.',
    { refDate: REF }
  );
  assert.equal(result.intent, 'offer');
  const acceptance = result.dates.find(date => date.iso === '2026-11-20');
  const start = result.dates.find(date => date.iso === '2027-01-05');
  assert.equal(acceptance?.label, 'Response due');
  assert.equal(start?.label, 'Start date');
});
