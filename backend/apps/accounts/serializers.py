from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.exceptions import APIException
from rest_framework_simplejwt.tokens import RefreshToken

from apps.organizations.models import Membership

from .models import User
from .services import RegistrationService


class InvalidCredentials(APIException):
    status_code = 401
    default_detail = "Thông tin đăng nhập không hợp lệ."
    default_code = "invalid_credentials"


class MembershipSerializer(serializers.ModelSerializer):
    organization_id = serializers.IntegerField(read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    branch_id = serializers.IntegerField(read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)

    class Meta:
        model = Membership
        fields = (
            "role",
            "organization_id",
            "organization_name",
            "branch_id",
            "branch_name",
        )


class UserSerializer(serializers.ModelSerializer):
    email_verified = serializers.SerializerMethodField()
    memberships = MembershipSerializer(many=True, read_only=True)

    class Meta:
        model = User
        fields = (
            "id_user",
            "email",
            "full_name",
            "email_verified_at",
            "email_verified",
            "memberships",
        )

    def get_email_verified(self, obj) -> bool:
        return obj.email_verified_at is not None


class TokenPairSerializer(serializers.Serializer):
    access = serializers.CharField(read_only=True)
    refresh = serializers.CharField(read_only=True)


class AuthPayloadSerializer(serializers.Serializer):
    user = UserSerializer(read_only=True)
    tokens = TokenPairSerializer(read_only=True)


class AuthResponseSerializer(serializers.Serializer):
    data = AuthPayloadSerializer(read_only=True)


class UserResponseSerializer(serializers.Serializer):
    data = UserSerializer(read_only=True)


class TokenRefreshResponseSerializer(serializers.Serializer):
    data = TokenPairSerializer(read_only=True)


def token_pair_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


class RegistrationSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    full_name = serializers.CharField(max_length=200)
    phone = serializers.RegexField(
        regex=r"^\+?[0-9]{9,15}$",
        max_length=16,
        error_messages={"invalid": "Số điện thoại không hợp lệ."},
    )
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    password_confirm = serializers.CharField(write_only=True, trim_whitespace=False)
    consent_to_data_processing = serializers.BooleanField(write_only=True)

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError("Email này đã được sử dụng.")
        return normalized

    def validate_consent_to_data_processing(self, value):
        if not value:
            raise serializers.ValidationError(
                "Bạn phải đồng ý xử lý dữ liệu cá nhân để đăng ký."
            )
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError(
                {"password_confirm": "Mật khẩu xác nhận không khớp."}
            )
        candidate = User(email=attrs["email"], full_name=attrs["full_name"])
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": error.messages}) from error
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        return RegistrationService.register_patient(
            email=validated_data["email"],
            full_name=validated_data["full_name"],
            phone=validated_data["phone"],
            password=validated_data["password"],
            ip_address=request.META.get("REMOTE_ADDR"),
            user_agent=request.META.get("HTTP_USER_AGENT"),
        )


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            email=attrs["email"].strip().lower(),
            password=attrs["password"],
        )
        if user is None:
            raise InvalidCredentials()
        attrs["user"] = user
        return attrs


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(write_only=True)


class EmailVerificationConfirmSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=200, trim_whitespace=False)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=200, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password_confirm = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError(
                {"new_password_confirm": "Mật khẩu xác nhận không khớp."}
            )
        return attrs


class MessagePayloadSerializer(serializers.Serializer):
    message = serializers.CharField(read_only=True)


class MessageResponseSerializer(serializers.Serializer):
    data = MessagePayloadSerializer(read_only=True)
