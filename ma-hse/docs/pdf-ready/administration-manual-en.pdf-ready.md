---
title: "Administration Manual"
subtitle: "MA HSE"
author: "MA HSE"
date: "June 25, 2026"
lang: "en"
toc: true
toc-depth: 3
numbersections: true
geometry: margin=22mm
colorlinks: true
---

<div class="cover">
  <div class="cover-brand">MA HSE</div>
  <h1 class="cover-title">Administration Manual</h1>
  <div class="cover-subtitle">MA HSE</div>
  <div class="cover-meta">
    <p><strong>Audience:</strong> Administrators and technical team</p>
    <p><strong>Date:</strong> June 25, 2026</p>
    <p>Functional administration, local operation and configuration guide.</p>
  </div>
</div>

<div class="page-break"></div>

# Administration Manual - MA HSE

Version generated from project analysis on 2026-06-25.

## 1. Purpose

This manual describes functional and technical administration for MA HSE. It covers roles, permissions, plant configuration, users, modules, master data, QR Codes, SLA, alerts, notifications, contractors, occupational health and local operation.

For detailed Linux deployment instructions, also see `DEPLOY.md`.

## 2. Roles and Permissions

### N0_ADMIN

Global administrator.

Can:

- manage plants;
- access Settings;
- enable/disable modules globally and per plant;
- manage global and plant master data;
- manage high-level and plant users;
- configure recipients, layouts, professional risks and lists;
- access dashboards and operational modules.

### N1_CORPORATE

Multi-plant corporate role.

Can:

- access the corporate dashboard;
- access plants;
- validate communications;
- approve S-EWO;
- create and manage N1/N2/N3 users per plant;
- create, reopen and close communications/actions where authorized;
- manage global repeatability alerts.

### N2_PLANT_MANAGER

Plant manager.

Can:

- view plant dashboards;
- create and view communications and actions;
- create and approve S-EWO;
- reopen communications and actions;
- access monthly inputs;
- view plant administration according to permissions.

Normally does not modify sensitive administrative parameters such as SLA, QR tokens, recipients or master data.

### N3_SAFETY

Plant safety role.

Can:

- create and view communications and actions;
- validate communications;
- manually close communications;
- reopen communications and actions;
- administer plant data;
- manage SLA, alerts, QR tokens and recipients where authorized;
- create N4/N5/MEDICO users in the same plant;
- create S-EWO without final N2 approval.

### N4_SUPERVISOR

Supervisor.

Can:

- view and create communications;
- view and create actions;
- close actions with evidence;
- view the S-EWO list;
- access SMAT when enabled.

Cannot validate communications, approve S-EWO or reopen communications/actions.

### N5_OPERATOR

Operator.

Can:

- view and create communications;
- view and create actions;
- close actions with evidence;
- view permitted dashboards.

Cannot access S-EWO API, validation or administration.

### N6_QR_REPORTER

Public reporter without login.

Can submit communications through public QR/link access. The types currently allowed by code are:

- Unsafe Act
- Unsafe Condition
- Near Miss
- First Aid
- 5S Improvement
- Improvement Suggestion

### MEDICO

Medical role.

Can view communications, including clinical fields. Cannot create communications/actions or access administrative/S-EWO mutations.

## 3. Local Startup

### 3.1 Requirements

- Node.js 22+
- Docker Desktop
- npm

### 3.2 Main commands

From the project folder:

```powershell
cd C:\HSE\ma-hse
docker compose up -d
npm run dev:all
```

`dev:all` starts the scheduler, the Next.js app on a free port between 3000 and 3020, and the BullMQ worker.

### 3.3 Local services

- PostgreSQL: `localhost:5433`
- Redis: `localhost:6380`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`
- Mailpit SMTP: `localhost:1025`
- Mailpit UI: `http://localhost:8025`

### 3.4 Useful scripts

- `npm run dev`: development app.
- `npm run dev:all`: app, scheduler and worker.
- `npm run build`: production build.
- `npm run start`: production server.
- `npm run lint`: lint.
- `npm run db:migrate`: Prisma migrations for development.
- `npm run db:migrate:deploy`: migrations for deployment.
- `npm run db:seed`: seed data.
- `npm run db:studio`: Prisma Studio.
- `npm run worker:dev`: BullMQ worker.
- `npm run scheduler:dev`: schedule recurring jobs.
- `npm run test:unit`: unit tests.
- `npm run test:e2e`: Playwright tests.

