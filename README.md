# Brickloop website CRM integration

The existing design-only preview is retained in `preview/`. The integration build is in `app/`, served by `server.mjs`. Nothing has been deployed to the public website.

## Run

Requires Node.js 22 or later. No npm dependencies are required.

1. Copy `.env.example` to `.env` if not already configured. Keep CRM credentials server-side. The supplied credentials are configured only in the ignored local `.env` file.
2. Run `npm start` and open `http://localhost:3000`.
3. Run `npm test` for the mock-CRM integration tests. Tests do not contact the live CRM or load `.env`.

The application form is live when this server runs with real credentials: submitting it sends a real CRM request. The standalone `preview/` form remains non-submitting.

## Request mapping

Browser submits JSON to same-origin `POST /api/leads`. The server validates it and forwards it using HTTP Basic authentication to `https://crm.brickloop.co.in/api/public/leads`.

| Website field | CRM field |
| --- | --- |
| Name (required) | `lead_name` |
| Mobile (required; 10-digit Indian numbers normalised to +91) | `phone` |
| Email (optional) | `email` |
| Requirement type (required; existing categories retained) | `property_interest` |
| Budget (optional) | `budget` |
| Preferred location (optional) | `preferred_location` |
| Message (optional) | `notes` |
| Server-controlled source | `lead_source: Brickloop Website` |

Optional fields are sent as empty strings when omitted. Mandatory CRM fields and its exact response contract were not supplied; confirm these in a controlled live acceptance test. A completed 2xx response is required; explicit JSON errors, HTML responses, asynchronous 202 responses, network failures and timeouts are not presented as success. Raw CRM responses, credentials and lead payloads are not logged or returned to the browser.

## Behaviour

- Browser and server validation; field-length and body-size limits.
- Browser blocks concurrent submissions; values remain on failure and reset after confirmed HTTP success.
- No automatic retries: a timeout can occur after a lead has already been created.
- Five attempts per socket IP per ten minutes; this is in-memory and resets on restart. Behind a reverse proxy it may aggregate visitors, so deploy proper edge/shared rate limiting before launch. Forwarded IP headers are deliberately not trusted.
- Exact origin checks, fixed upstream endpoint, no upstream redirects, 12-second CRM timeout, and public-file allowlist.
- `.env` is ignored and not served. Do not upload the repository to a static file host as a substitute for running the server.

## Deployment still required

Use a Node-capable host or adapt the handler to the existing site's backend once its source/hosting are available. Set secrets in the hosting environment, `PUBLIC_ORIGIN` to the actual website origin, and `HOST`/`PORT` to the host's requirements. Serve behind HTTPS. Preserve the public CRM destination and existing contact links. Review privacy wording and retention practices before launch.

No real lead has been submitted during implementation. Verify a clearly identified test enquiry with the business, including optional-empty-field acceptance, CRM response shape, record creation, source, notifications, routing and duplicate behaviour. That is distinct from the automated tests.

## Villa section image update

The hero retains the original villa photo. The separate villa section uses `app/assets/villa-section.jpg`, by Max Vakhtbovych: https://www.pexels.com/photo/exterior-of-fenced-modern-villa-in-suburb-area-7031594/ . Pexels licence; attribution optional. Source recorded internally; public villa and apartment captions read “Illustrative stock image”. The plot retains its conceptual-visualisation disclosure.
