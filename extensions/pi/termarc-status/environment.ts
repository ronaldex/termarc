export type TermarcEnvironment = Record<string, string | undefined>;

/** Resolve the app-owned CLI only in a top-level Termarc terminal. */
export function termarcMainTerminalCli(
  environment: TermarcEnvironment = process.env,
): string | undefined {
  const cli = environment.TERMARC_CLI;
  if (
    environment.TERM_PROGRAM !== "Termarc" ||
    !environment.TERMARC_TERMINAL_ID ||
    environment.TERMARC_PARENT_TERMINAL_ID ||
    environment.TERMARC_SUBAGENT_ID ||
    !cli?.startsWith("/")
  ) {
    return undefined;
  }
  return cli;
}

/** Resolve the app-owned CLI only in a managed Termarc child. */
export function termarcSubagentCli(
  environment: TermarcEnvironment = process.env,
): string | undefined {
  const cli = environment.TERMARC_CLI;
  if (
    environment.TERM_PROGRAM !== "Termarc" ||
    !environment.TERMARC_TERMINAL_ID ||
    !environment.TERMARC_PARENT_TERMINAL_ID ||
    !environment.TERMARC_SUBAGENT_ID ||
    !cli?.startsWith("/")
  ) {
    return undefined;
  }
  return cli;
}
