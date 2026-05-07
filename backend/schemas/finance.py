from pydantic import BaseModel, field_validator
from enum import Enum
from typing import Optional
from datetime import date


class RecordType(str, Enum):
    payment = "payment"
    expense = "expense"
    refund = "refund"


class PaymentStatus(str, Enum):
    pending = "pending"
    paid = "paid"
    cancelled = "cancelled"


class FinanceRecordCreate(BaseModel):
    record_type: RecordType
    amount: float
    currency: str = "RUB"
    payment_date: date
    status: PaymentStatus = PaymentStatus.pending
    client_id: Optional[str] = None
    case_id: Optional[str] = None
    description: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Amount must be greater than 0")
        return v


class FinanceRecordUpdate(BaseModel):
    record_type: Optional[RecordType] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    payment_date: Optional[date] = None
    status: Optional[PaymentStatus] = None
    description: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: Optional[float]) -> Optional[float]:
        if v is not None and v <= 0:
            raise ValueError("Amount must be greater than 0")
        return v


class FinanceRecordOut(BaseModel):
    id: str
    record_type: str
    amount: float
    currency: str
    payment_date: str
    status: str
    client_id: Optional[str]
    case_id: Optional[str]
    description: Optional[str]
    created_by: str
    created_at: str
