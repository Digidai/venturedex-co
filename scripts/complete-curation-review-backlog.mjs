#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewPath = path.join(root, "content", "curation-reviews.json");
const reviewedAt = "2026-09-11";
const qualifiedReviewAt = "2026-09-12";

const qualified = {
  aitan: {
    rubric: "hardware",
    label: "robotic sovereignty platform",
    funding: "a source-backed $41M financing",
    sources: ["https://www.prnewswire.com/news-releases/aitan-emerges-from-stealth-defines-new-defense-category-of-robotic-sovereignty-as-a-service--closes-41-million-funding-round-to-scale-its-battle-proven-technology-globally-302867620.html"],
    evidence: [
      ["https://www.aitansystems.com/", "The official site describes a software-defined autonomy layer for operating heterogeneous robotic fleets in contested environments."],
      ["https://www.prnewswire.com/news-releases/aitan-emerges-from-stealth-defines-new-defense-category-of-robotic-sovereignty-as-a-service--closes-41-million-funding-round-to-scale-its-battle-proven-technology-globally-302867620.html", "The company-issued announcement describes battle deployments, fleet interoperability and the operating model behind the platform."],
    ],
    taste: ["The company makes a concrete infrastructure bet on portable autonomy across mixed robotic fleets.", "Deployment and interoperability details expose more craft than a generic defense-AI landing page.", "The operating user, environment and system boundary are specific enough for an evidence-led profile."],
  },
  aslan: {
    rubric: "enterprise",
    label: "national-security digital-domain platform",
    funding: "a source-backed $20.8M financing",
    sources: ["https://www.axios.com/2026/09/01/aslan-agentic-ai-national-security-funding"],
    evidence: [
      ["https://aslanprotects.com/", "The official site presents a defined digital-domain operations platform for national-security teams rather than a general AI consultancy."],
      ["https://aslanprotects.com/about", "The company background and use-case material identify the mission users, operating context and product boundary."],
    ],
    taste: ["Aslan bets on agentic operations in a narrowly defined national-security domain.", "Its public use cases and operating context give the enterprise workflow an inspectable shape.", "The product is specific about buyer and mission even though implementation claims remain company reported."],
  },
  trustedrouter: {
    rubric: "developer",
    label: "model-routing and control plane",
    funding: "a source-backed $1.25M Seed round",
    sources: ["https://trustedrouter.com/blog/we-raised-1-25m-seed"],
    evidence: [
      ["https://trustedrouter.com/docs", "The public documentation exposes routing setup, provider integration and concrete developer-facing operating instructions."],
      ["https://trust.trustedrouter.com/", "The trust center publishes a dedicated security and assurance surface for teams evaluating production deployment."],
    ],
    taste: ["The product bets on trustworthy routing as a control layer rather than another undifferentiated model wrapper.", "Documentation and security material show attention to production integration and operational assurance.", "Its developer, workflow and deployment boundary are unusually concrete for an early product."],
  },
  "easy-aerial": {
    rubric: "hardware",
    label: "tethered and autonomous drone systems",
    funding: "a source-backed $20M financing",
    sources: ["https://www.axios.com/2026/09/01/easy-aerial-brooklyn-protests"],
    evidence: [
      ["https://www.easyaerial.com/", "The official site exposes tethered UAS and drone-in-a-box configurations with specific surveillance and deployment roles."],
      ["https://www.axios.com/2026/09/01/easy-aerial-brooklyn-protests", "Original reporting describes operational deployments and the current financing signal rather than only a concept render."],
    ],
    taste: ["The system-level bet combines persistent tethered flight with autonomous field deployment.", "Named configurations, certifications and deployment evidence make the hardware integration inspectable.", "The mission profile is specific, while performance and deployment claims still need vendor attribution."],
  },
  fambot: {
    rubric: "software",
    label: "consumer household-assistant application",
    funding: "a source-backed $3.5M Pre-Seed round",
    sources: ["https://fambot.com/press"],
    evidence: [
      ["https://landing.fambot.com/post/what-to-expect-in-your-first-week-with-fambot-2026", "The product guide walks through the first-week setup and actual household-assistant workflow for public beta users."],
      ["https://fambot.com/press", "The official press material ties the current financing to a live public beta and describes supported application integrations."],
    ],
    taste: ["FamBot bets on a persistent household workflow rather than a one-shot consumer chatbot.", "The first-week guide and live beta provide concrete onboarding and interaction evidence.", "The user and recurring job are clear, though long-term retention remains an open product risk."],
  },
  conveo: {
    rubric: "enterprise",
    label: "AI-moderated video research platform",
    funding: "a source-backed $50M Series A round",
    sources: ["https://conveo.ai/mediakit"],
    evidence: [
      ["https://conveo.ai/product", "The product page exposes study setup, AI-moderated video interviews, synthesis and research deliverables as a connected workflow."],
      ["https://engineering.conveo.ai/engineering-at-conveo", "The engineering material describes the technical operating context behind the research platform rather than only campaign claims."],
    ],
    taste: ["Conveo makes a specific bet that asynchronous AI moderation can expand qualitative research without removing video context.", "The end-to-end study workflow and engineering account show meaningful product construction.", "The buyer, research job and generated outputs are concrete enough to assess."],
  },
  guardio: {
    rubric: "software",
    label: "consumer cybersecurity product",
    funding: "a source-backed $40M financing at a reported $1.1B valuation",
    sources: ["https://www.prnewswire.com/news-releases/consumer-cybersecurity-pioneer-guardio-reaches-1-1-billion-valuation-302868923.html"],
    evidence: [
      ["https://guard.io/", "The official site exposes browser, identity and web-threat protection as a consumer product with a defined protection workflow."],
      ["https://guard.io/blog/a-note-from-amos-our-ceo", "The CEO note supplies current product and operating context, with company metrics retained as company-reported claims."],
    ],
    taste: ["Guardio bets on always-on protection at the consumer browsing and identity layer.", "The product surface connects detection, intervention and user remediation rather than presenting a generic security score.", "The use case is specific, while scale and efficacy claims require clear company attribution."],
  },
  ultrahuman: {
    rubric: "hardware",
    label: "wearable metabolic and health sensing system",
    funding: "a source-backed $70M financing package",
    sources: ["https://cyborg.ultrahuman.com/press-releases/ultrahuman-raises-70-million-to-build-the-next-generation-of-human-computer-interface-for-health"],
    evidence: [
      ["https://www.ultrahuman.com/us/", "The official product surface documents the Ring AIR and connected health-sensing ecosystem available to customers."],
      ["https://cyborg.ultrahuman.com/press-releases/ultrahuman-launches-pulsomics-a-foundational-model-of-the-human-pulse", "The company describes a specific pulse-model research direction tied to its wearable data and future interface layer."],
    ],
    taste: ["Ultrahuman bets that continuous wearable signals can become a broader human-computer health interface.", "Shipping hardware, a connected software experience and an articulated sensing model show system-level craft.", "The products and data loop are specific, while health-performance claims still need careful source labeling."],
  },
  "chariot-claims": {
    rubric: "enterprise",
    label: "legal-claims filing platform",
    funding: "a source-backed SEC-reported $9.46M financing",
    sources: ["https://alleywatch.com/2026/09/the-alleywatch-startup-daily-funding-report-9-3-2026/"],
    evidence: [
      ["https://www.chariotclaims.com/", "The official site defines a claims-filing and administration workflow for legal teams and claimants."],
      ["https://alleywatch.com/2026/09/the-alleywatch-startup-daily-funding-report-9-3-2026/", "The filing-based funding report establishes a current financing signal while leaving the unnamed stage explicit."],
    ],
    taste: ["Chariot Claims bets on turning a fragmented legal filing process into a structured operating workflow.", "The product boundary is tied to real claims administration rather than a generic legal assistant.", "The user and transaction are specific, although public implementation depth remains thinner than mature enterprise tools."],
  },
  "elm-ai": {
    rubric: "enterprise",
    label: "supplier-compliance operating system",
    funding: "a source-backed SEC-reported $3.84M financing",
    sources: ["https://alleywatch.com/2026/09/the-alleywatch-startup-daily-funding-report-9-3-2026/"],
    evidence: [
      ["https://product.elm-ai.com/", "The public product deck exposes supplier data intake, compliance analysis and operating outputs for procurement teams."],
      ["https://www.elm-ai.com/about", "The company material identifies the supply-chain compliance problem, target users and product approach."],
    ],
    taste: ["Elm AI bets on a supplier-specific compliance system rather than a horizontal document chatbot.", "The product deck exposes the workflow and decision artifacts with enough detail to evaluate construction.", "The target user, data object and compliance job are concrete despite limited public customer proof."],
  },
  "prevalent-ai": {
    rubric: "enterprise",
    label: "sovereign enterprise data and knowledge platform",
    funding: "a source-backed $22M first primary growth investment",
    sources: ["https://prevalent.ai/resources/prevalent-ai-raises-growth-investment-as-demand-for-ai-powered-trusted-enterprise-context-accelerates/"],
    evidence: [
      ["https://prevalent.ai/", "The official site describes a sovereign enterprise data fabric and knowledge-graph layer for trusted organizational context."],
      ["https://prevalent.ai/resources/prevalent-ai-raises-growth-investment-as-demand-for-ai-powered-trusted-enterprise-context-accelerates/", "The company announcement links its first primary financing to an existing profitable platform and enterprise deployment base."],
    ],
    taste: ["Prevalent AI bets that governed enterprise context is infrastructure, not a prompt-layer feature.", "The long-built data fabric and knowledge-graph architecture expose substantial systems craft.", "The deployment category is specific, while maturity makes future publication require explicit editorial breakout scrutiny."],
  },
  senticell: {
    rubric: "biotech",
    label: "red-blood-cell-bound nucleic-acid liquid biopsy platform",
    funding: "a source-backed Seed round approaching $7M",
    sources: ["https://www.prnewswire.com/news-releases/senticell-closes-oversubscribed-seed-round-to-advance-rbc-based-liquid-biopsy-platform-302865820.html"],
    evidence: [
      ["https://www.senticell.bio/platform", "The platform page explains the red-blood-cell-bound nucleic-acid signal and intended liquid-biopsy workflow."],
      ["https://www.senticell.bio/", "The official site identifies the analytical-development stage and disease-detection direction without presenting a commercial diagnostic as complete."],
    ],
    taste: ["SentiCell makes a distinctive biological bet on signals attached to red blood cells.", "The platform mechanism and disclosed analytical work give the preclinical product thesis inspectable substance.", "The assay concept is specific, while clinical validity and regulatory path remain material open questions."],
  },
  "zeit-ai": {
    rubric: "enterprise",
    label: "autonomous data-engineering platform",
    funding: "a source-backed EUR 4.3M financing",
    sources: ["https://www.eu-startups.com/2026/09/yc-backed-zeit-ai-raises-e5-million-to-build-europes-autonomous-data-engineer/"],
    evidence: [
      ["https://www.zeit-ai.com/", "The product site describes an autonomous data-engineering workflow and a catalog of more than 600 connectors for mid-market teams."],
      ["https://www.zeit-ai.com/about-us", "The company page identifies the European mid-market focus and the operating problem the product is designed to own."],
    ],
    taste: ["Zeit AI bets that a data engineer can be represented as an ongoing operational agent rather than a code assistant.", "Connector breadth and the described pipeline workflow make the integration burden visible.", "The target team and recurring data job are specific, though production reliability evidence remains company reported."],
  },
  peoplex: {
    rubric: "enterprise",
    label: "AI interview, role-play and meeting platform",
    funding: "a source-backed JPY 5.45B Series A financing package",
    sources: ["https://prtimes.jp/main/html/rd/p/000000290.000139786.html"],
    evidence: [
      ["https://peoplex.jp/", "The official site exposes separate interview, role-play, meeting and sales products rather than a single vague HR-AI claim."],
      ["https://peoplex.jp/news", "The current product and company news surface provides inspectable launch and adoption context for the suite."],
    ],
    taste: ["PeopleX bets on instrumented practice and evaluation across multiple high-stakes workplace conversations.", "Distinct products and workflows show deliberate packaging rather than a thin general-purpose assistant.", "The use cases are specific, while reported adoption and outcomes remain company claims."],
  },
  also: {
    rubric: "hardware",
    label: "connected lightweight electric-mobility system",
    funding: "a source-backed $150M Series D round",
    companyUrl: "https://ridealso.com/",
    identityCorrection: {
      previous_company_url: "https://also.com/",
      reason: "The frozen URL belongs to ALSO Holding AG, an unrelated technology distributor. The mobility company's own product, company and financing pages consistently identify its canonical brand and domain as ALSO at ridealso.com.",
      evidence_urls: ["https://also.com/", "https://ridealso.com/", "https://ridealso.com/pages/company"],
    },
    sources: ["https://ridealso.com/blogs/all/also-announces-150-million-series-d-financing"],
    evidence: [
      ["https://ridealso.com/", "The corrected official site exposes the TM-B and TM-Q electric vehicles and a connected mobility platform."],
      ["https://ridealso.com/pages/company", "The company page establishes the distinct mobility entity, product roadmap and autonomy direction at the corrected domain."],
    ],
    taste: ["ALSO bets on a lightweight connected vehicle class rather than a conventional e-bike catalog.", "Named vehicle systems and a coherent hardware-software roadmap provide evidence of integrated product craft.", "The products and company identity are now specific, although later autonomy claims remain forward looking."],
  },
  "teragen-energy": {
    rubric: "hardware",
    label: "modular solid-oxide fuel-cell system",
    funding: "a source-backed $6M Pre-Seed round",
    sources: ["https://www.teragenenergy.com/news/teragen-energy-raises-oversubscribed-pre-seed-round"],
    evidence: [
      ["https://www.teragenenergy.com/", "The official site describes a modular solid-oxide fuel-cell architecture and the transition from prototypes toward pilots."],
      ["https://www.teragenenergy.com/news/teragen-energy-raises-oversubscribed-pre-seed-round", "The company announcement connects the financing to pilot manufacturing and deployment milestones."],
    ],
    taste: ["Teragen makes a hard technical bet on modularizing solid-oxide power generation.", "Prototype and pilot plans expose an engineering path rather than a generic clean-energy promise.", "The architecture and next validation step are specific, while commercial efficiency remains unproven."],
  },
  science4beauty: {
    rubric: "biotech",
    label: "conotoxin-based cosmetic active and products",
    funding: "a source-backed PLN 7M investment",
    sources: ["https://4growthvc.pl/2026/09/03/7-mln-pln-dla-science4beauty-na-skalowanie-innowacyjnej-konotoksyny-dla-branzy-beauty/"],
    evidence: [
      ["https://science4beauty.net/en/pages/nauka", "The science page describes the conotoxin-derived active and a randomized double-blind placebo-controlled study with 60 volunteers."],
      ["https://science4beauty.net/en-ue/pages/project", "The official project page records the development program behind the active and the product commercialization work."],
    ],
    taste: ["Science4Beauty bets on a defined peptide mechanism rather than undifferentiated cosmetic branding.", "A disclosed controlled study, project record and sold products provide multiple inspectable layers of work.", "The active and application are specific, while study scale and company-sponsored evidence limit certainty."],
  },
  hyimpulse: {
    rubric: "hardware",
    label: "hybrid-propulsion orbital launch system",
    funding: "a source-backed Series A extension above EUR 50M",
    sources: ["https://www.pulsar-consulting.com/de/news/hyimpulse-series-a-extension"],
    evidence: [
      ["https://hyimpulse.de/sl1", "The SL1 product page publishes the launch-vehicle architecture, payload role and hybrid-propulsion system boundary."],
      ["https://hyimpulse.de/Press_Release/03052024_Press%20Release_HyImpulse%20-%20German%20space%20company%20successfully%20launches%20first%20commercially%20viable%20launch%20vehicle.pdf", "The official test-flight release records an actual launch milestone instead of only a vehicle roadmap."],
    ],
    taste: ["HyImpulse makes a clear propulsion bet on paraffin-based hybrid launch systems.", "A flight test plus detailed vehicle material provides unusually inspectable aerospace craft.", "The launch product and mission are specific, while orbital execution and economics remain open."],
  },
  airbility: {
    rubric: "hardware",
    label: "electric vertical-flight vehicle platform",
    funding: "a source-backed $4.7M Series A round",
    sources: ["https://www.prnewswire.com/news-releases/airbility-secures-krw-6-5-billion-series-a-led-by-sazze-partners-bringing-total-funding-to-usd-7-6-million-302867009.html"],
    evidence: [
      ["https://airbility.co.kr/", "The official product surface identifies the AB vehicle program and its electric vertical-flight configuration."],
      ["https://www.prnewswire.com/news-releases/airbility-secures-krw-6-5-billion-series-a-led-by-sazze-partners-bringing-total-funding-to-usd-7-6-million-302867009.html", "The company-issued release describes prototype and transition-flight progress alongside the financing."],
    ],
    taste: ["Airbility bets on a specific compact electric-flight architecture and transition profile.", "Prototype and transition-flight disclosures provide more substance than render-only advanced-air-mobility projects.", "The vehicle program is specific, while certification and production remain significant execution risks."],
  },
  xorlab: {
    rubric: "enterprise",
    label: "sovereign email-security platform",
    funding: "a source-backed EUR 5M Series A extension",
    sources: ["https://www.xorlab.com/en/blog/xorlab-raises-eur-5-million-to-build-europes-leading-sovereign-email-security-platform"],
    evidence: [
      ["https://www.xorlab.com/", "The official site details email threat detection, policy enforcement and deployment choices for enterprise security teams."],
      ["https://www.xorlab.com/en/blog/xorlab-raises-eur-5-million-to-build-europes-leading-sovereign-email-security-platform", "The company announcement ties the financing to a deployed sovereign email-security product rather than a pre-product concept."],
    ],
    taste: ["xorlab bets on email-native behavioral detection with a European sovereignty position.", "Deployment and protection workflows expose the operational seams that security buyers must evaluate.", "The product boundary and buyer are specific, though efficacy claims require independent validation."],
  },
  cato: {
    rubric: "enterprise",
    label: "public-tender intelligence and sales platform",
    funding: "a source-backed EUR 6M financing",
    sources: ["https://tech.eu/2026/09/07/cato-raises-eur6m-to-expand-its-ai-platform-for-public-sector-sales/"],
    evidence: [
      ["https://www.get-cato.com/en", "The official site exposes public-tender discovery, qualification and response workflows for companies selling to governments."],
      ["https://tech.eu/2026/09/07/cato-raises-eur6m-to-expand-its-ai-platform-for-public-sector-sales/", "Original reporting supplies the current financing and expansion context for the operating product."],
    ],
    taste: ["Cato bets on a domain-specific operating layer for public procurement rather than generic sales automation.", "Tender discovery and response workflows make the product's integration into enterprise work inspectable.", "The buyer and transaction are specific, while disclosed product evidence is primarily company supplied."],
  },
  "jaipur-robotics": {
    rubric: "hardware",
    label: "computer-vision operating system for waste plants",
    funding: "a source-backed EUR 4.3M Seed round",
    sources: ["https://www.htgf.de/en/jaipur-robotics-seed/"],
    evidence: [
      ["https://www.jaipurrobotics.com/", "The official site describes computer-vision monitoring and operating decisions inside material-recovery and waste-processing plants."],
      ["https://www.htgf.de/en/jaipur-robotics-seed/", "The lead investor's announcement records deployed image volume, processed material and a claimed reduction in shutdowns."],
    ],
    taste: ["Jaipur Robotics bets on a plant-level visual intelligence layer for messy physical material streams.", "Deployment metrics and the connection from cameras to operating actions expose real industrial craft.", "The plant user and workflow are specific, while performance figures remain investor and company reported."],
  },
  fluencify: {
    rubric: "enterprise",
    label: "managed creator-campaign operating platform",
    funding: "a source-backed EUR 3.7M Pre-Seed round",
    sources: ["https://www.eu-startups.com/2026/09/stockholm-based-fluencify-raises-e3-7-million-to-scale-its-end-to-end-creator-marketing-platform/"],
    evidence: [
      ["https://fluencify.io/product/campaign-management", "The product page details campaign briefs, creator coordination, approvals, deliverables and reporting in one workflow."],
      ["https://fluencify.io/", "The official site defines the managed operating model and customer problem beyond a simple influencer directory."],
    ],
    taste: ["Fluencify bets on owning creator-campaign operations rather than only matching brands and creators.", "The approval, delivery and reporting steps show a composed enterprise workflow.", "The product scope is specific, while differentiation from established campaign suites needs continued scrutiny."],
  },
  "octave-energy": {
    rubric: "hardware",
    label: "second-life battery storage and energy-management system",
    funding: "a source-backed EUR 10M Series A mixed financing",
    sources: ["https://octave.energy/fr/octave-dans-les-medias/we-just-raised-10m-in-series-a/"],
    evidence: [
      ["https://octave.energy/en/", "The official site describes containerized battery-energy storage combined with an energy-management software layer."],
      ["https://octave.energy/fr/octave-dans-les-medias/we-just-raised-10m-in-series-a/", "The company announcement connects the mixed financing to deployment of its second-life battery systems."],
    ],
    taste: ["Octave bets on making retired vehicle batteries useful as managed stationary storage.", "The battery system, container integration and management layer show cross-disciplinary product craft.", "The system and customer use case are specific, while lifecycle economics and degradation remain key risks."],
  },
  "moa-foodtech": {
    rubric: "biotech",
    label: "fermentation-derived food ingredient platform",
    funding: "a source-backed $3.8M financing",
    sources: ["https://agfundernews.com/moa-foodtech-nets-3-8m-to-scale-ai-powered-biomass-fermentation-platform"],
    evidence: [
      ["https://www.moafoodtech.com/moa-box", "MOA Box is presented as a defined fermentation-development platform for converting side streams into food ingredients."],
      ["https://www.moafoodtech.com/moa-yeast", "The official yeast ingredient page exposes a concrete output and application rather than only a platform thesis."],
    ],
    taste: ["MOA bets on pairing fermentation development with specific commercial ingredient outputs.", "The Box process and named ingredient products reveal both platform and formulation craft.", "The inputs and outputs are specific, while scale economics and regulatory acceptance remain open."],
  },
  backbone: {
    rubric: "enterprise",
    label: "food quality and compliance operating system",
    funding: "a source-backed EUR 4M Pre-Seed round",
    sources: ["https://www.usebackbone.ai/resources/backbone-raises-%E2%82%AC4m-to-build-the-quality-brain-for-the-food-industry"],
    evidence: [
      ["https://www.usebackbone.ai/", "The product site describes quality records, supplier evidence, specifications and compliance workflows for food companies."],
      ["https://www.usebackbone.ai/resources/backbone-raises-%E2%82%AC4m-to-build-the-quality-brain-for-the-food-industry", "The official funding announcement explains the operational data problem the product is designed to own."],
    ],
    taste: ["Backbone bets on a food-specific quality knowledge layer rather than a generic compliance copilot.", "The supplier, specification and evidence workflows make the product's operational model inspectable.", "The buyer and records are specific, while production adoption evidence is still early."],
  },
  minewatch: {
    rubric: "hardware",
    label: "offline mine dispatch and safety operating system",
    funding: "a source-backed $900K Seed round",
    sources: ["https://seedtable.com/companies/minewatch/funding-rounds/seed-2026-09", "https://www.df.cl/df-lab/innovacion-y-startups/startup-chilena-minewatch-levanta-capital-con-alza-para-llegar-a-las-faenas"],
    evidence: [
      ["https://vigalab.com/", "Vigalab's official surface describes MineWatch as an offline-capable dispatch, fleet and personnel-monitoring system for mines."],
      ["https://www.df.cl/df-lab/innovacion-y-startups/startup-chilena-minewatch-levanta-capital-con-alza-para-llegar-a-las-faenas", "Regional original reporting adds deployment and expansion context for the mine operating product."],
    ],
    taste: ["MineWatch bets on resilient offline operations in connectivity-constrained mine environments.", "Fleet, dispatch and personnel monitoring form a concrete system rather than a generic industrial dashboard.", "The operating environment is specific, while independent field-performance evidence remains limited."],
  },
  "fundly-ai": {
    rubric: "enterprise",
    label: "embedded financing platform for pharmaceutical distribution",
    funding: "a source-backed $4M Pre-Series A round plus separately reported venture debt",
    sources: ["https://m.economictimes.com/tech/funding/b2b-startup-fundly-ai-raises-4-million-led-by-accel-multiply/amp_articleshow/133890712.cms", "https://in.linkedin.com/company/fundlyai"],
    evidence: [
      ["https://fundly.ai/about", "The official company page defines embedded working-capital workflows for pharmaceutical retailers and distributors."],
      ["https://in.linkedin.com/company/fundlyai", "The company's official social profile states the current Pre-Series A financing and its named institutional backers."],
    ],
    taste: ["Fundly.ai bets on underwriting and capital delivery inside a specific pharmaceutical supply chain.", "The retailer-distributor workflow makes the financial product's operating context visible.", "The vertical and transaction are specific, while credit performance and funding composition need careful disclosure."],
  },
  "leinao-ai": {
    rubric: "enterprise",
    label: "AI compute and power-grid infrastructure platform",
    funding: "a source-backed Series B-plus financing",
    sources: ["https://yangtzeer.com/news/deals/yangtze-funding-quantum-robotics-evtol/"],
    evidence: [
      ["https://www.leinao.ai/product/solution_dlrg.html", "The official solution page describes an AI-compute operating system spanning resource orchestration and deployment."],
      ["https://www.leinao.ai/product/solution_lnbdz.html", "A separate official solution page documents an electric-grid application with specific infrastructure workflows."],
    ],
    taste: ["Leinao bets on coordinating compute with physical power infrastructure instead of selling a generic AI cloud.", "Distinct compute and grid solution pages expose substantial integration and operational design.", "The deployment domains are specific, while project counts and performance remain company reported."],
  },
  "megawave-fusion": {
    rubric: "hardware",
    label: "radio-frequency systems for fusion facilities",
    funding: "a source-backed Series A financing above CNY 100M",
    sources: ["https://finance.eastmoney.com/a/202609083867098289.html"],
    evidence: [
      ["https://www.megawavefusion.com/", "The official site identifies microwave and radio-frequency systems built for fusion research and energy facilities."],
      ["https://www.megawavefusion.cn/pruduct", "The official product catalog exposes concrete RF hardware categories rather than an abstract fusion-energy claim."],
    ],
    taste: ["MegaWave bets on a critical RF subsystem layer within fusion infrastructure.", "A concrete hardware catalog and facility role show specialized engineering craft.", "The subsystem boundary is specific, while the exact current raise is conservatively recorded as over CNY 100M."],
  },
  "split-pay": {
    rubric: "software",
    label: "consumer bill-splitting and short-term payment product",
    funding: "a source-backed approximately $100M Series B round",
    sources: ["https://www.axios.com/2026/09/08/split-pay-khosla-125-million"],
    evidence: [
      ["https://splitpay.com/how-it-works", "The public workflow explains bill upload, participant splitting and payment timing for the consumer product."],
      ["https://splitpay.com/help/about-split-pay/how-split-pay-works/what-fees-does-split-pay-charge", "The help center states a $9.99 fee plus 1.5%, making the operating and pricing model inspectable."],
    ],
    taste: ["Split Pay bets on cash-flow underwriting around shared bills rather than another peer-to-peer payment interface.", "The end-to-end workflow and exact fee schedule expose important product mechanics.", "The transaction and user are specific, while credit loss and consumer-protection outcomes remain open."],
  },
  "moonwalk-biosciences": {
    rubric: "biotech",
    label: "adipose-targeted RNA-interference therapeutics platform",
    funding: "a source-backed $70M Series B round",
    sources: ["https://moonwalk.bio/news/moonwalk-biosciences-announces-70-million-series-b-financing-to-advance-adipose-targeted-rnai-therapies-for-obesity-and-cardiometabolic-diseases/"],
    evidence: [
      ["https://moonwalk.bio/science/", "The science page describes adipose targeting, RNA interference and the biological rationale for the therapeutic platform."],
      ["https://moonwalk.bio/pipeline/", "The pipeline page identifies preclinical programs and indications without representing them as approved therapies."],
    ],
    taste: ["Moonwalk makes a specific delivery bet on adipose-targeted RNA interference for metabolic disease.", "Mechanism and pipeline disclosures provide a coherent preclinical product architecture.", "The targets and indications are specific, while human efficacy and safety remain unproven."],
  },
  outline: {
    rubric: "enterprise",
    label: "AI-native financial planning and analysis system",
    funding: "a source-backed $3M Seed round",
    sources: ["https://seedtable.com/companies/outline-fpa/funding-rounds/seed-2026-09"],
    evidence: [
      ["https://www.outlineapp.ai/", "The official site describes financial-model ingestion, variance analysis and recurring planning workflows for finance teams."],
      ["https://seedtable.com/companies/outline-fpa/funding-rounds/seed-2026-09", "The funding record establishes the current Seed signal and company identity for the product review."],
    ],
    taste: ["Outline bets on an operating workspace for finance teams rather than a standalone narrative generator.", "The model, variance and planning workflow shows deliberate domain packaging.", "The user and finance job are specific, while public integration and customer evidence remain early."],
  },
  "brainchild-bio": {
    rubric: "biotech",
    label: "brain-tumor cellular-therapy company",
    funding: "a source-backed $116M Series A round",
    sources: ["https://www.globenewswire.com/news-release/2026/09/08/3357486/0/en/brainchild-bio-closes-116-million-series-a-financing.html", "https://www.nature.com/articles/s41591-024-03451-3"],
    evidence: [
      ["https://brainchildbio.com/pipeline/", "The official pipeline lists defined cellular-therapy programs for pediatric brain tumors and their development status."],
      ["https://www.nature.com/articles/s41591-024-03451-3", "A peer-reviewed phase 1 publication provides independent clinical evidence relevant to the underlying program."],
    ],
    taste: ["BrainChild bets on locoregional cellular therapy for difficult pediatric brain tumors.", "A defined pipeline plus peer-reviewed early clinical work gives the program unusual evidentiary depth.", "The indication and intervention are specific, while small early studies cannot establish efficacy."],
  },
  "keep-converting": {
    rubric: "enterprise",
    label: "real-time ecommerce product-page personalization platform",
    funding: "a source-backed $2M Pre-Seed round",
    sources: ["https://www.thesaasnews.com/news/keep-converting-raises-2m-pre-seed/", "https://waya.media/arabi/keep-converting-%D8%AA%D8%AC%D9%85%D8%B9-2-%D9%85%D9%84%D9%8A%D9%88%D9%86-%D8%AF%D9%88%D9%84%D8%A7%D8%B1-%D9%88%D8%AA%D8%B1%D8%A7%D9%87%D9%86-%D8%B9%D9%84%D9%89-ai-%D9%84%D8%AA%D8%BA/"],
    evidence: [
      ["https://keepconverting.ai/", "The official site presents real-time product-page generation and continuous variant optimization for ecommerce merchants."],
      ["https://www.thesaasnews.com/news/keep-converting-raises-2m-pre-seed/", "Current reporting documents integrations with major commerce platforms and a closed Pre-Seed round."],
    ],
    taste: ["Keep Converting bets on adapting the product page itself to visitor intent in real time.", "Platform integrations and a closed-loop test-and-generate workflow show more craft than a copy generator.", "The merchant workflow is specific, while the reported conversion lift remains a company claim."],
  },
  "celero-communications": {
    rubric: "hardware",
    label: "coherent optical communications silicon platform",
    funding: "a source-backed $275M Series C round",
    sources: ["https://celero.inc/celero-communications-raises-275-million-series-c-following-validation-of-industrys-first-2nm-coherent-dsp-silicon/"],
    evidence: [
      ["https://celero.inc/", "The now-accessible official site describes coherent DSP silicon for optical communications and its product boundary."],
      ["https://celero.inc/celero-communications-raises-275-million-series-c-following-validation-of-industrys-first-2nm-coherent-dsp-silicon/", "The official release records validated 2nm silicon and the current Series C financing signal."],
    ],
    taste: ["Celero makes a deep hardware bet on 2nm coherent DSP silicon for optical networks.", "Validated silicon and a defined communications subsystem provide strong evidence of technical craft.", "The product boundary is specific, while scale, customer qualification and yields remain undisclosed."],
  },
  digitalpaani: {
    rubric: "enterprise",
    label: "water and wastewater infrastructure operating system",
    funding: "a source-backed INR 22 crore financing",
    sources: ["https://inc42.com/buzz/digitalpaani-bags-%E2%82%B922-cr-to-expand-water-management-platform/", "https://in.linkedin.com/company/digitalpaani"],
    evidence: [
      ["https://www.digitalpaani.com/", "The official site describes real-time monitoring, operating guidance and lifecycle management for water and wastewater assets."],
      ["https://www.digitalpaani.com/about-us/", "The company history records pilots and more than 40 deployments, retained as company-reported operating evidence."],
    ],
    taste: ["DigitalPaani bets on an operating layer for existing water infrastructure rather than replacing plants with new hardware.", "Monitoring, operational guidance and multi-site deployment evidence reveal real integration work.", "The facility user and water workflow are specific, while outcome metrics remain company reported."],
  },
  circolife: {
    rubric: "hardware",
    label: "commercial cooling-as-a-service platform",
    funding: "a source-backed $4.5M Pre-Series A round",
    sources: ["https://www.dealstreetasia.com/stories/circolife-funding-india-494483", "https://inc42.com/buzz/circolife-raises-4-5-mn-to-scale-subscription-based-air-conditioning/"],
    evidence: [
      ["https://subscription.circolife.com/ac-for-business/new", "The official offering exposes zero-upfront business subscriptions with installation, maintenance and service included."],
      ["https://circolife.com/blog/ac_subscription_vs_amc_vs_buying_on_emi/", "The company guide explains ownership, maintenance, replacement and customer economics across the service lifecycle."],
    ],
    taste: ["Circolife bets on turning commercial cooling hardware into managed recurring infrastructure.", "Ownership, field service, IoT monitoring and refurbishment combine into a substantive operating system.", "The service model is specific, while fleet utilization and asset economics remain important risks."],
  },
  veridue: {
    rubric: "enterprise",
    label: "energy-infrastructure due-diligence and transaction platform",
    funding: "a source-backed $4M Pre-Seed round",
    sources: ["https://veridue.ai/blog/veridue-launches-4m-pre-seed", "https://veridue.ai/blog/veridue-raises-its-pre-seed-to-accelerate-ai-native-diligence-for-energy-transactions"],
    evidence: [
      ["https://veridue.ai/", "The official site exposes screening, red-flag diligence, virtual-data-room organization and investment-readiness workflows."],
      ["https://veridue.ai/blog/veridue-launches-4m-pre-seed", "The launch announcement records two years of product development and validation with energy-market participants."],
    ],
    taste: ["Veridue bets on an energy-specific diligence system rather than a horizontal document summarizer.", "Traceable findings, data-room organization and transaction screening form a coherent professional workflow.", "The users and artifacts are specific, while the speed and cost claims remain company reported."],
  },
};

