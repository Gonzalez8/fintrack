import { describe, it, expect } from "vitest";
import { claudeCodeCommand, claudeDesktopConfig, mcpPackage } from "./ai-access-card";

const URL = "http://192.168.1.10:8001";
const KEY = "ft_abc123";

describe("mcpPackage", () => {
  it("pins the MCP to the app's release tag", () => {
    expect(mcpPackage("2.14.0")).toBe("git+https://github.com/Gonzalez8/fintrack@v2.14.0#subdirectory=mcp");
  });

  it("falls back to the default branch without a version", () => {
    expect(mcpPackage("")).toBe("git+https://github.com/Gonzalez8/fintrack#subdirectory=mcp");
  });
});

describe("MCP connection snippets", () => {
  it("builds the Claude Code command", () => {
    const cmd = claudeCodeCommand(URL, KEY);
    expect(cmd).toContain("claude mcp add fintrack");
    expect(cmd).toContain(`--env FINTRACK_URL=${URL}`);
    expect(cmd).toContain(`--env FINTRACK_TOKEN=${KEY}`);
    expect(cmd).toContain(`uvx --from "${mcpPackage()}" fintrack-mcp`);
  });

  it("builds a valid Claude Desktop config", () => {
    const config = JSON.parse(claudeDesktopConfig(URL, KEY));
    expect(config.mcpServers.fintrack).toEqual({
      command: "uvx",
      args: ["--from", mcpPackage(), "fintrack-mcp"],
      env: { FINTRACK_URL: URL, FINTRACK_TOKEN: KEY },
    });
  });
});
