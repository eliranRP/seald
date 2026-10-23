// Minimal typing for the two ESLint 8 classes `mcp-import-boundary.spec.ts`
// uses. `@types/eslint` is not a dependency of this app.
declare module 'eslint' {
  export namespace Linter {
    type RulesRecord = Record<string, unknown>;
    interface LintMessage {
      readonly message: string;
      readonly ruleId: string | null;
    }
  }
  export class Linter {
    verify(
      code: string,
      config: {
        parserOptions?: Record<string, unknown>;
        rules?: Linter.RulesRecord;
      },
      options?: { filename?: string },
    ): Linter.LintMessage[];
  }
  export class ESLint {
    constructor(options?: { cwd?: string });
    calculateConfigForFile(filePath: string): Promise<unknown>;
  }
}
