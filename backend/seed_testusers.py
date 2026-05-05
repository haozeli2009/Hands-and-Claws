"""
Seed test users + rich profiles for matching tests.
Run from the backend directory (or anywhere with the venv active):
    python seed_testusers.py

All test accounts get password: testpass123
Skips any username that already exists.
"""
import asyncio
import sys
import os
from datetime import datetime, timezone

# Make sure we can import from the backend package
sys.path.insert(0, os.path.dirname(__file__))

import aiosqlite
from user.auth import hash_password

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "users.db")
PASSWORD = "testpass123"

USERS = [
    # (username, email, name, bio, skills, location, availability, rating_avg, rating_count)
    (
        "zara_chen",
        "zara.chen@test.hc",
        "Zara Chen",
        "Full-stack engineer with 8 years building consumer apps at scale. "
        "Obsessed with clean APIs and fast UIs. Ex-Stripe, ex-Figma. "
        "Open to short contracts on the side.",
        "React, TypeScript, Node.js, PostgreSQL, REST API design, GraphQL, "
        "system design, code review, technical writing",
        "San Francisco, CA",
        True, 4.8, 12,
    ),
    (
        "marcus_obi",
        "marcus.obi@test.hc",
        "Marcus Obi",
        "ML engineer specialising in NLP and recommendation systems. "
        "Published two papers on transformer fine-tuning. Fluent in both "
        "research and production deployment. Love mentoring junior engineers.",
        "Python, PyTorch, Hugging Face, LLM fine-tuning, RAG, vector databases, "
        "MLflow, Kubernetes, data pipelines, technical mentoring",
        "London, UK",
        True, 4.9, 8,
    ),
    (
        "priya_nair",
        "priya.nair@test.hc",
        "Priya Nair",
        "UX/UI designer turned product manager. Led design for a fintech app "
        "used by 2M+ people. Strong on user research, prototyping, and "
        "working closely with engineers to ship fast.",
        "Figma, user research, wireframing, product roadmap, A/B testing, "
        "design systems, stakeholder management, Notion, Jira, analytics",
        "Bangalore, India",
        True, 4.7, 21,
    ),
    (
        "tom_reeves",
        "tom.reeves@test.hc",
        "Tom Reeves",
        "DevOps / platform engineer. Built and run infrastructure for startups "
        "from 0 to Series B. Comfortable on AWS, GCP, and bare metal. "
        "Strong opinions on observability and incident response.",
        "Terraform, AWS, GCP, Kubernetes, Docker, CI/CD, Prometheus, Grafana, "
        "incident management, cost optimisation, Linux, Bash scripting",
        "Austin, TX",
        True, 4.6, 15,
    ),
    (
        "yuki_tanaka",
        "yuki.tanaka@test.hc",
        "Yuki Tanaka",
        "Freelance graphic designer and brand strategist. Worked with 50+ startups "
        "on identity, pitch decks, and marketing collateral. Fast turnaround, "
        "strong opinions on typography.",
        "brand identity, logo design, Illustrator, Photoshop, InDesign, "
        "pitch deck design, motion graphics, social media visuals, colour theory",
        "Tokyo, Japan",
        True, 4.5, 34,
    ),
    (
        "alex_storm",
        "alex.storm@test.hc",
        "Alex Storm",
        "Security researcher and penetration tester. OSCP certified. "
        "Runs red team exercises for mid-market companies. "
        "Also does security code review and architecture threat-modelling.",
        "penetration testing, red teaming, OWASP, web app security, "
        "network security, threat modelling, Burp Suite, Metasploit, "
        "Python scripting, security code review, incident response",
        "Berlin, Germany",
        True, 4.9, 6,
    ),
    (
        "lena_mwangi",
        "lena.mwangi@test.hc",
        "Lena Mwangi",
        "Data scientist with a background in economics. Turns messy business "
        "data into decisions. Experienced in both early-stage startups (scrappy "
        "analysis in notebooks) and enterprise (Spark at scale).",
        "Python, pandas, SQL, dbt, Spark, Power BI, Tableau, statistical modelling, "
        "A/B testing, causal inference, data storytelling, Excel",
        "Nairobi, Kenya",
        True, 4.4, 19,
    ),
    (
        "ryan_walsh",
        "ryan.walsh@test.hc",
        "Ryan Walsh",
        "Video producer and editor. 10 years making content for YouTube, "
        "brands, and documentary. Comfortable from concept through final cut. "
        "Also does podcast production and audio mixing.",
        "video editing, Premiere Pro, DaVinci Resolve, After Effects, "
        "motion graphics, colour grading, scriptwriting, podcast production, "
        "audio mixing, YouTube SEO, short-form content",
        "Los Angeles, CA",
        True, 4.3, 28,
    ),
    (
        "sofia_blake",
        "sofia.blake@test.hc",
        "Sofia Blake",
        "Technical writer and content strategist. Spent 5 years at a developer "
        "tools company documenting APIs and SDKs. Also writes long-form blog posts "
        "and whitepapers. Fast, accurate, SEO-aware.",
        "technical writing, API documentation, developer content, SEO copywriting, "
        "whitepapers, blog writing, Markdown, Docs-as-Code, Git, content strategy",
        "Toronto, Canada",
        True, 4.6, 11,
    ),
    (
        "kai_diallo",
        "kai.diallo@test.hc",
        "Kai Diallo",
        "Mobile engineer (iOS and Android). Five apps in the top charts. "
        "Writes clean Swift and Kotlin. Good eye for interaction design. "
        "Available for short sprints or ongoing part-time work.",
        "iOS, Swift, SwiftUI, Android, Kotlin, React Native, mobile UI, "
        "App Store optimisation, push notifications, offline-first apps, "
        "mobile performance profiling",
        "Dakar, Senegal",
        True, 4.7, 9,
    ),
    (
        "nina_hart",
        "nina.hart@test.hc",
        "Nina Hart",
        "Growth marketer. Built and run paid acquisition for three SaaS companies. "
        "Runs tight loops between ads, landing pages, and analytics. "
        "Also does email marketing and lifecycle automation.",
        "paid acquisition, Google Ads, Meta Ads, landing page optimisation, "
        "email marketing, HubSpot, Klaviyo, conversion rate optimisation, "
        "analytics, growth experimentation, copywriting",
        "Amsterdam, Netherlands",
        True, 4.2, 17,
    ),
    (
        "jorge_silva",
        "jorge.silva@test.hc",
        "Jorge Silva",
        "Backend engineer with a focus on high-throughput systems and event-driven "
        "architecture. Rebuilt a payment processing pipeline to handle 50k TPS. "
        "Loves Rust and is comfortable in Go and Java.",
        "Rust, Go, Java, Kafka, event-driven architecture, microservices, "
        "PostgreSQL, Redis, load testing, performance tuning, API design",
        "São Paulo, Brazil",
        True, 4.8, 7,
    ),
    (
        "amy_liu",
        "amy.liu@test.hc",
        "Amy Liu",
        "Chartered accountant and startup CFO-for-hire. Has closed seed and Series A "
        "rounds. Does financial modelling, board reporting, due diligence, and "
        "fractional CFO work. Also comfortable with crypto accounting.",
        "financial modelling, fundraising, cap table management, due diligence, "
        "GAAP, board reporting, crypto accounting, QuickBooks, Excel, "
        "cash flow forecasting, startup finance",
        "New York, NY",
        True, 4.9, 5,
    ),
    (
        "dev_patel",
        "dev.patel@test.hc",
        "Dev Patel",
        "Blockchain developer with 4 years in DeFi. Audited 20+ smart contracts. "
        "Writes Solidity and Rust (Solana). Also does integrations with "
        "EVM chains and cross-chain bridges.",
        "Solidity, smart contract auditing, DeFi, EVM, Hardhat, Foundry, "
        "Solana, Rust, Web3.js, cross-chain bridges, tokenomics, "
        "protocol design, security review",
        "Dubai, UAE",
        True, 4.5, 13,
    ),
    (
        "claire_ford",
        "claire.ford@test.hc",
        "Claire Ford",
        "Executive assistant and operations manager. Keeps chaotic founders "
        "and small teams running. Handles scheduling, travel, vendor management, "
        "HR onboarding, and anything else that falls through the cracks.",
        "executive assistance, calendar management, travel coordination, "
        "vendor negotiation, HR onboarding, project coordination, "
        "Notion, Slack, Google Workspace, event planning",
        "Chicago, IL",
        True, 4.4, 23,
    ),
    (
        "bao_nguyen",
        "bao.nguyen@test.hc",
        "Bao Nguyen",
        "Professional chef and recipe developer. 12 years in Michelin-starred "
        "kitchens and now doing private dining, pop-ups, and food content. "
        "Strong in Vietnamese, French, and fusion cuisines.",
        "private dining, recipe development, menu design, Vietnamese cuisine, "
        "French technique, pastry, food photography, meal prep, "
        "catering, food content creation",
        "Ho Chi Minh City, Vietnam",
        True, 4.7, 31,
    ),
    (
        "olga_petrov",
        "olga.petrov@test.hc",
        "Olga Petrov",
        "Translator and localisation lead. Works across Russian, English, German, "
        "and French. Specialises in legal and technical documents. "
        "Has in-house experience at a global law firm.",
        "Russian-English translation, German, French, legal translation, "
        "technical translation, localisation, proofreading, "
        "transcreation, CAT tools, SDL Trados",
        "Warsaw, Poland",
        True, 4.6, 16,
    ),
    (
        "ethan_cross",
        "ethan.cross@test.hc",
        "Ethan Cross",
        "Licensed electrician and smart-home integrator. Wires residential and "
        "light commercial jobs. Also installs and programs KNX, Control4, and "
        "Home Assistant systems. Based in Sydney but travels for projects.",
        "electrical installation, home automation, KNX, Control4, Home Assistant, "
        "solar panels, EV charger installation, safety inspections, "
        "smart lighting, HVAC integration",
        "Sydney, Australia",
        False, 3.9, 4,  # unavailable — to verify availability filtering
    ),
]


