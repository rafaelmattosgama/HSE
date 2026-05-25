import { describe, expect, it } from "vitest";
import { getPublicReportText } from "@/lib/public-report";

describe("public report translations", () => {
  it("uses the updated Portuguese title only for Portuguese", () => {
    expect(getPublicReportText("pt").text.title).toBe("Comunicações de segurança do trabalho");
    expect(getPublicReportText("en").text.title).toBe("Plant Safety Report");
  });
});