const terminal = {
  emberos: {
    state: "policy_excluded",
    reason_code: "excluded_category",
    reason: "The official product and funding materials confirm that Emberos is an AI-search brand-visibility and GEO/AEO optimization product, an explicitly excluded search-optimization category under VentureDex F4; this is a policy decision, not a claim that the software is poorly built.",
    sources: ["https://www.emberos.ai/", "https://www.emberos.ai/knowledge-hub/emberos-raises-5.5-million-seed-round"],
  },
  hydrosight: {
    state: "quality_rejected",
    reason_code: "no_product_evidence",
    reason: "The current official site remains under construction and original reporting supplies only a high-level AI water-network concept. The multi-source review found no inspectable workflow, specification, demonstration or deployment artifact, so there is not enough product evidence for an editorial profile today.",
    sources: ["https://hydrosight-ai.com/", "https://www.calcalistech.com/ctechnews/article/syzscx2oge"],
  },
  socure: {
    state: "policy_excluded",
    reason_code: "late_stage_exception_failed",
    reason: "Socure is an independent and well-documented product company, but the current signal is a strategic growth investment at a reported $5.2B valuation after a prior Series E, alongside an acquisition and $364M company-reported ARR. This is a mature expansion transaction and does not clear VentureDex's selective late-stage breakout bar for this queue.",
    sources: ["https://www.socure.com/news-and-press/strategic-growth-investment-fravity-acquisition", "https://www.socure.com/news-and-press/riskos-ai-suite-launch", "https://www.socure.com/news-and-press/socure-accelerates-mission-to-be-the-first-to-verify-100-of-identities-and-eliminate-identity-fraud-across-all-industries-with-a-450m-investment-led-by-accel-and-t-rowe-price-at-a-4-5b-valuation"],
  },
};