async def seed():
    now = datetime.now(timezone.utc).isoformat()
    hashed_pw = hash_password(PASSWORD)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        created = 0
        skipped = 0

        for (username, email, name, bio, skills, location,
             availability, rating_avg, rating_count) in USERS:

            # Check if user already exists
            async with db.execute(
                "SELECT uid FROM users WHERE username = ?", (username,)
            ) as cur:
                existing = await cur.fetchone()

            if existing:
                print(f"  skip  {username} (already exists)")
                skipped += 1
                continue

            # Insert user
            cur = await db.execute(
                "INSERT INTO users (username, email, hashed_password, created_at) "
                "VALUES (?, ?, ?, ?)",
                (username, email, hashed_pw, now),
            )
            uid = cur.lastrowid

            # Upsert profile with ratings
            await db.execute(
                """INSERT INTO profiles
                       (uid, name, bio, skills, location, availability,
                        updated_at, rating_avg, rating_count)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(uid) DO UPDATE SET
                       name=excluded.name, bio=excluded.bio,
                       skills=excluded.skills, location=excluded.location,
                       availability=excluded.availability,
                       updated_at=excluded.updated_at,
                       rating_avg=excluded.rating_avg,
                       rating_count=excluded.rating_count""",
                (uid, name, bio, skills, location, int(availability),
                 now, rating_avg, rating_count),
            )

            avail_str = "available" if availability else "UNAVAILABLE"
            rating_str = f"{rating_avg}/5 ({rating_count})" if rating_avg else "no rating"
            print(f"  create {username:20s}  uid={uid:3d}  {avail_str}  rating={rating_str}")
            created += 1

        await db.commit()
        print(f"\nDone: {created} created, {skipped} skipped.")


if __name__ == "__main__":
    asyncio.run(seed())
