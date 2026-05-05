from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Inbound protocol events — delivered to registered callbacks.
# ---------------------------------------------------------------------------

class NewMessageFromUser(BaseModel):
    """User sends a natural-language message to their Delegate."""
    uid:   int
    input: str


class DataConsentResponse(BaseModel):
    """User answered YES/NO to exposing their data excerpt.
    cid ties the response back to the waiting Delegate coroutine."""
    cid: str
    uid: int
    yes: bool


class TaskConsentResponse(BaseModel):
    """Supply-side user answered YES/NO to an incoming task assignment."""
    cid: str
    uid: int
    yes: bool


class TaskFromOrchestrator(BaseModel):
    """Orchestrator sends a task to a supply-side Delegate."""
    cid:  str
    uid:  int
    task: str


# ---------------------------------------------------------------------------
# Outbound protocol calls — called on the protocol client.
# ---------------------------------------------------------------------------

class ReadPrivateContextRequest(BaseModel):
    """Load a user's full private profile into Delegate context."""
    uid: int


class ReadMemberProfileRequest(BaseModel):
    """Load a member's profile for supply-side context."""
    uid: int


class DataYesNoRequest(BaseModel):
    """Present the user with a data consent prompt (cid, data excerpt, intent)."""
    cid:    str
    uid:    int
    data:   str
    intent: str


class TaskYesNoRequest(BaseModel):
    """Present a supply-side user with a task consent prompt."""
    cid:  str
    uid:  int
    task: str


class StatusUpdateRequest(BaseModel):
    """Deliver a plain-text status message to the user's chat interface."""
    cid:  str
    uid:  int
    list: str


class PackageToOrchestratorRequest(BaseModel):
    """Forward a user-consented data excerpt and intent to the Orchestrator."""
    cid:    str
    uid:    int
    data:   str
    intent: str


class IsAcceptRequest(BaseModel):
    """Report a supply-side accept/decline decision back to the Orchestrator."""
    cid:      str
    uid:      int
    accepted: bool
