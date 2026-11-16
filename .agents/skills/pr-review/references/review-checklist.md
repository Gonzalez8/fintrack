# Fintrack PR Review Checklist

Detailed checklist with project-specific patterns and examples.

## Backend Patterns

### OwnedByUserMixin (BLOCKER if missing)

Every ViewSet that serves user-scoped data MUST use `OwnedByUserMixin`:

```python
# CORRECT
class MyViewSet(OwnedByUserMixin, viewsets.ModelViewSet):
    queryset = MyModel.objects.all()
    serializer_class = MySerializer

# WRONG — no owner filtering, cross-tenant data leak
class MyViewSet(viewsets.ModelViewSet):
    queryset = MyModel.objects.all()
```

### FK Ownership Validation (BLOCKER if missing)

Serializers with FK fields to user-owned models must validate ownership:

```python
# CORRECT
class AmortizationSerializer(_OwnershipValidationMixin, serializers.ModelSerializer):
    def validate_property(self, value):
        return self._validate_owned_fk(value, "property")

# WRONG — user A can reference user B's property
class AmortizationSerializer(serializers.ModelSerializer):
    pass  # no FK validation
```

Reference: `apps/transactions/serializers.py` — `_OwnershipValidationMixin`

### Decimal for Money (BLOCKER)

```python
# CORRECT
from decimal import Decimal
price = Decimal("19.99")

# WRONG — float precision loss
price = 19.99
```

### Model Base Class

```python
# CORRECT — UUID pk + timestamps
class MyModel(TimeStampedModel):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="my_models")

# WRONG — auto-increment int pk, no timestamps
class MyModel(models.Model):
    pass
```

### DoesNotExist Handling

```python
# CORRECT
from django.shortcuts import get_object_or_404
obj = get_object_or_404(MyModel, pk=pk, owner=request.user)

# WRONG — returns 500 on missing object
obj = MyModel.objects.get(pk=pk, owner=request.user)
```

## Frontend Patterns

### i18n — All 5 Locales (BLOCKER if incomplete)

Every new key must be in: `es.json`, `en.json`, `de.json`, `fr.json`, `it.json`

```typescript
// CORRECT — uses i18n key
<p>{t("savings.perMonth")}</p>

// WRONG — hardcoded Spanish
<p>/mes</p>
```

Verify key counts match:
```bash
for f in frontend/src/i18n/messages/*.json; do
  echo "$(basename $f): $(grep -c '"' $f)"
done
```

### BFF Proxy Pattern (BLOCKER if violated)

```typescript
// CORRECT — goes through BFF
import { api } from "@/lib/api-client";
const data = await api.get("/assets/");

// WRONG — calls Django directly from browser
const data = await fetch("http://backend:8000/api/assets/");
```

### Privacy Mode

```typescript
// CORRECT — public market data
formatMoney(asset.current_price, currency, true)  // isPublic=true

// CORRECT — private user amount
formatMoney(account.balance, currency)  // isPublic defaults to false

// WRONG — user balance shown as public
formatMoney(account.balance, currency, true)
```

### Mobile UX — SwipeCard

```tsx
// CORRECT — mobile uses SwipeCard, desktop uses inline actions
<div className="sm:hidden space-y-2">
  {items.map(item => (
    <SwipeCard key={item.id} onEdit={...} onDelete={...}>
      {/* card content */}
    </SwipeCard>
  ))}
</div>
<div className="hidden sm:block">
  {/* desktop table or grid with inline edit/delete */}
</div>

// WRONG — desktop table on mobile (horizontal scroll)
<table>{/* no mobile variant */}</table>
```

### Stale Closure in Mutations

```typescript
// CORRECT — pass all data needed as mutation argument
const editMutation = useMutation({
  mutationFn: (data: { id: string; month: number; amount: number }) =>
    api.put(`/items/${data.id}/`, { month: data.month, amount: data.amount }),
});

// WRONG — reads from closure that may be stale
const editMutation = useMutation({
  mutationFn: (data: { id: string; amount: number }) =>
    api.put(`/items/${data.id}/`, {
      month: items.find(i => i.id === data.id)?.month,  // stale!
    }),
});
```

## Change Propagation Patterns

### API ↔ MCP Sync (BLOCKER when an MCP tool breaks)

The MCP server (`mcp/fintrack_mcp/server.py`) is a client of the REST API. Any
change to an endpoint it calls — path, query params, request fields, response
shape — must update the tool, its test in `mcp/tests/` and the tool table in
`mcp/README.md` in the same PR. New capabilities the assistant should use need a
tool (read tools use `READ` annotations, writes `WRITE`; never add delete tools).

### Filter Parameter Names (BLOCKER)

django-filter silently ignores unknown query params, so a wrong name returns
unfiltered data instead of an error.

```ts
// CORRECT — names from TransactionFilter
buildTransactionsQuery({ dateFrom, dateTo, accountId }) // → from_date, to_date, account_id

// WRONG — silently ignored, the list is never filtered
p.set("date_after", dateFrom); p.set("account", accountId);
```

### Pagination (WARNING)

Lists send `page_size` equal to the size their paginator uses; pickers and
summaries that need every row use `page_size=1000` (`StandardPagination` max).
React Query keys must use the same values the request uses (URL params), not a
debounced copy, or results get cached under the wrong key.

### Backup & Demo Coverage (WARNING)

- New user-data models: add them to `apps/importer` export + import (after the
  models they reference) with a round-trip test.
- New API calls: MSW handler in `demo/handlers.ts` and a route in
  `demo/server-data.ts`. Generic matchers (`/api/assets/{id}`) answer deeper
  paths — add specific routes before them.

## Security Patterns

### Permission on API Views

```python
# Default: all APIView subclasses require authentication
# (configured in settings.py DEFAULT_PERMISSION_CLASSES)

# WRONG — public endpoint without explicit permission
class OpenEndpoint(APIView):
    permission_classes = []  # intentional? flag for review
```

### No Raw SQL with User Input

```python
# CORRECT — parameterized query
cursor.execute("SELECT * FROM table WHERE id = %s", [user_input])

# WRONG — SQL injection
cursor.execute(f"SELECT * FROM table WHERE id = {user_input}")
```

## Severity Guide

| Severity | When | Action |
|----------|------|--------|
| **BLOCKER** | Security issue, data leak, missing i18n, broken functionality | Must fix before merge |
| **WARNING** | Missing tests, suboptimal code, minor issues | Should fix, but can merge with acknowledgment |
| **NOTE** | Style suggestion, possible improvement, minor inconsistency | Optional, informational |
