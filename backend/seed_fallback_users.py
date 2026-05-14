"""
Seed fallback users — platform experts matched when no real user is available.
Run from the backend directory:
    python seed_fallback_users.py

Fallback users have participant_type='fallback' and are excluded from the normal
matching pool. The orchestrator uses them only as a last resort.
Skips any username that already exists.
"""
import asyncio
import sys
import os
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))

import aiosqlite

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "users.db")

# (username, email, name, bio, skills, location, rating_avg, rating_count)
FALLBACK_USERS = [
    (
        "fb_web_dev",
        "fb.web@fallback.hc",
        "Alex Morgan",
        "Full-stack web developer comfortable across the entire stack — React, Vue, "
        "and Angular on the frontend; Node.js, Python, Django, and PHP on the backend. "
        "Builds production-ready web apps, e-commerce sites, landing pages, APIs, "
        "and SaaS platforms. Familiar with relational and NoSQL databases.",
        "React, Vue, Angular, JavaScript, TypeScript, Node.js, Python, Django, Flask, "
        "PHP, WordPress, REST API, GraphQL, HTML, CSS, Tailwind, MySQL, PostgreSQL, "
        "MongoDB, Redis, web development, frontend, backend, full-stack",
        "Remote",
        None, 0,
    ),
    (
        "fb_designer",
        "fb.designer@fallback.hc",
        "Jordan Blake",
        "Creative designer covering UI/UX design, graphic design, branding, and visual "
        "identity. Has worked with startups and established brands on logos, design "
        "systems, mobile app interfaces, and marketing collateral. Also does print, "
        "social media graphics, and motion design.",
        "UI design, UX design, Figma, Sketch, Adobe XD, graphic design, branding, "
        "logo design, Illustrator, Photoshop, InDesign, design systems, wireframing, "
        "prototyping, motion graphics, social media design, print design, "
        "typography, color theory, visual identity",
        "Remote",
        None, 0,
    ),
    (
        "fb_ml_ai",
        "fb.ml@fallback.hc",
        "Sam Chen",
        "Machine learning and AI engineer with experience in NLP, computer vision, "
        "recommendation systems, and generative AI. Builds and deploys ML models in "
        "production. Familiar with LLM fine-tuning, RAG pipelines, agentic workflows, "
        "and classical ML. Strong Python and data engineering background.",
        "Python, PyTorch, TensorFlow, scikit-learn, LLM, OpenAI API, Anthropic API, "
        "NLP, computer vision, RAG, vector databases, Hugging Face, MLflow, Kubernetes, "
        "pandas, NumPy, data pipelines, model deployment, machine learning, AI, "
        "generative AI, embeddings, fine-tuning, agentic AI",
        "Remote",
        None, 0,
    ),
    (
        "fb_devops",
        "fb.devops@fallback.hc",
        "Chris Taylor",
        "DevOps and cloud infrastructure engineer comfortable with AWS, GCP, and Azure. "
        "Builds CI/CD pipelines, manages Kubernetes clusters, writes Terraform, and "
        "handles observability and alerting. Strong on Linux, Docker, and cloud "
        "security best practices. Available for audits, migrations, and ongoing ops.",
        "AWS, GCP, Azure, Kubernetes, Docker, Terraform, Ansible, CI/CD, "
        "GitHub Actions, Jenkins, GitLab CI, Prometheus, Grafana, Linux, Bash, "
        "Python, Nginx, infrastructure as code, observability, cost optimisation, "
        "DevSecOps, cloud architecture, site reliability engineering, SRE",
        "Remote",
        None, 0,
    ),
    (
        "fb_mobile",
        "fb.mobile@fallback.hc",
        "Riley Kim",
        "Mobile app developer for iOS and Android. Writes Swift and Kotlin natively "
        "and also builds cross-platform apps with React Native and Flutter. Has shipped "
        "multiple apps to the App Store and Google Play. Good eye for interaction "
        "design and mobile performance.",
        "iOS, Swift, SwiftUI, Objective-C, Android, Kotlin, Jetpack Compose, "
        "React Native, Flutter, Dart, mobile UI, push notifications, "
        "App Store, Google Play, mobile testing, offline-first apps, "
        "mobile performance, deep links, in-app purchases",
        "Remote",
        None, 0,
    ),
    (
        "fb_writer",
        "fb.writer@fallback.hc",
        "Morgan Ellis",
        "Professional writer covering copywriting, content marketing, technical writing, "
        "blog posts, whitepapers, and creative writing. Adapts tone and style to match "
        "any brand voice. SEO-aware and comfortable with docs-as-code workflows. "
        "Fast turnaround and strong editing skills.",
        "copywriting, content writing, SEO writing, blog posts, technical writing, "
        "API documentation, whitepapers, case studies, email copy, ad copy, "
        "social media content, creative writing, scriptwriting, proofreading, "
        "editing, Markdown, documentation, ghostwriting, newsletters",
        "Remote",
        None, 0,
    ),
    (
        "fb_marketer",
        "fb.marketer@fallback.hc",
        "Taylor Webb",
        "Digital marketer covering paid ads, SEO, social media, email marketing, "
        "and growth strategy. Runs campaigns on Google, Meta, LinkedIn, and TikTok. "
        "Strong on analytics, A/B testing, and conversion rate optimisation. "
        "Has grown SaaS, e-commerce, and consumer brands.",
        "digital marketing, Google Ads, Meta Ads, Facebook Ads, LinkedIn Ads, "
        "TikTok Ads, SEO, SEM, email marketing, Mailchimp, HubSpot, Klaviyo, "
        "social media marketing, content strategy, A/B testing, analytics, "
        "Google Analytics, growth hacking, conversion rate optimisation, "
        "influencer marketing, brand strategy, paid search, paid social",
        "Remote",
        None, 0,
    ),
    (
        "fb_lawyer",
        "fb.lawyer@fallback.hc",
        "Drew Lawson",
        "Startup and technology lawyer with experience in contracts, intellectual "
        "property, privacy law, employment agreements, and fundraising. Reviews and "
        "drafts NDAs, SaaS agreements, terms of service, privacy policies, and "
        "partnership contracts. Also advises on GDPR, CCPA, and data compliance.",
        "contracts, legal review, startup law, intellectual property, IP, patent, "
        "trademark, copyright, privacy law, GDPR, CCPA, NDA, SaaS agreement, "
        "terms of service, employment law, equity, cap table, corporate law, "
        "compliance, licensing, legal drafting, fundraising legal, SAFE, term sheet",
        "Remote",
        None, 0,
    ),
    (
        "fb_accountant",
        "fb.accountant@fallback.hc",
        "Jamie Price",
        "Chartered accountant and financial advisor for startups and small businesses. "
        "Handles bookkeeping, tax preparation, financial modelling, payroll, and "
        "startup finance. Also does fractional CFO work, fundraising preparation, "
        "investor reporting, and due diligence support.",
        "accounting, bookkeeping, tax preparation, financial modelling, payroll, "
        "QuickBooks, Xero, Wave, GAAP, IFRS, startup finance, CFO, fundraising, "
        "cash flow, budget, forecast, cap table, due diligence, Excel, "
        "financial reporting, audit, VAT, corporation tax, R&D tax credits",
        "Remote",
        None, 0,
    ),
    (
        "fb_pm",
        "fb.pm@fallback.hc",
        "Avery Stone",
        "Experienced project manager and product owner. Runs Agile and Scrum teams, "
        "manages cross-functional projects from inception to delivery. Strong "
        "communicator and stakeholder manager. Comfortable with both technical "
        "product development and operational projects.",
        "project management, product management, Agile, Scrum, Kanban, Jira, "
        "Asana, Notion, Linear, stakeholder management, product roadmap, sprint planning, "
        "risk management, resource planning, Confluence, requirements, "
        "user stories, OKRs, delivery management, program management, "
        "release management, change management",
        "Remote",
        None, 0,
    ),
    (
        "fb_data",
        "fb.data@fallback.hc",
        "Quinn Foster",
        "Data analyst and business intelligence specialist. Turns raw data into "
        "dashboards, reports, and actionable insights. Comfortable with SQL, Python, "
        "and BI tools. Has worked across e-commerce, SaaS, and fintech verticals. "
        "Also does data cleaning, pipeline building, and statistical analysis.",
        "data analysis, SQL, Python, pandas, Excel, Power BI, Tableau, Looker, "
        "Metabase, dbt, data modelling, business intelligence, dashboards, reporting, "
        "statistical analysis, A/B testing, ETL, data pipelines, Google Analytics, "
        "data storytelling, KPIs, metrics, data cleaning, Snowflake, BigQuery",
        "Remote",
        None, 0,
    ),
    (
        "fb_researcher",
        "fb.researcher@fallback.hc",
        "Casey Monroe",
        "Research specialist for market research, competitive analysis, user research, "
        "and literature reviews. Synthesises findings into clear reports and "
        "presentations. Background in social science and business strategy. "
        "Skilled at both qualitative and quantitative research methods.",
        "market research, competitive analysis, user research, literature review, "
        "research design, surveys, interviews, qualitative research, quantitative "
        "research, report writing, data synthesis, presentation, academic research, "
        "industry analysis, SWOT analysis, trend analysis, desk research, "
        "customer discovery, persona development",
        "Remote",
        None, 0,
    ),
    (
        "fb_video",
        "fb.video@fallback.hc",
        "Blake Harrison",
        "Video and multimedia creator. Edits YouTube videos, reels, shorts, and "
        "promotional clips. Also produces podcasts, webinars, and online course "
        "content. Comfortable with motion graphics, colour grading, and subtitling. "
        "Quick turnaround and strong storytelling instincts.",
        "video editing, Premiere Pro, DaVinci Resolve, After Effects, Final Cut Pro, "
        "YouTube, reels, shorts, TikTok video, podcast production, audio editing, "
        "motion graphics, colour grading, subtitles, YouTube SEO, webinar editing, "
        "screen recording, tutorial videos, social media video, explainer video",
        "Remote",
        None, 0,
    ),
    (
        "fb_security",
        "fb.security@fallback.hc",
        "Robin Chase",
        "Cybersecurity professional covering security audits, penetration testing, "
        "vulnerability assessment, and security architecture review. Also does "
        "compliance consulting for SOC2, ISO 27001, and GDPR. Strong background "
        "in web application security and cloud security posture management.",
        "cybersecurity, penetration testing, security audit, vulnerability assessment, "
        "OWASP, web app security, cloud security, AWS security, network security, "
        "SOC2, ISO 27001, GDPR compliance, threat modelling, security code review, "
        "security architecture, incident response, SIEM, firewall, zero trust, "
        "red teaming, phishing simulation, bug bounty",
        "Remote",
        None, 0,
    ),
    (
        "fb_hr",
        "fb.hr@fallback.hc",
        "Skyler Brooks",
        "HR generalist and talent acquisition specialist. Handles recruitment, "
        "onboarding, performance management, and HR policy development. Also does "
        "salary benchmarking, culture initiatives, and fractional CHRO work for "
        "startups and scale-ups building their people function from scratch.",
        "HR, human resources, recruitment, talent acquisition, sourcing, onboarding, "
        "performance management, HR policy, culture, employee engagement, "
        "salary benchmarking, CHRO, people operations, job descriptions, "
        "interviewing, diversity equity inclusion, DEI, payroll, employment law, "
        "organisational design, remote teams, employer branding",
        "Remote",
        None, 0,
    ),
]


