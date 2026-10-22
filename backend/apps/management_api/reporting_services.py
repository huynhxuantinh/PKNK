from collections import defaultdict
from datetime import datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum
from django.db.models.functions import Coalesce, TruncDate, TruncMonth

from apps.billing.models import Invoice, InvoiceLine, Payment
from apps.locations.models import Branch, BranchOpeningHour, Chair, Holiday
from apps.scheduling.models import Appointment


class RevenueReportService:
    MONEY_FIELD = DecimalField(max_digits=18, decimal_places=2)

    @staticmethod
    def utc_bounds(*, organization, date_from, date_to):
        local_tz = ZoneInfo(organization.timezone)
        starts_at = datetime.combine(date_from, time.min, tzinfo=local_tz)
        ends_at = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=local_tz)
        return starts_at, ends_at

    @classmethod
    def build(cls, *, organization, date_from, date_to, interval="DAY", branch=None):
        starts_at, ends_at = cls.utc_bounds(
            organization=organization, date_from=date_from, date_to=date_to
        )
        payments = Payment.objects.filter(
            status=Payment.Status.POSTED,
            invoice__status=Invoice.Status.PAID,
            invoice__branch__organization=organization,
            invoice__paid_at__gte=starts_at,
            invoice__paid_at__lt=ends_at,
        )
        branches = Branch.objects.filter(organization=organization)
        if branch is not None:
            payments = payments.filter(invoice__branch=branch)
            branches = branches.filter(pk=branch.pk)

        grouped = {
            row["invoice__branch_id"]: row
            for row in payments.values("invoice__branch_id").annotate(
                revenue=Coalesce(Sum("amount"), Decimal("0.00"), output_field=cls.MONEY_FIELD),
                paid_invoice_count=Count("invoice_id", distinct=True),
            )
        }
        rows = []
        for item in branches.order_by("name").values("id_branch", "name"):
            aggregate = grouped.get(item["id_branch"], {})
            rows.append({
                "branch_id": item["id_branch"],
                "branch_name": item["name"],
                "revenue": aggregate.get("revenue", Decimal("0.00")),
                "paid_invoice_count": aggregate.get("paid_invoice_count", 0),
            })
        totals = payments.aggregate(
            total_revenue=Coalesce(Sum("amount"), Decimal("0.00"), output_field=cls.MONEY_FIELD),
            paid_invoice_count=Count("invoice_id", distinct=True),
        )

        invoice_lines = InvoiceLine.objects.filter(
            invoice__payments__status=Payment.Status.POSTED,
            invoice__status=Invoice.Status.PAID,
            invoice__branch__organization=organization,
            invoice__paid_at__gte=starts_at,
            invoice__paid_at__lt=ends_at,
        )
        if branch is not None:
            invoice_lines = invoice_lines.filter(invoice__branch=branch)
        allocated_revenue = ExpressionWrapper(
            F("line_total") * F("invoice__total") / F("invoice__subtotal"),
            output_field=cls.MONEY_FIELD,
        )
        by_service = []
        service_groups = invoice_lines.values(
            "service_id", "service__code", "service__name"
        ).annotate(
            revenue=Coalesce(
                Sum(allocated_revenue), Decimal("0.00"), output_field=cls.MONEY_FIELD
            ),
            paid_invoice_count=Count("invoice_id", distinct=True),
        ).order_by("service__name", "service_id")
        for row in service_groups:
            by_service.append({
                "service_id": row["service_id"],
                "service_code": row["service__code"] or "OTHER",
                "service_name": row["service__name"] or "D\u1ecbch v\u1ee5 kh\u00e1c",
                "revenue": row["revenue"],
                "paid_invoice_count": row["paid_invoice_count"],
            })

        local_tz = ZoneInfo(organization.timezone)
        truncation = (
            TruncDate("invoice__paid_at", tzinfo=local_tz)
            if interval == "DAY"
            else TruncMonth("invoice__paid_at", tzinfo=local_tz)
        )
        by_period = []
        period_groups = payments.annotate(period_start=truncation).values(
            "period_start"
        ).annotate(
            revenue=Coalesce(Sum("amount"), Decimal("0.00"), output_field=cls.MONEY_FIELD),
            paid_invoice_count=Count("invoice_id", distinct=True),
        ).order_by("period_start")
        for row in period_groups:
            period_start = row["period_start"]
            if isinstance(period_start, datetime):
                period_start = period_start.date()
            by_period.append({
                "period_start": period_start,
                "revenue": row["revenue"],
                "paid_invoice_count": row["paid_invoice_count"],
            })

        return {
            "scope": "BRANCH" if branch is not None else "ORGANIZATION",
            "date_from": date_from,
            "date_to": date_to,
            "timezone": organization.timezone,
            "currency": "VND",
            "interval": interval,
            "total_revenue": totals["total_revenue"],
            "paid_invoice_count": totals["paid_invoice_count"],
            "by_branch": rows,
            "by_service": by_service,
            "by_period": by_period,
        }


