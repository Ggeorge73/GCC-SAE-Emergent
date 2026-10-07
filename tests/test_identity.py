"""Identity, session and role tests against the in-process store; no Mongo service."""
import asyncio
import os
import time
import unittest
import unittest.mock

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "law_suite_test_identity")
os.environ["LAW_SUITE_AI_MODE"] = "offline"

from fastapi.testclient import TestClient
from backend import identity, server
from backend.memory_store import MemoryDatabase

PASSWORD = "correct horse battery"


class IdentityTests(unittest.TestCase):
    def setUp(self):
        self.db = MemoryDatabase()
        asyncio.run(identity.ensure_indexes(self.db))
        server.app.dependency_overrides[identity.get_db] = lambda: self.db
        self.client = TestClient(server.app)

    def tearDown(self):
        self.client.close()
        server.app.dependency_overrides.clear()

    def signup(self, email="admin@firm-a.test", firm="Firm A"):
        response = self.client.post("/api/auth/signup", json={"firm_name": firm, "name": "Ada Admin", "email": email, "password": PASSWORD})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def add_member(self, firm_id, role, email):
        user = {"id": f"user-{role}-{email}", "firm_id": firm_id, "name": role.title(), "email": email, "password_hash": identity.hash_password(PASSWORD), "role": role, "active": True}
        asyncio.run(self.db.users.insert_one(dict(user)))
        return user

    def test_signup_creates_firm_admin_and_working_session(self):
        body = self.signup()
        self.assertEqual(body["user"]["role"], "admin")
        self.assertEqual(body["user"]["firm_id"], body["firm"]["id"])
        self.assertNotIn("password_hash", body["user"])
        me = self.client.get("/api/auth/me", headers=self.auth(body["token"]))
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["firm"]["name"], "Firm A")

    def test_passwords_are_stored_only_as_salted_hashes(self):
        self.signup()
        self.signup(email="second@firm-b.test", firm="Firm B")
        hashes = [row["password_hash"] for row in self.db.users.rows]
        self.assertTrue(all(h.startswith("scrypt$") and PASSWORD not in h for h in hashes))
        self.assertNotEqual(hashes[0], hashes[1], "same password must not produce the same hash")
        self.assertTrue(identity.verify_password(PASSWORD, hashes[0]))
        self.assertFalse(identity.verify_password("wrong password", hashes[0]))

    def test_duplicate_email_is_rejected_case_insensitively(self):
        self.signup()
        response = self.client.post("/api/auth/signup", json={"firm_name": "Other", "name": "Copy", "email": "ADMIN@firm-a.test", "password": PASSWORD})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(len(self.db.users.rows), 1)

    def test_short_password_and_bad_email_are_rejected(self):
        for payload in [{"password": "short"}, {"password": "elevenchars"}, {"email": "not-an-email"}]:
            body = {"firm_name": "Firm", "name": "Name", "email": "x@firm.test", "password": PASSWORD, **payload}
            self.assertEqual(self.client.post("/api/auth/signup", json=body).status_code, 422)

    def test_login_failures_share_one_message(self):
        self.signup()
        wrong_password = self.client.post("/api/auth/login", json={"email": "admin@firm-a.test", "password": "not the password"})
        unknown_email = self.client.post("/api/auth/login", json={"email": "nobody@firm-a.test", "password": PASSWORD})
        self.assertEqual(wrong_password.status_code, 401)
        self.assertEqual(unknown_email.status_code, 401)
        self.assertEqual(wrong_password.json(), unknown_email.json())

    def test_login_then_logout_revokes_only_that_session(self):
        first = self.signup()["token"]
        second = self.client.post("/api/auth/login", json={"email": "admin@firm-a.test", "password": PASSWORD}).json()["token"]
        self.assertEqual(self.client.post("/api/auth/logout", headers=self.auth(second)).status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.auth(second)).status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.auth(first)).status_code, 200)

    def test_missing_malformed_and_expired_tokens_are_rejected(self):
        token = self.signup()["token"]
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me", headers={"Authorization": token}).status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.auth("forged-token")).status_code, 401)
        self.db.sessions.rows[0]["expires_ts"] = time.time() - 1
        self.assertEqual(self.client.get("/api/auth/me", headers=self.auth(token)).status_code, 401)

    def test_tokens_are_stored_as_digests(self):
        token = self.signup()["token"]
        self.assertNotIn(token, str(self.db.sessions.rows))
        self.assertEqual(self.db.sessions.rows[0]["token_hash"], identity.token_digest(token))

    def test_admin_revokes_member_sessions_immediately(self):
        admin = self.signup()
        member = self.add_member(admin["firm"]["id"], "associate", "assoc@firm-a.test")
        member_token = self.client.post("/api/auth/login", json={"email": member["email"], "password": PASSWORD}).json()["token"]
        self.assertEqual(self.client.get("/api/auth/me", headers=self.auth(member_token)).status_code, 200)
        revoke = self.client.post(f"/api/firm/members/{member['id']}/revoke-sessions", headers=self.auth(admin["token"]))
        self.assertEqual(revoke.json(), {"revoked": 1})
        self.assertEqual(self.client.get("/api/auth/me", headers=self.auth(member_token)).status_code, 401)

    def test_non_admin_cannot_revoke_and_other_firms_are_invisible(self):
        firm_a = self.signup()
        firm_b = self.signup(email="admin@firm-b.test", firm="Firm B")
        partner = self.add_member(firm_a["firm"]["id"], "partner", "partner@firm-a.test")
        partner_token = self.client.post("/api/auth/login", json={"email": partner["email"], "password": PASSWORD}).json()["token"]
        self.assertEqual(self.client.post(f"/api/firm/members/{firm_a['user']['id']}/revoke-sessions", headers=self.auth(partner_token)).status_code, 403)
        cross_firm = self.client.post(f"/api/firm/members/{firm_b['user']['id']}/revoke-sessions", headers=self.auth(firm_a["token"]))
        self.assertEqual(cross_firm.status_code, 404)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.auth(firm_b["token"])).status_code, 200)

    def test_deactivated_user_cannot_sign_in_or_use_old_token(self):
        body = self.signup()
        self.db.users.rows[0]["active"] = False
        self.assertEqual(self.client.get("/api/auth/me", headers=self.auth(body["token"])).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/login", json={"email": "admin@firm-a.test", "password": PASSWORD}).status_code, 401)

    def test_auth_routes_do_not_need_the_legacy_demo_opt_in(self):
        with unittest.mock.patch.dict(os.environ, {"LAW_SUITE_ALLOW_LOCAL_DEMO": "false"}):
            self.signup()
            self.assertEqual(self.client.get("/api/deal-rooms").status_code, 503)


class RolePermissionTests(unittest.TestCase):
    EXPECTED = {
        "admin": ({"firm.manage", "matter.approve", "matter.create"}, {"portal.read"}),
        "partner": ({"matter.approve", "member.invite", "matter.wall"}, {"firm.manage", "portal.read"}),
        "associate": ({"matter.create", "matter.work"}, {"matter.approve", "member.invite"}),
        "paralegal": ({"matter.read", "matter.work"}, {"matter.create", "matter.approve"}),
        "client": ({"portal.read"}, {"matter.read", "matter.work", "matter.create"}),
    }

    def test_each_role_has_allowed_and_denied_actions(self):
        self.assertEqual(set(self.EXPECTED), set(identity.ROLES))
        for role, (allowed, denied) in self.EXPECTED.items():
            for permission in allowed:
                self.assertTrue(identity.can(role, permission), f"{role} should {permission}")
            for permission in denied:
                self.assertFalse(identity.can(role, permission), f"{role} should not {permission}")

    def test_unknown_permissions_and_roles_are_denied(self):
        self.assertFalse(identity.can("admin", "something.new"))
        self.assertFalse(identity.can("owner", "matter.read"))


if __name__ == "__main__":
    unittest.main()
