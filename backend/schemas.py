from typing import Literal

from pydantic import BaseModel


class OnboardingMessage(BaseModel):
    message: str


class SuggestTopic(BaseModel):
    suggestion: str


class UtteranceIn(BaseModel):
    speaker: Literal["user", "tutor"]
    text: str
