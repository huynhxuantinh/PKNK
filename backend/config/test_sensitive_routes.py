from importlib import reload

from django.test import Client, SimpleTestCase, override_settings
from django.urls import clear_url_caches

import config.urls


class SensitiveProductionRouteTests(SimpleTestCase):
    def test_docs_are_disabled_and_admin_uses_configured_path(self):
        client = Client()

        with override_settings(
            API_DOCS_ENABLED=False,
            ADMIN_PATH="operations-7f4c91",
        ):
            reload(config.urls)
            clear_url_caches()

            self.assertEqual(client.get("/api/docs/").status_code, 404)
            self.assertEqual(client.get("/api/schema/").status_code, 404)
            self.assertEqual(client.get("/admin/").status_code, 404)
            self.assertEqual(
                client.get("/operations-7f4c91/").status_code,
                302,
            )

        reload(config.urls)
        clear_url_caches()
