const { validateEmailPayload } = require('../validation');
const { renderTemplate } = require('../services/templateService');
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

module.exports = { sendEmailDirect };
