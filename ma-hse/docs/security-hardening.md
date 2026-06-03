# Security Hardening

This project applies application-level hardening in Next.js and keeps server-specific controls documented for nginx.

## Application Controls

- `next.config.ts` sets global security headers and disables the Next.js `X-Powered-By` header.
- Clickjacking is blocked with both `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`.
- The CSP keeps the required minimum directives: `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, and `frame-ancestors 'none'`.
- `script-src 'unsafe-inline'` is present because Next.js renders inline bootstrap scripts unless a nonce-based CSP architecture is added. Do not broaden this further without a specific dependency requirement.
- Credentials login attempts are rate-limited by client IP and by hashed account identifier. The default policy allows 5 failed attempts per 60 seconds plus a burst of 3 failed attempts per 10 seconds. Redis is used when available; the in-memory fallback is only suitable for single-instance deployments.
- Auth POST requests reject cross-origin `Origin` or `Referer` values before reaching NextAuth.
- Auth logs include timestamp from the logger, IP, user-agent, origin and hashed email where available. They must not include passwords, CSRF tokens, cookies, session tokens, magic links or raw secrets.

## Required Production Environment

Use the public HTTPS URL for browser-facing variables:

```text
APP_URL=https://maxsafety.maportugal.com
NEXT_PUBLIC_APP_URL=https://maxsafety.maportugal.com
NEXTAUTH_URL=https://maxsafety.maportugal.com
NEXTAUTH_URL_INTERNAL=http://127.0.0.1:3004
```

`NEXTAUTH_URL` must not include `:3004`. The internal URL is optional and only for server-to-server use.

## nginx Controls

Use `deploy/nginx/maxsafety-security.conf` as the deployment baseline:

- publish only ports 80 and 443 publicly;
- bind the Next.js container/app to `127.0.0.1:3004`;
- preserve `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-Port`, `X-Forwarded-For`, and `X-Real-IP`;
- set `server_tokens off;`;
- disable gzip for `/api/auth/` and `/login`;
- keep gzip only for static assets where useful, such as `/_next/static/`.

## Manual Validation

```bash
curl -I https://maxsafety.maportugal.com/login
curl -s https://maxsafety.maportugal.com/api/auth/providers | grep -F ':3004' && echo "bad: leaked internal port"
curl -I https://maxsafety.maportugal.com/.well-known/security.txt
curl -I https://maxsafety.maportugal.com/robots.txt
curl -sD - https://maxsafety.maportugal.com/api/auth/providers -o /dev/null | grep -Ei 'x-powered-by|content-encoding'
```

Expected results:

- security headers are present on `/login`;
- no `X-Powered-By` response header;
- `/api/auth/providers` does not include `:3004`;
- repeated invalid credentials attempts eventually return `429 Too Many Requests`;
- browser embedding from an external iframe is blocked by `frame-ancestors 'none'` and `X-Frame-Options: DENY`;
- sensitive auth endpoints do not return `Content-Encoding: gzip` when nginx is configured as above.
