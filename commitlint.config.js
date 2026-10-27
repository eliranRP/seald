export default {
  extends: ['@commitlint/config-conventional'],
  // Dependabot-only exemptions (everyone else keeps the full ruleset):
  // - its commit bodies carry long release-note/URL lines (body-max-line-length)
  // - it always capitalizes "Bump" after our prefix (subject-case)
  ignores: [
    (message) => /^Signed-off-by: dependabot\[bot\]/m.test(message),
    (message) => /^(chore\(deps(-dev)?\)|ci): Bump /.test(message),
  ],
};
