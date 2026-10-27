export default {
  extends: ['@commitlint/config-conventional'],
  // Dependabot commit bodies carry long release-note/URL lines that trip
  // body-max-line-length. Its subject is still linted via the PR title check.
  ignores: [(message) => /^Signed-off-by: dependabot\[bot\]/m.test(message)],
};
