import logging
import logging.handlers
import os
import json
from datetime import datetime, timezone


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps({
            "ts":      datetime.now(timezone.utc).isoformat(),
            "level":   record.levelname,
            "logger":  record.name,
            "msg":     record.getMessage(),
            **({"exc": self.formatException(record.exc_info)}
               if record.exc_info else {}),
        })


def setup_logging(level: str, log_file: str,
                  max_bytes: int, backup_count: int) -> None:
    os.makedirs(os.path.dirname(log_file), exist_ok=True)

    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Rotating JSON file handler
    fh = logging.handlers.RotatingFileHandler(
        log_file, maxBytes=max_bytes, backupCount=backup_count, encoding="utf-8"
    )
    fh.setFormatter(_JsonFormatter())
    root.addHandler(fh)

    # Plain stdout handler (for journald / systemd capture)
    sh = logging.StreamHandler()
    sh.setFormatter(logging.Formatter(
        "%(asctime)s  %(levelname)-8s  %(name)s — %(message)s"
    ))
    root.addHandler(sh)