## 4. Global Administration - Settings

The `Settings` page is available to N0_ADMIN.

### 4.1 Plants

Allows creating, editing and activating/inactivating plants.

Main fields:

- code;
- name;
- timezone;
- default language;
- active/inactive status.

### 4.2 Plant language

Defines the plant default language and timezone. This affects localized UI, public forms and localized data where supported.

### 4.3 Global and plant modules

Global and per-plant toggles control availability of:

- MAPA
- Validations
- Actions
- S-EWO
- SMAT
- Contractors
- Communications
- Monthly Inputs
- Occupational Health

If a module is disabled globally or for the plant, it may disappear from navigation even when the user role has permission.

### 4.4 Plant master data

N0 can manage:

- areas;
- workstations/locations;
- equipment;
- workers;
- near miss types;
- unsafe act types;
- unsafe condition types;
- injury types;
- professional risks.

Keeping this data updated is essential for dashboard and form quality.

### 4.5 Users

N0 can create and manage users linked to plants. If an account is created without a password, the system generates a temporary password, tries to send it by email and requires a password change on first login.

### 4.6 Recipients and layouts

Settings can configure:

- S-EWO report recipients;
- safety communication alert recipients;
- report layouts.

## 5. Plant Administration

The plant `Admin` page contains local configuration.

### 5.1 SLA

Configures due dates by priority:

- LOW;
- MEDIUM;
- HIGH.

These values affect action deadlines and follow-up.

### 5.2 Safety Days

Allows defining:

- manual last accident date;
- historical record days;
- historical record start date.

These values feed the days-without-accident boards.

### 5.3 QR Token Manager

Manages public tokens:

- REPORT;
- KIOSK.

Regenerating a token revokes the previous active token of the same type. The system displays:

- full public link;
- QR Code;
- open link option;
- copy link;
- save QR as image;
- print QR.

Store and distribute QR Codes only in approved places. If misuse is suspected, regenerate the token.

### 5.4 Repeatability alerts

Configures plant repeatability rules. These rules support notifications when similar events repeat within a time window.

### 5.5 Plant master data

Authorized roles can manage areas, locations and workers. N0 can manage additional datasets such as equipment and occurrence types.

### 5.6 Recipient lists

Recipient lists control who receives selected reports and notifications. Review them whenever team responsibilities change.

### 5.7 Plant users

Authorized administrators can:

- create users;
- set name, email, language and role;
- activate/inactivate users;
- change plant role association.

Main rules:

- N1 creates N1/N2/N3.
- N3 creates N4/N5/MEDICO in the same plant.
- N0 has global administration.

## 6. Communication Management

### 6.1 Statuses

Relevant statuses:

- `SUBMITTED`;
- `PENDING_VALIDATION`;
- `VALID_OPEN`;
- `ONGOING`;
- `CLOSED`.

Only communications in `VALID_OPEN`, `ONGOING` or `CLOSED` count toward KPI.

### 6.2 Validation

N1 and N3 validate communications. Validation updates the status and stores an audit diff.

### 6.3 Manual close and reopen

N1 and N3 can manually close communications with a reason. N1, N2 and N3 can reopen communications/actions when authorized.

### 6.4 Classification

Technical classifications should use correct master data to support rankings and trend analysis.

## 7. Action Management

### 7.1 SLA and priority

Priority drives due dates based on the configured SLA.

### 7.2 Required evidence

Action closure requires a comment and evidence. This improves CAPA traceability and control.

### 7.3 Relationship with communications

Open actions linked to communications can move the communication to `ONGOING`.

## 8. S-EWO

### 8.1 Cause catalog

S-EWO uses a versioned cause catalog. Administrators should keep the catalog consistent and avoid changes that reduce historical comparability.

### 8.2 Approval

Final approval is handled by authorized roles, normally N1/N2. Comments should be clear, especially for rejections.

### 8.3 Recipients

S-EWO recipient lists should reflect who needs to receive reports and notifications.

