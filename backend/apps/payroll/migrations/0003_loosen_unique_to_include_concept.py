"""Loosen the period-per-employer unique constraint to also key on concept.

Real-world payslips can legitimately share the same period when one is a
regular salary and the other is a bonus / atrasos / incentivo for the same
window. Keying on the concept too allows those to coexist; only genuine
duplicates (same employer + period + concept) are rejected.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("payroll", "0002_payroll_concept"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="payroll",
            name="unique_payroll_period_per_employer",
        ),
        migrations.AddConstraint(
            model_name="payroll",
            constraint=models.UniqueConstraint(
                fields=("owner", "employer", "period_start", "period_end", "concept"),
                name="unique_payroll_period_concept_per_employer",
            ),
        ),
    ]
