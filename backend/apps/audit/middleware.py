import uuid


class AuditRequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        supplied = request.headers.get("X-Request-ID")
        try:
            request_id = uuid.UUID(supplied) if supplied else uuid.uuid4()
        except (ValueError, TypeError, AttributeError):
            request_id = uuid.uuid4()
        request.audit_request_id = request_id
        response = self.get_response(request)
        response["X-Request-ID"] = str(request_id)
        return response
