FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Development target
FROM base AS development
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

# Production target
FROM base AS production
ENV DJANGO_SETTINGS_MODULE=config.settings.production
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "120"]
