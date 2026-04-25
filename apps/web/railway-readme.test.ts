import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("railway README", () => {
  it("keeps web cookie auth on same-origin API and websocket routes", () => {
    const readme = readFileSync(resolve(__dirname, "../../railway/README.md"), "utf8");

    expect(readme).toContain("Leave `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` unset");
    expect(readme).toContain("same-origin `/api`, `/auth`, and `/ws` routes");
    expect(readme).not.toContain("NEXT_PUBLIC_API_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}");
    expect(readme).not.toContain("NEXT_PUBLIC_WS_URL=wss://${{backend.RAILWAY_PUBLIC_DOMAIN}}/ws");
  });
});
