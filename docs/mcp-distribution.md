# MCP distribution

The remote MCP server can be added directly by URL without any registry listing:

```text
https://api.clipsubtitles.com/api/mcp
```

The server exposes portable MCP Apps UI resources for file selection, visual
style review, explicit export approval, live progress/results and focused word
editing. ChatGPT-specific metadata is additive compatibility: clients without
UI support can complete the same workflow through the ordinary tools.

The root `server.json` prepares ClipSubtitles for the official MCP Registry under
the domain-verified name `com.clipsubtitles/mcp`. The registry hosts metadata for
discovery and downstream marketplaces; it does not make a bare command such as
`claude mcp add clipsubtitles` resolve by name in current clients.

## Publish after production is live

Do not publish the manifest until the production MCP URL is publicly reachable
and its OAuth flow passes the clean-client conformance check.

1. Validate the root `server.json` with the current `mcp-publisher` release.
2. Prove ownership of `clipsubtitles.com` using the registry's DNS or HTTP
   authentication flow. Keep the private key in `mc-vault`; never commit it.
3. Run `mcp-publisher login dns --domain clipsubtitles.com ...` through a
   non-printing credential path.
4. Run `mcp-publisher publish`.
5. Confirm `com.clipsubtitles/mcp` through the registry API and downstream
   marketplaces before advertising registry installation.

Registry versions are immutable. Increment `version` before publishing any
metadata update.

## Client-specific distribution

- Cursor and VS Code accept verified one-click install links directly from the
  marketing page.
- Claude Code and Codex support plugin marketplaces. A marketplace package can
  bundle the remote MCP configuration, but users must first trust/configure that
  marketplace unless ClipSubtitles is accepted into a default marketplace.
- Gemini CLI extensions can bundle MCP configuration and install from a public
  Git repository. Direct `gemini mcp add` remains shorter until an extension is
  published and discoverable.