class AppointmentReportService:
    INCLUDED_STATUSES = [
        Appointment.Status.PENDING,
        Appointment.Status.CONFIRMED,
        Appointment.Status.CHECKED_IN,
        Appointment.Status.IN_PROGRESS,
        Appointment.Status.COMPLETED,
        Appointment.Status.CANCELLED,
        Appointment.Status.NO_SHOW,
    ]

    @staticmethod
    def _rate(count, total):
        if not total:
            return Decimal("0.00")
        return (Decimal(count) * Decimal("100") / Decimal(total)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

    @classmethod
    def _counts(cls, queryset):
        values = queryset.aggregate(
            total_appointments=Count("id_appointment"),
            completed_count=Count(
                "id_appointment", filter=Q(status=Appointment.Status.COMPLETED)
            ),
            cancelled_count=Count(
                "id_appointment", filter=Q(status=Appointment.Status.CANCELLED)
            ),
            no_show_count=Count(
                "id_appointment", filter=Q(status=Appointment.Status.NO_SHOW)
            ),
        )
        values["cancellation_rate_percent"] = cls._rate(
            values["cancelled_count"], values["total_appointments"]
        )
        values["no_show_rate_percent"] = cls._rate(
            values["no_show_count"], values["total_appointments"]
        )
        return values

    @classmethod
    def build(cls, *, organization, date_from, date_to, branch=None):
        starts_at, ends_at = RevenueReportService.utc_bounds(
            organization=organization, date_from=date_from, date_to=date_to
        )
        appointments = Appointment.objects.filter(
            branch__organization=organization,
            starts_at__gte=starts_at,
            starts_at__lt=ends_at,
            status__in=cls.INCLUDED_STATUSES,
        )
        branches = Branch.objects.filter(organization=organization)
        if branch is not None:
            appointments = appointments.filter(branch=branch)
            branches = branches.filter(pk=branch.pk)

        grouped = {
            row["branch_id"]: row
            for row in appointments.values("branch_id").annotate(
                total_appointments=Count("id_appointment"),
                completed_count=Count(
                    "id_appointment", filter=Q(status=Appointment.Status.COMPLETED)
                ),
                cancelled_count=Count(
                    "id_appointment", filter=Q(status=Appointment.Status.CANCELLED)
                ),
                no_show_count=Count(
                    "id_appointment", filter=Q(status=Appointment.Status.NO_SHOW)
                ),
            )
        }
        rows = []
        for item in branches.order_by("name").values("id_branch", "name"):
            counts = grouped.get(
                item["id_branch"],
                {
                    "total_appointments": 0,
                    "completed_count": 0,
                    "cancelled_count": 0,
                    "no_show_count": 0,
                },
            )
            rows.append({
                "branch_id": item["id_branch"],
                "branch_name": item["name"],
                **counts,
                "cancellation_rate_percent": cls._rate(
                    counts["cancelled_count"], counts["total_appointments"]
                ),
                "no_show_rate_percent": cls._rate(
                    counts["no_show_count"], counts["total_appointments"]
                ),
            })

        return {
            "scope": "BRANCH" if branch is not None else "ORGANIZATION",
            "date_from": date_from,
            "date_to": date_to,
            "timezone": organization.timezone,
            **cls._counts(appointments),
            "by_branch": rows,
        }


class ChairUtilizationReportService:
    INCLUDED_STATUSES = [
        Appointment.Status.PENDING,
        Appointment.Status.CONFIRMED,
        Appointment.Status.CHECKED_IN,
        Appointment.Status.IN_PROGRESS,
        Appointment.Status.COMPLETED,
    ]

    @staticmethod
    def _rate(occupied_minutes, available_minutes):
        if not available_minutes:
            return Decimal("0.00")
        return (
            Decimal(occupied_minutes) * Decimal("100") / Decimal(available_minutes)
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    @staticmethod
    def _dates(date_from, date_to):
        current = date_from
        while current <= date_to:
            yield current
            current += timedelta(days=1)

    @classmethod
    def build(cls, *, organization, date_from, date_to, branch=None):
        branches = Branch.objects.filter(organization=organization)
        if branch is not None:
            branches = branches.filter(pk=branch.pk)
        branches = list(branches.order_by("name"))
        branch_ids = [item.pk for item in branches]
        local_tz = ZoneInfo(organization.timezone)
        report_starts_at, report_ends_at = RevenueReportService.utc_bounds(
            organization=organization, date_from=date_from, date_to=date_to
        )

        opening_by_branch_weekday = {
            (item.branch_id, item.weekday): item
            for item in BranchOpeningHour.objects.filter(branch_id__in=branch_ids)
        }
        closed_holidays = Holiday.objects.filter(
            organization=organization,
            holiday_date__gte=date_from,
            holiday_date__lte=date_to,
            is_closed=True,
        ).filter(Q(branch_id__in=branch_ids) | Q(branch__isnull=True))
        organization_closed_dates = {
            item.holiday_date for item in closed_holidays if item.branch_id is None
        }
        branch_closed_dates = {
            (item.branch_id, item.holiday_date)
            for item in closed_holidays
            if item.branch_id is not None
        }
        chairs = list(
            Chair.objects.filter(
                branch_id__in=branch_ids,
                branch__is_active=True,
                resource_type=Chair.ResourceType.CHAIR,
                is_active=True,
            ).order_by("branch_id", "code", "id_chair")
        )
        chairs_by_branch = defaultdict(list)
        for chair_item in chairs:
            chairs_by_branch[chair_item.branch_id].append(chair_item)

        opening_windows = {}
        available_by_branch = defaultdict(int)
        open_days_by_branch = defaultdict(int)
        for branch_item in branches:
            if not branch_item.is_active:
                continue
            for target_date in cls._dates(date_from, date_to):
                if (
                    target_date in organization_closed_dates
                    or (branch_item.pk, target_date) in branch_closed_dates
                ):
                    continue
                opening = opening_by_branch_weekday.get(
                    (branch_item.pk, target_date.isoweekday())
                )
                if opening is None or opening.is_closed:
                    continue
                opens_at = datetime.combine(target_date, opening.open_time, tzinfo=local_tz)
                closes_at = datetime.combine(target_date, opening.close_time, tzinfo=local_tz)
                opening_windows[(branch_item.pk, target_date)] = (opens_at, closes_at)
                available_by_branch[branch_item.pk] += int(
                    (closes_at - opens_at).total_seconds() // 60
                )
                open_days_by_branch[branch_item.pk] += 1

        chair_ids = [item.pk for item in chairs]
        occupied_by_chair = defaultdict(int)
        appointments = Appointment.objects.filter(
            branch_id__in=branch_ids,
            chair_id__in=chair_ids,
            status__in=cls.INCLUDED_STATUSES,
            starts_at__lt=report_ends_at,
            occupied_until__gt=report_starts_at,
        ).values("branch_id", "chair_id", "starts_at", "occupied_until")
        for appointment in appointments:
            local_start = max(
                appointment["starts_at"], report_starts_at
            ).astimezone(local_tz)
            local_end = min(
                appointment["occupied_until"], report_ends_at
            ).astimezone(local_tz)
            target_date = local_start.date()
            while target_date <= local_end.date():
                window = opening_windows.get((appointment["branch_id"], target_date))
                if window is not None:
                    overlap_starts_at = max(local_start, window[0])
                    overlap_ends_at = min(local_end, window[1])
                    if overlap_starts_at < overlap_ends_at:
                        occupied_by_chair[appointment["chair_id"]] += int(
                            (overlap_ends_at - overlap_starts_at).total_seconds() // 60
                        )
                target_date += timedelta(days=1)

        rows = []
        total_available = 0
        total_occupied = 0
        for branch_item in branches:
            available_per_chair = available_by_branch[branch_item.pk]
            chair_rows = []
            branch_occupied = 0
            for chair_item in chairs_by_branch[branch_item.pk]:
                occupied_minutes = occupied_by_chair[chair_item.pk]
                branch_occupied += occupied_minutes
                chair_rows.append({
                    "chair_id": chair_item.pk,
                    "chair_code": chair_item.code,
                    "chair_name": chair_item.name,
                    "available_minutes": available_per_chair,
                    "occupied_minutes": occupied_minutes,
                    "utilization_rate_percent": cls._rate(
                        occupied_minutes, available_per_chair
                    ),
                })
            branch_available = available_per_chair * len(chair_rows)
            total_available += branch_available
            total_occupied += branch_occupied
            rows.append({
                "branch_id": branch_item.pk,
                "branch_name": branch_item.name,
                "chair_count": len(chair_rows),
                "open_days": open_days_by_branch[branch_item.pk],
                "available_minutes": branch_available,
                "occupied_minutes": branch_occupied,
                "utilization_rate_percent": cls._rate(
                    branch_occupied, branch_available
                ),
                "by_chair": chair_rows,
            })

        return {
            "scope": "BRANCH" if branch is not None else "ORGANIZATION",
            "date_from": date_from,
            "date_to": date_to,
            "timezone": organization.timezone,
            "included_statuses": cls.INCLUDED_STATUSES,
            "total_chairs": len(chairs),
            "available_minutes": total_available,
            "occupied_minutes": total_occupied,
            "utilization_rate_percent": cls._rate(total_occupied, total_available),
            "by_branch": rows,
        }
