import { pathToFileURL } from "node:url";
import {
  buildLatestGscDiagnostics,
  defaultGscHistoryPath,
  readGscLedger,
  renderGscDiagnosticsMarkdown,
  writeGscDiagnosticsReport,
} from "./gsc";
import { resolveFromRoot } from "./content";

interface Options {
  write: boolean;
  historyFile: string;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    write: false,
    historyFile: defaultGscHistoryPath(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--write":
        options.write = true;
        break;
      case "--history-file":
        options.historyFile = requiredValue(argv, ++index, arg);
        break;
      case "-h":
      case "--help":
        console.log("Usage: tsx scripts/promotion/gsc-diagnostics.ts --write");
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function requiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

export function reportPathForDate(date: Date): string {
  return resolveFromRoot("docs", "promotion", "metrics", `${date.toISOString().slice(0, 10)}-gsc-diagnostics.md`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const now = new Date();
  const body = renderGscDiagnosticsMarkdown({
    generatedAt: now.toISOString(),
    historyPath: options.historyFile,
    diagnostics: buildLatestGscDiagnostics(readGscLedger(options.historyFile)),
  });
  if (options.write) {
    const outputPath = reportPathForDate(now);
    writeGscDiagnosticsReport(outputPath, body);
    console.log(`Wrote ${outputPath}`);
  } else {
    console.log(body);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
