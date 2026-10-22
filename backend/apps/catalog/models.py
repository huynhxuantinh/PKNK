from django.db import models
from django.core.exceptions import ValidationError


class Service(models.Model):
    id_service = models.BigAutoField(primary_key=True)
    organization = models.ForeignKey(
        "organizations.Organization",
        db_column="id_organization",
        on_delete=models.PROTECT,
        related_name="services",
    )
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=200)
    description = models.TextField(null=True, blank=True)
    standard_duration_minutes = models.IntegerField()
    buffer_minutes = models.IntegerField(default=0)
    standard_price = models.DecimalField(max_digits=14, decimal_places=2)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "services"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "code"],
                name="uq_services_org_code",
            ),
            models.CheckConstraint(
                condition=models.Q(standard_duration_minutes__gt=0),
                name="ck_services_duration_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(buffer_minutes__gte=0),
                name="ck_services_buffer_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(standard_price__gte=0),
                name="ck_services_price_nonnegative",
            ),
        ]

    def __str__(self):
        return self.name


class BranchService(models.Model):
    id_branch_service = models.BigAutoField(primary_key=True)
    branch = models.ForeignKey(
        "locations.Branch",
        db_column="id_branch",
        on_delete=models.PROTECT,
        related_name="branch_services",
    )
    service = models.ForeignKey(
        Service,
        db_column="id_service",
        on_delete=models.PROTECT,
        related_name="branch_services",
    )
    price = models.DecimalField(max_digits=14, decimal_places=2)
    duration_minutes = models.IntegerField(null=True, blank=True)
    buffer_minutes = models.IntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "branch_services"
        ordering = ["branch", "service"]
        constraints = [
            models.UniqueConstraint(
                fields=["branch", "service"],
                name="uq_branch_services_branch_service",
            ),
            models.CheckConstraint(
                condition=models.Q(price__gte=0),
                name="ck_branch_services_price",
            ),
            models.CheckConstraint(
                condition=models.Q(duration_minutes__isnull=True)
                | models.Q(duration_minutes__gt=0),
                name="ck_branch_services_duration",
            ),
            models.CheckConstraint(
                condition=models.Q(buffer_minutes__isnull=True)
                | models.Q(buffer_minutes__gte=0),
                name="ck_branch_services_buffer",
            ),
        ]

    def __str__(self):
        return f"{self.branch} - {self.service}"

    def clean(self):
        super().clean()
        if self.branch_id and self.service_id and self.branch.organization_id != self.service.organization_id:
            raise ValidationError("Chi nhánh và dịch vụ phải cùng organization.")


class DentistService(models.Model):
    id_dentist_service = models.BigAutoField(primary_key=True)
    dentist = models.ForeignKey(
        "accounts.Dentist",
        db_column="id_dentist",
        on_delete=models.PROTECT,
        related_name="dentist_services",
    )
    service = models.ForeignKey(
        Service,
        db_column="id_service",
        on_delete=models.PROTECT,
        related_name="dentist_services",
    )

    class Meta:
        db_table = "dentist_services"
        ordering = ["dentist", "service"]
        constraints = [
            models.UniqueConstraint(
                fields=["dentist", "service"],
                name="uq_dentist_services_pair",
            ),
        ]

    def __str__(self):
        return f"{self.dentist} - {self.service}"

    def clean(self):
        super().clean()
        if self.dentist_id and self.service_id and self.dentist.organization_id != self.service.organization_id:
            raise ValidationError("Nha sĩ và dịch vụ phải cùng organization.")

