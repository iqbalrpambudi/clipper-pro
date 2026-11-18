import { describe, expect, it } from "vitest";
import { hardsubTreatment } from "../hardsub";

describe("hardsubTreatment", () => {
  it("crops a low band and blurs a high one, like the renderer", () => {
    expect(hardsubTreatment({ enabled: true, top: 0.78, bottom: 0.95, source: "auto" })).toEqual({
      kind: "crop",
      top: 0.78,
    });
    expect(hardsubTreatment({ enabled: true, top: 0.5, bottom: 0.6, source: "manual" })).toEqual({
      kind: "blur",
      top: 0.5,
      bottom: 0.6,
    });
  });

  it("ignores disabled or invalid bands", () => {
    expect(hardsubTreatment(null)).toBeNull();
    expect(hardsubTreatment({ enabled: false, top: 0.8, bottom: 0.9, source: "auto" })).toBeNull();
    expect(hardsubTreatment({ enabled: true, top: 0.9, bottom: 0.8, source: "auto" })).toBeNull();
  });
});
