# User Manual - MA HSE

Version generated from project analysis on 2026-06-25.

## 1. Purpose

MA HSE is a multi-plant Health, Safety and Environment web application. It supports safety communications, corrective actions, dashboards, validation workflows, S-EWO analysis, SMAT audits, occupational health, contractors, monthly inputs and operational maps.

This manual is for end users. Available pages and actions depend on the user's role, selected plant and enabled modules.

## 2. Access

### 2.1 Sign in

1. Open the application URL in a browser.
2. Enter email and password.
3. Open the relevant plant or dashboard.

If the account was created with a temporary password, the system may require a password change before normal access.

### 2.2 Change password

1. Open the user menu or the password change page.
2. Enter the current password and the new password.
3. Save the change.

### 2.3 Language

The application supports multiple languages. The visible language can come from the user's preference or from the plant default. Some technical module labels may still appear in English.

## 3. Main Navigation

Inside a plant, the side menu may include:

- Safety Dashboard
- Environment Dashboard
- Validation
- Communications
- Actions
- S-EWO
- SMAT
- Occupational Health
- Monthly Inputs
- Contractors
- MAPA
- Admin

Corporate users can also access the corporate dashboard. Global administrators can access Settings.

## 4. Safety Dashboard

The safety dashboard summarizes plant performance for a selected period.

### 4.1 Filter the period

1. Open `Safety Dashboard`.
2. Select year, month or a date range.
3. Click `Apply`.
4. Use `Clear dates` or `Current year` to reset filters.

### 4.2 Displayed indicators

The dashboard may show:

- days without accident;
- validated events;
- hours worked;
- overdue actions;
- my open actions;
- open communications;
- communications pending validation;
- clinical cases;
- safety pyramid;
- S-EWO root cause top 5;
- unsafe act, unsafe condition and near miss type top 5;
- rankings by worker, department and location.

KPI indicators use communications that are validated, ongoing or closed.

## 5. Communications

The `Communications` module is used to create and review safety events.

### 5.1 Communication types

Depending on permissions and source, the system supports:

- Unsafe Act
- Unsafe Condition
- Near Miss
- First Aid
- Injury / Accident
- 5S Improvement
- Improvement Suggestion

### 5.2 Create a communication

1. Open `Communications`.
2. Fill in the quick creation form.
3. Select type, date/time, area, location, involved worker when required, description and suggested action.
4. Link a corrective action if available.
5. Submit.

Clinical fields, such as injury nature or affected body part, are displayed only when required by the event type.

### 5.3 Review communications

The list shows recent plant communications, including code, date, type, status, reporter, department, location and description. Depending on permission, technical classification and unsafe act, unsafe condition or near miss types may also be visible.

## 6. Validation

The `Validation` module is mainly used by safety and corporate roles.

### 6.1 Validate communications

1. Open `Validation`.
2. Review submitted or pending communications.
3. Confirm event data.
4. Approve/validate or handle the item using the available actions.

A validated communication is included in dashboards and KPI.

### 6.2 S-EWO validation

Corporate users may also see the S-EWO validation/approval queue when records are pending.

## 7. Actions

The `Actions` module manages corrective and preventive action plans.

### 7.1 Create an action

1. Open `Actions`.
2. Fill in title, description, owner, priority, due date and source.
3. Link the action to a communication when applicable.
4. Save.

### 7.2 Track actions

The table includes:

- sequence code;
- title and description;
- level;
- priority;
- status;
- owner;
- due date;
- closed date;
- location;
- source;
- evidence.

### 7.3 Close an action

1. Open the action.
2. Add a closure comment.
3. Upload required evidence when requested.
4. Confirm closure.

The system may reject closure without a comment and required evidence.

## 8. S-EWO

The `S-EWO` module supports structured event analysis, root causes and action planning.

### 8.1 Create an S-EWO

1. Open `S-EWO`.
2. Create a standalone record or start from an existing communication.
3. Fill in event, location, worker, shift and description data.
4. Complete the analysis fields.
5. Select causes and mark root causes.
6. Create or link actions.
7. Submit for approval when required.

### 8.2 Statuses

Statuses may include draft, submitted, approved, rejected or closed, depending on the configured workflow.

### 8.3 Approval

