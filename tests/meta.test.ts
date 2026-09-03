import packageMetadata from "../package.json" with { type: "json" };
import { describe, expect, test } from "vitest";

import { SERVICE_NAME, SERVICE_VERSION } from "../src/meta.js";

describe("service metadata", () => {
  test("keeps package and service metadata aligned", () => {
    expect(packageMetadata.version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
    expect(SERVICE_VERSION).toBe(packageMetadata.version);
    expect(SERVICE_NAME).toBe(packageMetadata.name);
  });
});
