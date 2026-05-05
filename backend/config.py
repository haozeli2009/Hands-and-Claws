import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # --- Protocol (external gateway + DB) ---
    # Set to empty string to use the built-in WebSocket bridge (no external protocol)
    PROTOCOL_URL        = os.environ.get("PROTOCOL_URL", "")

    # --- LLM ---
    LLM_PROVIDER        = os.environ.get("LLM_PROVIDER", "anthropic")
    LLM_MODEL           = os.environ.get("LLM_MODEL", "claude-sonnet-4-6")
    LLM_MAX_TOKENS      = int(os.environ.get("LLM_MAX_TOKENS", "2048"))
    LLM_THINKING_BUDGET = int(os.environ.get("LLM_THINKING_BUDGET", "2048"))
    ANTHROPIC_API_KEY   = os.environ.get("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY      = os.environ.get("OPENAI_API_KEY", "")

    # --- Per-user LLM keys ---
    # Fernet key (url-safe base64 32 bytes) used to encrypt user-supplied API
    # keys at rest. Generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # If unset, per-user LLM config is disabled: API returns 503, Delegates use the
    # system-default LLM for everyone.
    LLM_KEY_ENCRYPTION_KEY = os.environ.get("LLM_KEY_ENCRYPTION_KEY", "")


    # --- Matching ---
    TOP_N_MATCHES       = int(os.environ.get("TOP_N_MATCHES", "3"))
    FTS_CANDIDATE_POOL  = int(os.environ.get("FTS_CANDIDATE_POOL", "50"))

    # --- Timeouts ---
    CONSENT_TIMEOUT     = float(os.environ.get("CONSENT_TIMEOUT", "120"))
    ACCEPT_TIMEOUT      = float(os.environ.get("ACCEPT_TIMEOUT", "120"))

    # --- Web server (API + dashboard) ---
    SERVER_HOST         = os.environ.get("SERVER_HOST", "0.0.0.0")
    SERVER_PORT         = int(os.environ.get("SERVER_PORT", "8000"))

    # --- Auth ---
    JWT_SECRET          = os.environ.get("JWT_SECRET", "change-me-in-production")
    JWT_EXPIRY_DAYS     = int(os.environ.get("JWT_EXPIRY_DAYS", "7"))

    # --- GitHub OAuth ---
    # Create an OAuth app at https://github.com/settings/developers
    # Authorization callback URL must match GITHUB_REDIRECT_URI exactly.
    # If any of these are empty, the GitHub sign-in button is disabled.
    GITHUB_CLIENT_ID     = os.environ.get("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
    GITHUB_REDIRECT_URI  = os.environ.get("GITHUB_REDIRECT_URI", "")

    # --- Admin dashboard ---
    DASHBOARD_USER      = os.environ.get("DASHBOARD_USER", "admin")
    DASHBOARD_PASS      = os.environ.get("DASHBOARD_PASS", "admin")

    # --- Database ---
    USER_DB_PATH        = os.environ.get("USER_DB_PATH", "data/users.db")

    # --- Logging ---
    LOG_LEVEL           = os.environ.get("LOG_LEVEL", "INFO")
    LOG_FILE            = os.environ.get("LOG_FILE", "logs/service.log")
    LOG_MAX_BYTES       = int(os.environ.get("LOG_MAX_BYTES", str(10 * 1024 * 1024)))
    LOG_BACKUP_COUNT    = int(os.environ.get("LOG_BACKUP_COUNT", "5"))
