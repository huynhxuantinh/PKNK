from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ProductionContainerConfigurationTests(unittest.TestCase):
    def test_image_uses_gunicorn_and_collects_static_files(self):
        dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
        entrypoint = (ROOT / "docker" / "entrypoint.sh").read_text(encoding="utf-8")
        requirements = (ROOT / "requirements.txt").read_text(encoding="utf-8")

        self.assertIn('CMD ["gunicorn", "config.wsgi:application"', dockerfile)
        self.assertNotIn('CMD ["python", "manage.py", "runserver"', dockerfile)
        self.assertIn("python manage.py collectstatic --noinput", entrypoint)
        self.assertIn("gunicorn==", requirements)
        self.assertIn("whitenoise==", requirements)

    def test_development_compose_keeps_runserver_and_production_static_middleware(self):
        compose = (ROOT / "compose.yaml").read_text(encoding="utf-8")
        settings = (
            ROOT / "backend" / "config" / "settings" / "base.py"
        ).read_text(encoding="utf-8")

        self.assertIn(
            'command: ["python", "manage.py", "runserver", "0.0.0.0:8000"]',
            compose,
        )
        self.assertIn("whitenoise.middleware.WhiteNoiseMiddleware", settings)
        self.assertIn("CompressedManifestStaticFilesStorage", settings)


if __name__ == "__main__":
    unittest.main()
