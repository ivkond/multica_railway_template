import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("root README", () => {
  const readme = readFileSync(resolve(__dirname, "../../README.md"), "utf8");

  it("documents this repository as a Railway deployment template", () => {
    expect(readme).toContain("# Multica Railway Template");
    expect(readme).toContain("deployable Railway template");
    expect(readme).toContain("## Railway Setup");
    expect(readme).toContain("## Using The Deployment");
    expect(readme).toContain("multica setup self-host --server-url https://<backend-domain> --app-url https://<frontend-domain>");
  });

  it("links to upstream instead of duplicating product documentation", () => {
    expect(readme).toContain("https://github.com/multica-ai/multica");
    expect(readme).toContain("does not duplicate upstream Multica documentation");
    expect(readme).not.toContain("Your next 10 hires won't be human");
    expect(readme).not.toContain("## Features");
    expect(readme).not.toContain("## Multica vs Paperclip");
  });
});
