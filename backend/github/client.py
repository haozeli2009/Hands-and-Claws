"""
GitHub App client — generates installation access tokens and wraps key API calls.

Auth flow for each API call:
  1. Sign a short-lived JWT with the App private key (RS256, max 10 min)
  2. Exchange JWT → installation access token (1 h, per-installation)
  3. Use that token for all repo-scoped reads and writes
"""
from __future__ import annotations
import logging
import time

import httpx
from jose import jwt as jose_jwt

from config import Config

logger = logging.getLogger(__name__)

_GITHUB_API = "https://api.github.com"
_DIFF_LIMIT = 8000   # truncate diffs before they enter LLM context


# ------------------------------------------------------------------
# App-level auth
# ------------------------------------------------------------------

def _app_jwt() -> str:
    """Short-lived RS256 JWT signed with the App private key."""
    now = int(time.time())
    return jose_jwt.encode(
        {"iat": now - 60, "exp": now + 540, "iss": Config.GITHUB_APP_ID},
        Config.GITHUB_APP_PRIVATE_KEY,
        algorithm="RS256",
    )


def _gh_headers(token: str, accept: str = "application/vnd.github+json") -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": accept,
        "User-Agent": "hands-and-claws",
        "X-GitHub-Api-Version": "2022-11-28",
    }


async def get_installation_token(installation_id: str) -> tuple[str, str]:
    """Exchange an installation_id for an access token. Returns (token, expires_at_iso)."""
    jwt = _app_jwt()
    async with httpx.AsyncClient(timeout=10) as http:
        resp = await http.post(
            f"{_GITHUB_API}/app/installations/{installation_id}/access_tokens",
            headers=_gh_headers(jwt),
        )
        resp.raise_for_status()
        data = resp.json()
        return data["token"], data["expires_at"]


async def get_installation_repos(installation_id: str) -> list[dict]:
    """List all repos the installation has access to (up to 100)."""
    token, _ = await get_installation_token(installation_id)
    async with httpx.AsyncClient(timeout=10) as http:
        resp = await http.get(
            f"{_GITHUB_API}/installation/repositories",
            headers=_gh_headers(token),
            params={"per_page": 100},
        )
        resp.raise_for_status()
        return [
            {
                "owner":       r["owner"]["login"],
                "name":        r["name"],
                "full_name":   r["full_name"],
                "private":     r["private"],
                "description": r.get("description") or "",
            }
            for r in resp.json().get("repositories", [])
        ]


# ------------------------------------------------------------------
# Repo-scoped reads
# ------------------------------------------------------------------

async def get_pr(token: str, owner: str, repo: str, number: int) -> dict:
    """Fetch PR metadata and a truncated diff."""
    headers = _gh_headers(token)
    async with httpx.AsyncClient(timeout=15) as http:
        pr_resp = await http.get(
            f"{_GITHUB_API}/repos/{owner}/{repo}/pulls/{number}",
            headers=headers,
        )
        pr_resp.raise_for_status()
        pr = pr_resp.json()

        diff_resp = await http.get(
            f"{_GITHUB_API}/repos/{owner}/{repo}/pulls/{number}",
            headers=_gh_headers(token, accept="application/vnd.github.diff"),
        )
        diff = diff_resp.text[:_DIFF_LIMIT] if diff_resp.status_code == 200 else ""

    return {
        "type":          "pr",
        "owner":         owner,
        "repo":          repo,
        "number":        pr["number"],
        "title":         pr["title"],
        "body":          pr.get("body") or "",
        "state":         pr["state"],
        "author":        pr["user"]["login"],
        "head_branch":   pr["head"]["ref"],
        "base_branch":   pr["base"]["ref"],
        "files_changed": pr.get("changed_files", 0),
        "additions":     pr.get("additions", 0),
        "deletions":     pr.get("deletions", 0),
        "diff":          diff,
        "url":           pr["html_url"],
    }


async def get_issue(token: str, owner: str, repo: str, number: int) -> dict:
    """Fetch issue metadata and up to 20 comments."""
    headers = _gh_headers(token)
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.get(
            f"{_GITHUB_API}/repos/{owner}/{repo}/issues/{number}",
            headers=headers,
        )
        resp.raise_for_status()
        iss = resp.json()

        comments_resp = await http.get(
            f"{_GITHUB_API}/repos/{owner}/{repo}/issues/{number}/comments",
            headers=headers,
            params={"per_page": 20},
        )
        comments = [
            {"author": c["user"]["login"], "body": c["body"]}
            for c in (comments_resp.json() if comments_resp.status_code == 200 else [])
        ]

    return {
        "type":     "issue",
        "owner":    owner,
        "repo":     repo,
        "number":   iss["number"],
        "title":    iss["title"],
        "body":     iss.get("body") or "",
        "state":    iss["state"],
        "author":   iss["user"]["login"],
        "labels":   [lbl["name"] for lbl in iss.get("labels", [])],
        "comments": comments,
        "url":      iss["html_url"],
    }


async def list_issues(
    token: str, owner: str, repo: str, state: str = "open"
) -> list[dict]:
    """List up to 30 issues (PRs excluded)."""
    async with httpx.AsyncClient(timeout=10) as http:
        resp = await http.get(
            f"{_GITHUB_API}/repos/{owner}/{repo}/issues",
            headers=_gh_headers(token),
            params={"state": state, "per_page": 30},
        )
        resp.raise_for_status()
        return [
            {
                "number": i["number"],
                "title":  i["title"],
                "state":  i["state"],
                "author": i["user"]["login"],
                "labels": [lbl["name"] for lbl in i.get("labels", [])],
                "url":    i["html_url"],
            }
            for i in resp.json()
            if "pull_request" not in i
        ]


# ------------------------------------------------------------------
# Repo-scoped writes
# ------------------------------------------------------------------

async def post_pr_review(
    token: str, owner: str, repo: str, number: int,
    body: str, event: str = "COMMENT",
) -> dict:
    """
    Post a review to a PR.
    event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"
    """
    async with httpx.AsyncClient(timeout=10) as http:
        resp = await http.post(
            f"{_GITHUB_API}/repos/{owner}/{repo}/pulls/{number}/reviews",
            headers=_gh_headers(token),
            json={"body": body, "event": event},
        )
        resp.raise_for_status()
        r = resp.json()
        return {"id": r["id"], "state": r["state"], "url": r["html_url"]}


async def post_issue_comment(
    token: str, owner: str, repo: str, number: int, body: str,
) -> dict:
    """Post a comment on an issue or PR."""
    async with httpx.AsyncClient(timeout=10) as http:
        resp = await http.post(
            f"{_GITHUB_API}/repos/{owner}/{repo}/issues/{number}/comments",
            headers=_gh_headers(token),
            json={"body": body},
        )
        resp.raise_for_status()
        c = resp.json()
        return {"id": c["id"], "url": c["html_url"]}
