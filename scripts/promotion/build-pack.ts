import {
  latestDailyDate,
  latestDailyStartups,
  latestWeeklyIssue,
  loadPublishedWeeklyIssues,
  loadStartups,
  resolveFromRoot,
  startupsForDate,
  writeText,
} from "./content";
import { buildPromotionPackMarkdown } from "./share-kit";

interface Options {
  write: boolean;
  latestDaily: boolean;
  latestWeekly: boolean;
  date: string | null;
  weeklyIssue: number | null;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    write: false,
    latestDaily: false,
    latestWeekly: false,
    date: null,
    weeklyIssue: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--write":
        options.write = true;
        break;
      case "--latest-daily":
        options.latestDaily = true;
        break;
      case "--latest-weekly":
        options.latestWeekly = true;
        break;
      case "--date":
        options.date = requiredValue(argv, ++index, arg);
        break;
      case "--weekly-issue":
        options.weeklyIssue = Number(requiredValue(argv, ++index, arg));
        break;
      case "-h":
      case "--help":
        console.log("Usage: tsx scripts/promotion/build-pack.ts --latest-daily --latest-weekly --write");
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.latestDaily && !options.latestWeekly && !options.date && options.weeklyIssue === null) {
    options.latestDaily = true;
    options.latestWeekly = true;
  }
  return options;
}

function requiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const startups = loadStartups();
  const issues = loadPublishedWeeklyIssues();
  const latestDate = options.date ?? latestDailyDate(startups);
  const dailyStartups = options.date
    ? startupsForDate(options.date, startups)
    : latestDailyStartups(startups);
  const selectedDaily = options.latestDaily || options.date ? dailyStartups : [];
  const selectedWeekly = options.weeklyIssue !== null
    ? issues.find((issue) => issue.issue_number === options.weeklyIssue) ?? null
    : options.latestWeekly
      ? latestWeeklyIssue(issues)
      : null;
  if (options.weeklyIssue !== null && !selectedWeekly) {
    throw new Error(`Published weekly issue not found: ${options.weeklyIssue}`);
  }
  const reportDate = (
    selectedDaily.length > 0
      ? latestDate
      : selectedWeekly?.published_at?.slice(0, 10) ?? latestDate
  ) ?? new Date().toISOString().slice(0, 10);
  const output = buildPromotionPackMarkdown({
    dailyDate: selectedDaily.length > 0 ? latestDate : null,
    dailyStartups: selectedDaily,
    weeklyIssue: selectedWeekly,
  });
  if (options.write) {
    const path = resolveFromRoot("docs", "promotion", "outbox", `${reportDate}-latest.md`);
    writeText(path, output);
    console.log(`Wrote ${path}`);
  } else {
    console.log(output);
  }
}

main();
