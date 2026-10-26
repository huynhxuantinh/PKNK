from pathlib import Path
import re
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

    def test_frontend_nginx_proxies_django_routes_with_forwarded_headers(self):
        nginx = (ROOT / "frontend" / "nginx.conf").read_text(encoding="utf-8")
        frontend_dockerfile = (ROOT / "frontend" / "Dockerfile").read_text(
            encoding="utf-8"
        )

        for path in ("/api/", "/static/"):
            with self.subTest(path=path):
                self.assertRegex(
                    nginx,
                    rf"location (?:\^~ )?{re.escape(path)}",
                )
        self.assertIn("location ^~ /${DJANGO_ADMIN_PATH}/", nginx)
        self.assertIn("/etc/nginx/templates/default.conf.template", frontend_dockerfile)
        self.assertGreaterEqual(nginx.count("proxy_pass http://web:8000;"), 3)
        self.assertGreaterEqual(
            nginx.count("proxy_set_header X-Forwarded-Proto $scheme;"), 3
        )
        self.assertGreaterEqual(
            nginx.count(
                "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
            ),
            3,
        )
        self.assertIn("client_max_body_size 20m;", nginx)


if __name__ == "__main__":
    unittest.main()
