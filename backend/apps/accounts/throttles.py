import hashlib

from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle


class EmailScopedRateThrottle(ScopedRateThrottle):
    """Apply a scope independently to each normalized email address.

    The digest keeps raw email addresses out of Redis cache keys. Requests
    without a usable email fall back to DRF's proxy-aware client identifier.
    """

    def get_cache_key(self, request, view):
        if request.method != "POST":
            return super().get_cache_key(request, view)
        email = str(request.data.get("email", "")).strip().lower()
        if not email:
            return super().get_cache_key(request, view)
        digest = hashlib.sha256(email.encode("utf-8")).hexdigest()
        return self.cache_format % {"scope": self.scope, "ident": f"email:{digest}"}
    def allow_request(self, request, view):
        base_scope = getattr(view, "throttle_scope", None)
        if not base_scope:
            return True
        self.scope = f"{base_scope}_email"
        self.rate = self.get_rate()
        if self.rate is None:
            return True
        self.num_requests, self.duration = self.parse_rate(self.rate)
        return SimpleRateThrottle.allow_request(self, request, view)

