from rest_framework.exceptions import APIException


class DentistConflict(APIException):
    status_code = 409
    default_code = "dentist_conflict"

    def __init__(self, detail):
        super().__init__({"code": self.default_code, "message": detail})

