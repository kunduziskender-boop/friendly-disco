from pydantic import BaseModel, GetCoreSchemaHandler
from pydantic_core import core_schema
from email_validator import validate_email, EmailNotValidError
from typing import Any


class _EmailType(str):
    """Email string that validates format but not deliverability."""

    @classmethod
    def __get_pydantic_core_schema__(
        cls, source_type: Any, handler: GetCoreSchemaHandler
    ) -> core_schema.CoreSchema:
        return core_schema.no_info_plain_validator_function(cls._validate)

    @classmethod
    def _validate(cls, v: Any) -> str:
        try:
            info = validate_email(str(v), check_deliverability=False)
            return info.normalized
        except EmailNotValidError as exc:
            raise ValueError("Некорректный email: укажите адрес вида name@company.ru.") from exc


# Use this instead of EmailStr everywhere in schemas
CrmEmail = _EmailType


