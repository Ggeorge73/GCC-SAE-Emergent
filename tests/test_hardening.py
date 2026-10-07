"""Release hardening checks: CORS, legacy route closure and token handling."""
import os
import unittest
from unittest.mock import patch

from tests.test_workspace import FirmFixture


class HardeningTests(FirmFixture):
    def test_only_the_configured_web_origin_may_call_the_api(self):
        allowed = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")[0].strip()
        ok = self.client.options("/api/auth/me", headers={"Origin": allowed, "Access-Control-Request-Method": "GET"})
        self.assertEqual(ok.headers.get("access-control-allow-origin"), allowed)
        evil = self.client.options("/api/auth/me", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
        self.assertNotIn("access-control-allow-origin", evil.headers)

    def test_legacy_deal_room_routes_stay_closed_even_for_signed_in_users(self):
        with patch.dict(os.environ, {"LAW_SUITE_ALLOW_LOCAL_DEMO": "false"}):
            for method, path in [("get", "/api/deal-rooms"), ("post", "/api/chat"), ("get", "/api/stats"), ("post", "/api/documents/upload")]:
                response = getattr(self.client, method)(path, headers={"Authorization": f"Bearer {self.admin['token']}"})
                self.assertEqual(response.status_code, 503, path)

    def test_sessions_expire_and_tokens_never_appear_in_urls(self):
        import time
        self.db.sessions.rows[0]["expires_ts"] = time.time() - 1
        self.assertEqual(self.call(self.admin, "get", "/auth/me").status_code, 401)
        from backend import server
        paths = [getattr(route, "path", "") for route in server.app.routes]
        self.assertFalse(any("token" in p for p in paths), "no route may take a token in its URL")


if __name__ == "__main__":
    unittest.main()
