SELECT COUNT(*) AS total_created_yesterday,
       COUNT(*) FILTER (WHERE status='CLOSED') AS closed,
       COUNT(*) FILTER (WHERE status='OPEN') AS open,
       COUNT(*) FILTER (WHERE status='ONGOING') AS ongoing
FROM "Action"
WHERE "createdAt" >= TIMESTAMP '2026-04-01 00:00:00'
  AND "createdAt" < TIMESTAMP '2026-04-02 00:00:00';

SELECT p.code AS plant,
       a."sequenceNumber",
       a.title,
       a.status,
       a."createdAt",
       a."closedAt"
FROM "Action" a
JOIN "Plant" p ON p.id = a."plantId"
WHERE a."createdAt" >= TIMESTAMP '2026-04-01 00:00:00'
  AND a."createdAt" < TIMESTAMP '2026-04-02 00:00:00'
ORDER BY p.code, a."createdAt";

SELECT COUNT(*) AS total_due_yesterday,
       COUNT(*) FILTER (WHERE status='CLOSED') AS closed,
       COUNT(*) FILTER (WHERE status='OPEN') AS open,
       COUNT(*) FILTER (WHERE status='ONGOING') AS ongoing
FROM "Action"
WHERE "dueDate" >= TIMESTAMP '2026-04-01 00:00:00'
  AND "dueDate" < TIMESTAMP '2026-04-02 00:00:00';
