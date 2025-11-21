const { validateEmailPayload } = require('../validation');
const { renderTemplate, renderRowTemplate } = require('../services/templateService');
const { sendViaMailjet, buildMessage } = require('../services/sendProvider');
const { checkAndSet } = require('../utils/idempotencyStore');

async function sendEmailDirect(req, res, next) {
  try {
    const payload = req.body;
    validateEmailPayload(payload);
    if (!checkAndSet(payload)) {
      return res.status(202).json({ status: 'duplicate_ignored' });
    }
    if (payload.templateId && !payload.text && !payload.html) {
      const rendered = renderTemplate(payload.templateId, payload.templateVersion, payload.templateVars || {});
      payload.text = rendered; // simple text fallback
    }
    const msg = buildMessage(payload);
    const result = await sendViaMailjet(msg);
    if (result.success) {
      return res.status(202).json({ status: 'sent' });
    }
    return res.status(500).json({ status: 'failed', error: result.error });
  } catch (err) {
    err.status = err.status || 400;
    next(err);
  }
}

// Bulk templated send using ad-hoc row data and a template string.
// Request body shape:
// {
//   headers: ["email", "name", "age", ...], // headers must include 'email' (any position)
//   rows: [["a@x.com", "Alice", 23], ...],
//   template: "Hello {{name}} your email {{1}} age {{3}}",
//   subjectTemplate: "Welcome {{name}}", // optional
//   dryRun: true // optional
// }
async function bulkTemplatedSend(req, res, next) {
  try {
    const { headers, rows, template, subjectTemplate, dryRun } = req.body || {};
    if (!Array.isArray(headers) || !headers.length) {
      const err = new Error('headers array required'); err.status = 400; throw err;
    }
    const emailIdx = headers.findIndex(h => String(h).toLowerCase() === 'email');
    if (emailIdx === -1) { const err = new Error("headers must include 'email' column"); err.status = 400; throw err; }
    if (!Array.isArray(rows) || !rows.length) {
      const err = new Error('rows array required'); err.status = 400; throw err;
    }
    if (typeof template !== 'string' || !template.trim()) {
      const err = new Error('template string required'); err.status = 400; throw err;
    }
    const subjTpl = typeof subjectTemplate === 'string' && subjectTemplate.trim() ? subjectTemplate : 'Notification';
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

    const rendered = [];
    const failures = [];
    let successCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length !== headers.length) {
        failures.push({ index: i, error: 'row length mismatch' });
        continue;
      }
      const email = row[emailIdx];
      if (typeof email !== 'string' || !emailRegex.test(email)) {
        failures.push({ index: i, error: 'invalid email' });
        continue;
      }
      const body = renderRowTemplate(template, headers, row);
      const subject = renderRowTemplate(subjTpl, headers, row);
      rendered.push({ email, subject, body });
    }

    if (dryRun) {
      return res.status(200).json({ status: 'ok', dryRun: true, total: rows.length, successCount: rendered.length, failureCount: failures.length, rendered, failures });
    }

    // Send emails one by one (could be optimized later)
    for (const item of rendered) {
      try {
        const payload = { to: [item.email], subject: item.subject, text: item.body };
        // idempotency per email+subject
        payload.idempotencyKey = `${item.email}|${item.subject}`;
        if (!checkAndSet(payload)) {
          failures.push({ email: item.email, error: 'duplicate_skipped' });
          continue;
        }
        const msg = buildMessage(payload);
        const result = await sendViaMailjet(msg);
        if (result.success) successCount++; else failures.push({ email: item.email, error: result.error || 'send_failed' });
      } catch (e) {
        failures.push({ email: item.email, error: e.message });
      }
    }

    return res.status(202).json({ status: 'sent', dryRun: false, total: rows.length, successCount, failureCount: failures.length, failures });
  } catch (err) {
    err.status = err.status || 400;
    next(err);
  }
}

module.exports = { sendEmailDirect, bulkTemplatedSend };