## 9. Contractors

### 9.1 Invitations

In the `Contractors` module, the administrator sends an invitation to the external company email. The company registers and accesses the portal.

### 9.2 Review

Administrators with permission can review:

- company data;
- company documents;
- workers;
- worker documents;
- document validity;
- approved, pending, rejected or expired status.

### 9.3 Approval

N3 Safety and N1 Corporate can approve, according to the rule implemented in the dashboard.

## 10. Occupational Health

Authorized administrators can:

- add workers;
- edit data;
- import Excel;
- export Excel/PDF;
- download template;
- inactivate workers.

Regularly check expired or soon-to-expire medical exams.

## 11. Monthly Inputs and Environment Dashboard

### 11.1 Monthly inputs

Monthly inputs feed dashboards and calculations such as hours worked, indexes and environmental indicators.

Administrators should ensure:

- the correct year is loaded;
- months are filled in;
- active indicators are appropriate;
- Excel imports are validated after processing.

### 11.2 Custom indicators

The form allows enabling/disabling indicators, editing labels, units, options and distances when applicable. Changes should be controlled to preserve historical comparability.

## 12. MAPA

The MAPA module uses documents, layers and features. For good maintenance:

- keep documents updated;
- keep areas and workstations correctly positioned;
- validate visible layers;
- review automatic incident markers.

## 13. Jobs, Queues and Email

The application uses BullMQ and Redis for jobs.

Existing handlers include:

- weekly digest;
- monthly and annual reports;
- overdue action alerts;
- repeatability alerts;
- approved S-EWO notifications;
- email notifications.

In a local environment, use `npm run dev:all` or start `scheduler` and `worker` separately.

## 14. Storage and Attachments

Attachments, evidence and public photos are stored in S3-compatible storage, usually local MinIO or an equivalent S3 provider.

For the public form:

- maximum 5 photos;
- maximum 5 MB per photo;
- maximum 20 MB total;
- JPG, JPEG, PNG, WEBP, HEIC and HEIF formats.

## 15. Security

### 15.1 Secrets

Protect:

- `.env`;
- `.env.production`;
- `NEXTAUTH_SECRET`;
- `TOKEN_PEPPER`;
- database credentials;
- S3/MinIO credentials;
- SMTP credentials;
- API keys.

Do not publish `.env` files or real dumps.

### 15.2 TOKEN_PEPPER

Do not change `TOKEN_PEPPER` after generating QR tokens, because existing tokens will stop validating.

### 15.3 Accounts and passwords

- Use strong passwords.
- Inactivate accounts that should no longer have access.
- Avoid shared accounts.
- Change temporary passwords on first access.

### 15.4 Rate limit

Public QR routes use rate limiting by IP and plant to reduce abuse.

## 16. Observability

Endpoints:

- `GET /api/health/live`
- `GET /api/health/ready`

The ready endpoint validates dependencies such as database, Redis and storage.

Logs use structured `pino` logging.

## 17. Backups

Before important updates:

1. Create a SQL database backup.
2. Preserve attachment storage/volume.
3. Confirm the backup can be restored.

Production backup examples are documented in `DEPLOY.md`.

## 18. Tests and Validation

Before publishing changes:

```powershell
npm run lint
npm run test:unit
npm run test:e2e
npm run build
```

If a test fails, fix it before deployment.

## 19. Troubleshooting

### Application does not start

Check:

- Docker is running;
- Postgres, Redis and MinIO are healthy;
- `.env` is correct;
- migrations were applied;
- port is free.

### Login fails

Check:

- user is active;
- role is assigned;
- password;
- `NEXTAUTH_SECRET`;
- configured URL (`NEXTAUTH_URL`, `APP_URL`).

### QR Code stopped working

Possible causes:

- token was regenerated;
- `TOKEN_PEPPER` changed;
- plant missing/inactive;
- public route blocked;
- rate limit.

### Dashboard has no data

Confirm:

- communications are validated;
- period is correct;
- monthly inputs are filled in;
- hours worked exist;
- modules are enabled.

### Upload fails

Check:

- MinIO/S3 availability;
- bucket configuration;
- credentials;
- size and format limits.

