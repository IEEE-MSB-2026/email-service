# Email Service (IEEE Portal)

Dedicated microservice for sending transactional emails.

## Features
- REST endpoint for immediate send (`POST /email/send`)
- Redis Stream consumer (`internal`) for async event-driven emails
- JSON Schema validation (AJV)
- Simple template rendering (in-memory; replace with DB later)
- Idempotency guard (in-memory; replace with Redis or DB)
- Retry with requeue + max attempts
- Provider: Mailjet (v3.1)

## Quick Start
```bash
cp .env.example .env
# edit MAILJET_API_KEY and MAILJET_API_SECRET
npm install
npm run dev
```
Service runs on `PORT` (default 5060).

## REST Send Example
```bash
curl -X POST http://localhost:5060/email/send \
  -H 'Content-Type: application/json' \
  -d '{
    "to": ["user@example.com"],
    "subject": "Welcome",
    "text": "Hello there"
  }'
```

## Stream Event Format
Producer should XADD:
- key: `payload`
- value: JSON string matching schema (`src/validation/emailSchema.json`)

Example payload:
```json
{
  "to": ["user@example.com"],
  "subject": "Registration Confirmed",
  "templateId": "registration_confirmation",
  "templateVersion": "v1",
  "templateVars": {"name": "Alice", "event": "Tech Summit"},
  "createdAt": "2025-11-15T12:00:00.000Z"
}
```

## TODO (Future Enhancements)
- Replace in-memory idempotency & templates with persistent store
- Add metrics endpoint (Prometheus)
- Multi-provider failover (SES/SendGrid)
- Scheduled sends + localization

## Integration Path
1. Deploy email-service separately (container / VM).
2. Use Mailjet keys; remove SendGrid vars from any configs.
3. Add `EMAIL_SERVICE_URL` to main service for direct fallback.
4. Refactor controllers to emit events instead of direct sending.

## License
Internal use only.
