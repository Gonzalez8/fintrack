from django.db import models

from apps.core.models import UserOwnedModel


class SavingsGoal(UserOwnedModel):
    BASE_TYPE_CHOICES = [
        ("PATRIMONY", "Total patrimony"),
        ("CASH", "Cash only"),
    ]

    name = models.CharField(max_length=120)
    target_amount = models.DecimalField(max_digits=14, decimal_places=2)
    base_type = models.CharField(
        max_length=10,
        choices=BASE_TYPE_CHOICES,
        default="PATRIMONY",
        help_text="Whether to measure progress against total patrimony or cash only.",
    )
    deadline = models.DateField(null=True, blank=True)
    icon = models.CharField(max_length=30, default="target", blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.target_amount})"
