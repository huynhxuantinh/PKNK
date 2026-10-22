from rest_framework.exceptions import APIException


class ManagementConflict(APIException):
    status_code = 409
    default_code = "management_conflict"

    def __init__(self, detail):
        super().__init__({"code": self.default_code, "message": detail})