Final approval is normally performed by an authorized management or corporate role. Approval and rejection comments remain attached to the record.

## 9. SMAT

The `SMAT` module records behavioral audits and field observations.

### 9.1 Create an audit

1. Open `SMAT`.
2. Fill in auditor, date, time, area and location.
3. Register observed and involved people.
4. Add safe acts, safe conditions, unsafe acts and unsafe conditions.
5. Complete the question guide.
6. Add photos/attachments and actions if needed.
7. Save.

### 9.2 Export an audit

Recent audits can be exported to PDF or Excel.

## 10. Occupational Health

The `Occupational Health` module manages workers and medical exam validity.

### 10.1 Review workers

The table shows worker number, name, age, exam date, validity, status and observations.

### 10.2 Add or edit a worker

1. Open `Occupational Health`.
2. Click `Add worker` or select an existing worker.
3. Fill in personal data, workstation, role, nationality, exam date and status.
4. Save.

Age and exam validity are calculated automatically from the entered dates.

### 10.3 Import and export

The module supports:

- Excel import;
- template download;
- Excel export;
- PDF export;
- inactivation of selected workers.

## 11. Monthly Inputs

The `Monthly Inputs` module collects monthly data used by safety, operational and environmental dashboards.

### 11.1 Fill in data

1. Open `Monthly Inputs`.
2. Confirm the year.
3. Select the month.
4. Fill in indicators by section.
5. Save.

### 11.2 View modes

- `Month`: focus on one month.
- `Year`: full annual review.

The page shows monthly and annual completion, number of active indicators and calculated standard hours.

### 11.3 Excel

Users can export a template, export data and import a completed Excel file.

## 12. Environment Dashboard

The `Environment Dashboard` uses monthly inputs to display environmental indicators at plant or corporate level. Availability depends on enabled modules and user permissions.

## 13. Contractors

The `Contractors` module manages external companies, external workers and documents.

### 13.1 Invite an external company

1. Open `Contractors`.
2. Enter the company contact email.
3. Send the invitation.

The company uses the registration link to create its account.

### 13.2 Review companies and workers

The table can be filtered by:

- name;
- type: company or worker;
- approval status;
- active/inactive status.

### 13.3 External company portal

In the portal, an external company can:

- review approval status;
- submit company PDF documents;
- create workers;
- submit worker PDF documents;
- activate, inactivate or delete workers where available.

## 14. MAPA

The `MAPA` module displays plant maps/documents with layers and points of interest.

Main capabilities:

- review map documents;
- view layers;
- position areas and workstations;
- view automatic aggregated incident markers by type.

## 15. Public QR Reporting

Some plants may provide public QR links for reporting situations without signing in.

### 15.1 Submit a QR report

1. Open the QR Code or public link.
2. Select the communication type.
3. Fill in date/time, reporter name, reporter number, area, location, shift, involved worker when required, description and suggested action.
4. Attach photos if needed.
5. Submit.

### 15.2 Photos

Applied limits:

- maximum 5 photos;
- maximum 5 MB per photo;
- maximum 20 MB total;
- accepted formats: JPG, JPEG, PNG, WEBP, HEIC and HEIF.

The system blocks future dates and reuses recent duplicate submissions when detected.

## 16. Alerts and Notifications

The application may show floating alerts and internal notifications, for example:

- repeatability alerts;
- rejected S-EWO;
- pending safety communications;
- overdue actions;
- email digests or reports when background jobs are active.

## 17. Good Practices

- Register events as soon as possible.
- Use objective and complete descriptions.
- Select the correct area, location and workers.
- Attach evidence when it helps explain the situation.
- Validate pending communications regularly.
- Close actions only when the work is complete and evidence exists.
- Keep monthly data updated before reviewing KPI.

## 18. Troubleshooting

### I cannot sign in

Check email, password and account status. If using a temporary password, complete the mandatory password change.

### I cannot see a module

The module may be disabled for the plant, or the user role may not have permission.

### KPI look incomplete

Check whether communications have been validated and whether monthly inputs, such as hours worked, have been filled in.

### I cannot close an action

Check that a closure comment and required evidence have been provided.

### The QR Code does not open

The token may be invalid, revoked or replaced by regeneration. Ask the plant administrator for a new QR Code.

