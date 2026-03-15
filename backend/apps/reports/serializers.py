from rest_framework import serializers

from .models import SavingsGoal


class SavingsGoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavingsGoal
        fields = [
            "id", "name", "target_amount", "base_type",
            "deadline", "icon", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
