from __future__ import annotations
from dataclasses import dataclass
from pydantic import BaseModel


@dataclass
class GithubRepo:
    owner:       str
    name:        str
    full_name:   str
    private:     bool = False
    description: str  = ""


class ServerProfile(BaseModel):
    """
    Anonymised member profile used during the matching stage.
    Contains only what the member has chosen to make visible to the platform.
    uid is int; all other fields are parsed from the returned string.
    """
    uid:  int
    name: str = ""
    data: str = ""   # raw public data string


class LocalProfile(BaseModel):
    """
    Full private profile loaded into a Delegate's context for a single request.
    Used exclusively for intent extraction and consent preparation — never
    forwarded to the server or stored beyond the duration of one pipeline run.
    uid is int; data is the raw string returned from the member's profile store.
    """
    uid:  int
    data: str = ""   # raw private data string
