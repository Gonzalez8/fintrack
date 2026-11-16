import { describe, it, expect } from "vitest";
import { claudeCodeCommand, claudeDesktopConfig } from "./ai-access-card";

const URL = "http://192.168.1.10:8001";
const KEY = "ft_abc123";

describe("MCP connection snippets", () => {
  it("builds the Claude Code command", () => {
    const cmd = claudeCodeCommand(URL, KEY);
    expect(cmd).toContain("claude mcp add fintrack");
    expect(cmd).toContain(`--env FINTRACK_URL=${URL}`);
    expect(cmd).toContain(`--env FINTRACK_TOKEN=${KEY}`);
    expect(cmd).toContain('uvx --from "git+https://github.com/Gonzalez8/fintrack#subdirectory=mcp" fintrack-mcp');
  });

  it("builds a valid Claude Desktop config", () => {
    const config = JSON.parse(claudeDesktopConfig(URL, KEY));
    expect(config.mcpServers.fintrack).toEqual({
      command: "uvx",
      args: ["--from", "git+https://github.com/Gonzalez8/fintrack#subdirectory=mcp", "fintrack-mcp"],
      env: { FINTRACK_URL: URL, FINTRACK_TOKEN: KEY },
    });
  });
});
