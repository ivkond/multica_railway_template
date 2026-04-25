import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Dockerfile.web", () => {
  it("passes DOCS_URL into the Next.js build", () => {
    const dockerfile = readFileSync(resolve(__dirname, "../../Dockerfile.web"), "utf8");

    expect(dockerfile).toContain("ARG NEXT_PUBLIC_API_URL");
    expect(dockerfile).toContain("ARG DOCS_URL=http://localhost:4000");
    expect(dockerfile).toContain("ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL");
    expect(dockerfile).toContain("ENV DOCS_URL=$DOCS_URL");
    expect(dockerfile.indexOf("ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL")).toBeLessThan(
      dockerfile.indexOf("RUN pnpm --filter @multica/web build"),
    );
    expect(dockerfile.indexOf("ENV DOCS_URL=$DOCS_URL")).toBeLessThan(
      dockerfile.indexOf("RUN pnpm --filter @multica/web build"),
    );
  });
});
