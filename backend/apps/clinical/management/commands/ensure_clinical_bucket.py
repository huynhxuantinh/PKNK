import boto3
from botocore.exceptions import ClientError
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create the private clinical attachment bucket when it does not exist."

    def handle(self, *args, **options):
        if not settings.USE_S3_STORAGE:
            self.stdout.write("S3 storage is disabled; bucket initialization skipped.")
            return

        storage_options = settings.STORAGES["default"]["OPTIONS"]
        bucket_name = storage_options["bucket_name"]
        client = boto3.client(
            "s3",
            endpoint_url=storage_options["endpoint_url"],
            aws_access_key_id=storage_options["access_key"],
            aws_secret_access_key=storage_options["secret_key"],
            region_name=storage_options["region_name"],
        )
        try:
            client.head_bucket(Bucket=bucket_name)
        except ClientError as error:
            error_code = error.response.get("Error", {}).get("Code", "")
            if error_code not in {"404", "NoSuchBucket", "NotFound"}:
                raise CommandError("Cannot inspect the clinical storage bucket.") from error
            try:
                client.create_bucket(Bucket=bucket_name)
            except ClientError as create_error:
                raise CommandError("Cannot create the clinical storage bucket.") from create_error

        try:
            client.put_bucket_versioning(
                Bucket=bucket_name,
                VersioningConfiguration={"Status": "Enabled"},
            )
        except ClientError as error:
            raise CommandError("Cannot enable clinical bucket versioning.") from error

        self.stdout.write(self.style.SUCCESS("Clinical storage bucket is ready and private."))
