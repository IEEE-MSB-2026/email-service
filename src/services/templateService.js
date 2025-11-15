// Simple in-memory template store (replace with DB later)
const templates = new Map();

// Example template
templates.set('registration_confirmation:v1', {
  render: (vars) => `Hello ${vars.name}, you are registered for ${vars.event}.`
});

function renderTemplate(templateId, templateVersion, vars = {}) {
  if (!templateId) return null;
  const key = `${templateId}:${templateVersion || 'v1'}`;
  const tpl = templates.get(key);
  if (!tpl) throw new Error(`Template not found: ${key}`);
  return tpl.render(vars);
}

module.exports = { renderTemplate };
