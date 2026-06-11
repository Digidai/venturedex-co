import {
  latestDailyDate,
  latestDailyStartups,
  latestFunding,
  latestWeeklyIssue,
  loadPublishedWeeklyIssues,
  loadStartups,
  resolveFromRoot,
  startupUrl,
  startupsForDate,
  utmUrl,
  weeklyUrl,
  writeText,
} from "./content";

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

function oneLine(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function campaignDate(date: string | null): string {
  return (date ?? new Date().toISOString().slice(0, 10)).replace(/-/g, "");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const startups = loadStartups();
  const issues = loadPublishedWeeklyIssues();
  const dailyDate = options.date ?? latestDailyDate(startups);
  const dailyStartups = options.date
    ? startupsForDate(options.date, startups)
    : latestDailyStartups(startups);
  const selectedDaily = options.latestDaily || options.date ? dailyStartups : [];
  const selectedWeekly = options.weeklyIssue !== null
    ? issues.find((issue) => issue.issue_number === options.weeklyIssue) ?? null
    : options.latestWeekly
      ? latestWeeklyIssue(issues)
      : null;
  const campaign = `venturedex_${campaignDate(dailyDate)}`;
  const lines: string[] = [];

  lines.push(`# VentureDex Promotion Pack - ${dailyDate ?? new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push("## Canonical URLs");
  for (const startup of selectedDaily) {
    lines.push(`- ${startup.product_name}: ${startupUrl(startup.slug)}`);
  }
  if (selectedWeekly) {
    lines.push(`- ${selectedWeekly.title}: ${weeklyUrl(selectedWeekly.issue_number)}`);
  }
  lines.push("");

  if (selectedDaily.length > 0) {
    lines.push("## Daily Additions");
    for (const startup of selectedDaily) {
      const funding = latestFunding(startup);
      const metadata = [
        startup.product_type,
        funding?.stage,
        funding?.amount,
        funding?.lead_investor ? `lead: ${funding.lead_investor}` : null,
      ].filter(Boolean).join(" / ");
      lines.push(`### ${startup.product_name}`);
      lines.push(`- URL: ${utmUrl(startupUrl(startup.slug), "linkedin", "social", campaign)}`);
      if (metadata) lines.push(`- Signal: ${metadata}`);
      if (startup.summary) lines.push(`- Summary: ${oneLine(startup.summary)}`);
      if (startup.why_featured) lines.push(`- Why VentureDex is watching: ${oneLine(startup.why_featured)}`);
      if (startup.investors) lines.push(`- Investors: ${startup.investors}`);
      lines.push("");
    }

    const names = selectedDaily.map((startup) => startup.product_name).join(", ");
    lines.push("## LinkedIn Draft");
    lines.push("");
    lines.push(`New VentureDex research is live: ${names}.`);
    lines.push("");
    lines.push("This batch is useful if you track early product signals across applied AI, workflow software, and venture-backed infrastructure. Each profile includes the company signal, funding context, source trail, and why it made the editorial queue.");
    lines.push("");
    lines.push(`Read the batch: ${utmUrl(startupUrl(selectedDaily[0].slug), "linkedin", "social", campaign)}`);
    lines.push("");

    lines.push("## X / Threads Drafts");
    lines.push("");
    lines.push(`1. New on VentureDex: ${names}. Profiles include funding context, product evidence, and source trails. ${utmUrl(startupUrl(selectedDaily[0].slug), "x", "social", campaign)}`);
    lines.push(`2. The most useful signal in today's batch: ${selectedDaily[0].why_featured ?? selectedDaily[0].summary ?? selectedDaily[0].product_name}.`);
    lines.push("3. Save the profiles for market maps, founder discovery, and investor monitoring.");
    lines.push("");

    lines.push("## Outreach Notes");
    lines.push("");
    for (const startup of selectedDaily) {
      lines.push(`- ${startup.product_name}: covered in VentureDex because ${oneLine(startup.why_featured ?? startup.summary ?? "the company showed a relevant product or funding signal")}. Useful angle: ask founder/team to verify context or share a correction.`);
    }
    lines.push("");
  }

  if (selectedWeekly) {
    lines.push("## Weekly Issue Draft");
    lines.push("");
    lines.push(`${selectedWeekly.title}`);
    lines.push("");
    if (selectedWeekly.research_summary) lines.push(oneLine(selectedWeekly.research_summary));
    else if (selectedWeekly.editorial_intro) lines.push(oneLine(selectedWeekly.editorial_intro));
    lines.push("");
    lines.push(`Read the weekly research: ${utmUrl(weeklyUrl(selectedWeekly.issue_number), "linkedin", "social", campaign)}`);
    lines.push("");
  }

  lines.push("## Community Distribution Guardrails");
  lines.push("- Submit only where the specific company or market thread is already relevant.");
  lines.push("- Disclose VentureDex affiliation where platform norms require it.");
  lines.push("- Prefer one high-context comment or post over repeated link drops.");
  lines.push("");

  const output = `${lines.join("\n").trim()}\n`;
  if (options.write) {
    const path = resolveFromRoot("docs", "promotion", "outbox", `${dailyDate ?? new Date().toISOString().slice(0, 10)}-latest.md`);
    writeText(path, output);
    console.log(`Wrote ${path}`);
  } else {
    console.log(output);
  }
}

main();
