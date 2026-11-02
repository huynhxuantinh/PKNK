from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string


def send_branded_email(*, subject, recipient, heading, message, action_label, action_url):
    """Send an accessible text fallback and a consistent DentaVie HTML email."""
    text_body = "\n\n".join(
        part
        for part in (
            heading,
            message,
            "Nếu bạn không thực hiện yêu cầu này, bạn có thể bỏ qua email.",
            f"{action_label}:\n{action_url}" if action_url else "",
        )
        if part
    )
    html_body = render_to_string(
        "emails/dentavie.html",
        {
            "heading": heading,
            "message": message,
            "action_label": action_label,
            "action_url": action_url,
        },
    )
    email = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient],
    )
    email.attach_alternative(html_body, "text/html")
    return email.send(fail_silently=False)
