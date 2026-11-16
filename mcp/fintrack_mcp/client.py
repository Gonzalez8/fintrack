"""Async client for the Fintrack REST API, authenticated with a personal access token."""

from __future__ import annotations

from typing import Any

import httpx


class FintrackError(Exception):
    """An API failure explained so the assistant knows what to do next."""


class FintrackClient:
    def __init__(self, base_url: str, token: str, transport: httpx.AsyncBaseTransport | None = None):
        self.base_url = base_url.rstrip("/")
        self._http = httpx.AsyncClient(
            base_url=f"{self.base_url}/api/",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            timeout=30.0,
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return await self._request("GET", path, params=_clean(params))

    async def post(self, path: str, json: dict[str, Any] | None = None) -> Any:
        return await self._request("POST", path, json=json)

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        try:
            response = await self._http.request(method, path, **kwargs)
        except httpx.ConnectError as exc:
            raise FintrackError(
                f"Cannot connect to Fintrack at {self.base_url}. Check that the server is running and that "
                "FINTRACK_URL points to the backend (e.g. http://<server>:8001)."
            ) from exc
        except httpx.TimeoutException as exc:
            raise FintrackError("Fintrack did not answer in time. Try again in a moment.") from exc

        if response.status_code == 401:
            raise FintrackError(
                "The Fintrack token was rejected (invalid or revoked). Create a new one in Fintrack → Settings → "
                "AI access (MCP) and update FINTRACK_TOKEN."
            )
        if response.status_code == 403:
            raise FintrackError(f"Not allowed: {_detail(response)}")
        if response.status_code == 404:
            raise FintrackError(f"Not found: {_detail(response)}")
        if response.status_code == 400 and "json" not in response.headers.get("content-type", ""):
            # Django answers a host missing from ALLOWED_HOSTS with a plain 400 page before reaching the API
            host = httpx.URL(self.base_url).host
            raise FintrackError(
                f"Fintrack refused the request for host '{host}'. Add it to ALLOWED_HOSTS in the server's .env "
                "and restart the backend."
            )
        if response.status_code == 400:
            raise FintrackError(f"Fintrack rejected the data: {_detail(response)}")
        if response.status_code >= 400:
            raise FintrackError(f"Fintrack returned an error ({response.status_code}). Try again later.")
        if response.status_code == 204 or not response.content:
            return None
        return response.json()


def _clean(params: dict[str, Any] | None) -> dict[str, Any] | None:
    if params is None:
        return None
    return {k: v for k, v in params.items() if v is not None and v != ""}


def _detail(response: httpx.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return response.text[:300] or response.reason_phrase
    if isinstance(data, dict) and "detail" in data:
        return str(data["detail"])
    return str(data)[:500]
