# Lot Map

A VS Code and Kiro port of [lot-map](https://github.com/alexeyw/lot-map): a live map of agent work in a dockable panel beside the chat. Kiro hooks record prompts, tool calls, file saves, and completed turns; VS Code displays the same shared activity state.

## Attribution

The original Lot Map was created by [Aleksei Volodin](https://github.com/alexeyw) and is used under the MIT License. This VS Code, Codex, Copilot, and Kiro edition includes additional code and modifications by Jeremy Hamilton.

## Install in Kiro

1. Open this folder in Kiro.
2. The reliable install path is to run `powershell -ExecutionPolicy Bypass -File .\package-vsix.ps1`.
3. In Kiro, open the Command Palette and choose **Extensions: Install from VSIX...**, then select `lot-map-0.1.0.vsix`.
4. Reload Kiro. Run **Lot Map: Open Work Map** from the Command Palette.

`F5` may open an extension-host window, but Kiro's debugger does not always register local workspace extensions. Installing the VSIX avoids that limitation.
5. Keep the workspace hook file [.kiro/hooks/lot-map.json](.kiro/hooks/lot-map.json) enabled.

## Install in VS Code

1. Run the same packaging command from the integrated terminal.
2. Open VS Code's Command Palette and choose **Extensions: Install from VSIX...**.
3. Select `lot-map-0.1.0.vsix`, reload VS Code, then run **Lot Map: Open Work Map**.
4. For a larger browser view, run **Lot Map: Open Web Dashboard**. It opens a local-only dashboard at `127.0.0.1` using the same live state and exact upstream renderer.

The extension runs in both editors from the same VSIX. VS Code does not expose Copilot's private agent/tool event stream to extensions. In VS Code, Lot Map tracks the live observable work instead: file changes, saves, creates, deletes, and terminal shell execution. Kiro additionally provides prompt and tool events through its hook integration.

The center is a permanent three-provider bus with separate `COPILOT`, `CODEX`, and `KIRO` cores. Each core keeps its own model metadata, buffered event count, and live/idle state.

The hook bridge writes only station names, short labels, timestamps, and counts to `.kiro/lot-map/state.json`. It does not persist prompt text, tool arguments, file contents, or credentials.

## Live GitHub Copilot CLI bridge

For full agent activity in VS Code, run GitHub Copilot CLI from the VS Code integrated terminal. The repository hook configuration at [.github/hooks/lot-map.json](.github/hooks/lot-map.json) sends Copilot CLI session, prompt, tool, completion, and error events to the shared Lot Map state file.

```powershell
copilot
```

Keep Lot Map open, then use Copilot CLI in that terminal. The extension also tails Copilot CLI's local machine-readable session stream at `%USERPROFILE%\.copilot\session-state\*\events.jsonl`. That stream contains the actual selected model on assistant and tool events, so the map can show model names such as `gpt-5.6-luna`; it does not scrape the rendered terminal UI.

This is separate from the built-in Copilot Chat panel: VS Code does not expose that panel's private event stream to extensions. The bridge intentionally stores only the model name, event type, station, short tool name, status, and timestamps.

## Live ChatGPT / Codex bridge

Lot Map also follows local Codex sessions from `%USERPROFILE%\.codex\sessions`. Sign in to Codex with the ChatGPT account that owns your eligible Plus or Pro plan, then use Codex in this workspace. The dedicated `CODEX` core records turn, model, tool, completion, and station metadata without replacing the other provider cores.

The bridge only follows sessions whose working directory matches the open workspace. It does not copy prompt text, tool arguments, tool output, response text, OAuth tokens, or other credentials into Lot Map state.

## What lights up

| Station | When |
| --- | --- |
| You | prompts submitted to Kiro |
| Model | completed Kiro turns |
| Memory | tools or paths whose names indicate memory/recall |
| Files | file tools and saved files |
| Shell | terminal and command tools |
| Network | web fetch, search, and HTTP tools |
| Browser | Playwright and interactive browser automation |
| Agents | agent and subagent tools |
| Skills | skill loading and skill-backed workflows |
| Hooks | project hook activity and hook failures |

## Development

The extension has no runtime dependencies. Validate the bridge with:

```powershell
node --check extension.js
node --check .kiro\lot-map\hook.js
node --check .github\lot-map-copilot-hook.js
```

Kiro hook event names and payloads can evolve. The bridge deliberately tolerates missing fields and sanitizes labels before writing state.

## License

[MIT](LICENSE)