async def seed():
    now = datetime.now(timezone.utc).isoformat()

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        created = 0
        skipped = 0

        for (username, email, name, bio, skills, location,
             rating_avg, rating_count) in FALLBACK_USERS:

            async with db.execute(
                "SELECT uid FROM users WHERE username = ?", (username,)
            ) as cur:
                existing = await cur.fetchone()

            if existing:
                print(f"  skip  {username} (already exists)")
                skipped += 1
                continue

            cur = await db.execute(
                "INSERT INTO users (username, email, hashed_password, created_at, participant_type) "
                "VALUES (?, ?, '!!fallback', ?, 'fallback')",
                (username, email, now),
            )
            uid = cur.lastrowid

            await db.execute(
                """INSERT INTO profiles
                       (uid, name, bio, skills, location, availability,
                        updated_at, rating_avg, rating_count)
                   VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
                   ON CONFLICT(uid) DO UPDATE SET
                       name=excluded.name, bio=excluded.bio,
                       skills=excluded.skills, location=excluded.location,
                       availability=1,
                       updated_at=excluded.updated_at,
                       rating_avg=excluded.rating_avg,
                       rating_count=excluded.rating_count""",
                (uid, name, bio, skills, location, now, rating_avg, rating_count),
            )

            print(f"  create {username:20s}  uid={uid:3d}  fallback")
            created += 1

        await db.commit()
        print(f"\nDone: {created} created, {skipped} skipped.")


if __name__ == "__main__":
    asyncio.run(seed())
