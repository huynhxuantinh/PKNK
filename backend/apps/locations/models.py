from django.contrib.gis.db import models


class AdministrativeUnit(models.Model):
    code = models.SmallIntegerField(primary_key=True)
    full_name = models.CharField(max_length=255)
    full_name_en = models.CharField(max_length=255, null=True, blank=True)
    short_name = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        db_table = "administrative_units"
        ordering = ["code"]

    def __str__(self):
        return self.full_name


class Province(models.Model):
    code = models.CharField(max_length=20, primary_key=True)
    name = models.CharField(max_length=255)
    full_name = models.CharField(max_length=255)
    administrative_unit = models.ForeignKey(
        AdministrativeUnit,
        db_column="administrative_unit_code",
        on_delete=models.PROTECT,
        related_name="provinces",
        null=True,
        blank=True,
    )
    boundary = models.MultiPolygonField(srid=4326, null=True, blank=True)

    class Meta:
        db_table = "provinces"
        ordering = ["name"]

    def __str__(self):
        return self.full_name


class Ward(models.Model):
    code = models.CharField(max_length=20, primary_key=True)
    province = models.ForeignKey(
        Province,
        db_column="province_code",
        on_delete=models.PROTECT,
        related_name="wards",
    )
    name = models.CharField(max_length=255)
    full_name = models.CharField(max_length=255)
    administrative_unit = models.ForeignKey(
        AdministrativeUnit,
        db_column="administrative_unit_code",
        on_delete=models.PROTECT,
        related_name="wards",
        null=True,
        blank=True,
    )
    boundary = models.MultiPolygonField(srid=4326, null=True, blank=True)

    class Meta:
        db_table = "wards"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["code", "province"],
                name="uq_wards_code_province",
            ),
        ]

    def __str__(self):
        return self.full_name


class Branch(models.Model):
    id_branch = models.BigAutoField(primary_key=True)
    organization = models.ForeignKey(
        "organizations.Organization",
        db_column="id_organization",
        on_delete=models.PROTECT,
        related_name="branches",
    )
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20, null=True, blank=True)
    email = models.EmailField(null=True, blank=True)
    province = models.ForeignKey(
        Province,
        db_column="province_code",
        on_delete=models.PROTECT,
        related_name="branches",
    )
    ward = models.ForeignKey(
        Ward,
        db_column="ward_code",
        on_delete=models.PROTECT,
        related_name="branches",
    )
    address_line = models.TextField()
    location = models.PointField(srid=4326, geography=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "branches"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "code"],
                name="uq_branches_org_code",
            ),
        ]
        indexes = [
            models.Index(
                fields=["organization", "is_active"],
                name="idx_branches_org_active",
            ),
            models.Index(
                fields=["ward", "province"],
                name="idx_branches_ward_province",
            ),
        ]

    def __str__(self):
        return self.name


class BranchOpeningHour(models.Model):
    id_branch_opening_hour = models.BigAutoField(primary_key=True)
    branch = models.ForeignKey(
        Branch,
        db_column="id_branch",
        on_delete=models.CASCADE,
        related_name="opening_hours",
    )
    weekday = models.SmallIntegerField()
    is_closed = models.BooleanField(default=False)
    open_time = models.TimeField(null=True, blank=True)
    close_time = models.TimeField(null=True, blank=True)

    class Meta:
        db_table = "branch_opening_hours"
        ordering = ["branch", "weekday"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(weekday__range=(1, 7)),
                name="ck_opening_hours_weekday",
            ),
            models.UniqueConstraint(
                fields=["branch", "weekday"],
                name="uq_opening_hours_branch_day",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(
                        is_closed=True,
                        open_time__isnull=True,
                        close_time__isnull=True,
                    )
                    | models.Q(
                        is_closed=False,
                        open_time__isnull=False,
                        close_time__isnull=False,
                        open_time__lt=models.F("close_time"),
                    )
                ),
                name="ck_opening_hours_valid_times",
            ),
        ]

    def __str__(self):
        return f"{self.branch} - thứ {self.weekday}"


class BranchImage(models.Model):
    id_branch_image = models.BigAutoField(primary_key=True)
    branch = models.ForeignKey(
        Branch,
        db_column="id_branch",
        on_delete=models.CASCADE,
        related_name="images",
    )
    storage_key = models.CharField(max_length=512, unique=True)
    original_name = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=100)
    size_bytes = models.BigIntegerField()
    is_primary = models.BooleanField(default=False)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "branch_images"
        ordering = ["branch", "sort_order", "id_branch_image"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(size_bytes__gt=0),
                name="ck_branch_images_size_positive",
            ),
            models.UniqueConstraint(
                fields=["branch"],
                condition=models.Q(is_primary=True),
                name="uq_branch_images_one_primary",
            ),
        ]

    def __str__(self):
        return self.original_name


class Holiday(models.Model):
    id_holiday = models.BigAutoField(primary_key=True)
    organization = models.ForeignKey(
        "organizations.Organization",
        db_column="id_organization",
        on_delete=models.PROTECT,
        related_name="holidays",
    )
    branch = models.ForeignKey(
        Branch,
        db_column="id_branch",
        on_delete=models.PROTECT,
        related_name="holidays",
        null=True,
        blank=True,
    )
    holiday_date = models.DateField()
    name = models.CharField(max_length=200)
    is_closed = models.BooleanField(default=True)

    class Meta:
        db_table = "holidays"
        ordering = ["holiday_date", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "holiday_date"],
                condition=models.Q(branch__isnull=True),
                name="uq_holidays_org_date",
            ),
            models.UniqueConstraint(
                fields=["branch", "holiday_date"],
                condition=models.Q(branch__isnull=False),
                name="uq_holidays_branch_date",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.holiday_date})"


class Chair(models.Model):
    class ResourceType(models.TextChoices):
        CHAIR = "CHAIR", "Ghế nha khoa"
        ROOM = "ROOM", "Phòng khám"

    id_chair = models.BigAutoField(primary_key=True)
    branch = models.ForeignKey(
        Branch,
        db_column="id_branch",
        on_delete=models.PROTECT,
        related_name="chairs",
    )
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=150)
    resource_type = models.CharField(max_length=20, choices=ResourceType.choices)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "chairs"
        ordering = ["branch", "code"]
        constraints = [
            models.UniqueConstraint(
                fields=["branch", "code"],
                name="uq_chairs_branch_code",
            ),
            models.CheckConstraint(
                condition=models.Q(resource_type__in=["CHAIR", "ROOM"]),
                name="ck_chairs_resource_type",
            ),
        ]

    def __str__(self):
        return f"{self.branch} - {self.name}"

