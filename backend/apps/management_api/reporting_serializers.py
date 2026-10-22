from datetime import timedelta

from rest_framework import serializers


class ReportPeriodSerializer(serializers.Serializer):
    date_from = serializers.DateField()
    date_to = serializers.DateField()

    def validate(self, attrs):
        if attrs["date_from"] > attrs["date_to"]:
            raise serializers.ValidationError("date_from phải nhỏ hơn hoặc bằng date_to.")
        if attrs["date_to"] - attrs["date_from"] > timedelta(days=365):
            raise serializers.ValidationError("Khoảng báo cáo tối đa 366 ngày.")
        return attrs


class RevenueReportQuerySerializer(ReportPeriodSerializer):
    interval = serializers.ChoiceField(choices=["DAY", "MONTH"], default="DAY")


class RevenueBranchRowSerializer(serializers.Serializer):
    branch_id = serializers.IntegerField()
    branch_name = serializers.CharField()
    revenue = serializers.DecimalField(max_digits=18, decimal_places=2)
    paid_invoice_count = serializers.IntegerField()


class RevenueServiceRowSerializer(serializers.Serializer):
    service_id = serializers.IntegerField(allow_null=True)
    service_code = serializers.CharField()
    service_name = serializers.CharField()
    revenue = serializers.DecimalField(max_digits=18, decimal_places=2)
    paid_invoice_count = serializers.IntegerField()


class RevenuePeriodRowSerializer(serializers.Serializer):
    period_start = serializers.DateField()
    revenue = serializers.DecimalField(max_digits=18, decimal_places=2)
    paid_invoice_count = serializers.IntegerField()


class RevenueReportSerializer(serializers.Serializer):
    scope = serializers.ChoiceField(choices=["ORGANIZATION", "BRANCH"])
    date_from = serializers.DateField()
    date_to = serializers.DateField()
    timezone = serializers.CharField()
    currency = serializers.CharField()
    interval = serializers.ChoiceField(choices=["DAY", "MONTH"])
    total_revenue = serializers.DecimalField(max_digits=18, decimal_places=2)
    paid_invoice_count = serializers.IntegerField()
    by_branch = RevenueBranchRowSerializer(many=True)
    by_service = RevenueServiceRowSerializer(many=True)
    by_period = RevenuePeriodRowSerializer(many=True)


class AppointmentBranchRowSerializer(serializers.Serializer):
    branch_id = serializers.IntegerField()
    branch_name = serializers.CharField()
    total_appointments = serializers.IntegerField()
    completed_count = serializers.IntegerField()
    cancelled_count = serializers.IntegerField()
    no_show_count = serializers.IntegerField()
    cancellation_rate_percent = serializers.DecimalField(max_digits=5, decimal_places=2)
    no_show_rate_percent = serializers.DecimalField(max_digits=5, decimal_places=2)


class AppointmentReportSerializer(serializers.Serializer):
    scope = serializers.ChoiceField(choices=["ORGANIZATION", "BRANCH"])
    date_from = serializers.DateField()
    date_to = serializers.DateField()
    timezone = serializers.CharField()
    total_appointments = serializers.IntegerField()
    completed_count = serializers.IntegerField()
    cancelled_count = serializers.IntegerField()
    no_show_count = serializers.IntegerField()
    cancellation_rate_percent = serializers.DecimalField(max_digits=5, decimal_places=2)
    no_show_rate_percent = serializers.DecimalField(max_digits=5, decimal_places=2)
    by_branch = AppointmentBranchRowSerializer(many=True)


class ChairUtilizationChairRowSerializer(serializers.Serializer):
    chair_id = serializers.IntegerField()
    chair_code = serializers.CharField()
    chair_name = serializers.CharField()
    available_minutes = serializers.IntegerField()
    occupied_minutes = serializers.IntegerField()
    utilization_rate_percent = serializers.DecimalField(max_digits=7, decimal_places=2)


class ChairUtilizationBranchRowSerializer(serializers.Serializer):
    branch_id = serializers.IntegerField()
    branch_name = serializers.CharField()
    chair_count = serializers.IntegerField()
    open_days = serializers.IntegerField()
    available_minutes = serializers.IntegerField()
    occupied_minutes = serializers.IntegerField()
    utilization_rate_percent = serializers.DecimalField(max_digits=7, decimal_places=2)
    by_chair = ChairUtilizationChairRowSerializer(many=True)


class ChairUtilizationReportSerializer(serializers.Serializer):
    scope = serializers.ChoiceField(choices=["ORGANIZATION", "BRANCH"])
    date_from = serializers.DateField()
    date_to = serializers.DateField()
    timezone = serializers.CharField()
    included_statuses = serializers.ListField(child=serializers.CharField())
    total_chairs = serializers.IntegerField()
    available_minutes = serializers.IntegerField()
    occupied_minutes = serializers.IntegerField()
    utilization_rate_percent = serializers.DecimalField(max_digits=7, decimal_places=2)
    by_branch = ChairUtilizationBranchRowSerializer(many=True)
