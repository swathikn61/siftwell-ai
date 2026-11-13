"""Schemas for accounts: registration, login, profile and preferences."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

Currency = Literal["INR", "USD", "EUR", "GBP"]


def _name(value: str) -> str:
    value = " ".join(value.split())
    if len(value) < 2:
        raise ValueError("Please enter your name (at least 2 characters)")
    return value


def _password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters")
    if value.strip() != value or not value.strip():
        raise ValueError("Password can’t start or end with spaces")
    return value


class RegisterRequest(BaseModel):
    name: str = Field(max_length=100, examples=["Alex Morgan"])
    email: EmailStr = Field(examples=["alex@example.com"])
    password: str = Field(max_length=128, examples=["a-long-passphrase"])

    _n = field_validator("name")(_name)
    _p = field_validator("password")(_password)

    @field_validator("email")
    @classmethod
    def lower(cls, value: str) -> str:
        return value.strip().lower()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def lower(cls, value: str) -> str:
        return value.strip().lower()


class UserPreferences(BaseModel):
    """Shopping preferences used for dashboard recommendations."""

    budget_min: int = Field(default=0, ge=0, le=10_000_000)
    budget_max: int = Field(default=150_000, ge=1000, le=10_000_000)
    categories: list[Literal["laptops", "smartphones"]] = Field(default_factory=lambda: ["laptops", "smartphones"])
    priorities: list[str] = Field(default_factory=lambda: ["Battery life", "Build quality", "Value for money"], max_length=10)
    email_digest: bool = True
    price_alerts: bool = True

    @field_validator("priorities")
    @classmethod
    def tidy(cls, values: list[str]) -> list[str]:
        out: list[str] = []
        for v in values:
            v = " ".join(str(v).split())[:40]
            if v and v not in out:
                out.append(v)
        return out

    @model_validator(mode="after")
    def order(self) -> "UserPreferences":
        if self.budget_min > self.budget_max:
            raise ValueError("budget_min cannot be greater than budget_max")
        return self


class UserRead(BaseModel):
    id: int
    email: str
    name: str
    location: str
    currency: str
    preferences: UserPreferences
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator("preferences", mode="before")
    @classmethod
    def fill_defaults(cls, value: object) -> object:
        return value or {}


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="Seconds until the token expires")
    user: UserRead


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=100)
    currency: Currency | None = None
    preferences: UserPreferences | None = None

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str | None) -> str | None:
        return _name(value) if value is not None else None

    @field_validator("location")
    @classmethod
    def tidy_location(cls, value: str | None) -> str | None:
        return " ".join(value.split()) if value is not None else None


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(max_length=128)

    _p = field_validator("new_password")(_password)


class AccountDelete(BaseModel):
    password: str = Field(min_length=1, max_length=128)
