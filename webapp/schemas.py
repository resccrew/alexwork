from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ShiftOut(BaseModel):
    id: int
    kind: str  # 'work' | 'dyzur'
    oddzial: str
    start: datetime
    end: Optional[datetime]
    hours: Optional[float]
    night_hours: Optional[float]
    edited: bool
    source: str


class ShiftStartIn(BaseModel):
    kind: str = Field(pattern="^(work|dyzur)$")
    oddzial: str


class ShiftCreateIn(BaseModel):
    kind: str = Field(pattern="^(work|dyzur)$")
    oddzial: str
    start: datetime
    end: datetime


class ShiftUpdateIn(BaseModel):
    kind: Optional[str] = Field(default=None, pattern="^(work|dyzur)$")
    oddzial: Optional[str] = None
    start: Optional[datetime] = None
    end: Optional[datetime] = None


class SummaryOut(BaseModel):
    year: int
    month: int
    total_hours: float
    praca_hours: float
    dyzur_hours: float
    night_hours: float
    overtime_hours: float
    earnings_simple: float
    earnings_bonus: float
    days: list["DayBar"]


class DayBar(BaseModel):
    day: int
    minutes: float
    has_dyzur: bool
    shifts: int


class ProfileOut(BaseModel):
    rate: float
    norm_hours: float
    employment: str
    default_oddzial: Optional[str]
    dyzur_bonus_pct: float
    night_bonus_pct: float
    gcal_refresh_token: Optional[str] = None


class ProfileUpdateIn(BaseModel):
    rate: Optional[float] = None
    norm_hours: Optional[float] = None
    employment: Optional[str] = None
    default_oddzial: Optional[str] = None
    dyzur_bonus_pct: Optional[float] = None
    night_bonus_pct: Optional[float] = None


class ConfigOut(BaseModel):
    departments: list[str]
    doctor_name: str


class MeOut(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