function appendAttempt(row, outcome, note) {
  if (row.attempts.some((attempt) => attempt.date === reviewedAt)) {
    throw new Error(`${row.slug}: a ${reviewedAt} attempt already exists`);
  }
  row.attempts.push({ date: reviewedAt, outcome, note });
}

const data = JSON.parse(readFileSync(reviewPath, "utf8"));
const rows = new Map(data.reviews.map((row) => [row.slug, row]));

for (const [slug, spec] of Object.entries(qualified)) {
  const row = rows.get(slug);
  if (!row) throw new Error(`Missing review: ${slug}`);
  if (spec.companyUrl) row.company_url = spec.companyUrl;
  if (spec.identityCorrection) row.identity_correction = spec.identityCorrection;
  row.state = "qualified_pending";
  row.reason_code = "publication_capacity";
  row.reason = `The September 11 evidence review verified ${spec.funding} and an inspectable ${spec.label}. Product evidence and at least two taste dimensions pass; the company is qualified for the bounded publication queue, not silently accepted without startup, investor, screenshot and release gates.`;
  row.reviewed_at = reviewedAt;
  row.next_review_at = qualifiedReviewAt;
  row.sources = [...new Set([row.company_url, ...spec.sources, ...spec.evidence.map(([url]) => url)])];
  row.evaluation = {
    rubric: spec.rubric,
    independent: true,
    funding_verified: true,
    product_evidence: spec.evidence.map(([url, note]) => ({ url, note })),
    taste: {
      bet: { pass: true, note: spec.taste[0] },
      craft: { pass: true, note: spec.taste[1] },
      specificity: { pass: true, note: spec.taste[2] },
    },
  };
  appendAttempt(row, "qualified_pending", `Completed the source-by-source backlog review: verified the financing and ${spec.label}; qualification passed and awaits the bounded publication workflow.`);
}

