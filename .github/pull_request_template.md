## Summary

<!-- What changed and why. Reference the rule id when the change is skill-driven. -->

## Test plan

- [ ] `pnpm -r typecheck && pnpm -r lint && pnpm --filter api test && pnpm --filter web test`

## MCP parity (docs/design/mcp-server.md)

For a pull request that adds or changes a sender route or an MCP tool:

- [ ] The sender route is in `apps/api/src/mcp/route-coverage.ts` (`tool`, `planned`, or a D5 exclusion).
- [ ] The tool calls the same service method as the controller.
- [ ] Input and output schemas come from `packages/shared`.
- [ ] `apps/api/src/mcp/tools-list.snapshot.json` is updated and the change is classified (additive bumps the `MCP_SERVER_VERSION` minor; breaking adds a `_v2` tool).
- [ ] Scopes and annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`) are set.
- [ ] An e2e call was added to `apps/api/test/mcp.e2e-spec.ts`.
- [ ] The output has no token-shaped strings (`?t=`, `seald_live_`, `access_token_hash`, storage paths, `/approve#`).
