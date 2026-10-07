"""Admin console, plan seat limits and sign-in lockout."""
import time
import unittest

from tests.test_workspace import PASSWORD, FirmFixture


class AdminConsoleTests(FirmFixture):
    def change(self, who, member, **body):
        return self.call(who, "patch", f"/firm/members/{member['user']['id']}", json=body)

    def test_only_admins_change_roles(self):
        self.assertEqual(self.change(self.partner, self.associate, role="partner").status_code, 403)
        promoted = self.change(self.admin, self.associate, role="partner")
        self.assertEqual(promoted.json()["role"], "partner")
        me = self.call(self.associate, "get", "/auth/me").json()
        self.assertEqual(me["user"]["role"], "partner")

    def test_deactivation_signs_the_member_out_immediately(self):
        self.assertEqual(self.call(self.associate, "get", "/auth/me").status_code, 200)
        self.assertEqual(self.change(self.admin, self.associate, active=False).status_code, 200)
        self.assertEqual(self.call(self.associate, "get", "/auth/me").status_code, 401)
        login = self.client.post("/api/auth/login", json={"email": "assoc@firm-a.test", "password": PASSWORD})
        self.assertEqual(login.status_code, 401)
        self.assertEqual(self.change(self.admin, self.associate, active=True).status_code, 200)
        self.assertEqual(self.client.post("/api/auth/login", json={"email": "assoc@firm-a.test", "password": PASSWORD}).status_code, 200)

    def test_the_last_admin_cannot_be_demoted_or_deactivated(self):
        self.assertEqual(self.change(self.admin, self.admin, active=False).status_code, 409)
        self.assertEqual(self.change(self.admin, self.admin, role="partner").status_code, 409)
        self.change(self.admin, self.partner, role="admin")
        self.assertEqual(self.change(self.admin, self.admin, role="partner").status_code, 200)

    def test_other_firms_members_are_not_found(self):
        self.assertEqual(self.change(self.admin, self.other_firm, active=False).status_code, 404)


class PlanSeatTests(FirmFixture):
    def plan(self, who=None):
        return self.call(who or self.admin, "get", "/firm/plan").json()

    def invite(self, email, role="associate"):
        return self.call(self.admin, "post", "/firm/invites", json={"name": "New", "email": email, "role": role})

    def test_seats_count_active_staff_and_pending_invites_but_not_clients(self):
        self.assertEqual(self.plan(), {"plan": "practice", "seat_limit": 50, "seats_used": 4})
        self.invite("pending@firm-a.test")
        self.assertEqual(self.plan()["seats_used"], 5)
        matter = self.open_matter()
        self.call(self.partner, "post", f"/firm/matters/{matter['id']}/clients", json={"name": "C", "email": "c@client.test"})
        self.assertEqual(self.plan()["seats_used"], 5)

    def test_solo_plan_blocks_the_fourth_seat_and_downgrades_that_do_not_fit(self):
        self.assertEqual(self.call(self.admin, "patch", "/firm/plan", json={"plan": "solo"}).status_code, 409)
        self.call(self.admin, "patch", f"/firm/members/{self.paralegal['user']['id']}", json={"active": False})
        self.assertEqual(self.call(self.admin, "patch", "/firm/plan", json={"plan": "solo"}).json()["seat_limit"], 3)
        blocked = self.invite("fourth@firm-a.test")
        self.assertEqual(blocked.status_code, 409)
        self.assertIn("3 staff seats", blocked.json()["detail"])
        reactivate = self.call(self.admin, "patch", f"/firm/members/{self.paralegal['user']['id']}", json={"active": True})
        self.assertEqual(reactivate.status_code, 409)
        self.assertEqual(self.call(self.admin, "patch", "/firm/plan", json={"plan": "enterprise"}).json()["seat_limit"], None)
        self.assertEqual(self.invite("fourth@firm-a.test").status_code, 201)

    def test_only_admins_change_the_plan(self):
        self.assertEqual(self.call(self.partner, "patch", "/firm/plan", json={"plan": "enterprise"}).status_code, 403)


class LockoutTests(FirmFixture):
    def attempt(self, email, password="wrong password!"):
        return self.client.post("/api/auth/login", json={"email": email, "password": password})

    def test_five_failures_lock_the_email_even_for_the_right_password(self):
        for _ in range(5):
            self.assertEqual(self.attempt("assoc@firm-a.test").status_code, 401)
        self.assertEqual(self.attempt("assoc@firm-a.test", PASSWORD).status_code, 429)
        self.assertEqual(self.attempt("para@firm-a.test", PASSWORD).status_code, 200)

    def test_unknown_emails_lock_the_same_way(self):
        for _ in range(5):
            self.attempt("nobody@firm-a.test")
        self.assertEqual(self.attempt("nobody@firm-a.test").status_code, 429)

    def test_lockout_expires_and_success_clears_failures(self):
        for _ in range(4):
            self.attempt("assoc@firm-a.test")
        self.assertEqual(self.attempt("assoc@firm-a.test", PASSWORD).status_code, 200)
        self.assertEqual(self.db.login_failures.rows, [])
        for _ in range(5):
            self.attempt("assoc@firm-a.test")
        for row in self.db.login_failures.rows:
            row["at"] = time.time() - 16 * 60
        self.assertEqual(self.attempt("assoc@firm-a.test", PASSWORD).status_code, 200)


if __name__ == "__main__":
    unittest.main()