for (const [slug, spec] of Object.entries(terminal)) {
  const row = rows.get(slug);
  if (!row) throw new Error(`Missing review: ${slug}`);
  row.state = spec.state;
  row.reason_code = spec.reason_code;
  row.reason = spec.reason;
  row.reviewed_at = reviewedAt;
  row.next_review_at = null;
  row.sources = spec.sources;
  delete row.evaluation;
  delete row.identity_correction;
  appendAttempt(row, spec.state, `Completed the source-by-source backlog review. ${spec.reason}`);
}

const dawraty = rows.get("dawraty");
if (!dawraty) throw new Error("Missing review: dawraty");
dawraty.state = "evidence_pending";
dawraty.reason_code = "funding_evidence_gap";
dawraty.reason = "The product is now inspectable through current institutional-learning coverage, but reporting describes an investment as part of a $2M Seed round whose final close is expected by the end of November. The completed amount and finality are not yet established, so the candidate remains evidence-pending rather than being accepted or rejected.";
dawraty.reviewed_at = reviewedAt;
dawraty.next_review_at = "2026-10-11";
dawraty.priority = 1;
dawraty.sources = [
  "https://joindawraty.com/",
  "https://www.wamda.com/index.php/en/media/news",
  "https://en.sharikatmubasher.com/media-hub/news/21573497/kuwaiti-edtech-startup-dawraty-raises-2mn-seed-round?lang=en",
];
delete dawraty.evaluation;
appendAttempt(dawraty, "evidence_pending", "Access is no longer the blocker. Current reporting says the investment is part of a $2M Seed round with final close expected later, so exact completed financing remains unresolved.");

const expectedQualified = 39;
if (Object.keys(qualified).length !== expectedQualified) {
  throw new Error(`Expected ${expectedQualified} qualified records, found ${Object.keys(qualified).length}`);
}
if (data.reviews.length !== 57 || rows.size !== 57) {
  throw new Error(`Expected the complete 57-record overlay, found ${data.reviews.length}/${rows.size}`);
}

writeFileSync(reviewPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(JSON.stringify({ reviewed_at: reviewedAt, qualified: Object.keys(qualified).length, terminal: Object.keys(terminal).length, evidence_pending: ["dawraty", "bluecore-energy"] }, null, 2));
