-- VentureDex Weekly #1
INSERT OR IGNORE INTO weekly_issues (id, issue_number, title, editorial_intro, published_at, status) VALUES
('w-001', 1,
 'The tools that changed how we build',
 'For our first issue, we picked the tools that fundamentally changed developer workflows in the last three years. Not incremental improvements. Not features wrapped in startups. Products that made you think differently about how software gets built.',
 datetime('now'),
 'published');

-- Link 5 picks to the issue
INSERT OR IGNORE INTO weekly_issue_sites (issue_id, site_id, display_order, issue_note) VALUES
('w-001', 's-005', 1, 'Cursor proved that the IDE is not done evolving. Every developer who tries it has the same reaction: why did I wait so long to switch?'),
('w-001', 's-001', 2, 'Linear made project management feel like a developer tool, not a management tool. That distinction matters more than any feature list.'),
('w-001', 's-004', 3, 'Perplexity is what happens when you start from the answer instead of the search. Simple idea. Turns out nobody had done it well.'),
('w-001', 's-007', 4, 'Claude Code turned an AI chatbot into an engineering colleague. The CLI changed everything about how we think about AI-assisted development.'),
('w-001', 's-002', 5, 'Resend took transactional email from painful to pleasant. React Email as a companion project was the move that showed they get it.');
