from django.contrib.postgres.operations import BtreeGistExtension, CreateExtension
from django.db import migrations


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        CreateExtension("postgis"),
        BtreeGistExtension(),
    ]

