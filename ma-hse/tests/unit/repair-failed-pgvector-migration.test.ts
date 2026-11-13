import { describe, expect, it } from "vitest";
import {
  TARGET_MIGRATION,
  decidePgvectorRepair,
} from "../../scripts/repair-failed-pgvector-migration.mjs";

const failedState = {
  migrationsTableExists: true,
  targetFailed: true,
  otherFailedMigrations: [] as string[],
  vectorAvailable: true,
  partialObjects: [] as string[],
};

describe("decidePgvectorRepair", () => {
  it("resolves the failed migration when pgvector is available and nothing was created", () => {
    expect(decidePgvectorRepair(failedState).action).toBe("resolve");
    expect(TARGET_MIGRATION).toBe("20261028120000_add_incident_knowledge_base");
  });

  it("does nothing on a fresh database or when the migration did not fail", () => {
    expect(decidePgvectorRepair({ ...failedState, migrationsTableExists: false }).action).toBe("none");
    expect(decidePgvectorRepair({ ...failedState, targetFailed: false }).action).toBe("none");
  });

  it("stops when the postgres image still has no pgvector", () => {
    const decision = decidePgvectorRepair({ ...failedState, vectorAvailable: false });
    expect(decision.action).toBe("abort");
    expect(decision.reason).toContain("pgvector");
  });

  it("stops when other migrations failed or the migration left objects behind", () => {
    expect(
      decidePgvectorRepair({ ...failedState, otherFailedMigrations: ["20261101000000_other"] }).action,
    ).toBe("abort");
    expect(
      decidePgvectorRepair({ ...failedState, partialObjects: ["IncidentKnowledgeSourceType"] }).action,
    ).toBe("abort");
  });
});
