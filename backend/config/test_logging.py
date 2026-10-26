from django.conf import settings
from django.test import SimpleTestCase


class ProductionLoggingConfigurationTests(SimpleTestCase):
    def test_application_and_celery_logs_use_stdout_console_handler(self):
        logging_config = settings.LOGGING

        self.assertEqual(logging_config["version"], 1)
        self.assertFalse(logging_config["disable_existing_loggers"])
        self.assertEqual(
            logging_config["handlers"]["console"]["stream"],
            "ext://sys.stdout",
        )
        self.assertIn("apps", logging_config["loggers"])
        self.assertIn("celery", logging_config["loggers"])
        self.assertFalse(settings.CELERY_WORKER_HIJACK_ROOT_LOGGER)
