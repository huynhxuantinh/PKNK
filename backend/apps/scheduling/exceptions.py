class SchedulingError(Exception):
    code = "scheduling_error"

    def __init__(self, message, *, code=None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code


class SlotUnavailableError(SchedulingError):
    code = "slot_unavailable"


class BookingValidationError(SchedulingError):
    code = "booking_validation_error"

